/**
 * benchmarks/k6/scenarios/soak.js
 *
 * Stage 6 — Soak test scenario.
 *
 * Runs a constant VU load against FlexGate for 1h, 6h, or 24h.
 * Designed to surface memory leaks, latency drift, and crash events —
 * NOT to find throughput limits.
 *
 * Environment variables
 * ─────────────────────
 *   SOAK_PROFILE      1h | 6h | 24h | smoke   (default: smoke)
 *   BASE_URL          FlexGate base URL        (default: http://localhost:8080)
 *   RESULT_FILE       path for result JSON     (default: /tmp/soak-result.json)
 *   LABEL             run label for envelope   (default: '')
 *
 * Topology
 * ────────
 *   k6 VUs → FlexGate :8080 → Echo :9000
 *
 * Request mix (8 routes)
 * ─────────────────────
 *   Weight  Method   Path
 *   40 %    GET      /api/status
 *   20 %    GET      /api/metrics
 *   15 %    POST     /api/events
 *   10 %    GET      /api/config
 *   5 %     GET      /api/routes
 *   4 %     GET      /api/health
 *   3 %     PUT      /api/settings
 *   3 %     GET      /api/webhooks
 *
 * For a soak test the route mix is intentionally the same every run so
 * that latency drift is attributable to FlexGate state, not workload
 * variance.  No think-time randomness beyond the fixed THINK_TIME_S.
 *
 * Metrics written to the result envelope
 * ───────────────────────────────────────
 *   soak_meta       — profile, duration, VU count, target RPS
 *   system          — merged from soak-monitor JSONL (by run-soak.sh)
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';
import { buildEnvelope } from '../lib/result.js';
import { buildSoakOptions, soakMeta, soakSleep } from '../lib/soak-profiles.js';

// ── Environment ───────────────────────────────────────────────────────────────

const SOAK_PROFILE = __ENV.SOAK_PROFILE || 'smoke';
const BASE_URL     = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const RESULT_FILE  = __ENV.RESULT_FILE  || '/tmp/soak-result.json';
const LABEL        = __ENV.LABEL        || '';

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  ...buildSoakOptions(SOAK_PROFILE),
  // Soak tests must NOT abort early on threshold breach — the full run is
  // needed to observe drift.  buildSoakOptions already sets abortOnFail:false,
  // but we reinforce it here for clarity.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
};

// ── Custom metrics ────────────────────────────────────────────────────────────

const SoakErrors      = new Counter('soak_errors_total');
const SoakReqs        = new Counter('soak_requests_total');
const SoakRps         = new Gauge('soak_rps_current');
const SoakLatencyDrift = new Trend('soak_latency_drift_ms');  // placeholder; analysed post-run

// ── Request catalogue ─────────────────────────────────────────────────────────

const REQUESTS = [
  // [weight, method, path, body, contentType]
  [40, 'GET',  '/api/status',   null,                    null],
  [20, 'GET',  '/api/metrics',  null,                    null],
  [15, 'POST', '/api/events',   '{"type":"ping","ts":0}','application/json'],
  [10, 'GET',  '/api/config',   null,                    null],
  [ 5, 'GET',  '/api/routes',   null,                    null],
  [ 4, 'GET',  '/api/health',   null,                    null],
  [ 3, 'PUT',  '/api/settings', '{"debug":false}',       'application/json'],
  [ 3, 'GET',  '/api/webhooks', null,                    null],
];

// Build cumulative weight table once at init time
const CUM_WEIGHTS = [];
let _acc = 0;
for (const [w] of REQUESTS) {
  _acc += w;
  CUM_WEIGHTS.push(_acc);
}
const TOTAL_WEIGHT = _acc;

/**
 * pickRequest() — weighted random selection, O(n) but n=8 so irrelevant.
 */
function pickRequest() {
  const r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < CUM_WEIGHTS.length; i++) {
    if (r < CUM_WEIGHTS[i]) return REQUESTS[i];
  }
  return REQUESTS[REQUESTS.length - 1];
}

// ── State shared across VUs via closure ───────────────────────────────────────

let _startEpochMs = 0;
let _totalReqs    = 0;

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  _startEpochMs = Date.now();

  // Verify FlexGate is reachable before committing to a multi-hour run.
  const res = http.get(`${BASE_URL}/api/health`, { timeout: '10s' });
  if (res.status !== 200) {
    throw new Error(
      `Pre-flight health check failed: ${BASE_URL}/api/health → HTTP ${res.status}. ` +
      `Ensure FlexGate is running before starting a soak test.`
    );
  }

  return {
    startEpochMs:  Date.now(),
    profile:       SOAK_PROFILE,
    baseUrl:       BASE_URL,
    soakMeta:      soakMeta(SOAK_PROFILE),
  };
}

// ── Default (VU iteration) ────────────────────────────────────────────────────

