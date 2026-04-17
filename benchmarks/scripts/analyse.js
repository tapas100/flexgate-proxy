#!/usr/bin/env node
/**
 * benchmarks/scripts/analyse.js
 *
 * Stage 5 — Result Analysis
 *
 * Reads all scenario result files from a run directory (or explicit file
 * list), computes derived metrics, and emits:
 *
 *   summary.json   — machine-readable analysis (all numbers, comparisons)
 *   report.md      — human-readable Markdown report with tables and verdicts
 *
 * Usage
 * ─────
 *   # Analyse a run directory (produced by run-benchmarks.sh)
 *   node benchmarks/scripts/analyse.js benchmarks/results/run-<id>/
 *
 *   # Analyse explicit files
 *   node benchmarks/scripts/analyse.js \
 *        baseline.json nginx.json haproxy.json flexgate-inline.json
 *
 *   # Pipe report to stdout only (no files written)
 *   node benchmarks/scripts/analyse.js --stdout benchmarks/results/run-<id>/
 *
 * Output files
 * ────────────
 *   <run-dir>/summary.json   — structured analysis object (schema below)
 *   <run-dir>/report.md      — full Markdown report
 *
 * Summary JSON schema
 * ───────────────────
 *   {
 *     "generated_at": "<ISO8601>",
 *     "run_id":       "<string>",
 *     "profile":      "ci|full",
 *     "git_sha":      "<string>",
 *     "hardware":     { os, cpu, note },
 *
 *     "scenarios": {
 *       "<name>": {
 *         "rps":            <number>,
 *         "avg_ms":         <number>,
 *         "p50_ms":         <number>,
 *         "p95_ms":         <number>,
 *         "p99_ms":         <number>,
 *         "p999_ms":        <number>,
 *         "max_ms":         <number>,
 *         "stddev_ms":      <number>,
 *         "error_pct":      <number>,
 *         "thresholds_ok":  <boolean>,
 *         "system": { proxy_cpu_pct_mean, proxy_rss_mb_mean, ... } | null
 *       }
 *     },
 *
 *     "comparisons": {
 *       "vs_baseline": { "<scenario>": { p50, p95, p99, rps_pct, within_limits } },
 *       "vs_haproxy":  { "<scenario>": { p50, p95, p99, rps_pct, within_limits } },
 *       "vs_nginx":    { "<scenario>": { p50, p95, p99, rps_pct, within_limits } }
 *     },
 *
 *     "verdict": {
 *       "overall":           "pass|fail",
 *       "flexgate_overhead_acceptable": <boolean>,
 *       "breaking_point":    "<step>|null",
 *       "notes":             ["<string>", ...]
 *     }
 *   }
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Overhead SLA limits ───────────────────────────────────────────────────────
// These are the maximum ADDITIONAL latency FlexGate is allowed to add
// over each reference proxy before the overhead is considered unacceptable.

const LIMITS_VS_BASELINE = { p50: 2,  p95: 5,  p99: 15  };
const LIMITS_VS_HAPROXY  = { p50: 3,  p95: 8,  p99: 20  };  // FlexGate builds ON TOP of HAProxy
const LIMITS_VS_NGINX    = { p50: 10, p95: 20, p99: 40  };  // different technology; wider tolerance

// ── Scenario display labels ───────────────────────────────────────────────────

const LABELS = {
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

// Scenarios that represent the FlexGate product (used for overhead verdict)
const FLEXGATE_SCENARIOS = new Set(['flexgate-inline', 'flexgate-mirror', 'realistic']);

// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const rawArgs  = process.argv.slice(2);
  const stdoutOnly = rawArgs.includes('--stdout');
  const args     = rawArgs.filter(a => a !== '--stdout');

  if (args.length === 0) {
    console.error(
      'Usage: analyse.js [--stdout] <run-dir>\n' +
      '       analyse.js [--stdout] <file1.json> [file2.json ...]'
    );
    process.exit(1);
  }

  // ── Resolve input files ──────────────────────────────────────────────────
  let resultFiles;
  let outDir;

  if (args.length === 1 && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory()) {
    outDir = args[0];
    resultFiles = fs.readdirSync(outDir)
      .filter(f =>
        f.endsWith('.json') &&
        !f.startsWith('schema') &&
        !f.startsWith('summary') &&
        !f.startsWith('manifest') &&
        !f.includes('comparison')
      )
      .map(f => path.join(outDir, f))
      .sort();
  } else {
    resultFiles = args.filter(a => a.endsWith('.json'));
    outDir = stdoutOnly ? null : path.dirname(resultFiles[0]);
  }

  if (resultFiles.length === 0) {
    console.error('No result files found.');
    process.exit(1);
  }

  // ── Load results ─────────────────────────────────────────────────────────
  const results = resultFiles
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (data.schema_version !== 1) return null;
        return data;
      } catch (e) {
        process.stderr.write(`  ⚠  Skipping ${path.basename(f)}: ${e.message}\n`);
        return null;
      }
    })
    .filter(Boolean);

  if (results.length === 0) {
    console.error('No valid v1 result files found.');
    process.exit(1);
  }

  // ── Sort canonically ──────────────────────────────────────────────────────
  const ORDER = Object.keys(LABELS);
  results.sort((a, b) => {
    const ai = ORDER.indexOf(a.scenario);
    const bi = ORDER.indexOf(b.scenario);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // ── Build scenario map ────────────────────────────────────────────────────
  const byScenario = {};
  results.forEach(r => { byScenario[r.scenario] = r; });

  // ── Compute per-scenario stats ────────────────────────────────────────────
  const scenarioStats = {};
  results.forEach(r => {
    const l   = r.metrics.latency_ms || {};
    const rps = r.metrics.rps        || {};
    const thresholds = r.thresholds_passed || {};
    const passed     = Object.values(thresholds);

    scenarioStats[r.scenario] = {
      rps:           round2(rps.mean   || 0),
      avg_ms:        round2(l.mean     || 0),
      p50_ms:        round2(l.p50      || 0),
      p95_ms:        round2(l.p95      || 0),
      p99_ms:        round2(l.p99      || 0),
      p999_ms:       round2(l.p999     || 0),
      max_ms:        round2(l.max      || 0),
      stddev_ms:     round2(l.stddev   || 0),
      error_pct:     round2(r.metrics.error_rate_pct || 0),
      thresholds_ok: passed.length > 0 && passed.every(Boolean),
      system:        r.metrics.system  || null,
      // extras for load tests
      stress_meta:   r.stress_meta     || null,
      spike_meta:    r.spike_meta      || null,
    };
  });

  // ── Build comparison tables ───────────────────────────────────────────────
  const comparisons = {
    vs_baseline: buildComparisons('baseline', byScenario, LIMITS_VS_BASELINE),
    vs_haproxy:  buildComparisons('haproxy',  byScenario, LIMITS_VS_HAPROXY),
    vs_nginx:    buildComparisons('nginx',    byScenario, LIMITS_VS_NGINX),
  };

  // ── Verdict ───────────────────────────────────────────────────────────────
  const verdict = computeVerdict(scenarioStats, comparisons, byScenario);

  // ── Assemble summary ──────────────────────────────────────────────────────
  const meta      = results[0];
  const summary = {
    schema_version: 1,
    generated_at:   new Date().toISOString(),
    run_id:         meta.run_id    || 'unknown',
    run_label:      meta.run_label || 'unknown',
    profile:        meta.profile   || 'unknown',
    git_sha:        meta.git_sha   || 'unknown',
    hardware:       meta.hardware  || {},
    scenario_count: results.length,
    scenarios:      scenarioStats,
    comparisons,
    verdict,
  };

  // ── Build report ──────────────────────────────────────────────────────────
  const report = buildReport(summary, results);

  // ── Write / print ─────────────────────────────────────────────────────────
  if (!stdoutOnly && outDir) {
    const summaryPath = path.join(outDir, 'summary.json');
    const reportPath  = path.join(outDir, 'report.md');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(reportPath,  report);
    process.stderr.write(`  ✔  summary.json → ${summaryPath}\n`);
    process.stderr.write(`  ✔  report.md    → ${reportPath}\n`);
  }

  // Always print report to stdout
  console.log(report);
}

// ─────────────────────────────────────────────────────────────────────────────
//  buildComparisons(referenceScenario, byScenario, limits)
//
//  For each non-reference scenario compute latency deltas and RPS % change
//  relative to the reference scenario.
// ─────────────────────────────────────────────────────────────────────────────

function buildComparisons(referenceScenario, byScenario, limits) {
  const ref = byScenario[referenceScenario];
  if (!ref) return null;

  const rl  = ref.metrics.latency_ms || {};
  const out = {};

  Object.entries(byScenario).forEach(([scenario, r]) => {
    if (scenario === referenceScenario) return;
    const l = r.metrics.latency_ms || {};

    const p50d  = round2((l.p50 || 0) - (rl.p50 || 0));
    const p95d  = round2((l.p95 || 0) - (rl.p95 || 0));
    const p99d  = round2((l.p99 || 0) - (rl.p99 || 0));
    const refRps = ref.metrics.rps.mean || 0;
    const rRps   = r.metrics.rps.mean   || 0;
    const rpsPct = refRps > 0 ? round2(((rRps - refRps) / refRps) * 100) : null;

    const withinLimits = p50d <= limits.p50
                      && p95d <= limits.p95
                      && p99d <= limits.p99;

    out[scenario] = {
      p50_delta_ms:  p50d,
      p95_delta_ms:  p95d,
      p99_delta_ms:  p99d,
      rps_delta_pct: rpsPct,
      within_limits: withinLimits,
    };
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  computeVerdict
// ─────────────────────────────────────────────────────────────────────────────

function computeVerdict(stats, comparisons, byScenario) {
  const notes  = [];
  let overheadOk = true;

  // 1. All required scenarios must have thresholds_ok
  const failed = Object.entries(stats)
    .filter(([, s]) => !s.thresholds_ok)
    .map(([name]) => name);

  if (failed.length > 0) {
    notes.push(`Threshold failures: ${failed.join(', ')}`);
  }

  // 2. FlexGate overhead vs baseline must be within limits
  const vsBaseline = comparisons.vs_baseline || {};
  for (const sc of FLEXGATE_SCENARIOS) {
    if (!vsBaseline[sc]) continue;
    if (!vsBaseline[sc].within_limits) {
      overheadOk = false;
      const d = vsBaseline[sc];
      notes.push(
        `${LABELS[sc] || sc} overhead vs baseline exceeds limits — ` +
        `ΔP95=${fmtDelta(d.p95_delta_ms)}ms ΔP99=${fmtDelta(d.p99_delta_ms)}ms`
      );
    }
  }

  // 3. FlexGate overhead vs HAProxy (its own data plane)
  const vsHAProxy = comparisons.vs_haproxy || {};
  for (const sc of FLEXGATE_SCENARIOS) {
    if (!vsHAProxy[sc]) continue;
    if (!vsHAProxy[sc].within_limits) {
      notes.push(
        `${LABELS[sc] || sc} adds excessive overhead over HAProxy — ` +
        `ΔP99=${fmtDelta(vsHAProxy[sc].p99_delta_ms)}ms (limit: +${LIMITS_VS_HAPROXY.p99}ms)`
      );
    }
  }

  // 4. Stress breaking point
  const stressStat = stats['stress'];
  const breakingStep = stressStat?.stress_meta?.breaking_step || null;
  if (breakingStep) {
    notes.push(`Stress breaking point: ${breakingStep}`);
  }

  // 5. Error rates
  Object.entries(stats).forEach(([sc, s]) => {
    if (s.error_pct > 0.1) {
      notes.push(`${LABELS[sc] || sc} error rate ${s.error_pct.toFixed(2)}% > 0.1%`);
    }
  });

  const overall = failed.length === 0 ? 'pass' : 'fail';

  if (notes.length === 0) {
    notes.push('All scenarios passed. FlexGate overhead is within acceptable limits.');
  }

  return {
    overall,
    flexgate_overhead_acceptable: overheadOk,
    breaking_point: breakingStep,
    scenario_pass_count:  Object.values(stats).filter(s => s.thresholds_ok).length,
    scenario_total_count: Object.keys(stats).length,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  buildReport — full Markdown document
// ─────────────────────────────────────────────────────────────────────────────

function buildReport(summary, results) {
  const lines = [];
  const { scenarios, comparisons, verdict, hardware, profile } = summary;

  const ts  = summary.generated_at.slice(0,19).replace('T',' ');
  const sha = summary.git_sha;
  const hw  = hardware || {};

  // ── Header ────────────────────────────────────────────────────────────────

  lines.push('# FlexGate Benchmark Analysis — Stage 5');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| Generated  | ${ts} UTC |`);
  lines.push(`| Run ID     | \`${summary.run_id}\` |`);
  lines.push(`| Git SHA    | \`${sha}\` |`);
  lines.push(`| Profile    | ${profile} |`);
  lines.push(`| CPU        | ${hw.cpu || '—'} |`);
  lines.push(`| OS         | ${hw.os  || '—'} |`);
  lines.push(`| Note       | ${hw.note || 'single-node loopback'} |`);
  lines.push('');

  // ── Verdict banner ────────────────────────────────────────────────────────

  const overallIcon = verdict.overall === 'pass' ? '✅' : '❌';
  const overheadIcon = verdict.flexgate_overhead_acceptable ? '✅' : '⚠️';

  lines.push('## Verdict');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Overall | ${overallIcon} **${verdict.overall.toUpperCase()}** |`);
  lines.push(`| FlexGate overhead acceptable | ${overheadIcon} |`);
  lines.push(`| Scenarios passed | ${verdict.scenario_pass_count} / ${verdict.scenario_total_count} |`);
  if (verdict.breaking_point) {
    lines.push(`| Stress breaking point | \`${verdict.breaking_point}\` |`);
  }
  lines.push('');
  verdict.notes.forEach(n => lines.push(`> ${n}`));
  lines.push('');

  // ── Main metrics table ────────────────────────────────────────────────────

  lines.push('## Metrics Summary');
  lines.push('');
  lines.push('| Tool | RPS | Avg (ms) | P50 | P95 | P99 | P99.9 | Max | StdDev | Error % | Thresholds |');
  lines.push('|------|----:|---------:|----:|----:|----:|------:|----:|-------:|--------:|:----------:|');

  Object.entries(scenarios).forEach(([sc, s]) => {
    const label    = LABELS[sc] || sc;
    const errFmt   = s.error_pct > 0.1 ? `⚠ ${fmt(s.error_pct)}` : fmt(s.error_pct);
    const tFmt     = s.thresholds_ok ? '✅' : '❌';
    lines.push(
      `| ${label} ` +
      `| ${fmt(s.rps, 0)} ` +
      `| ${fmt(s.avg_ms)} ` +
      `| ${fmt(s.p50_ms)} ` +
      `| ${fmt(s.p95_ms)} ` +
      `| ${fmt(s.p99_ms)} ` +
      `| ${fmt(s.p999_ms)} ` +
      `| ${fmt(s.max_ms)} ` +
      `| ${fmt(s.stddev_ms)} ` +
      `| ${errFmt} ` +
      `| ${tFmt} |`
    );
  });
  lines.push('');

  // ── Overhead vs Baseline ──────────────────────────────────────────────────

  if (comparisons.vs_baseline) {
    lines.push('## Overhead vs Baseline (direct echo)');
    lines.push('');
    lines.push(
      `> Limits: ΔP50 ≤ ${LIMITS_VS_BASELINE.p50} ms · ` +
      `ΔP95 ≤ ${LIMITS_VS_BASELINE.p95} ms · ` +
      `ΔP99 ≤ ${LIMITS_VS_BASELINE.p99} ms`
    );
    lines.push('');
    lines.push('| Tool | ΔP50 (ms) | ΔP95 (ms) | ΔP99 (ms) | ΔRPS % | Within Limits |');
    lines.push('|------|----------:|----------:|----------:|-------:|:-------------:|');
    overheadRows(comparisons.vs_baseline, lines);
    lines.push('');
  }

  // ── Overhead vs HAProxy ───────────────────────────────────────────────────

  if (comparisons.vs_haproxy) {
    lines.push('## Overhead vs HAProxy (FlexGate\'s own data plane)');
    lines.push('');
    lines.push(
      `> Limits: ΔP50 ≤ ${LIMITS_VS_HAPROXY.p50} ms · ` +
      `ΔP95 ≤ ${LIMITS_VS_HAPROXY.p95} ms · ` +
      `ΔP99 ≤ ${LIMITS_VS_HAPROXY.p99} ms`
    );
    lines.push('');
    lines.push('| Tool | ΔP50 (ms) | ΔP95 (ms) | ΔP99 (ms) | ΔRPS % | Within Limits |');
    lines.push('|------|----------:|----------:|----------:|-------:|:-------------:|');
    overheadRows(comparisons.vs_haproxy, lines);
    lines.push('');
  }

  // ── Overhead vs Nginx ─────────────────────────────────────────────────────

  if (comparisons.vs_nginx) {
    lines.push('## Overhead vs Nginx (industry reference)');
    lines.push('');
    lines.push(
      `> Limits: ΔP50 ≤ ${LIMITS_VS_NGINX.p50} ms · ` +
      `ΔP95 ≤ ${LIMITS_VS_NGINX.p95} ms · ` +
      `ΔP99 ≤ ${LIMITS_VS_NGINX.p99} ms`
    );
    lines.push('');
    lines.push('| Tool | ΔP50 (ms) | ΔP95 (ms) | ΔP99 (ms) | ΔRPS % | Within Limits |');
    lines.push('|------|----------:|----------:|----------:|-------:|:-------------:|');
    overheadRows(comparisons.vs_nginx, lines);
    lines.push('');
  }

  // ── System resources ──────────────────────────────────────────────────────

  const withSystem = Object.entries(scenarios).filter(([, s]) => s.system);
  if (withSystem.length > 0) {
    lines.push('## System Resources');
    lines.push('');
    lines.push('| Tool | CPU mean % | CPU max % | RSS mean (MiB) | RSS max (MiB) | Load avg |');
    lines.push('|------|----------:|----------:|--------------:|-------------:|---------:|');
    withSystem.forEach(([sc, s]) => {
      const sys = s.system;
      lines.push(
        `| ${LABELS[sc] || sc} ` +
        `| ${fmt(sys.proxy_cpu_pct_mean)} ` +
        `| ${fmt(sys.proxy_cpu_pct_max)} ` +
        `| ${fmt(sys.proxy_rss_mb_mean)} ` +
        `| ${fmt(sys.proxy_rss_mb_max)} ` +
        `| ${fmt(sys.loadavg_1min_mean)} |`
      );
    });
    lines.push('');
  }

  // ── Load test results (Stage 3) ───────────────────────────────────────────

  const loadScenarios = ['steady-load', 'spike', 'stress']
    .filter(sc => scenarios[sc]);

  if (loadScenarios.length > 0) {
    lines.push('## Load Test Results (Stage 3)');
    lines.push('');

    // Steady load
    if (scenarios['steady-load']) {
      const s = scenarios['steady-load'];
      lines.push('### Steady Load (100 → 1 000 RPS ramp)');
      lines.push('');
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|------:|`);
      lines.push(`| RPS (sustained) | ${fmt(s.rps, 0)} |`);
      lines.push(`| P95 latency     | ${fmt(s.p95_ms)} ms |`);
      lines.push(`| P99 latency     | ${fmt(s.p99_ms)} ms |`);
      lines.push(`| Error rate      | ${fmt(s.error_pct)} % |`);
      lines.push(`| Thresholds      | ${s.thresholds_ok ? '✅ PASS' : '❌ FAIL'} |`);
      lines.push('');
    }

    // Spike
    if (scenarios['spike']) {
      const s    = scenarios['spike'];
      const meta = s.spike_meta || {};
      lines.push('### Spike Test (10× burst)');
      lines.push('');
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|------:|`);
      lines.push(`| Peak VUs | ${meta.peak_vus || '—'} |`);
      lines.push(`| Burst factor | ${meta.burst_factor || '10'}× |`);
      lines.push(`| P99 during spike | ${fmt(s.p99_ms)} ms |`);
      lines.push(`| Overall error rate | ${fmt(s.error_pct)} % |`);
      lines.push(`| Thresholds | ${s.thresholds_ok ? '✅ PASS' : '❌ FAIL'} |`);
      lines.push('');
    }

    // Stress
    if (scenarios['stress']) {
      const s    = scenarios['stress'];
      const meta = s.stress_meta || {};
      lines.push('### Stress Test (staircase to breaking point)');
      lines.push('');
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|------:|`);
      lines.push(`| Steps | ${meta.steps || 10} × ${meta.step_duration_s || 30} s |`);
      lines.push(`| Peak VUs tested | ${meta.peak_vus || '750'} |`);
      lines.push(`| Breaking point | ${meta.breaking_step ? `\`${meta.breaking_step}\`` : 'Not reached'} |`);
      lines.push(`| P99 at breaking point | ${fmt(s.p99_ms)} ms |`);
      lines.push(`| Max error rate | ${fmt(s.error_pct)} % |`);
      if (meta.breaking_point_note) {
        lines.push('');
        lines.push(`> ${meta.breaking_point_note}`);
      }
      lines.push('');
    }
  }

  // ── Threshold detail ──────────────────────────────────────────────────────

  const anyFailed = results.some(r => {
    const vals = Object.values(r.thresholds_passed || {});
    return vals.some(v => !v);
  });

  lines.push('## Threshold Detail');
  lines.push('');
  lines.push('| Scenario | Threshold | Passed |');
  lines.push('|----------|-----------|:------:|');

  results.forEach(r => {
    const thresholds = r.thresholds_passed || {};
    const entries    = Object.entries(thresholds);
    if (entries.length === 0) {
      lines.push(`| ${LABELS[r.scenario] || r.scenario} | *(none)* | — |`);
      return;
    }
    entries.forEach(([expr, ok]) => {
      const icon = ok ? '✅' : '❌';
      lines.push(`| ${LABELS[r.scenario] || r.scenario} | \`${expr}\` | ${icon} |`);
    });
  });

  lines.push('');

  // ── Key insights ──────────────────────────────────────────────────────────

  lines.push('## Key Insights');
  lines.push('');

  const baseline = scenarios['baseline'];
  const fgInline = scenarios['flexgate-inline'];
  const haproxy  = scenarios['haproxy'];
  const nginx    = scenarios['nginx'];

  if (baseline && fgInline) {
    const overhead99 = round2(fgInline.p99_ms - baseline.p99_ms);
    const icon = overhead99 <= LIMITS_VS_BASELINE.p99 ? '✅' : '⚠️';
    lines.push(
      `${icon} **FlexGate inline adds ${fmtDelta(overhead99)} ms P99** ` +
      `over the raw baseline (limit: +${LIMITS_VS_BASELINE.p99} ms).`
    );
  }

  if (haproxy && fgInline) {
    const overhead99 = round2(fgInline.p99_ms - haproxy.p99_ms);
    const icon = overhead99 <= LIMITS_VS_HAPROXY.p99 ? '✅' : '⚠️';
    lines.push(
      `${icon} **FlexGate adds ${fmtDelta(overhead99)} ms P99 over HAProxy alone** ` +
      `(its own data plane, limit: +${LIMITS_VS_HAPROXY.p99} ms).`
    );
  }

  if (nginx && fgInline) {
    const overhead99 = round2(fgInline.p99_ms - nginx.p99_ms);
    const icon = overhead99 <= LIMITS_VS_NGINX.p99 ? '✅' : '⚠️';
    lines.push(
      `${icon} **FlexGate vs Nginx: ${fmtDelta(overhead99)} ms P99** ` +
      `(limit: +${LIMITS_VS_NGINX.p99} ms).`
    );
  }

  if (scenarios['stress']?.stress_meta?.breaking_step) {
    lines.push(
      `⚡ **Stress test breaking point:** ` +
      `\`${scenarios['stress'].stress_meta.breaking_step}\` — ` +
      `see stress threshold detail above for the exact step where errors appeared.`
    );
  } else if (scenarios['stress']) {
    lines.push(
      `⚡ **Stress test:** no breaking point reached within the test parameters.`
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    `*Generated by \`benchmarks/scripts/analyse.js\`. ` +
    `All latency values are loopback measurements — ` +
    `see [ARCHITECTURE.md](../ARCHITECTURE.md) §3 for context and honesty constraints.*`
  );

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function overheadRows(compMap, lines) {
  if (!compMap) return;
  Object.entries(compMap).forEach(([sc, c]) => {
    const ok = c.within_limits ? '✅' : '❌';
    lines.push(
      `| ${LABELS[sc] || sc} ` +
      `| ${fmtDelta(c.p50_delta_ms)} ` +
      `| ${fmtDelta(c.p95_delta_ms)} ` +
      `| ${fmtDelta(c.p99_delta_ms)} ` +
      `| ${fmtDelta(c.rps_delta_pct)} ` +
      `| ${ok} |`
    );
  });
}

function fmt(v, digits = 2) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(digits);
}

function fmtDelta(v) {
  if (v === null || v === undefined) return '—';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ── Run ───────────────────────────────────────────────────────────────────────

main();
