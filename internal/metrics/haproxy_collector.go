package metrics

import (
	"bufio"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"
)

// ─────────────────────────────────────────────────────────────────────────────
// HAProxyCollector
// ─────────────────────────────────────────────────────────────────────────────

// HAProxyCollector is a prometheus.Collector that scrapes HAProxy stats on
// every Gather() call. It supports two backends:
//   - UNIX socket  (statsSocket != "")  — sends "show stat\n" and parses CSV
//   - HTTP stats page (statsURL != "")  — HTTP GET ?stats;csv;norefresh
//
// Socket is preferred when both are configured.
type HAProxyCollector struct {
	statsSocket string
	statsURL    string
	log         zerolog.Logger

	// descriptor cache (created once in NewHAProxyCollector)
	descSessionsTotal    *prometheus.Desc
	descBytesIn          *prometheus.Desc
	descBytesOut         *prometheus.Desc
	descQueueCurrent     *prometheus.Desc
	descConnRate         *prometheus.Desc
	descReqRate          *prometheus.Desc
	descResponseCodes    *prometheus.Desc
	descServerStatus     *prometheus.Desc
	descUptime           *prometheus.Desc
	descActiveServers    *prometheus.Desc
	descBackupServers    *prometheus.Desc
}

// NewHAProxyCollector creates an HAProxyCollector and registers it with reg.
// Returns nil without error when both statsSocket and statsURL are empty.
func NewHAProxyCollector(statsSocket, statsURL string, log zerolog.Logger) *HAProxyCollector {
	if statsSocket == "" && statsURL == "" {
		return nil
	}

	labels := []string{"proxy", "sv", "type"} // HAProxy pxname, svname, itype
	statusLabels := []string{"proxy", "sv", "code"}

	c := &HAProxyCollector{
		statsSocket: statsSocket,
		statsURL:    statsURL,
		log:         log.With().Str("component", "haproxy-collector").Logger(),

		descSessionsTotal: prometheus.NewDesc(
			"flexgate_haproxy_sessions_total",
			"Total number of sessions handled by HAProxy.",
			labels, nil,
		),
		descBytesIn: prometheus.NewDesc(
			"flexgate_haproxy_bytes_in_total",
			"Total bytes received by HAProxy.",
			labels, nil,
		),
		descBytesOut: prometheus.NewDesc(
			"flexgate_haproxy_bytes_out_total",
			"Total bytes sent by HAProxy.",
			labels, nil,
		),
		descQueueCurrent: prometheus.NewDesc(
			"flexgate_haproxy_queue_current",
			"Current number of queued requests.",
			labels, nil,
		),
		descConnRate: prometheus.NewDesc(
			"flexgate_haproxy_connection_rate",
			"Current connection rate per second.",
			labels, nil,
		),
		descReqRate: prometheus.NewDesc(
			"flexgate_haproxy_request_rate",
			"Current HTTP request rate per second.",
			labels, nil,
		),
		descResponseCodes: prometheus.NewDesc(
			"flexgate_haproxy_http_responses_total",
			"HTTP responses by status code class.",
			statusLabels, nil,
		),
		descServerStatus: prometheus.NewDesc(
			"flexgate_haproxy_server_status",
			"Server status: 1=UP, 0=DOWN/MAINT.",
			labels, nil,
		),
		descUptime: prometheus.NewDesc(
			"flexgate_haproxy_uptime_seconds",
			"HAProxy process uptime in seconds.",
			nil, nil,
		),
		descActiveServers: prometheus.NewDesc(
			"flexgate_haproxy_active_servers",
			"Number of active servers in backend.",
			[]string{"proxy"}, nil,
		),
		descBackupServers: prometheus.NewDesc(
			"flexgate_haproxy_backup_servers",
			"Number of backup servers in backend.",
			[]string{"proxy"}, nil,
		),
	}

	// Self-register with the shared registry.
	Registry.MustRegister(c)
	return c
}

