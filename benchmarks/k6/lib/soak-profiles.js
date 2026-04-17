/**
 * benchmarks/k6/lib/soak-profiles.js
 *
 * Stage 6 — Soak test profiles: 1h, 6h, 24h.
 *
 * A soak test runs at a FIXED, moderate load for an extended period.
 * Its goal is NOT to find the saturation point (that is Stage 3 stress.js)
 * but to detect:
 *   - Memory leaks (RSS growing monotonically over hours)
 *   - Goroutine / file-descriptor leaks (fd count growing unboundedly)
 *   - Latency drift (p99 rising over time as internal state accumulates)
 *   - Crash / OOM (process disappears mid-run)
 *   - Log file bloat (unbounded log rotation)
 *
 * Load model
 * ──────────
 * VU count is deliberately conservative — roughly 30–40 % of the peak
 * throughput found by the stress test.  The goal is sustained correctness,
 * not peak throughput.  Think time of 100 ms is added between iterations
 * to simulate realistic pacing and prevent CPU saturation masking memory
 * signals.
 *
 *   Profile  VUs   Think   Est. RPS   Duration   Total requests (approx)
 *   ──────── ───── ─────── ─────────── ──────── ──────────────────────────
 *   1h        30   100 ms    ~270       1 h        ~972 000
 *   6h        30   100 ms    ~270       6 h       ~5 832 000
 *   24h       20   100 ms    ~180      24 h       ~15 552 000
 *   smoke      5   100 ms    ~45        5 min      ~13 500  (CI gate)
 *
 * Measurement windows
 * ───────────────────
 * The run is divided into 6 equal windows.  The analysis script compares
 * window-1 stats (warm state) against window-6 stats (end state).
 * Drift is flagged if any of:
 *   - p99 grows > LATENCY_DRIFT_THRESHOLD_PCT  (default 20 %)
 *   - mean RSS grows > MEMORY_GROWTH_THRESHOLD_PCT  (default 15 %)
 *   - error rate grows by > ERRRATE_DRIFT_ABS  (default 0.1 pp)
 *
 * Thresholds
 * ──────────
 * Soak thresholds are TIGHTER on error rate (< 0.01 %) but WIDER on
 * absolute latency (soak runs against a real FlexGate, not the loopback
 * echo server — RTT is higher):
 *   - http_req_failed rate < 0.0001  (0.01 %)
 *   - http_req_duration p(99) < 200 ms  (wider than stress, allows for GC)
 *   - NO abortOnFail — soak must run for its full duration to detect leaks
 */

import { sleep } from 'k6';

// ── Duration constants (seconds) ──────────────────────────────────────────────

export const DURATIONS = {
  smoke: 5 * 60,           // 5 min — CI gate, confirms soak logic runs
  '1h':  1 * 60 * 60,     // 1 hour
  '6h':  6 * 60 * 60,     // 6 hours
  '24h': 24 * 60 * 60,    // 24 hours
};

// ── VU counts ─────────────────────────────────────────────────────────────────

export const VUS = {
  smoke: 5,
  '1h':  30,
  '6h':  30,
  '24h': 20,
};

// ── Think time (seconds) between iterations ───────────────────────────────────

export const THINK_TIME_S = 0.1;   // 100 ms — same across all durations

// ── Drift detection thresholds ────────────────────────────────────────────────

export const DRIFT = {
  latency_p99_pct:   20,    // flag if p99 in last window is > 20 % higher than first
  memory_rss_pct:    15,    // flag if mean RSS in last window is > 15 % higher than first
  errrate_abs_pp:     0.1,  // flag if error rate grows by > 0.1 percentage points
};

// ── k6 options builder ────────────────────────────────────────────────────────

/**
 * buildSoakOptions(profile)
 *
 * Returns a k6 options object for the given soak profile.
 * Imported and spread into the scenario's export const options = {...}.
 *
 * @param {'smoke'|'1h'|'6h'|'24h'} profile
 * @returns {object}
 */
export function buildSoakOptions(profile) {
  const dur = DURATIONS[profile];
  const vus = VUS[profile];

  if (!dur || !vus) {
    throw new Error(
      `Unknown soak profile: ${profile}. Valid: ${Object.keys(DURATIONS).join(', ')}`
    );
  }

  const durStr = formatDuration(dur);
  const warmup = Math.min(60, Math.floor(dur * 0.02));  // 2 % of run, max 60 s

  return {
    stages: [
      { duration: `${warmup}s`,  target: vus },   // ramp up
      { duration: durStr,         target: vus },   // soak body
      { duration: '30s',          target: 0   },   // drain
    ],
    thresholds: buildSoakThresholds(profile),
  };
}

// ── Threshold builder ─────────────────────────────────────────────────────────

export function buildSoakThresholds(profile) {
  // Smoke uses relaxed thresholds; all others use production-soak thresholds.
  if (profile === 'smoke') {
    return {
      http_req_failed:  [{ threshold: 'rate<0.01',   abortOnFail: false }],
      http_req_duration:[{ threshold: 'p(99)<500',   abortOnFail: false }],
    };
  }

  return {
    // Error rate: near-zero across millions of requests
    http_req_failed: [
      { threshold: 'rate<0.0001', abortOnFail: false },
    ],
    // Latency: allow wider budget than stress (real stack, not just echo)
    http_req_duration: [
      { threshold: 'p(95)<150',  abortOnFail: false },
      { threshold: 'p(99)<200',  abortOnFail: false },
    ],
    // RPS must stay above minimum through the full run
    // (regression in throughput = likely GC pause or resource exhaustion)
    http_reqs: [
      { threshold: 'rate>50', abortOnFail: false },
    ],
  };
}

// ── Window boundaries ─────────────────────────────────────────────────────────

/**
 * windowBoundaries(profile, n)
 *
 * Return n evenly-spaced window boundaries (in seconds from run start).
 * Used by soak-report.js to split the JSONL into time windows.
 *
 * @param {'smoke'|'1h'|'6h'|'24h'} profile
 * @param {number} n   number of windows (default 6)
 * @returns {number[]}  array of n+1 boundary timestamps (seconds from start)
 */
export function windowBoundaries(profile, n = 6) {
  const total = DURATIONS[profile];
  const step  = total / n;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step));
}

// ── Timing description ────────────────────────────────────────────────────────

/**
 * soakMeta(profile)
 *
 * Returns a plain object with human-readable timing for the envelope.
 */
export function soakMeta(profile) {
  return {
    profile,
    duration_s:       DURATIONS[profile],
    duration_human:   formatDuration(DURATIONS[profile]),
    target_vus:       VUS[profile],
    think_time_ms:    THINK_TIME_S * 1000,
    windows:          6,
    drift_thresholds: DRIFT,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * formatDuration(seconds) → '1h30m0s' style string for k6 stages
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

/**
 * soakSleep()
 *
 * Call at the end of each VU iteration.  Wraps k6's sleep() with the
 * standard soak think time.
 */
export function soakSleep() {
  sleep(THINK_TIME_S);
}
