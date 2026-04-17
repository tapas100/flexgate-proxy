package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/benchmark"
)

// BenchmarkHandler serves the /api/benchmarks family of endpoints.
//
// Endpoints registered in router.go:
//
//	GET  /api/benchmarks         → list all stored data-points, keyed by scenario
//	GET  /api/benchmarks/latest  → one data-point per scenario (most recent)
//	GET  /api/benchmarks/status  → current run status (running / idle / results)
//	POST /api/benchmarks/ingest  → ingest one DataPoint from benchmarks/run.js
//	POST /api/benchmarks/start   → signal that a new run has started (resets store)
//	POST /api/benchmarks/progress → update scenario running/passed/failed status
//	POST /api/benchmarks/summary → record final per-scenario aggregate
//	POST /api/benchmarks/complete → signal that the entire run is done
type BenchmarkHandler struct {
	collector *benchmark.Collector
	store     *benchmark.Store
	log       zerolog.Logger
}

// NewBenchmarkHandler wires up the handler with the global singletons.
func NewBenchmarkHandler(log zerolog.Logger) *BenchmarkHandler {
	return &BenchmarkHandler{
		collector: benchmark.GlobalCollector,
		store:     benchmark.Global,
		log:       log,
	}
}

// ── GET /api/benchmarks ───────────────────────────────────────────────────────

// List returns every stored data-point, grouped by scenario.
//
// Response shape:
//
//	{
//	  "baseline":        [ { DataPoint }, … ],
//	  "nginx":           [ … ],
//	  "haproxy":         [ … ],
//	  "flexgate-inline": [ … ],
//	  "flexgate-mirror": [ … ]
//	}
func (h *BenchmarkHandler) List(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, h.store.All())
}

// ── GET /api/benchmarks/latest ────────────────────────────────────────────────

// Latest returns the most-recent data-point for each scenario that has data.
//
// Response shape:
//
//	{
//	  "baseline": { DataPoint },
//	  "nginx":    { DataPoint },
//	  …
//	}
func (h *BenchmarkHandler) Latest(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, h.store.Latest())
}

// ── GET /api/benchmarks/status ────────────────────────────────────────────────

// Status returns the current run lifecycle state.
//
// Response shape:
//
//	{
//	  "running": true,
//	  "active_scenario": "nginx",
//	  "started_at": "2026-04-14T10:00:00Z",
//	  "completed_at": null,
//	  "scenarios": {
//	    "baseline": { "passed": true, "exit_code": 0, … },
//	    …
//	  }
//	}
func (h *BenchmarkHandler) Status(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, h.store.Status())
}

// ── POST /api/benchmarks/ingest ───────────────────────────────────────────────

// Ingest accepts a single DataPoint from the Node runner and stores + broadcasts it.
//
// Request body (from benchmarks/run.js MetricWindow.flush()):
//
//	{
//	  "scenario":  "nginx",
//	  "rps":       523,
//	  "p50":       1.2,
//	  "p95":       2.8,
//	  "p99":       4.1,
//	  "errors":    0.002,
//	  "vus":       50,
//	  "timestamp": "2026-04-14T10:00:01Z"
//	}
func (h *BenchmarkHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	var dp benchmark.DataPoint
	if !decodeJSON(w, r, &dp) {
		return
	}

	if err := h.collector.Ingest(dp); err != nil {
		h.log.Error().Err(err).Str("scenario", dp.Scenario).Msg("benchmark: ingest failed")
		Error(w, http.StatusInternalServerError, "ingest failed: "+err.Error())
		return
	}

	JSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

// IngestBatch accepts an array of DataPoints (backfill / bulk push).
//
// Request body: [ { DataPoint }, … ]
func (h *BenchmarkHandler) IngestBatch(w http.ResponseWriter, r *http.Request) {
	var dps []benchmark.DataPoint
	if !decodeJSON(w, r, &dps) {
		return
	}
	if len(dps) == 0 {
		Error(w, http.StatusBadRequest, "empty batch")
		return
	}

	if err := h.collector.IngestBatch(dps); err != nil {
		h.log.Error().Err(err).Msg("benchmark: batch ingest failed")
		Error(w, http.StatusInternalServerError, "batch ingest failed: "+err.Error())
		return
	}

	JSON(w, http.StatusAccepted, map[string]interface{}{
		"status":   "accepted",
		"ingested": len(dps),
	})
}

// ── POST /api/benchmarks/start ────────────────────────────────────────────────

// Start resets the store and signals the start of a new benchmark run.
//
// Request body:
//
//	{ "scenario": "baseline" }   ← first scenario that will run
func (h *BenchmarkHandler) Start(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Scenario string `json:"scenario"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	h.collector.RecordRunStart(body.Scenario)
	h.log.Info().Str("first_scenario", body.Scenario).Msg("benchmark: run started — store reset")

	JSON(w, http.StatusOK, map[string]string{"status": "started"})
}

// ── POST /api/benchmarks/progress ────────────────────────────────────────────

// Progress records a scenario status change (running → passed | failed).
//
// Request body:
//
//	{ "scenario": "nginx", "status": "passed", "exit_code": 0 }
func (h *BenchmarkHandler) Progress(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Scenario string `json:"scenario"`
		Status   string `json:"status"`
		ExitCode int    `json:"exit_code"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	h.collector.RecordProgress(body.Scenario, body.Status, body.ExitCode)
	JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── POST /api/benchmarks/summary ─────────────────────────────────────────────

// Summary stores the final aggregate for a completed scenario.
//
// Request body: benchmark.ScenarioResult JSON
func (h *BenchmarkHandler) Summary(w http.ResponseWriter, r *http.Request) {
	var result benchmark.ScenarioResult

	// ScenarioResult contains time.Time fields — use standard json decoder.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		Error(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	h.collector.RecordSummary(result)
	JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── POST /api/benchmarks/complete ────────────────────────────────────────────

// Complete signals that all scenarios in the run have finished.
func (h *BenchmarkHandler) Complete(w http.ResponseWriter, r *http.Request) {
	h.collector.RecordRunComplete()
	h.log.Info().Msg("benchmark: run complete")
	JSON(w, http.StatusOK, map[string]string{"status": "complete"})
}
