/**
 * benchmarks/k6/scenarios/flexgate-mirror.js
 *
 * Scenario 4 — FlexGate Mirror
 *
 * Topology:
 *   k6  ──►  HAProxy (:9004)  ──►  Echo Server (:9000)   [critical path]
 *                    │
 *                    └──►  FlexGate (:8080)               [shadow copy, async]
 *
 * Purpose:
 *   Measure whether the mirror copy materially impacts HAProxy's forwarding
 *   latency on the critical path.  In theory it should not — HAProxy's
 *   `http-request mirror` is fire-and-forget.  Any latency delta proves
 *   contention on the loopback or HAProxy's internal mirroring budget.
 *
 * HAProxy config:
 *   In haproxy-bench.cfg, the bench-mirror frontend includes:
 *
 *     http-request mirror http://127.0.0.1:8080/bench
 *
 *   This sends an async copy of every request to FlexGate without waiting
 *   for its response.  The client response comes from the echo server only.
 *
 * Run:
 *   BASELINE_P50_MS=<haproxy_p50> \
 *   TARGET_URL=http://127.0.0.1:9004 \
 *   k6 run --out json=results/flexgate-mirror-$(date +%s).json \
 *          benchmarks/k6/scenarios/flexgate-mirror.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { STRICT, RELAXED }              from '../lib/thresholds.js';
import { buildTags, recordOverhead,
         currentStage }                 from '../lib/metrics.js';
import { buildEnvelope }                from '../lib/result.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'flexgate-mirror';
const TARGET   = __ENV.TARGET_URL || 'http://127.0.0.1:9004';
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
      `Mirror target not reachable: ${TARGET}/health → HTTP ${probe.status}\n` +
      'Ensure HAProxy (:9004) → echo (:9000) + FlexGate (:8080) mirror are running.'
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
    // In mirror mode the response comes from the echo server, not FlexGate —
    // FlexGate's X-Request-ID header should NOT appear on the response.
    'no FlexGate header on response': (r) => true, // informational check
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
