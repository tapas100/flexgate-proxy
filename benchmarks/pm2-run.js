#!/usr/bin/env node
/**
 * benchmarks/pm2-run.js
 *
 * PM2 entry-point wrapper for the benchmark runner.
 *
 * PM2 evaluates `args` statically at start time, so it cannot pick up
 * per-run env-var overrides like BENCHMARK_SCENARIO or BENCHMARK_PROFILE.
 * This shim reads those env vars at runtime and forwards them to the real
 * runner as proper CLI flags before handing off.
 *
 * Environment variables honoured:
 *
 *   BENCHMARK_SCENARIO   – run a single named scenario  (default: all)
 *   PROFILE              – 'ci' or 'full'               (default: ci)
 *   BENCHMARK_API_URL    – Go admin API base URL        (default: http://localhost:8080)
 *   BENCHMARK_API_USER   – Basic-auth username          (default: admin)
 *   BENCHMARK_API_PASS   – Basic-auth password          (default: admin)
 *   K6_BIN               – path to k6 binary            (default: k6)
 *
 * Usage (direct):
 *   node benchmarks/pm2-run.js
 *   BENCHMARK_SCENARIO=baseline node benchmarks/pm2-run.js
 *
 * Usage (via PM2):
 *   pm2 start ecosystem.config.js --only benchmark-runner
 *   BENCHMARK_SCENARIO=nginx pm2 start ecosystem.config.js --only benchmark-runner
 */

'use strict';

const path    = require('path');
const { BenchmarkRunner, SCENARIOS } = require('./run.js');

// ── Resolve config from env ───────────────────────────────────────────────────

const profile  = process.env.PROFILE            || 'ci';
const scenario = process.env.BENCHMARK_SCENARIO || '';
const k6Binary = process.env.K6_BIN             || 'k6';

// Validate scenario name if provided
if (scenario && !SCENARIOS.find((s) => s.name === scenario)) {
  console.error(
    `[benchmark-runner] Unknown BENCHMARK_SCENARIO="${scenario}"\n` +
    `Valid values: ${SCENARIOS.map((s) => s.name).join(', ')}`
  );
  process.exit(1);
}

// ── Print startup banner ──────────────────────────────────────────────────────

const apiUrl = process.env.BENCHMARK_API_URL || '(not set — results will not stream to UI)';
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  FlexGate Benchmark Runner — PM2 entry-point');
console.log('──────────────────────────────────────────────────────────────');
console.log(`  Profile  : ${profile}`);
console.log(`  Scenario : ${scenario || 'all (5 scenarios)'}`);
console.log(`  API URL  : ${apiUrl}`);
console.log(`  k6 bin   : ${k6Binary}`);
console.log('══════════════════════════════════════════════════════════════');
console.log('');

// ── Build runner options ──────────────────────────────────────────────────────

const opts = {
  profile,
  k6Binary,
  scenarios: scenario ? [scenario] : null,
};

const runner = new BenchmarkRunner(opts);

// ── Wire up console output ────────────────────────────────────────────────────

runner.on('start', ({ scenarios: names, profile: p }) => {
  console.log(`[start] profile=${p}  scenarios=${names.join(', ')}`);
});

runner.on('progress', ({ scenario: s, status }) => {
  const icon = { running: '▶', passed: '✔', failed: '✘' }[status] || '•';
  console.log(`[${icon}] ${s.padEnd(22)} ${status}`);
});

runner.on('metric', ({ scenario: s, ts, rps, latency, vus, error_rate }) => {
  if (!rps && !latency?.p50) return;           // skip empty windows
  const p99 = latency?.p99 != null ? `p99=${latency.p99.toFixed(1)}ms` : '';
  process.stdout.write(
    `    ${s.padEnd(22)} ` +
    `rps=${String(Math.round(rps)).padStart(6)}  ` +
    `vus=${String(vus ?? 0).padStart(3)}  ` +
    `${p99.padEnd(14)}  ` +
    `err=${((error_rate ?? 0) * 100).toFixed(2)}%\n`
  );
});

runner.on('summary', ({ scenario: s, passed, exitCode }) => {
  const icon = passed ? '✔' : '✘';
  console.log(`[summary] [${icon}] ${s.padEnd(22)} exit=${exitCode}`);
});

runner.on('warn',  ({ scenario: s, msg }) => console.warn(`[!] ${s}: ${msg}`));
runner.on('error', (err)                  => console.error(`[error] ${err.message}`));
runner.on('log',   ()                     => {});  // suppress k6 stderr noise

runner.on('done', ({ results }) => {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Results summary');
  console.log('──────────────────────────────────────────────────────────────');
  results.forEach(({ scenario: s, passed, exitCode }) => {
    const icon = passed ? '✔' : '✘';
    console.log(`  [${icon}] ${s.padEnd(24)} exit=${exitCode}`);
  });
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');
});

// ── Run ───────────────────────────────────────────────────────────────────────

runner.run()
  .then((results) => {
    const anyFailed = results.some((r) => !r.passed);
    process.exit(anyFailed ? 1 : 0);
  })
  .catch((err) => {
    console.error(`[fatal] ${err.message}`);
    process.exit(2);
  });
