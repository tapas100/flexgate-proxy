/**
 * benchmarks/k6/scenarios/baseline.js
 *
 * Scenario 0 — Baseline (no proxy)
 *
 * Topology:
 *   k6  ──►  Echo Server (:9000)
 *
 * Purpose:
 *   Establish the floor measurement: TCP + loopback RTT + echo-server cost.
 *   Every other scenario's overhead is measured as delta against this.
 *
 * Run:
 *   TARGET_URL=http://127.0.0.1:9000 \
 *   k6 run --out json=results/baseline-$(date +%s).json \
 *          benchmarks/k6/scenarios/baseline.js
 *
 *   CI (short):
 *   PROFILE=ci k6 run ...
 */

import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { STRICT, RELAXED }              from '../lib/thresholds.js';
import { buildTags, recordOverhead,
         currentStage }                 from '../lib/metrics.js';
import { buildEnvelope }                from '../lib/result.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'baseline';
const TARGET   = __ENV.TARGET_URL || 'http://127.0.0.1:9000';
const PROFILE  = __ENV.PROFILE    || 'full';

// Stage durations (seconds) — must match options.stages below
const PROFILE_TIMING = {
  ci:   { warmup: 15, rampUp: 20, sustained: 20 },
  full: { warmup: 30, rampUp: 60, sustained: 120 },
};

const timing = PROFILE_TIMING[PROFILE] || PROFILE_TIMING.full;

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  tags: { scenario: SCENARIO },

  stages:
    PROFILE === 'ci'
      ? [
          { duration: '15s', target: 10  }, // warmup
          { duration: '20s', target: 50  }, // ramp-up
          { duration: '20s', target: 50  }, // sustained
          { duration: '5s',  target: 0   }, // ramp-down
        ]
      : [
          { duration: '30s',  target: 50  }, // warmup
          { duration: '60s',  target: 200 }, // ramp-up
          { duration: '120s', target: 200 }, // sustained  ← primary measurement window
          { duration: '30s',  target: 0   }, // ramp-down
        ],

  thresholds: PROFILE === 'ci' ? RELAXED : STRICT,
};

// ── Setup — verify target is reachable ───────────────────────────────────────

export function setup() {
  const probe = http.get(`${TARGET}/health`, { timeout: '5s' });
  if (probe.status !== 200) {
    throw new Error(
      `Baseline target not reachable: ${TARGET}/health → HTTP ${probe.status}`
    );
  }
  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET };
}

// ── VU iteration ─────────────────────────────────────────────────────────────

export default function (data) {
  const stage = currentStage(Date.now() - data.startTs, timing);
  const tags  = buildTags(SCENARIO, stage);

  const res = http.get(`${TARGET}/bench`, {
    tags,
    timeout: '10s',
  });

  // Assertions — checked per-request; failures increment http_req_failed
  check(res, {
    'status 200':              (r) => r.status === 200,
    'body has ok:true':        (r) => r.body && r.body.includes('"ok"'),
    'duration < 200ms':        (r) => r.timings.duration < 200,
  });

  recordOverhead(res.timings.duration);

  // No sleep — maximum pressure for throughput measurement
}

// ── Teardown — update RPS gauge ───────────────────────────────────────────────

export function teardown(data) {
  // RpsSustained is populated from iteration data; log meta for compare.js
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
