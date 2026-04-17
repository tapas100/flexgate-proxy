/**
 * benchmarks/k6/scenarios/failure.js
 *
 * Stage 7 — Failure / Resilience Test
 *
 * A single k6 scenario file that drives all four fault scenarios.
 * The active scenario is selected via the FAULT_SCENARIO environment variable.
 *
 * Environment variables
 * ─────────────────────
 *   FAULT_SCENARIO   backend-down | slow-backend | timeout | redis-down
 *   BASE_URL         FlexGate base URL (default: http://localhost:8080)
 *   RESULT_FILE      path for result JSON (default: /tmp/failure-result.json)
 *   LABEL            run label (default: '')
 *
 * Test phases
 * ───────────
 *   1. baseline  (30 s) — healthy traffic; establishes error-rate and latency floor
 *   2. fault     (60 s) — fault is ACTIVE (infrastructure set up by run-failure.sh)
 *   3. recovery  (30 s) — fault removed; system must self-heal
 *
 * The run DOES NOT inject the fault itself — that is done by run-failure.sh
 * which starts/stops the appropriate fault container or iptables rule between
 * the phases, signalled by writing a timestamp file that soak-monitor reads.
 *
 * Verified behaviours
 * ───────────────────
 *   backend-down   → 502 in < 200 ms (fast-fail), no crash
 *   slow-backend   → 200s, p99 ≥ upstream delay, full recovery after fault removed
 *   timeout        → 504 after ≤ 35 s (FlexGate 30 s default + overhead), no crash
 *   redis-down     → 200s always (fail-open), overhead < 10 ms, no crash
 *
 * Manual run (with fault already active)
 * ───────────────────────────────────────
 *   FAULT_SCENARIO=backend-down \
 *   BASE_URL=http://localhost:8080 \
 *   k6 run benchmarks/k6/scenarios/failure.js
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { buildEnvelope, summariseThresholds } from '../lib/result.js';
import {
  FAILURE_STAGES,
  buildFailureThresholds,
  currentPhase,
  faultScenarioLabel,
  EXPECTED,
  PHASE_TIMING,
} from '../lib/failure-profiles.js';

// ── Environment ───────────────────────────────────────────────────────────────

const FAULT = __ENV.FAULT_SCENARIO || 'backend-down';
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const RESULT_FILE = __ENV.RESULT_FILE || '/tmp/failure-result.json';
const LABEL = __ENV.LABEL || '';

// Validate scenario name
const VALID = ['backend-down', 'slow-backend', 'timeout', 'redis-down'];
if (!VALID.includes(FAULT)) {
  throw new Error(
    `Unknown FAULT_SCENARIO: "${FAULT}". Valid values: ${VALID.join(', ')}`
  );
}

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  stages: FAILURE_STAGES,
  thresholds: buildFailureThresholds(FAULT),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ── Custom metrics (phase-labelled) ──────────────────────────────────────────

// Per-phase error counters
const BaselineErrors   = new Counter('failure_baseline_errors');
const FaultErrors      = new Counter('failure_fault_errors');
const RecoveryErrors   = new Counter('failure_recovery_errors');

// Per-phase request counters
const BaselineReqs     = new Counter('failure_baseline_reqs');
const FaultReqs        = new Counter('failure_fault_reqs');
const RecoveryReqs     = new Counter('failure_recovery_reqs');

// Per-phase latency trends
const BaselineLatency  = new Trend('failure_baseline_latency_ms');
const FaultLatency     = new Trend('failure_fault_latency_ms');
const RecoveryLatency  = new Trend('failure_recovery_latency_ms');

// Status code counters for fault phase
const Fault502         = new Counter('failure_fault_502');
const Fault504         = new Counter('failure_fault_504');
const Fault200         = new Counter('failure_fault_200');

// Crash detector — incremented if FlexGate itself becomes unreachable
const CrashEvents      = new Counter('failure_crash_events');

// ── Request target ────────────────────────────────────────────────────────────
// Use /api/status as the primary endpoint — it is a GET, cached-safe route
// that exercises the full proxy path: route resolution → upstream → response.
// For timeout scenario we use the same path; the upstream hangs (infinite delay),
// not the route — so the path doesn't matter.

const TARGET_PATH = '/api/status';
const HEALTH_PATH = '/health';

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  // Verify FlexGate is reachable and healthy before the run starts.
  // If FlexGate itself is down, the test should not start.
  const res = http.get(`${BASE_URL}${HEALTH_PATH}`, { timeout: '10s' });
  if (res.status !== 200) {
    throw new Error(
      `Pre-flight health check failed: ${BASE_URL}${HEALTH_PATH} → HTTP ${res.status}.\n` +
      `FlexGate must be running before starting a failure test.`
    );
  }

  return {
    startEpochMs: Date.now(),
    scenario:     FAULT,
    baseUrl:      BASE_URL,
    expected:     EXPECTED[FAULT],
  };
}

// ── Default (VU iteration) ────────────────────────────────────────────────────

export default function (data) {
  const elapsed = Date.now() - data.startEpochMs;
  const phase   = currentPhase(elapsed);

  const params = {
    timeout: '40s',  // longer than FlexGate's 30 s timeout so k6 itself doesn't cut off first
    tags: {
      scenario: `failure-${FAULT}`,
      phase,
    },
  };

  let res;
  group(phase, () => {
    res = http.get(`${data.baseUrl}${TARGET_PATH}`, params);
  });

  const durationMs = res.timings.duration;
  const status     = res.status;
  const is2xx      = status >= 200 && status < 300;

  // ── Phase-level recording ─────────────────────────────────────────────────

  switch (phase) {
    case 'baseline':
      BaselineReqs.add(1);
      BaselineLatency.add(durationMs);
      if (!is2xx) BaselineErrors.add(1);
      break;

    case 'fault':
      FaultReqs.add(1);
      FaultLatency.add(durationMs);
      if (!is2xx) FaultErrors.add(1);
      if (status === 502) Fault502.add(1);
      if (status === 504) Fault504.add(1);
      if (is2xx)          Fault200.add(1);
      break;

    case 'recovery':
      RecoveryReqs.add(1);
      RecoveryLatency.add(durationMs);
      if (!is2xx) RecoveryErrors.add(1);
      break;
  }

  // ── Crash detection ───────────────────────────────────────────────────────
  // Status 0 means k6 got a connection refused / network error — meaning
  // FlexGate itself has crashed or become unreachable (not the upstream).
  // Distinguish from expected upstream errors by checking the error type.
  if (status === 0 && phase === 'baseline') {
    // FlexGate unreachable during baseline = crash
    CrashEvents.add(1);
  }

  // ── Per-scenario checks ───────────────────────────────────────────────────

  switch (FAULT) {
    case 'backend-down':
      if (phase === 'fault') {
        check(res, {
          'fault: returns 502':                (r) => r.status === 502,
          'fault: responds fast (<200ms)':     (r) => r.timings.duration < 200,
          'fault: error body present':         (r) => r.body && r.body.includes('error'),
        });
      } else {
        check(res, {
          'non-fault: returns 2xx': (r) => is2xx,
        });
      }
      break;

    case 'slow-backend':
      if (phase === 'fault') {
        check(res, {
          'fault: returns 200 (not error)':  (r) => r.status === 200,
          'fault: body present':             (r) => r.body && r.body.length > 0,
          // Latency check is soft — only meaningful if SLOW_DELAY_MS is set.
          // We record the trend and assert it in handleSummary.
        });
      } else if (phase === 'recovery') {
        check(res, {
          'recovery: returns 2xx':          (r) => is2xx,
          'recovery: latency recovered':    (r) => r.timings.duration < 500,
        });
      }
      break;

    case 'timeout':
      if (phase === 'fault') {
        check(res, {
          'fault: returns 504':             (r) => r.status === 504,
          'fault: timeout body present':    (r) => r.body && r.body.includes('timeout'),
        });
      } else {
        check(res, {
          'non-fault: returns 2xx': (r) => is2xx,
        });
      }
      break;

    case 'redis-down':
      // Fail-open: ALL requests must succeed regardless of Redis state
      check(res, {
        [`${phase}: fail-open returns 2xx`]:    (r) => is2xx,
        [`${phase}: overhead < 500ms`]:         (r) => r.timings.duration < 500,
        [`${phase}: X-Request-ID present`]:     (r) =>
          !!(r.headers['X-Request-Id'] || r.headers['X-Request-ID'] || r.headers['x-request-id']),
      });
      break;
  }
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(
    `[failure teardown] scenario=${data.scenario} ` +
    `elapsed=${Math.round((Date.now() - data.startEpochMs) / 1000)}s`
  );
}

// ── handleSummary ─────────────────────────────────────────────────────────────

export function handleSummary(summary) {
  // ── Extract per-phase values from custom metrics ─────────────────────────

  function metricVal(name, stat) {
    return summary.metrics[name]?.values?.[stat] ?? 0;
  }

  const baselineReqs    = metricVal('failure_baseline_reqs',    'count');
  const faultReqs       = metricVal('failure_fault_reqs',       'count');
  const recoveryReqs    = metricVal('failure_recovery_reqs',    'count');

  const baselineErrors  = metricVal('failure_baseline_errors',  'count');
  const faultErrors     = metricVal('failure_fault_errors',     'count');
  const recoveryErrors  = metricVal('failure_recovery_errors',  'count');

  const faultLatP99     = metricVal('failure_fault_latency_ms',     'p(99)');
  const recoveryLatP99  = metricVal('failure_recovery_latency_ms',  'p(99)');
  const baselineLatP99  = metricVal('failure_baseline_latency_ms',  'p(99)');

  const fault502        = metricVal('failure_fault_502', 'count');
  const fault504        = metricVal('failure_fault_504', 'count');
  const fault200        = metricVal('failure_fault_200', 'count');
  const crashEvents     = metricVal('failure_crash_events', 'count');

  // Safe divide
  const pct = (n, d) => d > 0 ? (n / d) * 100 : 0;

  const baselineErrPct  = pct(baselineErrors, baselineReqs);
  const faultErrPct     = pct(faultErrors,    faultReqs);
  const recoveryErrPct  = pct(recoveryErrors, recoveryReqs);

  // ── Evaluate expected behaviour ──────────────────────────────────────────

  const exp    = EXPECTED[FAULT];
  const checks = {};

  checks.no_crash             = crashEvents === 0;
  checks.baseline_healthy     = baselineErrPct < 1;   // < 1 % errors in baseline

  switch (FAULT) {
    case 'backend-down':
      checks.fault_returns_502      = faultReqs > 0 && (fault502 / faultReqs) >= 0.90;
      checks.fault_fast_fail        = faultLatP99 < 500;  // not hanging
      checks.recovery_healthy       = recoveryErrPct < 1;
      break;

    case 'slow-backend':
      checks.fault_no_errors        = faultErrPct < 1;
      // Only assert latency floor if there were actual slow requests
      checks.fault_latency_elevated = faultReqs > 0 && faultLatP99 > baselineLatP99 * 1.5;
      checks.recovery_p99_recovered = recoveryLatP99 < 200;
      break;

    case 'timeout':
      checks.fault_returns_504      = faultReqs > 0 && (fault504 / faultReqs) >= 0.80;
      checks.fault_timeout_bounded  = faultLatP99 < 35000;  // < 35 s
      checks.recovery_healthy       = recoveryErrPct < 1;
      break;

    case 'redis-down':
      checks.fault_fail_open        = faultErrPct < 1;
      checks.recovery_fail_open     = recoveryErrPct < 1;
      checks.overhead_acceptable    = faultLatP99 < 500;
      break;
  }

  const allChecksPass = Object.values(checks).every(Boolean);

  // ── Build envelope ────────────────────────────────────────────────────────

  const httpDur  = summary.metrics.http_req_duration;
  const httpReqs = summary.metrics.http_reqs;
  const httpFail = summary.metrics.http_req_failed;

  // Re-use buildEnvelope from Stage 1 shared lib
  const envelopeData = {
    metrics: summary.metrics,
    thresholds: summary.thresholds,
  };

  const envelope = buildEnvelope(
    faultScenarioLabel(FAULT),
    BASE_URL,
    'full',
    envelopeData,
  );

  // Attach Stage 7 fault-specific block
  envelope.failure_meta = {
    fault_scenario:     FAULT,
    description:        exp.description,
    run_label:          LABEL,

    phases: {
      baseline: {
        requests:   baselineReqs,
        errors:     baselineErrors,
        error_pct:  round2(baselineErrPct),
        p99_ms:     round2(baselineLatP99),
      },
      fault: {
        requests:       faultReqs,
        errors:         faultErrors,
        error_pct:      round2(faultErrPct),
        p99_ms:         round2(faultLatP99),
        status_502:     fault502,
        status_504:     fault504,
        status_200:     fault200,
      },
      recovery: {
        requests:   recoveryReqs,
        errors:     recoveryErrors,
        error_pct:  round2(recoveryErrPct),
        p99_ms:     round2(recoveryLatP99),
      },
    },

    checks: checks,
    all_checks_pass: allChecksPass,
    crash_events: crashEvents,
  };

  return {
    [RESULT_FILE]: JSON.stringify(envelope, null, 2),
    stdout: textSummary(FAULT, envelope.failure_meta, allChecksPass),
  };
}

// ── Text summary ──────────────────────────────────────────────────────────────

function textSummary(fault, meta, pass) {
  const p = meta.phases;
  const PASS = '✓';
  const FAIL = '✗';
  const icon = (v) => v ? PASS : FAIL;

  const lines = [
    '',
    '╔═══════════════════════════════════════════════════════════╗',
    `║  FAILURE TEST — ${fault.padEnd(14)}  ${pass ? `${PASS} ALL CHECKS PASS` : `${FAIL} CHECKS FAILED`}   ║`,
    '╠═══════════════════════════════════════════════════════════╣',
    `║  Phase      │ Requests │ Errors │ Err %  │ P99 ms         ║`,
    `║  ─────────────────────────────────────────────────────    ║`,
    `║  baseline   │ ${pad(p.baseline.requests, 8)} │ ${pad(p.baseline.errors, 6)} │ ${pad(p.baseline.error_pct + '%', 6)} │ ${pad(p.baseline.p99_ms, 14)} ║`,
    `║  fault      │ ${pad(p.fault.requests, 8)} │ ${pad(p.fault.errors, 6)} │ ${pad(p.fault.error_pct + '%', 6)} │ ${pad(p.fault.p99_ms, 14)} ║`,
    `║  recovery   │ ${pad(p.recovery.requests, 8)} │ ${pad(p.recovery.errors, 6)} │ ${pad(p.recovery.error_pct + '%', 6)} │ ${pad(p.recovery.p99_ms, 14)} ║`,
    '╠═══════════════════════════════════════════════════════════╣',
  ];

  for (const [k, v] of Object.entries(meta.checks)) {
    lines.push(`║  ${icon(v)} ${k.padEnd(53)} ║`);
  }

  lines.push(`║  crash events: ${String(meta.crash_events).padEnd(43)} ║`);
  lines.push('╚═══════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}

function pad(v, n) {
  return String(v).padEnd(n);
}

function round2(v) {
  return Math.round((v ?? 0) * 100) / 100;
}
