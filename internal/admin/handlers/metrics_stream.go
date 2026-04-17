package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/metrics"
)

// MetricsStreamHandler serves GET /api/stream/metrics as a Server-Sent Events
// (SSE) endpoint.  The frontend's useLiveMetrics hook subscribes to this stream
// and renders live charts; if the stream fails it falls back to polling
// GET /api/metrics/live.
//
// Each SSE message is a JSON object shaped to match BackendMetricsPayload in
// useLiveMetrics.ts:
//
//	{
//	  "summary":     { "uptime": 99.9, "total_requests": 1234, "active_requests": 3 },
//	  "latency":     { "p50": {...}, "p95": {...}, "p99": {...} },
//	  "errorRate":   { "name":"Error Rate","unit":"%","data":[{"timestamp":…,"value":…}] },
//	  "requestRate": { "name":"Request Rate","unit":"rps","data":[…] },
//	  "timestamp":   "2026-04-16T12:00:00Z"
//	}
type MetricsStreamHandler struct {
	log zerolog.Logger
}

// NewMetricsStreamHandler constructs a MetricsStreamHandler.
func NewMetricsStreamHandler(log zerolog.Logger) *MetricsStreamHandler {
	return &MetricsStreamHandler{log: log}
}

// Stream handles GET /api/stream/metrics.
func (h *MetricsStreamHandler) Stream(w http.ResponseWriter, r *http.Request) {
	// ── SSE headers ──────────────────────────────────────────────────────────
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// ── Send "connected" event immediately ──────────────────────────────────
	h.writeEvent(w, flusher, map[string]interface{}{
		"type": "connected",
		"ts":   time.Now().UTC().Format(time.RFC3339),
	})

	// ── Push a metrics snapshot every second ────────────────────────────────
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			snap := h.buildPayload(now)
			h.writeEvent(w, flusher, snap)
		}
	}
}

// buildPayload converts the live Prometheus metrics into the shape expected
// by BackendMetricsPayload in useLiveMetrics.ts.
func (h *MetricsStreamHandler) buildPayload(now time.Time) map[string]interface{} {
	s := metrics.GatherSummary()
	tsMs := now.UnixMilli()

	point := func(v float64) []map[string]interface{} {
		return []map[string]interface{}{{"timestamp": tsMs, "value": v}}
	}

	series := func(name, unit string, v float64) map[string]interface{} {
		return map[string]interface{}{
			"name": name,
			"unit": unit,
			"data": point(v),
		}
	}

	// Derive a crude "request rate" from TotalRequests — the frontend
	// accumulates deltas to draw a time-series.  A proper rate would need a
	// sliding-window counter; for now we expose the raw counter and let the
	// chart normalise it.
	uptime := 100.0
	if s.ErrorRate >= 0 {
		uptime = (1 - s.ErrorRate) * 100
	}

	return map[string]interface{}{
		"timestamp": now.UTC().Format(time.RFC3339),
		"summary": map[string]interface{}{
			"uptime":          uptime,
			"total_requests":  s.TotalRequests,
			"active_requests": s.ActiveRequestsNow,
		},
		"latency": map[string]interface{}{
			"p50": series("P50 Latency", "ms", s.P50),
			"p95": series("P95 Latency", "ms", s.P95),
			"p99": series("P99 Latency", "ms", s.P99),
		},
		"errorRate":   series("Error Rate", "%", s.ErrorRate*100),
		"requestRate": series("Request Rate", "rps", s.TotalRequests),
		"slo": map[string]interface{}{
			"availability": map[string]interface{}{
				"current": uptime,
				"target":  99.9,
				"budget":  100,
			},
			"latency": map[string]interface{}{
				"p50":       s.P50,
				"p95":       s.P95,
				"p99":       s.P99,
				"targetP95": 200,
				"targetP99": 500,
			},
			"errorRate": map[string]interface{}{
				"current": s.ErrorRate,
				"target":  0.001,
			},
		},
		"circuitBreakers": map[string]interface{}{
			"open":      0,
			"halfOpen":  0,
			"closed":    1,
			"intelligence_open": s.IntelligenceCircuitOpen,
		},
	}
}

// writeEvent serialises v to JSON and writes a single SSE data frame.
func (h *MetricsStreamHandler) writeEvent(w http.ResponseWriter, f http.Flusher, v interface{}) {
	b, err := json.Marshal(v)
	if err != nil {
		h.log.Error().Err(err).Msg("metrics/stream: marshal error")
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", b)
	f.Flush()
}