// Describe implements prometheus.Collector.
func (c *HAProxyCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.descSessionsTotal
	ch <- c.descBytesIn
	ch <- c.descBytesOut
	ch <- c.descQueueCurrent
	ch <- c.descConnRate
	ch <- c.descReqRate
	ch <- c.descResponseCodes
	ch <- c.descServerStatus
	ch <- c.descUptime
	ch <- c.descActiveServers
	ch <- c.descBackupServers
}

// Collect implements prometheus.Collector. Called by Prometheus on every scrape.
func (c *HAProxyCollector) Collect(ch chan<- prometheus.Metric) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	rows, err := c.fetchStats(ctx)
	if err != nil {
		c.log.Warn().Err(err).Msg("haproxy collector: stats fetch failed")
		return
	}

	for _, row := range rows {
		c.collectRow(ch, row)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats fetch
// ─────────────────────────────────────────────────────────────────────────────

// haproxyStatRow holds one parsed CSV row from HAProxy stats output.
type haproxyStatRow struct {
	pxname  string // frontend/backend name
	svname  string // server name ("FRONTEND", "BACKEND", or actual server)
	itype   string // "0"=frontend "1"=backend "2"=server "3"=socket/listener
	status  string // "UP", "DOWN", "MAINT", "no check", ...
	scur    int64  // current sessions
	stot    int64  // total sessions
	bin     int64  // bytes in
	bout    int64  // bytes out
	qcur    int64  // current queue
	rate    int64  // connection rate
	reqRate int64  // request rate
	hrsp1xx int64
	hrsp2xx int64
	hrsp3xx int64
	hrsp4xx int64
	hrsp5xx int64
	act     int64 // active servers
	bck     int64 // backup servers
	upsecs  int64 // uptime seconds
}

func (c *HAProxyCollector) fetchStats(ctx context.Context) ([]haproxyStatRow, error) {
	var csvData string
	var err error

	if c.statsSocket != "" {
		csvData, err = c.fetchFromSocket(ctx)
	} else {
		csvData, err = c.fetchFromHTTP(ctx)
	}
	if err != nil {
		return nil, err
	}
	return parseHAProxyCSV(csvData)
}

func (c *HAProxyCollector) fetchFromSocket(ctx context.Context) (string, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "unix", c.statsSocket)
	if err != nil {
		return "", fmt.Errorf("haproxy socket dial: %w", err)
	}
	defer conn.Close() //nolint:errcheck

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	if _, err := fmt.Fprint(conn, "show stat\n"); err != nil {
		return "", fmt.Errorf("haproxy socket write: %w", err)
	}

	var sb strings.Builder
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		sb.WriteString(scanner.Text())
		sb.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		return "", fmt.Errorf("haproxy socket read: %w", err)
	}
	return sb.String(), nil
}

