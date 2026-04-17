/**
 * benchmarks/k6/lib/failure-profiles.js
 *
 * Stage 7 — Failure test profiles and shared constants.
 *
 * Four fault scenarios are tested:
 *
 *   FAULT_BACKEND_DOWN   — upstream refuses connections entirely
 *   FAULT_SLOW_BACKEND   — upstream adds artificial latency (simulates overload)
 *   FAULT_TIMEOUT        — upstream hangs until FlexGate's per-request timeout fires
 *   FAULT_REDIS_DOWN     — Redis is unavailable (rate-limiting degrades to fail-open)
 *
 * For each scenario the test has three phases:
 *
 *   1. BASELINE  — steady normal traffic before any fault is injected
 *   2. FAULT     — fault is active; expected errors/timeouts/degradation
 *   3. RECOVERY  — fault is removed; system must return to baseline
 *
 * The k6 scenario is parameterized by the FAULT_SCENARIO env var.
 * Infrastructure setup/teardown is handled by run-failure.sh (Stage 7 runner).
 *
 * Expected behaviour contract
 * ──────────────────────────
 *   BACKEND_DOWN   → FlexGate returns HTTP 502 with body {"error":"upstream error"}
 *                    response time < 100 ms (fast fail, not hang)
 *   SLOW_BACKEND   → FlexGate proxies and returns 200; p99 rises to ~upstream_delay
 *                    no crashes; graceful degradation
 *   TIMEOUT        → FlexGate returns HTTP 504 with body {"error":"upstream timeout"}
 *                    within defaultUpstreamTimeout + small overhead
 *   REDIS_DOWN     → Rate-limit checks short-circuit (fail-open); requests pass through
 *                    as normal (no 429, no crash, < 5 ms overhead vs no-Redis baseline)
 *
 * Load levels
 * ───────────
 * Failure tests use LOW load — just enough to detect failure behaviour without
 * flooding the system in an already-degraded state.  10 VUs is sufficient.
 *
 *   Phase       VUs   Duration
 *   baseline    10    30 s   — warm the connection pool, establish healthy baseline
 *   fault       10    60 s   — inject fault, measure degraded behaviour
 *   recovery    10    30 s   — remove fault, verify system heals
 */

// ── Phase timing ──────────────────────────────────────────────────────────────

export const PHASE_TIMING = {
  baseline_s:  30,
  fault_s:     60,
  recovery_s:  30,
};

export const PHASE_LABELS = ['baseline', 'fault', 'recovery'];

// ── VU count ──────────────────────────────────────────────────────────────────

export const FAILURE_VUS = 10;

// ── k6 stages for failure scenarios ──────────────────────────────────────────

export const FAILURE_STAGES = [
  { duration: `${PHASE_TIMING.baseline_s}s`,  target: FAILURE_VUS },  // baseline
  { duration: `${PHASE_TIMING.fault_s}s`,      target: FAILURE_VUS },  // fault active
  { duration: `${PHASE_TIMING.recovery_s}s`,   target: FAILURE_VUS },  // recovery
  { duration: '5s',                            target: 0            },  // drain
];

// ── Scenario-specific expected behaviour ─────────────────────────────────────

