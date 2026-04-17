#!/usr/bin/env node
/**
 * benchmarks/scripts/failure-report.js
 *
 * Stage 7 — Failure test result reporter.
 *
 * Reads the k6 result envelope written by failure.js handleSummary()
 * and produces:
 *   <scenario>-report.md   — human-readable Markdown with pass/fail table
 *   failure-summary.json   — machine-readable summary (updated cumulatively
 *                            across all scenarios in a single run)
 *
 * Usage
 * ─────
 *   node failure-report.js --result <file> --scenario <name> [--out-dir <dir>] [--stdout]
 *
 * Options
 *   --result   <file>    k6 result envelope JSON (required)
 *   --scenario <name>    fault scenario name (required)
 *   --out-dir  <dir>     output directory (default: same dir as --result)
 *   --stdout             also print the report to stdout
 *
 * Exit codes
 *   0  — all checks passed in the result
 *   1  — one or more checks failed
 *   2  — usage / file read error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i === -1 ? def : args[i + 1];
}
const hasFlag = (f) => args.includes(f);

const RESULT_FILE = getArg('--result',   null);
const SCENARIO    = getArg('--scenario', null);
const OUT_DIR     = getArg('--out-dir',  null);
const PRINT       = hasFlag('--stdout');

if (!RESULT_FILE || !SCENARIO) {
  console.error('Usage: node failure-report.js --result <file> --scenario <name> [--out-dir <dir>]');
  process.exit(2);
}

// ── Load result ───────────────────────────────────────────────────────────────

let envelope;
try {
  envelope = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
} catch (e) {
  console.error(`Cannot read result: ${e.message}`);
  process.exit(2);
}

const meta    = envelope.failure_meta || {};
const phases  = meta.phases || {};
const checks  = meta.checks || {};
const allPass = meta.all_checks_pass === true;

const outDir = OUT_DIR || path.dirname(RESULT_FILE);
fs.mkdirSync(outDir, { recursive: true });

// ── Expected-behaviour reference ──────────────────────────────────────────────

const EXPECTED_BEHAVIOUR = {
  'backend-down': [
    '502 Bad Gateway returned during fault phase (not 500, not hang)',
    'Response time < 200 ms during fault (fast-fail, no blocking)',
    'Error body contains `"error"` field',
    'Zero crashes of FlexGate process',
    'Full recovery after fault removed (< 1 % errors)',
  ],
  'slow-backend': [
    '200 OK during fault phase — FlexGate proxies despite slowness',
    'p99 latency elevated by at least upstream delay amount',
    'No circuit-break triggered (FlexGate does not have route-level circuit breaker)',
    'Latency recovers to near-baseline within recovery phase (p99 < 200 ms)',
    'Zero crashes of FlexGate process',
  ],
  'timeout': [
    '504 Gateway Timeout returned during fault phase',
    'Response time bounded to FlexGate default timeout (≤ 35 s)',
    'Error body contains `"timeout"`',
    'Zero crashes of FlexGate process',
    'Full recovery after fault removed (< 1 % errors)',
  ],
  'redis-down': [
    'All requests return 200 OK (fail-open: rate-limit bypassed when Redis unavailable)',
    'Overhead < 10 ms compared to healthy baseline',
    'X-Request-ID header present (proxy path executing normally)',
    'Zero crashes or 5xx responses',
  ],
};

// ── Check annotations ─────────────────────────────────────────────────────────

const CHECK_DESCRIPTIONS = {
  no_crash:                 'FlexGate process did not crash during the test',
  baseline_healthy:         'Baseline phase had < 1 % errors (healthy start state)',
  fault_returns_502:        '≥ 90 % of fault-phase requests returned HTTP 502',
  fault_fast_fail:          'Fault-phase p99 < 500 ms (fast-fail, no hanging)',
  recovery_healthy:         'Recovery phase error rate < 1 %',
  fault_no_errors:          'Fault-phase error rate < 1 % (slow but not broken)',
  fault_latency_elevated:   'Fault-phase p99 ≥ 1.5× baseline (upstream delay confirmed)',
  recovery_p99_recovered:   'Recovery p99 < 200 ms (latency returned to normal)',
  fault_returns_504:        '≥ 80 % of fault-phase requests returned HTTP 504',
  fault_timeout_bounded:    'Fault-phase p99 < 35 s (timeout fires within budget)',
  fault_fail_open:          'Fault-phase error rate < 1 % (Redis-down fail-open)',
  recovery_fail_open:       'Recovery-phase error rate < 1 %',
  overhead_acceptable:      'Fault-phase p99 < 500 ms (minimal Redis-down overhead)',
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const icon = (v) => v ? PASS : FAIL;

// ── Build Markdown report ─────────────────────────────────────────────────────

function fmtN(v) { return v == null ? 'n/a' : String(v); }
function fmtMs(v) { return v == null ? 'n/a' : `${v} ms`; }
function fmtPct(v) { return v == null ? 'n/a' : `${v} %`; }

const lines = [
  `# Failure Test Report — \`${SCENARIO}\``,
  '',
  `**Generated:** ${new Date().toISOString()}`,
  `**Scenario:** \`${SCENARIO}\``,
  `**Description:** ${meta.description || 'n/a'}`,
  '',
  '---',
  '',
  `## Overall Verdict: ${allPass ? `${PASS} PASS` : `${FAIL} FAIL`}`,
  '',
  '---',
  '',
  '## Phase Summary',
  '',
  '| Phase | Requests | Errors | Error % | P99 ms |',
  '| ----- | -------- | ------ | ------- | ------ |',
  `| baseline  | ${fmtN(phases.baseline?.requests)} | ${fmtN(phases.baseline?.errors)} | ${fmtPct(phases.baseline?.error_pct)} | ${fmtMs(phases.baseline?.p99_ms)} |`,
  `| fault     | ${fmtN(phases.fault?.requests)} | ${fmtN(phases.fault?.errors)} | ${fmtPct(phases.fault?.error_pct)} | ${fmtMs(phases.fault?.p99_ms)} |`,
  `| recovery  | ${fmtN(phases.recovery?.requests)} | ${fmtN(phases.recovery?.errors)} | ${fmtPct(phases.recovery?.error_pct)} | ${fmtMs(phases.recovery?.p99_ms)} |`,
];

// Fault-phase status code breakdown (where relevant)
if (phases.fault && (phases.fault.status_502 || phases.fault.status_504)) {
  lines.push('');
  lines.push('### Fault-Phase Status Code Breakdown');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('| ------ | ----- |');
  if (phases.fault.status_200 != null) lines.push(`| 200 | ${phases.fault.status_200} |`);
  if (phases.fault.status_502 != null) lines.push(`| 502 | ${phases.fault.status_502} |`);
  if (phases.fault.status_504 != null) lines.push(`| 504 | ${phases.fault.status_504} |`);
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('## Checks');
lines.push('');
lines.push('| Check | Result | Description |');
lines.push('| ----- | ------ | ----------- |');

for (const [k, v] of Object.entries(checks)) {
  const desc = CHECK_DESCRIPTIONS[k] || k;
  lines.push(`| \`${k}\` | ${icon(v)} | ${desc} |`);
}

if (meta.crash_events != null) {
  lines.push('');
  lines.push(`**Crash events:** ${meta.crash_events}`);
}

// Expected behaviour section
const expected = EXPECTED_BEHAVIOUR[SCENARIO];
if (expected) {
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Expected Behaviour');
  lines.push('');
  lines.push('The following behaviours were validated:');
  lines.push('');
  for (const b of expected) {
    lines.push(`- ${b}`);
  }
}

// k6 thresholds section
if (envelope.thresholds_passed && Object.keys(envelope.thresholds_passed).length > 0) {
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## k6 Thresholds');
  lines.push('');
  lines.push('| Threshold | Passed |');
  lines.push('| --------- | ------ |');
  for (const [k, v] of Object.entries(envelope.thresholds_passed)) {
    lines.push(`| \`${k}\` | ${v ? PASS : FAIL} |`);
  }
}

// Key insight paragraph
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Analysis');
lines.push('');

switch (SCENARIO) {
  case 'backend-down': {
    const f502pct = phases.fault?.requests > 0
      ? Math.round((phases.fault.status_502 / phases.fault.requests) * 100)
      : 0;
    lines.push(
      checks.fault_returns_502
        ? `${PASS} **Fast-fail confirmed** — ${f502pct} % of fault-phase requests returned 502 within p99=${phases.fault?.p99_ms} ms. FlexGate did not hang or crash.`
        : `${FAIL} **Fast-fail not confirmed** — only ${f502pct} % of fault-phase requests returned 502. Check the upstream connection and FlexGate route configuration.`
    );
    if (checks.recovery_healthy) {
      lines.push(`${PASS} **Recovery confirmed** — error rate returned to ${phases.recovery?.error_pct} % after fault was removed.`);
    } else {
      lines.push(`${FAIL} **Recovery failed** — error rate in recovery phase was ${phases.recovery?.error_pct} %. FlexGate may need manual intervention.`);
    }
    break;
  }

  case 'slow-backend': {
    lines.push(
      checks.fault_no_errors
        ? `${PASS} **Graceful degradation confirmed** — FlexGate continued proxying during the slow-backend fault with ${phases.fault?.error_pct} % errors.`
        : `${FAIL} **Errors during slow-backend** — ${phases.fault?.error_pct} % error rate. FlexGate may be timing out before upstream delay completes.`
    );
    lines.push(
      checks.recovery_p99_recovered
        ? `${PASS} **Latency recovery confirmed** — p99 returned to ${phases.recovery?.p99_ms} ms after fault removed.`
        : `${FAIL} **Latency did not recover** — p99 still ${phases.recovery?.p99_ms} ms after fault removed.`
    );
    lines.push('');
    lines.push(`> **Note:** FlexGate does not have a per-route circuit breaker in the Go proxy core (as of this test run). The slow-backend scenario is therefore expected to pass all requests through with elevated latency, not to short-circuit them. Circuit-breaker behaviour is implemented in the intelligence layer (Node.js).`);
    break;
  }

  case 'timeout': {
    const f504pct = phases.fault?.requests > 0
      ? Math.round((phases.fault.status_504 / phases.fault.requests) * 100)
      : 0;
    lines.push(
      checks.fault_returns_504
        ? `${PASS} **Timeout handling confirmed** — ${f504pct} % of fault-phase requests returned 504. FlexGate fires per-request context timeout (30 s default) correctly.`
        : `${FAIL} **Timeout not triggered** — only ${f504pct} % returned 504. Check FlexGate timeout config and fault-server mode.`
    );
    lines.push(
      checks.fault_timeout_bounded
        ? `${PASS} **Timeout bounded** — p99 latency during fault phase was ${phases.fault?.p99_ms} ms, within the 35 s budget.`
        : `${FAIL} **Timeout exceeded budget** — p99 was ${phases.fault?.p99_ms} ms (budget: 35 000 ms).`
    );
    break;
  }

  case 'redis-down': {
    lines.push(
      checks.fault_fail_open
        ? `${PASS} **Fail-open confirmed** — FlexGate rate-limit check short-circuited correctly when Redis was unavailable. Error rate: ${phases.fault?.error_pct} %.`
        : `${FAIL} **Fail-open NOT confirmed** — requests failed (${phases.fault?.error_pct} % errors) when Redis was down. This is a regression: rate-limit checks must be fail-open.`
    );
    lines.push('');
    lines.push(`> FlexGate's intelligence HTTP client implements a consecutive-failure circuit breaker. When Redis is unreachable, after ${5} consecutive failures the circuit opens and all synchronous rate-limit checks are skipped (approved by default). This test validates that circuit.`);
    break;
  }
}

lines.push('');

const reportText = lines.join('\n');
const reportPath = path.join(outDir, `${SCENARIO}-report.md`);
fs.writeFileSync(reportPath, reportText);
console.log(`[failure-report] Written: ${reportPath}`);

// ── Update cumulative failure-summary.json ────────────────────────────────────

const summaryPath = path.join(outDir, 'failure-summary.json');
let summary = {};
try {
  if (fs.existsSync(summaryPath)) {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  }
} catch { /* fresh file */ }

summary.schema_version = 1;
summary.generated_at   = new Date().toISOString();
summary.scenarios = summary.scenarios || {};

summary.scenarios[SCENARIO] = {
  verdict:     allPass ? 'PASS' : 'FAIL',
  checks,
  crash_events: meta.crash_events || 0,
  phases: {
    baseline:  { reqs: phases.baseline?.requests, err_pct: phases.baseline?.error_pct, p99_ms: phases.baseline?.p99_ms },
    fault:     { reqs: phases.fault?.requests,    err_pct: phases.fault?.error_pct,    p99_ms: phases.fault?.p99_ms    },
    recovery:  { reqs: phases.recovery?.requests, err_pct: phases.recovery?.error_pct, p99_ms: phases.recovery?.p99_ms },
  },
};

const allScenariosPass = Object.values(summary.scenarios).every(s => s.verdict === 'PASS');
summary.overall = allScenariosPass ? 'PASS' : 'FAIL';

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`[failure-report] Updated: ${summaryPath}`);
console.log(`[failure-report] Verdict: ${allPass ? 'PASS' : 'FAIL'}`);

if (PRINT) process.stdout.write('\n' + reportText + '\n');

process.exit(allPass ? 0 : 1);