export default function (data) {
  const [, method, path, body, contentType] = pickRequest();
  const url = `${data.baseUrl}${path}`;

  const params = {
    timeout: '30s',
    tags: { scenario: `soak-${SOAK_PROFILE}`, path },
  };
  if (contentType) {
    params.headers = { 'Content-Type': contentType };
  }

  let res;
  if (method === 'GET') {
    res = http.get(url, params);
  } else if (method === 'POST') {
    res = http.post(url, body, params);
  } else if (method === 'PUT') {
    res = http.put(url, body, params);
  } else {
    res = http.request(method, url, body, params);
  }

  // Track totals for RPS gauge
  _totalReqs++;
  const elapsedS = (Date.now() - _startEpochMs) / 1000;
  if (elapsedS > 0) {
    SoakRps.add(_totalReqs / elapsedS);
  }

  // Record raw duration for drift analysis
  SoakLatencyDrift.add(res.timings.duration);

  const ok = check(res, {
    'status 2xx':           (r) => r.status >= 200 && r.status < 300,
    'duration < 500ms':     (r) => r.timings.duration < 500,
    'X-Request-ID present': (r) => r.headers['X-Request-Id'] !== undefined ||
                                    r.headers['X-Request-ID'] !== undefined ||
                                    r.headers['x-request-id'] !== undefined,
  });

  SoakReqs.add(1);
  if (!ok) {
    SoakErrors.add(1);
  }

  soakSleep();
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  // Nothing to clean up — environment management is handled by run-soak.sh.
  // Logging the run summary here ensures something is emitted even if
  // handleSummary fails.
  console.log(
    `[soak teardown] profile=${data.profile} ` +
    `duration=${data.soakMeta.duration_human} ` +
    `vus=${data.soakMeta.target_vus}`
  );
}

// ── handleSummary ─────────────────────────────────────────────────────────────

export function handleSummary(summary) {
  const http_reqs = summary.metrics.http_reqs;
  const http_req_duration = summary.metrics.http_req_duration;
  const http_req_failed = summary.metrics.http_req_failed;
  const soak_requests_total = summary.metrics.soak_requests_total;

  const totalReqs = http_reqs?.values?.count ?? 0;
  const avgDur    = http_req_duration?.values?.avg ?? 0;
  const p95Dur    = http_req_duration?.values?.['p(95)'] ?? 0;
  const p99Dur    = http_req_duration?.values?.['p(99)'] ?? 0;
  const p999Dur   = http_req_duration?.values?.['p(99.9)'] ?? 0;
  const errRate   = http_req_failed?.values?.rate ?? 0;

  // Build thresholds pass/fail map
  const thresholdResults = {};
  for (const [metric, checks] of Object.entries(summary.thresholds ?? {})) {
    for (const chk of checks) {
      thresholdResults[`${metric} ${chk.threshold}`] = chk.ok;
    }
  }
  const allPassed = Object.values(thresholdResults).every(Boolean);

  const soakMetaObj = soakMeta(SOAK_PROFILE);

  const envelope = buildEnvelope(
    `soak-${SOAK_PROFILE}`,
    BASE_URL,
    SOAK_PROFILE,
    {
      total_requests:   totalReqs,
      avg_duration_ms:  Math.round(avgDur * 100) / 100,
      p95_ms:           Math.round(p95Dur * 100) / 100,
      p99_ms:           Math.round(p99Dur * 100) / 100,
      p999_ms:          Math.round(p999Dur * 100) / 100,
      error_rate:       Math.round(errRate * 1e6) / 1e6,
      thresholds:       thresholdResults,
      passed:           allPassed,
      soak_meta:        soakMetaObj,
      run_label:        LABEL,
    }
  );

  return {
    [RESULT_FILE]: JSON.stringify(envelope, null, 2),
    stdout: textSummary(summary, soakMetaObj, allPassed),
  };
}

// ── Text summary helper ───────────────────────────────────────────────────────

function textSummary(summary, meta, passed) {
  const dur    = summary.metrics.http_req_duration?.values ?? {};
  const failed = summary.metrics.http_req_failed?.values ?? {};
  const reqs   = summary.metrics.http_reqs?.values ?? {};

  const lines = [
    '',
    '╔══════════════════════════════════════════════╗',
    `║  SOAK TEST — ${meta.profile.padEnd(6)}  ${passed ? '✓ PASSED' : '✗ FAILED'}             ║`,
    '╠══════════════════════════════════════════════╣',
    `║  Duration : ${meta.duration_human.padEnd(32)} ║`,
    `║  VUs      : ${String(meta.target_vus).padEnd(32)} ║`,
    `║  Requests : ${String(reqs.count ?? 0).padEnd(32)} ║`,
    `║  Avg      : ${fmtMs(dur.avg)}  P95: ${fmtMs(dur['p(95)'])}                 ║`,
    `║  P99      : ${fmtMs(dur['p(99)'])}  P99.9: ${fmtMs(dur['p(99.9)'])}               ║`,
    `║  Error %  : ${fmtPct(failed.rate).padEnd(32)} ║`,
    '╚══════════════════════════════════════════════╝',
    '',
  ];

  return lines.join('\n');
}

function fmtMs(v) {
  if (v == null) return 'n/a    ';
  return `${(Math.round(v * 10) / 10).toFixed(1)} ms`.padEnd(9);
}

function fmtPct(v) {
  if (v == null) return 'n/a';
  return `${(v * 100).toFixed(4)} %`;
}