func (c *HAProxyCollector) fetchFromHTTP(ctx context.Context) (string, error) {
	u := c.statsURL
	// Append CSV query params if not already present.
	if !strings.Contains(u, "csv") {
		sep := "?"
		if strings.Contains(u, "?") {
			sep = "&"
		}
		u += sep + "stats;csv;norefresh"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("haproxy http stats: build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("haproxy http stats: do: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("haproxy http stats: read body: %w", err)
	}
	return string(data), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV parsing
// ─────────────────────────────────────────────────────────────────────────────

// HAProxy CSV column indices (0-based, from "show stat" output).
// Ref: https://www.haproxy.org/download/2.8/doc/management.txt §9.1
const (
	colPxname  = 0
	colSvname  = 1
	colScur    = 4
	colQcur    = 6
	colRate    = 33
	colStot    = 7
	colBin     = 8
	colBout    = 9
	colHrsp1xx = 39
	colHrsp2xx = 40
	colHrsp3xx = 41
	colHrsp4xx = 42
	colHrsp5xx = 43
	colStatus  = 17
	colAct     = 19
	colBck     = 20
	colReqRate = 46
	colItype   = 32
	colUpsecs  = 23
)

func parseHAProxyCSV(data string) ([]haproxyStatRow, error) {
	r := csv.NewReader(strings.NewReader(data))
	r.Comment = '#'
	r.TrimLeadingSpace = true
	r.FieldsPerRecord = -1 // variable; HAProxy versions differ

	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("haproxy csv parse: %w", err)
	}

	var rows []haproxyStatRow
	for _, rec := range records {
		if len(rec) < 20 {
			continue
		}
		row := haproxyStatRow{
			pxname: strings.TrimSpace(rec[colPxname]),
			svname: strings.TrimSpace(rec[colSvname]),
			status: safeGet(rec, colStatus),
		}
		row.scur = parseInt(rec, colScur)
		row.stot = parseInt(rec, colStot)
		row.bin = parseInt(rec, colBin)
		row.bout = parseInt(rec, colBout)
		row.qcur = parseInt(rec, colQcur)
		row.rate = parseInt(rec, colRate)
		row.reqRate = parseInt(rec, colReqRate)
		row.hrsp1xx = parseInt(rec, colHrsp1xx)
		row.hrsp2xx = parseInt(rec, colHrsp2xx)
		row.hrsp3xx = parseInt(rec, colHrsp3xx)
		row.hrsp4xx = parseInt(rec, colHrsp4xx)
		row.hrsp5xx = parseInt(rec, colHrsp5xx)
		row.act = parseInt(rec, colAct)
		row.bck = parseInt(rec, colBck)
		row.upsecs = parseInt(rec, colUpsecs)
		row.itype = safeGet(rec, colItype)
		rows = append(rows, row)
	}
	return rows, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric emission
// ─────────────────────────────────────────────────────────────────────────────

func (c *HAProxyCollector) collectRow(ch chan<- prometheus.Metric, row haproxyStatRow) {
	ls := prometheus.Labels{}
	_ = ls // not used below but kept for clarity

	px, sv, it := row.pxname, row.svname, row.itype

	emit := func(desc *prometheus.Desc, v float64, labels ...string) {
		ch <- prometheus.MustNewConstMetric(desc, prometheus.CounterValue, v, labels...)
	}
	emitGauge := func(desc *prometheus.Desc, v float64, labels ...string) {
		ch <- prometheus.MustNewConstMetric(desc, prometheus.GaugeValue, v, labels...)
	}

	emit(c.descSessionsTotal, float64(row.stot), px, sv, it)
	emit(c.descBytesIn, float64(row.bin), px, sv, it)
	emit(c.descBytesOut, float64(row.bout), px, sv, it)
	emitGauge(c.descQueueCurrent, float64(row.qcur), px, sv, it)
	emitGauge(c.descConnRate, float64(row.rate), px, sv, it)
	emitGauge(c.descReqRate, float64(row.reqRate), px, sv, it)

	// HTTP response code breakdown.
	emit(c.descResponseCodes, float64(row.hrsp1xx), px, sv, "1xx")
	emit(c.descResponseCodes, float64(row.hrsp2xx), px, sv, "2xx")
	emit(c.descResponseCodes, float64(row.hrsp3xx), px, sv, "3xx")
	emit(c.descResponseCodes, float64(row.hrsp4xx), px, sv, "4xx")
	emit(c.descResponseCodes, float64(row.hrsp5xx), px, sv, "5xx")

	// Server UP/DOWN status.
	statusVal := 0.0
	if strings.ToUpper(row.status) == "UP" || strings.ToUpper(row.status) == "OPEN" {
		statusVal = 1.0
	}
	emitGauge(c.descServerStatus, statusVal, px, sv, it)

	// Active / backup server counts (meaningful for BACKEND rows).
	if sv == "BACKEND" {
		emitGauge(c.descActiveServers, float64(row.act), px)
		emitGauge(c.descBackupServers, float64(row.bck), px)
	}

	// Process uptime (emit once from any row that has it).
	if row.upsecs > 0 && sv == "FRONTEND" {
		emitGauge(c.descUptime, float64(row.upsecs))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

func safeGet(rec []string, idx int) string {
	if idx < len(rec) {
		return strings.TrimSpace(rec[idx])
	}
	return ""
}

func parseInt(rec []string, idx int) int64 {
	s := safeGet(rec, idx)
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseInt(s, 10, 64)
	return v
}
