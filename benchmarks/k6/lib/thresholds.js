/**
 * benchmarks/k6/lib/thresholds.js
 *
 * Shared pass/fail thresholds applied to every scenario.
 *
 * k6 evaluates these at the END of the run and exits 1 if any are breached.
 * This makes the benchmark suite CI-safe: a regression blocks the pipeline.
 *
 * Threshold levels
 * ────────────────
 *   STRICT  — production SLA targets (used in full profile)
 *   RELAXED — looser gates for CI short-run noise tolerance
 *
 * Usage
 *   import { STRICT, RELAXED } from './thresholds.js';
 *   export const options = { thresholds: STRICT };
 */

// ── STRICT — release validation ───────────────────────────────────────────────

export const STRICT = {
  // Error rate: less than 0.1% of requests may fail
  http_req_failed: [
    { threshold: 'rate<0.001', abortOnFail: false },
  ],

  // Latency targets
  // p(95) < 50 ms — SLA-grade
  // p(99) < 100 ms — tail acceptable
  // p(99.9) < 250 ms — worst-case bounded
  http_req_duration: [
    { threshold: 'p(95)<50',   abortOnFail: false },
    { threshold: 'p(99)<100',  abortOnFail: false },
    { threshold: 'p(99.9)<250', abortOnFail: false },
  ],

  // Minimum throughput: 500 RPS sustained
  // k6 exposes this as the rate of the http_reqs counter.
  // We assert it via a custom metric set in each scenario.
  'rps_sustained{scenario:sustained}': [
    { threshold: 'value>500', abortOnFail: false },
  ],
};

// ── RELAXED — CI short runs (60 s, 50 VUs max) ────────────────────────────────

export const RELAXED = {
  http_req_failed: [
    { threshold: 'rate<0.005', abortOnFail: false }, // 0.5% allowed in short runs
  ],
  http_req_duration: [
    { threshold: 'p(95)<100',  abortOnFail: false },
    { threshold: 'p(99)<250',  abortOnFail: false },
  ],
};

// ── Overhead thresholds (used by comparison.js, not k6 itself) ───────────────
//
// These are checked by compare.js when diffing a proxy result against baseline.
// Values are MAXIMUM ALLOWED OVERHEAD in ms over baseline p-values.

export const OVERHEAD_LIMITS_MS = {
  p50_vs_baseline:  2,   // +2 ms on median is acceptable
  p95_vs_baseline:  5,   // +5 ms on 95th percentile
  p99_vs_baseline:  15,  // +15 ms on 99th percentile (transient overhead ok)
};
