/**
 * benchmarks/k6/scenarios/realistic.js
 *
 * Scenario 5 — Realistic Traffic (Stage 2)
 *
 * Topology:
 *   k6  ──►  HAProxy (:9006)  ──►  FlexGate (:8080)  ──►  Echo (:9000 / :9007)
 *
 * Purpose:
 *   Exercise FlexGate under realistic traffic conditions:
 *     - 8 distinct paths across GET and POST methods (see lib/workload.js)
 *     - Weighted-random request selection — some paths are "cold" in the
 *       route cache, some are "warm"
 *     - POST requests include a 64-byte JSON body (body-parsing pressure)
 *     - A slow upstream path (/bench/slow → echo :9007 with 50 ms latency)
 *     - A not-found path (/bench/missing) exercises FlexGate's 404 path
 *     - Pareto-distributed think time (50–3000 ms) between iterations —
 *       simulates browser-level pacing rather than hammer mode
 *
 *   This scenario is NOT a throughput stress test (that is Stage 1).
 *   Its purpose is to measure:
 *     1. P95/P99 latency per request class under realistic concurrency
 *     2. FlexGate route-resolution overhead across a cache with multiple entries
 *     3. Error rate under mixed traffic (expected ~3–4 % from 404s)
 *
 * Result file
 *   benchmarks/results/realistic-<ts>.json  (schema v1)
 *
 * Prerequisites:
 *   # echo server (fast upstream)
 *   ./benchmarks/targets/echo-server/echo-server -addr :9000
 *
 *   # echo server (slow upstream — 50 ms latency)
 *   ./benchmarks/targets/echo-server/echo-server -addr :9007 -latency 50000
 *
 *   # FlexGate (all 8 routes seeded — run-all.sh does this automatically)
 *   ./flexgate --config config/flexgate.bench.json
 *
 *   # HAProxy (realistic frontend on :9006)
 *   haproxy -f benchmarks/targets/haproxy-bench.cfg
 *
 * Manual run:
 *   TARGET_URL=http://127.0.0.1:9006 \
 *   FLEXGATE_ADMIN_URL=http://127.0.0.1:9090 \
 *   PROFILE=ci \
 *   k6 run --out json=results/realistic-$(date +%s).json \
 *          benchmarks/k6/scenarios/realistic.js
 */

import http             from 'k6/http';
import { check }        from 'k6';
import { textSummary }  from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

import { RELAXED }                         from '../lib/thresholds.js';
import { buildTags, currentStage }         from '../lib/metrics.js';
import { buildEnvelope }                   from '../lib/result.js';
import { pickRequest, thinkTimeMs,
         REALISTIC_THRESHOLDS }            from '../lib/workload.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'realistic';
const TARGET   = __ENV.TARGET_URL        || 'http://127.0.0.1:9006';
const PROFILE  = __ENV.PROFILE           || 'full';
const ADMIN    = __ENV.FLEXGATE_ADMIN_URL || 'http://127.0.0.1:9090';

// Stage durations — lower VU ceiling than Stage 1 because think time
// means each VU issues fewer requests per second
const PROFILE_TIMING = {
  ci:   { warmup: 15, rampUp: 20, sustained: 30 },
  full: { warmup: 30, rampUp: 60, sustained: 120 },
};
const timing = PROFILE_TIMING[PROFILE] || PROFILE_TIMING.full;

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  tags: { scenario: SCENARIO },

  // Realistic: lower VU ceiling — think time means higher VU count would
  // starve the event loop; 100 VUs sustained is representative
  stages:
    PROFILE === 'ci'
      ? [
          { duration: '15s', target: 10  },   // warmup
          { duration: '20s', target: 50  },   // ramp-up
          { duration: '30s', target: 50  },   // sustained (longer for mixed paths)
          { duration: '5s',  target: 0   },   // ramp-down
        ]
      : [
          { duration: '30s',  target: 20  },   // warmup
          { duration: '60s',  target: 100 },   // ramp-up
          { duration: '120s', target: 100 },   // sustained ← primary measurement window
          { duration: '30s',  target: 0   },   // ramp-down
        ],

  // Per-tag thresholds from workload.js take precedence; add a global backstop
  thresholds: {
    ...REALISTIC_THRESHOLDS,
    // Global backstop — any request class that isn't already covered
    'http_req_duration': ['p(99)<500'],
  },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  // 1. Verify HAProxy front is up
  const probe = http.get(`${TARGET.replace('/bench', '')}/health`.replace(/\/\//g, '/'),
                         { timeout: '5s' });
  // HAProxy /health proxies to echo — any 2xx/3xx means the chain is alive
  // (some HAProxy configs return 200 from stats, others pass through to backend)
  // We do a soft check here and fail loudly if completely down
  const chainHealthUrl = `http://127.0.0.1:9000/health`;
  const echoProbe = http.get(chainHealthUrl, { timeout: '5s' });
  if (echoProbe.status !== 200) {
    throw new Error(
      `Echo server not reachable at ${chainHealthUrl} → HTTP ${echoProbe.status}\n` +
      'Start: ./benchmarks/targets/echo-server/echo-server -addr :9000'
    );
  }

  // 2. Verify FlexGate admin is healthy
  const adminProbe = http.get(`${ADMIN}/health`, { timeout: '5s' });
  if (adminProbe.status !== 200) {
    throw new Error(
      `FlexGate admin not healthy at ${ADMIN}/health → HTTP ${adminProbe.status}`
    );
  }

  // 3. Verify the slow echo instance is up (best-effort — warn only)
  const slowProbe = http.get('http://127.0.0.1:9007/health', { timeout: '3s' });
  if (slowProbe.status !== 200) {
    console.warn(
      'WARN: Slow echo server (:9007) not reachable — /bench/slow requests will fail. ' +
      'Start: ./benchmarks/targets/echo-server/echo-server -addr :9007 -latency 50000'
    );
  }

  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET };
}

// ── VU iteration ─────────────────────────────────────────────────────────────

export default function (data) {
  const stage = currentStage(Date.now() - data.startTs, timing);

  // Pick a weighted-random request from the workload mix
  const req  = pickRequest();

  // Build per-request tags — include workload class tag for per-path thresholds
  const tags = {
    ...buildTags(SCENARIO, stage),
    tag: req.tag,   // "hot-get", "post-body", "not-found", etc.
  };

  // Execute the request
  let res;
  if (req.method === 'POST') {
    res = http.post(
      `${TARGET}${req.path}`,
      req.body || null,
      { tags, timeout: '10s', headers: req.headers || {} }
    );
  } else {
    res = http.get(
      `${TARGET}${req.path}`,
      { tags, timeout: '10s' }
    );
  }

  // Assertions — tolerant of expected 404s on /bench/missing
  const isExpected404 = req.tag === 'not-found';
  check(res, {
    'status ok':         (r) => isExpected404 ? r.status === 404
                                               : r.status >= 200 && r.status < 300,
    'duration < 500ms':  (r) => r.timings.duration < 500,
    // FlexGate adds X-Request-ID on all non-404 paths
    'has X-Request-ID':  (r) => isExpected404
                                  ? true
                                  : (r.headers['X-Request-Id']  !== undefined ||
                                     r.headers['X-Request-ID']  !== undefined),
  });

  // Think time — Pareto-distributed pause simulating human/browser pacing
  thinkTimeMs();
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
