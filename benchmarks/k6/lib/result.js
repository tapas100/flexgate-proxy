/**
 * benchmarks/k6/lib/result.js
 *
 * Shared result envelope builder used by all five benchmark scenarios.
 * Produces the JSON structure validated by benchmarks/results/schema.json.
 */

/* global __ENV */

/**
 * Build the result envelope written to disk by handleSummary().
 *
 * @param {string} scenario  - scenario identifier (e.g. 'nginx')
 * @param {string} target    - base URL under test
 * @param {string} profile   - 'ci' | 'full'
 * @param {Object} data      - k6 summary data object from handleSummary()
 * @returns {Object}         - envelope conforming to results/schema.json v1
 */
export function buildEnvelope(scenario, target, profile, data) {
  const dur = data.metrics.http_req_duration;
  const req = data.metrics.http_reqs;
  const err = data.metrics.http_req_failed;

  return {
    schema_version: 1,
    scenario,
    profile,
    target,
    timestamp: new Date().toISOString(),
    git_sha:   __ENV.GIT_SHA  || 'unknown',
    hardware: {
      note: 'single-node loopback — see ARCHITECTURE.md §3',
      os:   __ENV.BENCH_OS  || 'unknown',
      cpu:  __ENV.BENCH_CPU || 'unknown',
    },
    metrics: {
      rps: {
        mean: req ? (req.values.rate || 0) : 0,
      },
      latency_ms: {
        min:    dur ? dur.values.min             : null,
        mean:   dur ? dur.values.mean            : null,
        med:    dur ? dur.values.med             : null,
        p50:    dur ? dur.values['p(50)']        : null,
        p95:    dur ? dur.values['p(95)']        : null,
        p99:    dur ? dur.values['p(99)']        : null,
        p999:   dur ? dur.values['p(99.9)']      : null,
        max:    dur ? dur.values.max             : null,
        stddev: dur ? dur.values.stddev          : null,
      },
      error_rate_pct: err
        ? parseFloat((err.values.rate * 100).toFixed(4))
        : 0,
    },
    // Filled in by compare.js after all scenarios complete
    overhead_vs_baseline: null,
    thresholds_passed: summariseThresholds(data.thresholds),
  };
}

/**
 * Convert k6 threshold result map to a plain {key: boolean} object.
 *
 * @param {Object|undefined} thresholds
 * @returns {Object}
 */
export function summariseThresholds(thresholds) {
  if (!thresholds) return {};
  return Object.fromEntries(
    Object.entries(thresholds).map(([k, v]) => [k, v.ok])
  );
}
