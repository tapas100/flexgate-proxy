#!/usr/bin/env node
// benchmarks/scripts/compare.js
//
// Diff two or more benchmark result JSON files and print a Markdown
// comparison table.
//
// Usage:
//   # Compare all results from a single run (by timestamp)
//   node benchmarks/scripts/compare.js benchmarks/results 1712345678
//
//   # Compare two specific files
//   node benchmarks/scripts/compare.js \
//        benchmarks/results/baseline-1712345678.json \
//        benchmarks/results/flexgate-inline-1712345678.json
//
//   # Output to file
//   node benchmarks/scripts/compare.js benchmarks/results 1712345678 \
//        > benchmarks/results/comparison-1712345678.md

'use strict';

const fs   = require('fs');
const path = require('path');

// ── OVERHEAD_LIMITS_MS — must match thresholds.js ────────────────────────────
const OVERHEAD_LIMITS = { p50: 2, p95: 5, p99: 15 };

// ── Entry point ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: compare.js <results-dir> [timestamp]');
    console.error('       compare.js <file1.json> <file2.json> [...]');
    process.exit(1);
  }

  let resultFiles;

  // Mode 1: directory + optional timestamp
  if (args.length <= 2 && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory()) {
    const dir = args[0];
    const ts  = args[1];
    const allFiles = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.includes('schema') && !f.includes('comparison'))
      .filter(f => !ts || f.includes(ts))
      .map(f => path.join(dir, f))
      .sort();
    resultFiles = allFiles;
  } else {
    // Mode 2: explicit file list
    resultFiles = args.filter(a => a.endsWith('.json'));
  }

  if (resultFiles.length === 0) {
    console.error('No result files found');
    process.exit(1);
  }

  // Load and validate results
  const results = resultFiles
    .map(f => {
      try {
        const raw  = fs.readFileSync(f, 'utf8');
        const data = JSON.parse(raw);
        if (data.schema_version !== 1) return null;
        return { file: path.basename(f), ...data };
      } catch (e) {
        process.stderr.write(`  ⚠  Skipping ${f}: ${e.message}\n`);
        return null;
      }
    })
    .filter(Boolean);

  if (results.length === 0) {
    console.error('No valid v1 result files found');
    process.exit(1);
  }

  // Sort: baseline first, then alphabetical by scenario
  const ORDER = [
    'baseline', 'nginx', 'haproxy', 'flexgate-inline', 'flexgate-mirror',
    'realistic',
    'steady-load', 'spike', 'stress',
  ];
  results.sort((a, b) => {
    const ai = ORDER.indexOf(a.scenario);
    const bi = ORDER.indexOf(b.scenario);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Find baseline for overhead delta
  const baseline = results.find(r => r.scenario === 'baseline');

  // Compute overhead deltas
  results.forEach(r => {
    if (!baseline || r.scenario === 'baseline') return;
    const bl = baseline.metrics.latency_ms;
    const rl = r.metrics.latency_ms;
    const p50d  = round2(rl.p50  - bl.p50);
    const p95d  = round2(rl.p95  - bl.p95);
    const p99d  = round2(rl.p99  - bl.p99);
    const rpsPct = baseline.metrics.rps.mean > 0
      ? round2(((r.metrics.rps.mean - baseline.metrics.rps.mean) / baseline.metrics.rps.mean) * 100)
      : null;

    const withinLimits =
      p50d <= OVERHEAD_LIMITS.p50 &&
      p95d <= OVERHEAD_LIMITS.p95 &&
      p99d <= OVERHEAD_LIMITS.p99;

    r.overhead_vs_baseline = {
      baseline_file: baseline.file || 'baseline',
      p50_delta_ms:  p50d,
      p95_delta_ms:  p95d,
      p99_delta_ms:  p99d,
      rps_delta_pct: rpsPct,
      within_limits: withinLimits,
    };

    // Write back enriched result
    try {
      const outPath = resultFiles.find(f => f.includes(r.scenario));
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(r, null, 2));
    } catch { /* best-effort */ }
  });

  // ── Print Markdown report ──────────────────────────────────────────────────

  const ts     = results[0]?.timestamp?.slice(0,19).replace('T',' ') || 'unknown';
  const sha    = results[0]?.git_sha || 'unknown';
  const hw     = results[0]?.hardware || {};
  const pname  = results[0]?.profile  || 'unknown';

  const lines = [];

  lines.push(`# FlexGate Benchmark Results`);
  lines.push(``);
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Timestamp | ${ts} |`);
  lines.push(`| Git SHA   | \`${sha}\` |`);
  lines.push(`| Profile   | ${pname} |`);
  lines.push(`| Hardware  | ${hw.cpu || 'unknown'} (${hw.os || 'unknown'}) |`);
  lines.push(`| Note      | ${hw.note || ''} |`);
  lines.push(``);

  // ── Main latency table ────────────────────────────────────────────────────

  lines.push(`## Latency (ms)`);
  lines.push(``);
  lines.push(
    `| Scenario | RPS | P50 | P95 | P99 | P99.9 | Max | StdDev | Err% |`
  );
  lines.push(
    `|----------|----:|----:|----:|----:|------:|----:|-------:|-----:|`
  );

  results.forEach(r => {
    const l   = r.metrics.latency_ms;
    const rps = r.metrics.rps.mean;
    const err = r.metrics.error_rate_pct;
    const errFmt = err > 0.1 ? `⚠ ${fmt(err)}` : fmt(err);
    lines.push(
      `| ${scenarioLabel(r.scenario)} ` +
      `| ${fmt(rps, 0)} ` +
      `| ${fmt(l.p50)} ` +
      `| ${fmt(l.p95)} ` +
      `| ${fmt(l.p99)} ` +
      `| ${fmt(l.p999)} ` +
      `| ${fmt(l.max)} ` +
      `| ${fmt(l.stddev)} ` +
      `| ${errFmt} |`
    );
  });

  // ── Overhead delta table ──────────────────────────────────────────────────

  const proxyResults = results.filter(r => r.overhead_vs_baseline);

  if (proxyResults.length > 0) {
    lines.push(``);
    lines.push(`## Overhead vs Baseline`);
    lines.push(``);
    lines.push(
      `| Scenario | ΔP50 (ms) | ΔP95 (ms) | ΔP99 (ms) | ΔRPS% | Within Limits |`
    );
    lines.push(
      `|----------|----------:|----------:|----------:|------:|:-------------:|`
    );

    proxyResults.forEach(r => {
      const o = r.overhead_vs_baseline;
      const ok = o.within_limits ? '✅' : '❌';
      lines.push(
        `| ${scenarioLabel(r.scenario)} ` +
        `| ${fmtDelta(o.p50_delta_ms)} ` +
        `| ${fmtDelta(o.p95_delta_ms)} ` +
        `| ${fmtDelta(o.p99_delta_ms)} ` +
        `| ${fmtDelta(o.rps_delta_pct)} ` +
        `| ${ok} |`
      );
    });

    lines.push(``);
    lines.push(
      `> Limits: ΔP50 ≤ ${OVERHEAD_LIMITS.p50} ms, ` +
      `ΔP95 ≤ ${OVERHEAD_LIMITS.p95} ms, ` +
      `ΔP99 ≤ ${OVERHEAD_LIMITS.p99} ms`
    );
  }

  // ── Threshold pass/fail ───────────────────────────────────────────────────

  lines.push(``);
  lines.push(`## Threshold Results`);
  lines.push(``);
  lines.push(`| Scenario | All Passed |`);
  lines.push(`|----------|:----------:|`);

  results.forEach(r => {
    const passed = Object.values(r.thresholds_passed || {});
    const allOk  = passed.length > 0 && passed.every(Boolean);
    lines.push(`| ${scenarioLabel(r.scenario)} | ${allOk ? '✅' : '❌'} |`);
  });

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(
    `*Generated by \`benchmarks/scripts/compare.js\`. ` +
    `All numbers are loopback measurements — see [ARCHITECTURE.md](../ARCHITECTURE.md) §3 for context.*`
  );

  console.log(lines.join('\n'));
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(v, digits = 2) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(digits);
}

function fmtDelta(v) {
  if (v === null || v === undefined) return '—';
  const s = v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  return s;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function scenarioLabel(s) {
  const MAP = {
    'baseline':        'Baseline (direct)',
    'nginx':           'Nginx',
    'haproxy':         'HAProxy',
    'flexgate-inline': 'FlexGate inline',
    'flexgate-mirror': 'FlexGate mirror',
    'realistic':       'Realistic traffic',
    'steady-load':     'Steady load',
    'spike':           'Spike',
    'stress':          'Stress',
  };
  return MAP[s] || s;
}

// ── Run ───────────────────────────────────────────────────────────────────────

main();
