/**
 * benchmarks/k6/lib/metrics.js
 *
 * Custom k6 metrics and helpers shared across all scenarios.
 *
 * Why custom metrics?
 * ───────────────────
 * k6's built-in http_reqs counter gives total count but not instantaneous RPS.
 * We track:
 *   - rps_sustained  : Gauge set once per iteration during the sustained stage
 *   - overhead_ms    : Trend recording per-request overhead vs baseline
 *   - scenario_meta  : structured tag bag written to every sample
 *
 * Usage
 *   import { RpsSustained, OverheadMs, tagRequest } from './metrics.js';
 */

import { Gauge, Trend, Counter } from 'k6/metrics';

// ── Custom metric objects ─────────────────────────────────────────────────────

/**
 * Instantaneous RPS gauge — set in sustained stage only.
 * compare.js reads this to assert minimum throughput.
 */
export const RpsSustained = new Gauge('rps_sustained');

/**
 * Per-request overhead (duration - baseline_p50).
 * Populated only in proxy scenarios where BASELINE_P50_MS env var is set.
 */
export const OverheadMs = new Trend('overhead_ms', true /* isTime */);

/**
 * Count of requests that exceeded the p99 threshold.
 * Useful for SLO breach counting.
 */
export const TailBreaches = new Counter('tail_breaches');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a consistent tag object applied to every http.get() call.
 *
 * @param {string} scenario  - e.g. 'baseline', 'nginx', 'flexgate-inline'
 * @param {string} stage     - e.g. 'warmup', 'ramp-up', 'sustained'
 * @returns {object}
 */
export function buildTags(scenario, stage) {
  return {
    scenario,
    stage,
    target: __ENV.TARGET_URL || 'unknown',
  };
}

/**
 * Record per-request overhead relative to a known baseline p50.
 * Call this inside each iteration when BASELINE_P50_MS is injected via env.
 *
 * @param {number} durationMs  - http_req_duration value for this request
 * @param {number} p99LimitMs  - p99 threshold to track tail breaches
 */
export function recordOverhead(durationMs, p99LimitMs = 100) {
  const baselineP50 = parseFloat(__ENV.BASELINE_P50_MS || '0');
  if (baselineP50 > 0) {
    OverheadMs.add(Math.max(0, durationMs - baselineP50));
  }
  if (durationMs > p99LimitMs) {
    TailBreaches.add(1);
  }
}

/**
 * Compute and set the RpsSustained gauge.
 * Call once per VU iteration during the sustained stage.
 *
 * k6 does not expose live RPS natively; we approximate it as
 *   (total_requests / elapsed_seconds)
 * from the __ITER and __VU globals plus a start timestamp passed from setup().
 *
 * @param {number} startTimestamp   - Date.now() value from setup()
 * @param {number} totalRequests    - running counter from scenario
 */
export function updateRpsGauge(startTimestamp, totalRequests) {
  const elapsedSecs = (Date.now() - startTimestamp) / 1000;
  if (elapsedSecs > 0) {
    RpsSustained.add(totalRequests / elapsedSecs);
  }
}

// ── Stage detection ───────────────────────────────────────────────────────────

/**
 * Return the name of the current load stage based on elapsed time.
 * This must match the scenario's stages[] duration values.
 *
 * @param {number} elapsedMs
 * @param {object} profile  - { warmup, rampUp, sustained } in seconds
 * @returns {'warmup'|'ramp-up'|'sustained'|'ramp-down'}
 */
export function currentStage(elapsedMs, profile) {
  const s = elapsedMs / 1000;
  if (s < profile.warmup)                        return 'warmup';
  if (s < profile.warmup + profile.rampUp)       return 'ramp-up';
  if (s < profile.warmup + profile.rampUp + profile.sustained) return 'sustained';
  return 'ramp-down';
}
