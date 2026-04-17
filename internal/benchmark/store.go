// Package benchmark provides an in-memory store and real-time broadcaster for
// benchmark run results produced by the Node.js k6 runner (benchmarks/run.js).
//
// Architecture
// ────────────
//
//	benchmarks/run.js  →  POST /api/benchmarks/ingest  →  Store.Append()
//	                                                         └→  Hub.Broadcast()
//	                                                               └→  SSE clients  (Stage 3)
//
// The store holds one ring-buffer per scenario (last N data-points each).
// All methods are goroutine-safe.
package benchmark

import (
	"sync"
	"time"
)

// ── Data types ────────────────────────────────────────────────────────────────

// Scenario names accepted by the collector.
var KnownScenarios = []string{
	"baseline",
	"nginx",
	"haproxy",
	"flexgate-inline",
	"flexgate-mirror",
}

// DataPoint is one metric snapshot from a running k6 scenario.
// It is produced once per second by the MetricWindow aggregator in run.js
// and forwarded to this store via POST /api/benchmarks/ingest.
type DataPoint struct {
	// Scenario identifier — one of KnownScenarios.
	Scenario string `json:"scenario"`

	// Requests per second in this 1-s window.
	RPS float64 `json:"rps"`

	// Latency percentiles in milliseconds.  Null (zero) if no requests.
	P50 float64 `json:"p50"`
	P95 float64 `json:"p95"`
	P99 float64 `json:"p99"`

	// Error rate [0, 1].
	Errors float64 `json:"errors"`

	// Virtual users active in this window.
	VUs int `json:"vus"`

	// ISO-8601 timestamp of the 1-s window start.
	// Set by the runner; store falls back to server time if absent.
	Timestamp string `json:"timestamp"`
}

// RunStatus represents the current state of a benchmark run.
type RunStatus struct {
	// Running is true while k6 is actively producing data.
	Running bool `json:"running"`

	// ActiveScenario is the name of the scenario currently executing.
	// Empty string when no run is in progress.
	ActiveScenario string `json:"active_scenario"`

	// StartedAt is when the current or most-recent run began.
	StartedAt time.Time `json:"started_at"`

	// CompletedAt is when the most-recent run finished (zero if still running).
	CompletedAt time.Time `json:"completed_at,omitempty"`

	// Scenarios holds the pass/fail result for each completed scenario.
	Scenarios map[string]ScenarioResult `json:"scenarios"`
}

// ScenarioResult is the final summary written when a scenario finishes.
type ScenarioResult struct {
	Scenario  string    `json:"scenario"`
	Passed    bool      `json:"passed"`
	ExitCode  int       `json:"exit_code"`
	StartedAt time.Time `json:"started_at"`
	EndedAt   time.Time `json:"ended_at"`

	// Final aggregated metrics across the entire run.
	Summary *FinalSummary `json:"summary,omitempty"`
}

// FinalSummary holds the end-of-scenario aggregate produced by k6's
// handleSummary() and forwarded by the runner via POST /api/benchmarks/complete.
type FinalSummary struct {
	RPS    float64 `json:"rps_mean"`
	P50    float64 `json:"p50"`
	P95    float64 `json:"p95"`
	P99    float64 `json:"p99"`
	Errors float64 `json:"error_rate_pct"`
}

// ── Store ─────────────────────────────────────────────────────────────────────

const defaultRingSize = 300 // 5 minutes at 1-s resolution

// Store is a thread-safe in-memory ring-buffer for benchmark data-points.
// It resets fully on process restart — no persistence is intentional.
type Store struct {
	mu       sync.RWMutex
	points   map[string][]DataPoint // scenario → ring
	ringSize int
	status   RunStatus
}

// NewStore creates an empty Store with a ring buffer of ringSize entries
// per scenario.  Pass 0 to use the default (300).
func NewStore(ringSize int) *Store {
	if ringSize <= 0 {
		ringSize = defaultRingSize
	}
	s := &Store{
		ringSize: ringSize,
		points:   make(map[string][]DataPoint, len(KnownScenarios)),
		status: RunStatus{
			Scenarios: make(map[string]ScenarioResult),
		},
	}
	for _, name := range KnownScenarios {
		s.points[name] = make([]DataPoint, 0, ringSize)
	}
	return s
}