export const EXPECTED = {
  'backend-down': {
    description:       'Upstream refuses all connections',
    fault_phase_status:[502],
    fault_error_rate_min: 0.95,  // ≥ 95 % of fault-phase requests must be 502
    response_time_max_ms: 200,   // fail-fast — must not hang
    recovery_error_rate_max: 0.01,
    no_crash: true,
    check_header: false,
  },

  'slow-backend': {
    description:       'Upstream delays every response by SLOW_DELAY_MS (default 800 ms)',
    fault_phase_status:[200],
    fault_error_rate_min: 0,     // no errors expected — just slow
    fault_p99_min_ms: 700,       // p99 must be >= upstream delay (proves delay reached FlexGate)
    recovery_p99_max_ms: 100,    // after recovery, latency returns to normal
    no_crash: true,
    check_header: true,
  },

  'timeout': {
    description:       'Upstream hangs forever; FlexGate timeout fires',
    fault_phase_status:[504],
    fault_error_rate_min: 0.90,  // ≥ 90 % of fault-phase requests timeout
    timeout_max_ms: 35000,       // FlexGate default timeout 30s + 5s overhead
    no_crash: true,
    check_header: false,
  },

  'redis-down': {
    description:       'Redis unavailable; rate-limit checks fail-open',
    fault_phase_status:[200],    // requests must PASS (fail-open behaviour)
    fault_error_rate_min: 0,
    fault_error_rate_max: 0.01,  // near-zero errors
    overhead_max_ms: 10,         // fail-open should add < 10 ms overhead
    no_crash: true,
    check_header: true,
  },
};

// ── Threshold builders ────────────────────────────────────────────────────────

/**
 * buildFailureThresholds(scenario)
 *
 * Returns k6 thresholds appropriate for the given fault scenario.
 * These thresholds gate the overall pass/fail of the k6 run.
 * They are intentionally loose — the detailed per-phase assertions
 * are done in handleSummary via the EXPECTED contract above.
 *
 * @param {string} scenario  e.g. 'backend-down'
 * @returns {object}
 */
export function buildFailureThresholds(scenario) {
  switch (scenario) {
    case 'backend-down':
      // During fault phase 100 % of requests fail — that's expected and correct.
      // Overall error rate will be high. We assert on fault_phase metrics in summary.
      // Threshold here: no OOM / infinite hang — p99 must be < 5 s regardless.
      return {
        http_req_duration: [{ threshold: 'p(99)<5000', abortOnFail: false }],
        // DO NOT assert low error rate — 502s are the expected behaviour.
      };

    case 'slow-backend':
      // No errors expected at all during slow-backend.
      return {
        http_req_failed:   [{ threshold: 'rate<0.01',   abortOnFail: false }],
        http_req_duration: [{ threshold: 'p(99)<35000', abortOnFail: false }],
      };

    case 'timeout':
      // Timeouts ARE the expected behaviour — no error-rate threshold.
      // But p99 must be < timeout + 5 s overhead.
      return {
        http_req_duration: [{ threshold: 'p(99)<35000', abortOnFail: false }],
      };

    case 'redis-down':
      // Redis-down must be fail-open: no errors, very small latency overhead.
      return {
        http_req_failed:   [{ threshold: 'rate<0.01',  abortOnFail: true  }],
        http_req_duration: [{ threshold: 'p(99)<500',  abortOnFail: false }],
      };

    default:
      return {
        http_req_duration: [{ threshold: 'p(99)<35000', abortOnFail: false }],
      };
  }
}

// ── Phase detector ────────────────────────────────────────────────────────────

/**
 * currentPhase(elapsedMs)
 *
 * Returns 'baseline' | 'fault' | 'recovery' | 'drain'
 * based on elapsed time from test start.
 *
 * Call this in each VU iteration and tag requests with the result so that
 * handleSummary can separate phase metrics.
 *
 * @param {number} elapsedMs   Date.now() - startEpochMs
 * @returns {string}
 */
export function currentPhase(elapsedMs) {
  const s = elapsedMs / 1000;
  const { baseline_s, fault_s, recovery_s } = PHASE_TIMING;

  if (s < baseline_s)                         return 'baseline';
  if (s < baseline_s + fault_s)               return 'fault';
  if (s < baseline_s + fault_s + recovery_s)  return 'recovery';
  return 'drain';
}

// ── Scenario names valid in schema ───────────────────────────────────────────

export const FAULT_SCENARIOS = [
  'backend-down',
  'slow-backend',
  'timeout',
  'redis-down',
];

export function faultScenarioLabel(scenario) {
  return `failure-${scenario}`;  // e.g. 'failure-backend-down'
}
