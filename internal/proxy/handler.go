package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/intelligence"
	"github.com/flexgate/proxy/internal/metrics"
	"github.com/flexgate/proxy/internal/proxy/middleware"
)

// defaultUpstreamTimeout is used when a route has no per-route timeout set
// and the request context carries no deadline.
const defaultUpstreamTimeout = 30 * time.Second

// Handler is the core reverse proxy handler.
//
// It resolves an upstream from the RouteCache on every request (zero DB hits
// on the hot path), builds an httputil.ReverseProxy with per-request Director
// and ErrorHandler closures, and forwards the request.
//
// If no route matches and a fallbackUpstream is configured, the request is
// forwarded there. If no fallback is configured, 502 is returned.
type Handler struct {
	cache            *RouteCache
	fallbackUpstream string // optional, from config
	transport        http.RoundTripper
	intel            intelligence.Client
	log              zerolog.Logger
}

// NewHandler creates a Handler. fallbackUpstream may be empty.
// intel must not be nil; use intelligence.New() which returns a NoopClient
// when no intelligence URL is configured.
func NewHandler(cache *RouteCache, fallbackUpstream string, intel intelligence.Client, log zerolog.Logger) *Handler {
	return &Handler{
		cache:            cache,
		fallbackUpstream: fallbackUpstream,
		transport:        buildTransport(),
		intel:            intel,
		log:              log,
	}
}

// ServeHTTP implements http.Handler.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.RequestIDFromCtx(ctx)
	start := time.Now()

	// ── route resolution ──────────────────────────────────────────────────────
	route := h.cache.Resolve(r.Method, r.URL.Path)

	var (
		upstream    string
		stripPrefix string
		addHeaders  map[string]string
		timeout     = defaultUpstreamTimeout
		routeID     string
	)

	if route != nil {
		upstream = route.Upstream
		stripPrefix = route.StripPrefix
		addHeaders = route.AddHeaders
		routeID = route.ID
		if route.Timeout > 0 {
			timeout = route.Timeout
		}

		h.log.Debug().
			Str("request_id", requestID).
			Str("route_id", route.ID).
			Str("upstream", upstream).
			Str("path", r.URL.Path).
			Msg("proxy: route matched")
	} else if h.fallbackUpstream != "" {
		upstream = h.fallbackUpstream
		h.log.Debug().
			Str("request_id", requestID).
			Str("upstream", upstream).
			Str("path", r.URL.Path).
			Msg("proxy: no route matched, using fallback upstream")
	} else {
		h.log.Warn().
			Str("request_id", requestID).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Msg("proxy: no route matched")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":      "no upstream found for this route",
			"request_id": requestID,
		})
		return
	}

	clientIP := realIP(r)

	// ── intelligence: rate-limit check ────────────────────────────────────────
	rlResult := h.intel.RateLimit(ctx, intelligence.RateLimitRequest{
		ClientIP: clientIP,
		RouteID:  routeID,
		Method:   r.Method,
		Path:     r.URL.Path,
	})
	if !rlResult.Allowed {
		h.log.Warn().
			Str("request_id", requestID).
			Str("client_ip", clientIP).
			Str("route_id", routeID).
			Int("retry_after_ms", rlResult.RetryAfterMs).
			Msg("proxy: rate limit exceeded")

		metrics.IntelligenceRateLimitDenied.Inc()

		w.Header().Set("Content-Type", "application/json")
		if rlResult.RetryAfterMs > 0 {
			w.Header().Set("Retry-After", fmt.Sprintf("%.3f", float64(rlResult.RetryAfterMs)/1000))
		}
		w.WriteHeader(http.StatusTooManyRequests)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":      "rate limit exceeded",
			"request_id": requestID,
		})
		return
	}

	// ── intelligence: auth check ──────────────────────────────────────────────
	token := extractBearerToken(r)
	if token != "" {
		authResult := h.intel.Auth(ctx, intelligence.AuthRequest{
			Token:    token,
			RouteID:  routeID,
			ClientIP: clientIP,
		})
		if !authResult.Valid {
			h.log.Warn().
				Str("request_id", requestID).
				Str("client_ip", clientIP).
				Str("route_id", routeID).
				Msg("proxy: auth rejected")

			metrics.IntelligenceAuthDenied.Inc()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":      "forbidden",
				"request_id": requestID,
			})
			return
		}
		if authResult.Subject != "" {
			r.Header.Set("X-Auth-Subject", authResult.Subject)
		}
	}

	// ── parse upstream URL ────────────────────────────────────────────────────
	targetURL, err := url.Parse(upstream)
	if err != nil {
		h.log.Error().Err(err).Str("upstream", upstream).Msg("proxy: invalid upstream URL")
		http.Error(w, "invalid upstream URL", http.StatusInternalServerError)
		return
	}

	// ── per-route timeout ─────────────────────────────────────────────────────
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	r = r.WithContext(timeoutCtx)

	// ── inject observability headers ─────────────────────────────────────────
	// Written to the *response* header map so that ProxyInstrumentation and
	// Logging middleware (which wrap this handler) can read them back. They are
	// stripped from the downstream response in ModifyResponse and in
	// ProxyInstrumentation before any byte is sent to the client.
	w.Header().Set("X-Flexgate-Route-ID", routeID)
	w.Header().Set("X-Flexgate-Upstream", upstream)

	// ── build reverse proxy ───────────────────────────────────────────────────
	rp := &httputil.ReverseProxy{
		Director:       h.buildDirector(targetURL, stripPrefix, addHeaders, requestID),
		Transport:      h.transport,
		ErrorHandler:   h.buildErrorHandler(requestID, upstream),
		ModifyResponse: h.buildModifyResponse(),
	}

	rw := NewResponseWriter(w)
	rp.ServeHTTP(rw, r)

	// ── intelligence: record request (fire-and-forget) ────────────────────────
	h.intel.RecordRequest(intelligence.RequestEvent{
		RequestID: requestID,
		Method:    r.Method,
		Path:      r.URL.Path,
		Status:    rw.Status,
		LatencyMs: time.Since(start).Milliseconds(),
		ClientIP:  clientIP,
		Upstream:  upstream,
		RouteID:   routeID,
		Timestamp: start,
		BytesOut:  rw.Written,
	})
}

