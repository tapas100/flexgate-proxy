package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/metrics"
)

// MetricsHandler handles admin metrics endpoints.
type MetricsHandler struct {
	log zerolog.Logger
}

// NewMetricsHandler constructs a MetricsHandler.
func NewMetricsHandler(log zerolog.Logger) *MetricsHandler {
	return &MetricsHandler{log: log}
}

// summaryResponse is the JSON shape returned by GET /api/metrics/summary.
// Fields match the Summary struct from the metrics package with an additional
// human-readable wrapper.
type summaryResponse struct {
	// Latency percentiles in milliseconds. -1 means no data yet.
	LatencyP50Ms float64 `json:"latency_p50_ms"`
	LatencyP95Ms float64 `json:"latency_p95_ms"`
	LatencyP99Ms float64 `json:"latency_p99_ms"`

	// ErrorRate is the fraction of requests that returned a 5xx status.
	// Range [0, 1]. -1 means no data yet.
	ErrorRate float64 `json:"error_rate"`

	// TotalRequests is the cumulative request count since process start.
	TotalRequests float64 `json:"total_requests"`

	// ActiveRequests is the number of requests currently in flight.
	ActiveRequests float64 `json:"active_requests"`

	// IntelligenceCircuitOpen is true when the intelligence circuit breaker
	// has tripped (intelligence service is assumed unavailable).
	IntelligenceCircuitOpen bool `json:"intelligence_circuit_open"`
}

// Summary handles GET /api/metrics/summary.
//
// It reads live Prometheus metric data from the shared registry and returns a
// compact JSON document with P50/P95/P99 latency, error rate, and the
// intelligence circuit-breaker status.
//
// Example response:
//
//	{
//	  "latency_p50_ms": 4.3,
//	  "latency_p95_ms": 28.7,
//	  "latency_p99_ms": 95.1,
//	  "error_rate": 0.0012,
//	  "total_requests": 148203,
//	  "active_requests": 7,
//	  "intelligence_circuit_open": false
//	}
func (h *MetricsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	s := metrics.GatherSummary()

	resp := summaryResponse{
		LatencyP50Ms:            s.P50,
		LatencyP95Ms:            s.P95,
		LatencyP99Ms:            s.P99,
		ErrorRate:               s.ErrorRate,
		TotalRequests:           s.TotalRequests,
		ActiveRequests:          s.ActiveRequestsNow,
		IntelligenceCircuitOpen: s.IntelligenceCircuitOpen,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		h.log.Error().Err(err).Msg("admin/metrics: failed to encode summary response")
	}
}
