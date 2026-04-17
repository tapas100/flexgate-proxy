/**
 * benchmarks/k6/scenarios/spike.js
 *
 * Scenario 7 — Spike Test (Stage 3)
 *
 * Goal
 * ────
 *   Verify that FlexGate and its data plane do NOT drop requests or return
 *   errors during a sudden 10× traffic burst, and that latency recovers to
 *   near-baseline within 30 seconds after the spike drops.
 *
 *   This tests HAProxy's connection queue, FlexGate's goroutine pool, and
 *   the echo server's ability to handle burst connections.
 *
 * Topology
 * ────────
 *   k6  ──►  HAProxy (:9003)  ──►  FlexGate (:8080)  ──►  Echo (:9000)
 *
 * Load shape (full profile)
 * ─────────────────────────
 *   Stage          VUs      Duration   Purpose
 *   ───────────── ──────── ────────── ──────────────────────────────
 *   pre-spike       50      60 s       establish clean baseline
 *   spike-onset   50→500    2 s        instantaneous 10× burst
 *   spike-hold     500     120 s       sustained spike (error budget)
 *   spike-drop   500→50     2 s        drop back to normal
 *   post-spike      50      60 s       recovery window ← key check
 *   drain          50→0    10 s        clean shutdown
 *   ───────────── ──────── ────────── ──────────────────────────────
 *   Total                  254 s
 *
 * Load shape (ci profile)
 * ───────────────────────
 *   pre-spike 20 s → spike (2 s onset + 30 s hold + 2 s drop) → recovery 20 s
 *   → drain 5 s   (79 s total)
 *
 * Pass/fail criteria
 * ──────────────────
 *   ✔  overall error rate < 1 %  (abortOnFail at 10 %)
 *   ✔  spike-hold p99 < 500 ms   (system under stress — wider budget)
 *   ✔  post-spike p95 < 100 ms   (recovery check — must return to normal)
 *   ✔  pre-spike p95 < 50 ms     (clean baseline before the spike)
 *
 * Captured metrics
 * ────────────────
 *   - http_req_duration per stage tag (pre-spike / spike-hold / post-spike)
 *   - http_req_failed rate
 *   - overhead_ms (delta vs BASELINE_P50_MS)
 *   - tail_breaches
 *
 * Manual run
 * ──────────
 *   TARGET_URL=http://localhost:9003/api/test \
 *   PROFILE=ci \
 *   k6 run --out json=benchmarks/results/spike-$(date +%s).json \
 *          benchmarks/k6/scenarios/spike.js
 */

import http            from 'k6/http';
import { check }       from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { buildTags, recordOverhead }       from '../lib/metrics.js';
import { buildEnvelope }                   from '../lib/result.js';
import { SPIKE_STAGES, SPIKE_TIMING,
         SPIKE_STAGES_CI, SPIKE_TIMING_CI,
         SPIKE_THRESHOLDS,
         spikeStageLabel }                 from '../lib/load-profiles.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'spike';
const TARGET   = __ENV.TARGET_URL || 'http://localhost:9003';
const PROFILE  = __ENV.PROFILE    || 'full';

const timing = PROFILE === 'ci' ? SPIKE_TIMING_CI : SPIKE_TIMING;

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  tags: { scenario: SCENARIO },

  stages: PROFILE === 'ci' ? SPIKE_STAGES_CI : SPIKE_STAGES,

  thresholds: SPIKE_THRESHOLDS,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const res = http.get(`${TARGET}/health`, { timeout: '5s' });
  if (res.status !== 200) {
    throw new Error(
      `[spike] Target not reachable: ${TARGET}/health → HTTP ${res.status}`
    );
  }
  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET };
}

// ── VU iteration ─────────────────────────────────────────────────────────────

export default function (data) {
  const elapsed = Date.now() - data.startTs;
  const stage   = spikeStageLabel(elapsed, timing);

  // Attach per-stage tag so per-phase thresholds fire correctly
  const tags = {
    ...buildTags(SCENARIO, stage),
    stage,   // explicit override ensures threshold tag filter matches
  };

  const res = http.get(`${TARGET}/api/test`, {
    tags,
    timeout: '15s',   // wider timeout during spike — system may queue
  });

  check(res, {
    'status 200':             (r) => r.status === 200,
    'no server error':        (r) => r.status < 500,
    'duration < 1000ms':      (r) => r.timings.duration < 1000,
  });

  // Record overhead — useful to see how much extra latency the spike adds
  recordOverhead(res.timings.duration, 200);

  // No sleep — spike scenarios need maximum connection pressure
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

  // Annotate envelope with spike-specific metadata
  envelope.spike_meta = {
    peak_vus:         PROFILE === 'ci' ? 200 : 500,
    burst_factor:     10,
    recovery_budget_s: 30,
    profile:          PROFILE,
  };

  return {
    stdout:    textSummary(data, { indent: ' ', enableColors: true }),
    [outFile]: JSON.stringify(envelope, null, 2),
  };
}
