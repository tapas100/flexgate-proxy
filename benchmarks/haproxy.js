/**
 * benchmarks/haproxy.js
 *
 * Entry-point k6 script — HAProxy reverse proxy scenario.
 *
 * Topology:  k6 ──► HAProxy (:9002) ──► Echo Server (:9000)
 *
 * Run standalone:
 *   k6 run --out json=- benchmarks/haproxy.js
 *
 * Via runner:
 *   node benchmarks/run.js --scenario haproxy
 */

import http    from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { STRICT, RELAXED }           from './k6/lib/thresholds.js';
import { buildTags, recordOverhead,
         currentStage }              from './k6/lib/metrics.js';
import { buildEnvelope }             from './k6/lib/result.js';

// ── Config ────────────────────────────────────────────────────────────────────

const SCENARIO = 'haproxy';
const TARGET   = __ENV.TARGET_URL || 'http://127.0.0.1:9002';
const PROFILE  = __ENV.PROFILE    || 'ci';

const TIMING = {
  ci:   { warmup: 10, rampUp: 15, sustained: 30 },
  full: { warmup: 30, rampUp: 60, sustained: 120 },
};
const timing = TIMING[PROFILE] || TIMING.ci;

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  tags: { scenario: SCENARIO },
  stages:
    PROFILE === 'ci'
      ? [
          { duration: '10s', target: 10  },
          { duration: '15s', target: 50  },
          { duration: '30s', target: 50  },
          { duration: '5s',  target: 0   },
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
      `[haproxy] Target unreachable: ${TARGET}/health → HTTP ${probe.status}`
    );
  }
  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET };
}

// ── VU iteration ──────────────────────────────────────────────────────────────

export default function (data) {
  const stage = currentStage(Date.now() - data.startTs, timing);
  const tags  = buildTags(SCENARIO, stage);

  const res = http.get(`${TARGET}/bench`, { tags, timeout: '10s' });

  check(res, {
    'status 200':       (r) => r.status === 200,
    'has body':         (r) => r.body && r.body.length > 0,
    'duration < 500ms': (r) => r.timings.duration < 500,
  });

  recordOverhead(res.timings.duration);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(JSON.stringify({
    event: 'teardown', scenario: SCENARIO,
    target: TARGET, profile: PROFILE,
    startTs: data.startTs, endTs: Date.now(),
  }));
}

// ── Summary → JSON envelope ───────────────────────────────────────────────────

export function handleSummary(data) {
  const ts  = Math.floor(Date.now() / 1000);
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
    [`benchmarks/results/${SCENARIO}-${ts}.json`]:
      JSON.stringify(buildEnvelope(SCENARIO, TARGET, PROFILE, data), null, 2),
  };
}
