package handlers

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// TroubleshootingHandler handles all /api/troubleshoot/* endpoints.
type TroubleshootingHandler struct {
	haproxySocket   string
	haproxyStatsURL string
	rdb             *redis.Client // nil when Redis not configured
	log             zerolog.Logger
}

// NewTroubleshootingHandler creates a TroubleshootingHandler.
func NewTroubleshootingHandler(
	haproxySocket string,
	haproxyStatsURL string,
	rdb *redis.Client,
	log zerolog.Logger,
) *TroubleshootingHandler {
	return &TroubleshootingHandler{
		haproxySocket:   haproxySocket,
		haproxyStatsURL: haproxyStatsURL,
		rdb:             rdb,
		log:             log,
	}
}

// HAProxy handles GET /api/troubleshoot/haproxy
// Queries the HAProxy stats page and returns parsed backend statistics.
func (h *TroubleshootingHandler) HAProxy(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	stats, err := h.fetchHAProxyStats(ctx)
	if err != nil {
		h.log.Warn().Err(err).Msg("troubleshoot: haproxy stats fetch failed")
		JSON(w, http.StatusOK, map[string]any{
			"available": false,
			"error":     err.Error(),
		})
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"available": true,
		"stats":     stats,
	})
}

// Upstream handles GET /api/troubleshoot/upstream?url=https://...
// Checks whether the proxy can reach the given upstream URL.
func (h *TroubleshootingHandler) Upstream(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		Error(w, http.StatusBadRequest, "url query parameter is required")
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		Error(w, http.StatusBadRequest, "invalid url")
		return
	}

	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	dialAddr := parsed.Host
	if parsed.Port() == "" {
		switch parsed.Scheme {
		case "https":
			dialAddr = parsed.Hostname() + ":443"
		default:
			dialAddr = parsed.Hostname() + ":80"
		}
	}

	var d net.Dialer
	conn, dialErr := d.DialContext(ctx, "tcp", dialAddr)
	latencyMs := float64(time.Since(start).Microseconds()) / 1000.0

	if dialErr != nil {
		JSON(w, http.StatusOK, map[string]any{
			"reachable":  false,
			"url":        rawURL,
			"latency_ms": latencyMs,
			"error":      dialErr.Error(),
		})
		return
	}
	_ = conn.Close()

	JSON(w, http.StatusOK, map[string]any{
		"reachable":  true,
		"url":        rawURL,
		"latency_ms": latencyMs,
	})
}

// Redis handles GET /api/troubleshoot/redis
func (h *TroubleshootingHandler) Redis(w http.ResponseWriter, r *http.Request) {
	if h.rdb == nil {
		JSON(w, http.StatusOK, map[string]any{
			"configured": false,
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	start := time.Now()
	pingErr := h.rdb.Ping(ctx).Err()
	latencyMs := float64(time.Since(start).Microseconds()) / 1000.0

	if pingErr != nil {
		JSON(w, http.StatusOK, map[string]any{
			"configured": true,
			"reachable":  false,
			"latency_ms": latencyMs,
			"error":      pingErr.Error(),
		})
		return
	}

	// Fetch INFO server section for version + uptime.
	info, _ := h.rdb.Info(ctx, "server", "clients", "memory", "stats").Result()

	JSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"reachable":  true,
		"latency_ms": latencyMs,
		"info":       parseRedisInfo(info),
	})
}

// ── HAProxy stats via socket ──────────────────────────────────────────────────

// fetchHAProxyStats connects to the HAProxy stats HTTP page and parses the
// CSV stats output. Falls back to the UNIX socket if the HTTP page fails.
func (h *TroubleshootingHandler) fetchHAProxyStats(ctx context.Context) ([]map[string]string, error) {
	// Try HTTP stats page first (simpler, no UNIX socket required).
	if h.haproxyStatsURL != "" {
		rows, err := h.fetchStatsHTTP(ctx)
		if err == nil {
			return rows, nil
		}
		h.log.Debug().Err(err).Msg("troubleshoot: haproxy http stats failed, trying socket")
	}

	// Fall back to UNIX socket.
	if h.haproxySocket != "" {
		return h.fetchStatsSocket(ctx)
	}

	return nil, fmt.Errorf("no HAProxy stats URL or socket configured")
}

func (h *TroubleshootingHandler) fetchStatsHTTP(ctx context.Context) ([]map[string]string, error) {
	statsURL := strings.TrimRight(h.haproxyStatsURL, "/") + ";csv"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, statsURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return parseHAProxyCSV(resp.Body)
}

func (h *TroubleshootingHandler) fetchStatsSocket(ctx context.Context) ([]map[string]string, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "unix", h.haproxySocket)
	if err != nil {
		return nil, fmt.Errorf("unix socket %s: %w", h.haproxySocket, err)
	}
	defer conn.Close()

	if _, err := fmt.Fprintf(conn, "show stat\n"); err != nil {
		return nil, err
	}

	return parseHAProxyCSV(conn)
}

// parseHAProxyCSV parses HAProxy's "show stat" CSV output into a slice of
// key→value maps, one per line (frontend/backend/server entry).
func parseHAProxyCSV(r io.Reader) ([]map[string]string, error) {
	scanner := bufio.NewScanner(r)

	// First line is the header: "# pxname,svname,qcur,..."
	if !scanner.Scan() {
		return nil, fmt.Errorf("empty response from HAProxy stats")
	}
	header := strings.TrimPrefix(scanner.Text(), "# ")
	cols := strings.Split(header, ",")

	var rows []map[string]string
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		vals := strings.Split(line, ",")
		row := make(map[string]string, len(cols))
		for i, col := range cols {
			if i < len(vals) {
				row[strings.TrimSpace(col)] = vals[i]
			}
		}
		rows = append(rows, row)
	}
	return rows, scanner.Err()
}

// parseRedisInfo parses the Redis INFO output into a flat key→value map.
func parseRedisInfo(info string) map[string]string {
	result := make(map[string]string)
	for _, line := range strings.Split(info, "\r\n") {
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			result[parts[0]] = parts[1]
		}
	}
	return result
}