// buildDirector returns a Director function that rewrites the outbound request.
//
// Director responsibilities:
//  1. Set Scheme + Host from the upstream URL
//  2. Strip path prefix if configured
//  3. Merge upstream base path with the (optionally stripped) request path
//  4. Inject additional headers from the route config
//  5. Set X-Forwarded-* headers
//  6. Set X-Request-ID so upstream can correlate
func (h *Handler) buildDirector(
	target *url.URL,
	stripPrefix string,
	addHeaders map[string]string,
	requestID string,
) func(*http.Request) {
	return func(req *http.Request) {
		// Preserve the original scheme and host for X-Forwarded-* headers
		// before overwriting them.
		if req.Header.Get("X-Forwarded-Host") == "" {
			req.Header.Set("X-Forwarded-Host", req.Host)
		}
		if req.Header.Get("X-Forwarded-Proto") == "" {
			scheme := "http"
			if req.TLS != nil {
				scheme = "https"
			}
			req.Header.Set("X-Forwarded-Proto", scheme)
		}

		// ── upstream host ─────────────────────────────────────────────────────
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.Host = target.Host

		// ── path rewrite ──────────────────────────────────────────────────────
		requestPath := req.URL.Path
		if stripPrefix != "" && strings.HasPrefix(requestPath, stripPrefix) {
			requestPath = requestPath[len(stripPrefix):]
			if requestPath == "" {
				requestPath = "/"
			}
		}

		// Merge upstream base path with (stripped) request path.
		// e.g. upstream = "https://svc.internal/v2", path = "/users/1"
		//      → https://svc.internal/v2/users/1
		if target.Path != "" {
			requestPath = strings.TrimRight(target.Path, "/") + "/" + strings.TrimLeft(requestPath, "/")
		}
		req.URL.Path = requestPath
		req.URL.RawPath = "" // let net/url re-encode

		// ── inject request ID ─────────────────────────────────────────────────
		req.Header.Set("X-Request-ID", requestID)

		// ── inject route-level headers ────────────────────────────────────────
		for k, v := range addHeaders {
			req.Header.Set(k, v)
		}
	}
}

// buildErrorHandler returns an ErrorHandler that logs upstream errors and
// returns a structured JSON 502.
func (h *Handler) buildErrorHandler(requestID, upstream string) func(http.ResponseWriter, *http.Request, error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		status := http.StatusBadGateway
		errMsg := "upstream error"

		// Distinguish timeout from connection refused.
		if isTimeout(err) {
			status = http.StatusGatewayTimeout
			errMsg = "upstream timeout"
		}

		h.log.Error().
			Err(err).
			Str("request_id", requestID).
			Str("upstream", upstream).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", status).
			Msg("proxy: upstream error")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":      errMsg,
			"request_id": requestID,
		})
	}
}

// buildModifyResponse strips headers that should not be forwarded downstream.
func (h *Handler) buildModifyResponse() func(*http.Response) error {
	return func(resp *http.Response) error {
		// Never let the upstream dictate CORS; the proxy owns that (Phase 1 cors.go).
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Allow-Credentials")

		// Internal observability headers must not leak to downstream clients.
		// ProxyInstrumentation reads them from the upstream writer's Header()
		// map (set before rp.ServeHTTP) and then strips them independently;
		// we also strip from the upstream response for defence-in-depth.
		resp.Header.Del("X-Flexgate-Route-ID")
		resp.Header.Del("X-Flexgate-Upstream")
		return nil
	}
}

// buildTransport returns a tuned http.Transport suitable for a high-throughput
// reverse proxy.
func buildTransport() http.RoundTripper {
	return &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		MaxIdleConns:          500,
		MaxIdleConnsPerHost:   100,
		MaxConnsPerHost:       200,
		IdleConnTimeout:       90 * time.Second,
		DisableCompression:    true, // proxy should not decompress; pass through as-is
	}
}

// isTimeout returns true if err is a context deadline / timeout error.
func isTimeout(err error) bool {
	if err == nil {
		return false
	}
	if err == context.DeadlineExceeded {
		return true
	}
	netErr, ok := err.(net.Error)
	return ok && netErr.Timeout()
}

// realIP extracts the client IP from the request. It prefers X-Real-IP (set
// by HAProxy) and falls back to RemoteAddr.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		// X-Forwarded-For may be a comma-separated list; take the first entry.
		if idx := strings.IndexByte(ip, ','); idx >= 0 {
			return strings.TrimSpace(ip[:idx])
		}
		return strings.TrimSpace(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// extractBearerToken returns the token from an "Authorization: Bearer <token>"
// header, or an empty string if the header is absent or malformed.
func extractBearerToken(r *http.Request) string {
	const prefix = "Bearer "
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, prefix) {
		return auth[len(prefix):]
	}
	return ""
}
