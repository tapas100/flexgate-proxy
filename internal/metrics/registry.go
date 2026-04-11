// Package metrics provides the single shared Prometheus registry and all
// metric definitions for FlexGate Proxy.
//
// Design principles:
//   - One registry per process, created once at startup.
//   - All metric objects are exported so they can be incremented from any
//     package without passing a registry reference everywhere.
//   - Labels are kept narrow: adding high-cardinality labels (e.g. full path)
//     is deliberately avoided; route_id and upstream_host are bounded.
//   - HAProxy metrics are scraped on-demand via a collector; they are never
//     stored in memory between scrapes.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

// Registry is the single Prometheus registry used by the whole process.
// All collectors in this package register against it.
var Registry = prometheus.NewRegistry()

// reg is a shorthand used by promauto within this package.
var reg = prometheus.WrapRegistererWith(prometheus.Labels{}, Registry)

// ─────────────────────────────────────────────────────────────────────────────
// Proxy — core reverse-proxy metrics
// ─────────────────────────────────────────────────────────────────────────────

var (
	// RequestsTotal counts every HTTP request handled by the proxy.
	// Labels: method, route_id, status_class (2xx/4xx/5xx), upstream_host
	RequestsTotal = promauto.With(reg).NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "flexgate",
			Subsystem: "proxy",
			Name:      "requests_total",
			Help:      "Total number of HTTP requests processed by the proxy.",
		},
		[]string{"method", "route_id", "status_class", "upstream_host"},
	)

	// RequestDuration is a histogram of end-to-end proxy latency in seconds.
	// Buckets are tuned for a sub-100 ms SLO; the 5 ms intelligence timeout
	// sits well within the 0.005 bucket.
	RequestDuration = promauto.With(reg).NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "flexgate",
			Subsystem: "proxy",
			Name:      "request_duration_seconds",
			Help:      "End-to-end request duration in seconds.",
			Buckets:   []float64{.001, .0025, .005, .01, .025, .05, .1, .25, .5, 1, 2.5},
		},
		[]string{"method", "route_id", "status_class"},
	)

	// UpstreamResponseStatus counts upstream HTTP status codes.
	// Labels: upstream_host, status_class
	UpstreamResponseStatus = promauto.With(reg).NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "flexgate",
			Subsystem: "proxy",
			Name:      "upstream_response_status_total",
			Help:      "Upstream HTTP response status codes.",
		},
		[]string{"upstream_host", "status_class"},
	)

	// ActiveRequests is the current number of in-flight proxy requests.
	ActiveRequests = promauto.With(reg).NewGauge(prometheus.GaugeOpts{
		Namespace: "flexgate",
		Subsystem: "proxy",
		Name:      "active_requests",
		Help:      "Number of proxy requests currently in flight.",
	})

	// RouteCacheSize is the number of routes currently held in the sync.Map.
	RouteCacheSize = promauto.With(reg).NewGauge(prometheus.GaugeOpts{
		Namespace: "flexgate",
		Subsystem: "proxy",
		Name:      "route_cache_size",
		Help:      "Number of routes currently loaded in the in-memory route cache.",
	})

	// RouteCacheRefreshTotal counts every background route cache refresh.
	RouteCacheRefreshTotal = promauto.With(reg).NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "flexgate",
			Subsystem: "proxy",
			Name:      "route_cache_refresh_total",
			Help:      "Total number of route cache refreshes.",
		},
		[]string{"result"}, // "ok" | "error"
	)
)

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence — thin client metrics
// ─────────────────────────────────────────────────────────────────────────────

