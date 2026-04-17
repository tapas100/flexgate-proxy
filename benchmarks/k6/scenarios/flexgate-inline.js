/**
 * benchmarks/k6/scenarios/flexgate-inline.js
 *
 * Scenario 3 — FlexGate Inline
 *
 * Topology:
 *   k6  ──►  HAProxy (:9003)  ──►  FlexGate (:8080)  ──►  Echo Server (:9000)
 *
 * Purpose:
 *   Measure the total latency when FlexGate sits inline between HAProxy
 *   and the backend.  Every request passes through FlexGate's full
 *   middleware stack:
 *     - Route resolution (in-memory RouteCache, no DB hit)
 *     - Request ID propagation
 *     - Security headers
 *     - HAProxy header forwarding (X-Forwarded-For etc.)
 *     - SSRF validation (noop when sidecar not configured)
 *     - Intelligence client call (noop when URL not configured)
 *     - httputil.ReverseProxy to echo server
 *
 *   The overhead delta vs Scenario 2 (HAProxy alone) isolates FlexGate's cost.
 *
 * Start targets before running:
 *   # echo server
 *   ./benchmarks/targets/echo-server/echo-server -addr :9000
 *
 *   # FlexGate (route: /bench → http://127.0.0.1:9000)
 *   ./flexgate --config config/flexgate.bench.yaml
 *
 *   # HAProxy
 *   haproxy -f benchmarks/targets/haproxy-bench.cfg -D
 *
 * Run:
 *   BASELINE_P50_MS=<baseline_p50> \
 *   TARGET_URL=http://127.0.0.1:9003 \
 *   k6 run --out json=results/flexgate-inline-$(date +%s).json \
 *          benchmarks/k6/scenarios/flexgate-inline.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { STRICT, RELAXED }              from '../lib/thresholds.js';
import { buildTags, recordOverhead,
         currentStage }                 from '../lib/metrics.js';
import { buildEnvelope }                from '../lib/result.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'flexgate-inline';
const TARGET   = __ENV.TARGET_URL || 'http://127.0.0.1:9003';
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
  // Check HAProxy front door
  const probe = http.get(`${TARGET}/health`, { timeout: '5s' });
  if (probe.status !== 200) {
    throw new Error(
      `FlexGate inline target not reachable: ${TARGET}/health → HTTP ${probe.status}\n` +
      'Ensure HAProxy (:9003) → FlexGate (:8080) → echo (:9000) are running.'
    );
  }
  // Also verify FlexGate admin API is healthy
  const adminUrl = __ENV.FLEXGATE_ADMIN_URL || 'http://127.0.0.1:9090';
  const adminProbe = http.get(`${adminUrl}/health`, { timeout: '5s' });
  if (adminProbe.status !== 200) {
    throw new Error(
      `FlexGate admin not healthy: ${adminUrl}/health → HTTP ${adminProbe.status}`
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
    'status 200':            (r) => r.status === 200,
    'body has ok:true':      (r) => r.body && r.body.includes('"ok"'),
    'duration < 200ms':      (r) => r.timings.duration < 200,
    // FlexGate adds X-Request-ID from its middleware stack
    'has X-Request-ID':      (r) => r.headers['X-Request-Id'] !== undefined ||
                                    r.headers['X-Request-ID'] !== undefined,
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