// Append adds a data-point to the ring-buffer for its scenario.
// If the buffer is full the oldest entry is evicted.
// Returns an error only for unknown/empty scenario names.
func (s *Store) Append(dp DataPoint) error {
	if dp.Scenario == "" {
		dp.Scenario = "unknown"
	}
	if dp.Timestamp == "" {
		dp.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	ring := s.points[dp.Scenario]
	if len(ring) >= s.ringSize {
		// Evict oldest — shift left
		ring = ring[1:]
	}
	s.points[dp.Scenario] = append(ring, dp)
	return nil
}

// All returns a copy of every data-point currently held, keyed by scenario.
func (s *Store) All() map[string][]DataPoint {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make(map[string][]DataPoint, len(s.points))
	for k, v := range s.points {
		cp := make([]DataPoint, len(v))
		copy(cp, v)
		out[k] = cp
	}
	return out
}

// ForScenario returns a copy of the data-points for a single scenario.
// Returns nil if the scenario is unknown.
func (s *Store) ForScenario(name string) []DataPoint {
	s.mu.RLock()
	defer s.mu.RUnlock()

	v, ok := s.points[name]
	if !ok {
		return nil
	}
	cp := make([]DataPoint, len(v))
	copy(cp, v)
	return cp
}

// Latest returns the most-recent data-point for every scenario that has data.
func (s *Store) Latest() map[string]DataPoint {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make(map[string]DataPoint)
	for k, v := range s.points {
		if len(v) > 0 {
			out[k] = v[len(v)-1]
		}
	}
	return out
}

// Reset wipes all stored data-points and resets run status.
// Called automatically when a new run starts.
func (s *Store) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for k := range s.points {
		s.points[k] = s.points[k][:0]
	}
	s.status = RunStatus{
		Scenarios: make(map[string]ScenarioResult),
	}
}

// Status returns a snapshot of the current run status.
func (s *Store) Status() RunStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Deep-copy the scenarios map so the caller can't mutate it.
	st := s.status
	sc := make(map[string]ScenarioResult, len(s.status.Scenarios))
	for k, v := range s.status.Scenarios {
		sc[k] = v
	}
	st.Scenarios = sc
	return st
}

// MarkRunStarted records that a new benchmark run has begun.
func (s *Store) MarkRunStarted(scenario string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status.Running        = true
	s.status.ActiveScenario = scenario
	s.status.StartedAt      = time.Now().UTC()
	s.status.CompletedAt    = time.Time{}
}

// MarkScenarioStarted notes that a specific scenario is now running.
func (s *Store) MarkScenarioStarted(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status.ActiveScenario = name
	// Only create a new entry if one doesn't exist yet — avoids overwriting
	// a StartedAt that was already set by a previous progress event.
	if existing, ok := s.status.Scenarios[name]; !ok || existing.StartedAt.IsZero() {
		s.status.Scenarios[name] = ScenarioResult{
			Scenario:  name,
			StartedAt: time.Now().UTC(),
		}
	}
}

// MarkScenarioComplete records the result of a finished scenario.
func (s *Store) MarkScenarioComplete(r ScenarioResult) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.EndedAt.IsZero() {
		r.EndedAt = time.Now().UTC()
	}
	s.status.Scenarios[r.Scenario] = r
}

// MarkRunComplete records that the entire run has finished.
func (s *Store) MarkRunComplete() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status.Running        = false
	s.status.ActiveScenario = ""
	s.status.CompletedAt    = time.Now().UTC()
}

// ── Singleton ─────────────────────────────────────────────────────────────────

// Global is the process-level Store instance wired into the admin router.
// Initialised once at startup; reset at the start of each benchmark run.
var Global = NewStore(0)