var (
	// IntelligenceRequestsTotal counts calls to the intelligence service.
	// Labels: operation (rate_limit/auth/record/get_logs), result (ok/fail/circuit_open)
	IntelligenceRequestsTotal = promauto.With(reg).NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "flexgate",
			Subsystem: "intelligence",
			Name:      "requests_total",
			Help:      "Total calls to the intelligence service.",
		},
		[]string{"operation", "result"},
	)

	// IntelligenceDuration is a histogram of intelligence RPC latency.
	// Buckets are tight: the hard timeout is 5 ms so anything > 5 ms is a failure.
	IntelligenceDuration = promauto.With(reg).NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "flexgate",
			Subsystem: "intelligence",
			Name:      "request_duration_seconds",
			Help:      "Intelligence service call duration in seconds.",
			Buckets:   []float64{.0005, .001, .0025, .005, .01, .025, .05},
		},
		[]string{"operation"},
	)

	// IntelligenceRateLimitDenied counts requests rejected by rate limiting.
	IntelligenceRateLimitDenied = promauto.With(reg).NewCounter(prometheus.CounterOpts{
		Namespace: "flexgate",
		Subsystem: "intelligence",
		Name:      "rate_limit_denied_total",
		Help:      "Total requests rejected by the intelligence rate limiter.",
	})

	// IntelligenceAuthDenied counts requests rejected by auth.
	IntelligenceAuthDenied = promauto.With(reg).NewCounter(prometheus.CounterOpts{
		Namespace: "flexgate",
		Subsystem: "intelligence",
		Name:      "auth_denied_total",
		Help:      "Total requests rejected by the intelligence auth check.",
	})

	// IntelligenceCircuitOpen is 1 when the circuit breaker is open, 0 when closed.
	IntelligenceCircuitOpen = promauto.With(reg).NewGauge(prometheus.GaugeOpts{
		Namespace: "flexgate",
		Subsystem: "intelligence",
		Name:      "circuit_open",
		Help:      "1 if the intelligence circuit breaker is currently open, 0 otherwise.",
	})

	// IntelligenceBatcherQueueDepth is the current batcher channel depth (gRPC mode).
	IntelligenceBatcherQueueDepth = promauto.With(reg).NewGauge(prometheus.GaugeOpts{
		Namespace: "flexgate",
		Subsystem: "intelligence",
		Name:      "batcher_queue_depth",
		Help:      "Current number of events waiting in the gRPC batcher queue.",
	})
)

// ─────────────────────────────────────────────────────────────────────────────
// Build-info metric (always present, never changes after startup)
// ─────────────────────────────────────────────────────────────────────────────

// BuildInfo is a gauge always set to 1.0 that carries version labels.
// Grafana dashboards use it to display the running version.
var BuildInfo = promauto.With(reg).NewGaugeVec(
	prometheus.GaugeOpts{
		Namespace: "flexgate",
		Name:      "build_info",
		Help:      "FlexGate build information (always 1).",
	},
	[]string{"version", "go_version"},
)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// StatusClass converts an HTTP status code to a Prometheus-friendly class
// string: "1xx", "2xx", "3xx", "4xx", "5xx", or "unknown".
func StatusClass(code int) string {
	switch {
	case code >= 100 && code < 200:
		return "1xx"
	case code >= 200 && code < 300:
		return "2xx"
	case code >= 300 && code < 400:
		return "3xx"
	case code >= 400 && code < 500:
		return "4xx"
	case code >= 500:
		return "5xx"
	default:
		return "unknown"
	}
}

// UpstreamHost extracts just the host (no scheme/path) from a raw upstream URL
// for use as a low-cardinality Prometheus label.
func UpstreamHost(upstream string) string {
	// Fast path: strip scheme.
	if i := indexScheme(upstream); i >= 0 {
		upstream = upstream[i+3:] // skip "://"
	}
	// Strip path.
	if i := indexByte(upstream, '/'); i >= 0 {
		upstream = upstream[:i]
	}
	if upstream == "" {
		return "unknown"
	}
	return upstream
}

func indexScheme(s string) int {
	for i := 0; i < len(s)-2; i++ {
		if s[i] == ':' && s[i+1] == '/' && s[i+2] == '/' {
			return i
		}
	}
	return -1
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
