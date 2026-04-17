/**
 * benchmarks/k6/scenarios/steady-load.js
 *
 * Scenario 6 — Steady Load (Stage 3)
 *
 * Goal
 * ────
 *   Prove that FlexGate delivers stable, SLA-compliant latency across the
 *   full operational RPS range: from light traffic (≈100 RPS) up to
 *   production peak (≈1 000 RPS), with no degradation during the
 *   sustained measurement window.
 *
 * Topology
 * ────────
 *   k6  ──►  HAProxy (:9003)  ──►  FlexGate (:8080)  ──►  Echo (:9000)
 *
 *   Same inline topology as Scenario 3.  The difference is the load shape:
 *   this scenario ramps slowly to full load instead of hammering at maximum
 *   concurrency from the start.
 *
 * Load shape (full profile)
 * ─────────────────────────
 *   Stage        VUs      Duration   RPS equiv   Purpose
 *   ─────────── ────── ──────────── ─────────── ───────────────────────
 *   warmup       1→10    30 s        ~100        connection pool init
 *   ramp-up     10→100   60 s       100→1000    find saturation
 *   sustained     100   120 s        ~1000      measurement window ←
 *   drain        100→0   30 s          —        clean shutdown
 *   ─────────── ────── ──────────── ─────────── ───────────────────────
 *   Total                240 s
 *
 * Load shape (ci profile)
 * ───────────────────────
 *   warmup 10 s → ramp 20 s → sustained 30 s → drain 5 s  (65 s total)
 *
 * Captured metrics
 * ────────────────
 *   - http_req_duration  (p50/p95/p99/p99.9 per stage tag)
 *   - http_reqs rate     (RPS — reported in envelope)
 *   - http_req_failed    (error rate)
 *   - overhead_ms        (delta vs BASELINE_P50_MS env var)
 *   - tail_breaches      (requests > p99 threshold)
 *   - rps_sustained      (Gauge set during sustained stage)
 *
 * Manual run
 * ──────────
 *   TARGET_URL=http://localhost:9003/api/test \
 *   PROFILE=ci \
 *   k6 run --out json=benchmarks/results/steady-load-$(date +%s).json \
 *          benchmarks/k6/scenarios/steady-load.js
 */

import http            from 'k6/http';
import { check }       from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { buildTags, recordOverhead,
         updateRpsGauge, currentStage }      from '../lib/metrics.js';
import { buildEnvelope }                      from '../lib/result.js';
import { STEADY_STAGES, STEADY_TIMING,
         STEADY_STAGES_CI,
         STEADY_THRESHOLDS,
         STEADY_THRESHOLDS_CI }               from '../lib/load-profiles.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'steady-load';
const TARGET   = __ENV.TARGET_URL || 'http://localhost:9003';
const PROFILE  = __ENV.PROFILE    || 'full';

// Stage timing used by currentStage() — must match options.stages durations
const timing = PROFILE === 'ci'
  ? { warmup: 10, rampUp: 20, sustained: 30 }
  : STEADY_TIMING;

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  tags: { scenario: SCENARIO },

  stages: PROFILE === 'ci'
    ? [
        { duration: '10s', target: 5   },   // warmup
        { duration: '20s', target: 50  },   // ramp  (~100→500 RPS)
        { duration: '30s', target: 50  },   // sustained
        { duration: '5s',  target: 0   },   // drain
      ]
    : STEADY_STAGES,

  thresholds: PROFILE === 'ci' ? STEADY_THRESHOLDS_CI : STEADY_THRESHOLDS,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  // Verify target health before committing to a full run
  const res = http.get(`${TARGET}/health`, { timeout: '5s' });
  if (res.status !== 200) {
    throw new Error(
      `[steady-load] Target not reachable: ${TARGET}/health → HTTP ${res.status}\n` +
      'Ensure echo server, FlexGate, and HAProxy are running.'
    );
  }
  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET, reqCount: 0 };
}

// ── VU iteration ─────────────────────────────────────────────────────────────

export default function (data) {
  const stage = currentStage(Date.now() - data.startTs, timing);
  const tags  = buildTags(SCENARIO, stage);

  const res = http.get(`${TARGET}/api/test`, {
    tags,
    timeout: '10s',
  });

  // Assertions — all failures increment http_req_failed (threshold-checked)
  check(res, {
    'status 200':         (r) => r.status === 200,
    'duration < 200ms':   (r) => r.timings.duration < 200,
    'body non-empty':     (r) => r.body !== null && r.body.length > 0,
  });

  // Record overhead delta vs baseline (noop when BASELINE_P50_MS not set)
  recordOverhead(res.timings.duration);

  // Update RPS gauge during sustained stage only (avoids ramp noise)
  if (stage === 'sustained') {
    updateRpsGauge(data.startTs, ++data.reqCount);
  }

  // No sleep — maximum pressure; VU count controls RPS
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(JSON.stringify({
    event:    'teardown',
    scenario: SCENARIO,
    target:   TARGET,
    profile:  PROFILE,
    startTs:  data.startTs,
    endTs:    Date.now(),
  }));
}

// ── Custom summary → JSON result envelope ─────────────────────────────────────

export function handleSummary(data) {
  const ts      = Math.floor(Date.now() / 1000);
  const outFile = `benchmarks/results/${SCENARIO}-${ts}.json`;

  const envelope = buildEnvelope(SCENARIO, TARGET, PROFILE, data);

  return {
    stdout:    textSummary(data, { indent: ' ', enableColors: true }),
    [outFile]: JSON.stringify(envelope, null, 2),
  };
}
