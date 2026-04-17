// Package benchmark — collector / ingest logic.
//
// The Collector wraps Store + Hub and exposes a single method (Ingest) that
// the HTTP handler calls after parsing the request body.  Keeping business
// logic here (not in the handler) makes it easy to test without an HTTP layer.
package benchmark

import "time"

// Collector orchestrates Store writes and Hub broadcasts.
type Collector struct {
	store *Store
	hub   *Hub
}

// NewCollector creates a Collector backed by the given store and hub.
// Pass benchmark.Global and benchmark.GlobalHub for the singletons.
func NewCollector(store *Store, hub *Hub) *Collector {
	return &Collector{store: store, hub: hub}
}

// Ingest accepts a single DataPoint, persists it to the store, and
// broadcasts it to all SSE subscribers.
func (c *Collector) Ingest(dp DataPoint) error {
	// Normalise timestamp
	if dp.Timestamp == "" {
		dp.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	if err := c.store.Append(dp); err != nil {
		return err
	}

	c.hub.Broadcast(BroadcastMsg{
		Type: "metric",
		Data: dp,
	})

	return nil
}

// IngestBatch accepts multiple DataPoints (e.g. a backfill from the runner).
func (c *Collector) IngestBatch(dps []DataPoint) error {
	for _, dp := range dps {
		if err := c.Ingest(dp); err != nil {
			return err
		}
	}
	return nil
}

// RecordProgress broadcasts a progress event (scenario status change) without
// persisting it to the store — progress events are transient.
func (c *Collector) RecordProgress(scenario, status string, exitCode int) {
	if status == "running" {
		c.store.MarkScenarioStarted(scenario)
	}

	c.hub.Broadcast(BroadcastMsg{
		Type: "progress",
		Data: map[string]interface{}{
			"scenario":  scenario,
			"status":    status,
			"exit_code": exitCode,
			"ts":        time.Now().UTC().Format(time.RFC3339),
		},
	})
}

// RecordSummary stores a completed scenario's final aggregate and broadcasts
// a summary event to all subscribers.
func (c *Collector) RecordSummary(r ScenarioResult) {
	c.store.MarkScenarioComplete(r)

	c.hub.Broadcast(BroadcastMsg{
		Type: "summary",
		Data: r,
	})
}

// RecordRunStart resets the store and broadcasts a reset event so connected
// frontends know to clear their charts.
func (c *Collector) RecordRunStart(scenario string) {
	c.store.Reset()
	c.store.MarkRunStarted(scenario)

	c.hub.Broadcast(BroadcastMsg{
		Type: "reset",
		Data: map[string]interface{}{
			"ts": time.Now().UTC().Format(time.RFC3339),
		},
	})
}

// RecordRunComplete marks the run as done and broadcasts a done event.
func (c *Collector) RecordRunComplete() {
	c.store.MarkRunComplete()

	c.hub.Broadcast(BroadcastMsg{
		Type: "done",
		Data: map[string]interface{}{
			"ts":        time.Now().UTC().Format(time.RFC3339),
			"scenarios": c.store.Status().Scenarios,
		},
	})
}

// GlobalCollector is the process-level Collector wired into the admin router.
var GlobalCollector = NewCollector(Global, GlobalHub)
