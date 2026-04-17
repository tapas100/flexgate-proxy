/**
 * benchmarks/k6/scenarios/nginx.js
 *
 * Scenario 1 — Nginx
 *
 * Topology:
 *   k6  ──►  Nginx (:9001)  ──►  Echo Server (:9000)
 *
 * Purpose:
 *   Industry reference point for a well-tuned C reverse proxy.
 *   Overhead delta vs baseline = Nginx's pure forwarding cost.
 *
 * Run:
 *   BASELINE_P50_MS=<value_from_baseline_run> \
 *   TARGET_URL=http://127.0.0.1:9001 \
 *   k6 run --out json=results/nginx-$(date +%s).json \
 *          benchmarks/k6/scenarios/nginx.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { STRICT, RELAXED }              from '../lib/thresholds.js';
import { buildTags, recordOverhead,
         currentStage }                 from '../lib/metrics.js';
import { buildEnvelope }                from '../lib/result.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'nginx';
const TARGET   = __ENV.TARGET_URL || 'http://127.0.0.1:9001';
const PROFILE  = __ENV.PROFILE    || 'full';

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
          { duration: '15s', target: 10 },
          { duration: '20s', target: 50 },
          { duration: '20s', target: 50 },
          { duration: '5s',  target: 0  },
        ]
      : [
          { duration: '30s',  target: 50  },
          { duration: '60s',  target: 200 },
          { duration: '120s', target: 200 },
          { duration: '30s',  target: 0   },
        ],
  thresholds: PROFILE === 'ci' ? RELAXED : STRICT,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const probe = http.get(`${TARGET}/health`, { timeout: '5s' });
  if (probe.status !== 200) {
    throw new Error(
      `Nginx target not reachable: ${TARGET}/health → HTTP ${probe.status}`
    );
  }
  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET };
}

// ── VU iteration ─────────────────────────────────────────────────────────────

export default function (data) {
  const stage = currentStage(Date.now() - data.startTs, timing);
  const tags  = buildTags(SCENARIO, stage);

  const res = http.get(`${TARGET}/bench`, { tags, timeout: '10s' });

  check(res, {
    'status 200':       (r) => r.status === 200,
    'body has ok:true': (r) => r.body && r.body.includes('"ok"'),
    'duration < 200ms': (r) => r.timings.duration < 200,
  });

  recordOverhead(res.timings.duration);
}

// ── Summary ───────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const ts      = Math.floor(Date.now() / 1000);
  const outFile = `benchmarks/results/${SCENARIO}-${ts}.json`;
  return {
    stdout:    textSummary(data, { indent: ' ', enableColors: true }),
    [outFile]: JSON.stringify(buildEnvelope(SCENARIO, TARGET, PROFILE, data), null, 2),
  };
}
