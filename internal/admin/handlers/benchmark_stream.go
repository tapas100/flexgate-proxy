package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/benchmark"
)

// BenchmarkStreamHandler serves GET /api/stream/benchmarks as a
// Server-Sent Events (SSE) endpoint.
//
// Protocol
// ────────
// Each SSE frame carries a named event so the client can dispatch cleanly:
//
//	event: connected
//	data: {"type":"connected","ts":"…"}
//
//	event: metric
//	data: {"type":"metric","scenario":"nginx","rps":523,"p50":1.2,…}
//
//	event: progress
//	data: {"type":"progress","scenario":"nginx","status":"passed","exit_code":0}
//
//	event: summary
//	data: {"type":"summary","scenario":"nginx","passed":true,…}
//
//	event: done
//	data: {"type":"done","ts":"…","scenarios":{…}}
//
//	event: reset
//	data: {"type":"reset","ts":"…"}
//
//	event: heartbeat
//	data: {"type":"heartbeat","ts":"…","subscribers":3}
//
// On first connect the handler immediately replays the current store state
// (all buffered data-points + current run status) so the browser catches up
// without waiting for the next live event.
type BenchmarkStreamHandler struct {
	hub   *benchmark.Hub
	store *benchmark.Store
	log   zerolog.Logger
}

// NewBenchmarkStreamHandler returns a handler backed by the global singletons.
func NewBenchmarkStreamHandler(log zerolog.Logger) *BenchmarkStreamHandler {
	return &BenchmarkStreamHandler{
		hub:   benchmark.GlobalHub,
		store: benchmark.Global,
		log:   log,
	}
}

// Stream handles GET /api/stream/benchmarks.
func (h *BenchmarkStreamHandler) Stream(w http.ResponseWriter, r *http.Request) {
	// ── SSE header block ────────────────────────────────────────────────────
	// Must be set before the first Write / Flush call.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx/HAProxy output buffering

	// CORS — allow the React dev server (port 3001) to subscribe while the Go
	// binary runs on a different port.  In production both are on the same
	// origin so this is a no-op.
	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	// ── Flusher check ───────────────────────────────────────────────────────
	flusher, ok := w.(http.Flusher)
	if !ok {
		h.log.Error().Msg("benchmark/stream: ResponseWriter does not implement http.Flusher")
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// ── Subscribe to hub ────────────────────────────────────────────────────
	sub := h.hub.Subscribe()
	defer h.hub.Unsubscribe(sub)

	ctx := r.Context()

	h.log.Debug().
		Str("remote", r.RemoteAddr).
		Int("subscribers", h.hub.Len()).
		Msg("benchmark/stream: client connected")

	// ── Replay current store state ───────────────────────────────────────────
	// Send a "connected" event first so the client knows the stream is live.
	h.writeEvent(w, flusher, "connected", map[string]interface{}{
		"type":        "connected",
		"ts":          time.Now().UTC().Format(time.RFC3339),
		"subscribers": h.hub.Len(),
	})

	// Replay current run status so the frontend can restore its UI state
	// (e.g. show "Running: nginx" if a run is already in progress).
	status := h.store.Status()
	h.writeEvent(w, flusher, "status", map[string]interface{}{
		"type":   "status",
		"status": status,
	})

	// Replay all buffered data-points, grouped by scenario.
	// Sent as a single "replay" event so the frontend can bulk-load its charts
	// rather than processing hundreds of individual "metric" events on connect.
	all := h.store.All()
	h.writeEvent(w, flusher, "replay", map[string]interface{}{
		"type": "replay",
		"data": all,
		"ts":   time.Now().UTC().Format(time.RFC3339),
	})

	// ── Heartbeat ticker ────────────────────────────────────────────────────
	// Keeps the TCP connection alive through proxies that close idle streams,
	// and lets the client detect silent disconnects (no heartbeat for > 30 s).
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	// ── Event loop ──────────────────────────────────────────────────────────
	for {
		select {

		case <-ctx.Done():
			// Client disconnected
			h.log.Debug().
				Str("remote", r.RemoteAddr).
				Msg("benchmark/stream: client disconnected")
			return

		case msg, ok := <-sub:
			if !ok {
				// Hub closed this subscriber (shutdown)
				return
			}
			h.writeEvent(w, flusher, msg.Type, msg.Data)

		case t := <-heartbeat.C:
			h.writeEvent(w, flusher, "heartbeat", map[string]interface{}{
				"type":        "heartbeat",
				"ts":          t.UTC().Format(time.RFC3339),
				"subscribers": h.hub.Len(),
			})
		}
	}
}

// ── Private helpers ───────────────────────────────────────────────────────────

// writeEvent serialises v as JSON and writes a complete SSE frame.
//
// SSE wire format:
//
//	event: <eventName>\n
//	data: <json>\n
//	\n
func (h *BenchmarkStreamHandler) writeEvent(
	w http.ResponseWriter,
	f http.Flusher,
	eventName string,
	v interface{},
) {
	payload, err := json.Marshal(v)
	if err != nil {
		h.log.Error().Err(err).Str("event", eventName).Msg("benchmark/stream: marshal failed")
		return
	}

	_, werr := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, payload)
	if werr != nil {
		// Client gone — the next ctx.Done() select arm will clean up
		return
	}
	f.Flush()
}

// writeComment writes an SSE comment line (": <text>\n\n").
// Used for keep-alive pings that don't trigger client-side event handlers.
func writeComment(w http.ResponseWriter, f http.Flusher, text string) {
	fmt.Fprintf(w, ": %s\n\n", text) //nolint:errcheck
	f.Flush()
}

// CORSPreflight handles OPTIONS /api/stream/benchmarks for browsers that
// send a preflight before opening an EventSource to a different origin.
func (h *BenchmarkStreamHandler) CORSPreflight(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Max-Age", "86400")
	}
	w.WriteHeader(http.StatusNoContent)
}
