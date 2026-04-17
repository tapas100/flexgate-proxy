#!/usr/bin/env node
/**
 * benchmarks/scripts/soak-report.js
 *
 * Stage 6 — Soak test result analyser.
 *
 * Reads:
 *   1.  A k6 result envelope JSON  (written by soak.js handleSummary)
 *   2.  A soak-monitor JSONL file  (written by soak-monitor.sh)
 *
 * Produces:
 *   soak-summary.json   — machine-readable summary with drift/leak verdicts
 *   soak-report.md      — human-readable Markdown report with sparklines
 *
 * Usage
 * ─────
 *   node soak-report.js --result <result.json> --monitor <monitor.jsonl> [options]
 *
 * Options
 *   --result  <file>     Path to the k6 result envelope JSON (required)
 *   --monitor <file>     Path to the soak-monitor JSONL file (required)
 *   --out-dir <dir>      Directory to write outputs (default: same as --result)
 *   --stdout             Also print the Markdown report to stdout
 *   --drift-p99-pct <n> Flag latency drift if p99 grows > n % (default: 20)
 *   --drift-rss-pct <n> Flag memory growth if RSS grows > n % (default: 15)
 *   --windows <n>        Number of time windows to divide the run into (default: 6)
 *
 * Exit codes
 *   0  — all checks pass
 *   1  — one or more drift/leak/crash checks failed
 *   2  — usage / file error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CLI parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const i = args.indexOf(flag);
  if (i === -1) return defaultVal;
  return args[i + 1];
}
function hasFlag(flag) { return args.includes(flag); }

const RESULT_FILE    = getArg('--result',        null);
const MONITOR_FILE   = getArg('--monitor',       null);
const OUT_DIR        = getArg('--out-dir',        null);
const PRINT_STDOUT   = hasFlag('--stdout');
const DRIFT_P99_PCT  = Number(getArg('--drift-p99-pct', '20'));
const DRIFT_RSS_PCT  = Number(getArg('--drift-rss-pct', '15'));
const N_WINDOWS      = Number(getArg('--windows',       '6'));

if (!RESULT_FILE || !MONITOR_FILE) {
  console.error('Usage: node soak-report.js --result <file> --monitor <file> [options]');
  process.exit(2);
}

// ── File loading ──────────────────────────────────────────────────────────────

function loadJSON(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error(`Cannot read ${fp}: ${e.message}`);
    process.exit(2);
  }
}

function loadJSONL(fp) {
  try {
    return fs.readFileSync(fp, 'utf8')
      .split('\n')
      .filter(l => l.trim())
      .map((l, i) => {
        try { return JSON.parse(l); }
        catch { console.warn(`  [warn] JSONL line ${i + 1} is invalid JSON — skipped`); return null; }
      })
      .filter(Boolean);
  } catch (e) {
    console.error(`Cannot read ${fp}: ${e.message}`);
    process.exit(2);
  }
}

const result  = loadJSON(RESULT_FILE);
const samples = loadJSONL(MONITOR_FILE);

const outDir = OUT_DIR || path.dirname(RESULT_FILE);
fs.mkdirSync(outDir, { recursive: true });

// ── Extract metadata ──────────────────────────────────────────────────────────

const scenario    = result.scenario       || 'soak-unknown';
const profile     = (result.data?.soak_meta?.profile) || scenario.replace('soak-', '');
const durationS   = result.data?.soak_meta?.duration_s ?? 0;
const targetVus   = result.data?.soak_meta?.target_vus ?? 0;
const totalReqs   = result.data?.total_requests ?? 0;
const avgDurMs    = result.data?.avg_duration_ms ?? 0;
const p95Ms       = result.data?.p95_ms   ?? 0;
const p99Ms       = result.data?.p99_ms   ?? 0;
const p999Ms      = result.data?.p999_ms  ?? 0;
const errRate     = result.data?.error_rate ?? 0;
const k6Passed    = result.data?.passed   ?? false;

// ── Window analysis (latency data from k6 summary — we can only split
//    the MONITOR samples by time; k6 does not emit per-window p99 in the
//    summary JSON unless --out json is used.  We therefore compute per-window
//    statistics from the MONITOR JSONL and flag trends there.) ─────────────────

function divideIntoWindows(records, n) {
  if (!records.length) return Array.from({ length: n }, () => []);
  const startTs = records[0].ts;
  const endTs   = records[records.length - 1].ts;
  const span    = endTs - startTs || 1;
  const winSize = span / n;

  const windows = Array.from({ length: n }, () => []);
  for (const r of records) {
    const idx = Math.min(Math.floor((r.ts - startTs) / winSize), n - 1);
    windows[idx].push(r);
  }
  return windows;
}

function mean(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((s, r) => s + (r[key] ?? 0), 0) / arr.length;
}

function max(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((m, r) => Math.max(m, r[key] ?? 0), 0);
}

const windows = divideIntoWindows(samples, N_WINDOWS);

// Per-window aggregate stats
const windowStats = windows.map((win, i) => ({
  window:        i + 1,
  sample_count:  win.length,
  mean_cpu_pct:  round2(mean(win, 'cpu_pct')),
  max_cpu_pct:   round2(max(win,  'cpu_pct')),
  mean_rss_mb:   round2(mean(win, 'rss_mb')),
  max_rss_mb:    round2(max(win,  'rss_mb')),
  mean_fd_count: round2(mean(win, 'fd_count')),
  max_fd_count:  Math.round(max(win, 'fd_count')),
  health_fails:  win.filter(r => r.health_ok === false).length,
  crashes:       win.filter(r => r.crash === true).length,
}));

// ── Crash detection ───────────────────────────────────────────────────────────

const crashSamples = samples.filter(s => s.crash === true);
const crashCount   = crashSamples.length;
const crashed      = crashCount > 0;

// ── Memory leak detection (linear regression on RSS over time) ────────────────

/**
 * linearRegression(xs, ys) → { slope, intercept, r2 }
 *
 * Returns the slope of RSS over time in MB/hour.
 */
function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (xs[i] - xMean) * (ys[i] - yMean);
    ssxx += (xs[i] - xMean) ** 2;
    ssyy += (ys[i] - yMean) ** 2;
  }

  const slope     = ssxx === 0 ? 0 : ssxy / ssxx;
  const intercept = yMean - slope * xMean;
  const r2        = ssyy === 0 ? 0 : (ssxy ** 2) / (ssxx * ssyy);

  return { slope, intercept, r2 };
}

// Use elapsed_s vs rss_mb for regression
const rssPoints = samples
  .filter(s => !s.crash && s.rss_mb != null && s.elapsed_s != null)
  .map(s => ({ x: s.elapsed_s / 3600, y: s.rss_mb }));  // x in hours

const { slope: rssSlopeMbPerHr, r2: rssR2 } =
  linearRegression(rssPoints.map(p => p.x), rssPoints.map(p => p.y));

// FD count regression
const fdPoints = samples
  .filter(s => !s.crash && s.fd_count != null && s.elapsed_s != null)
  .map(s => ({ x: s.elapsed_s / 3600, y: s.fd_count }));

const { slope: fdSlopePerHr, r2: fdR2 } =
  linearRegression(fdPoints.map(p => p.x), fdPoints.map(p => p.y));

// ── Per-window drift comparison ───────────────────────────────────────────────

const firstWin = windowStats[0];
const lastWin  = windowStats[N_WINDOWS - 1];

const rssGrowthPct = firstWin?.mean_rss_mb > 0
  ? ((lastWin?.mean_rss_mb - firstWin?.mean_rss_mb) / firstWin.mean_rss_mb) * 100
  : 0;

const fdGrowthPct = firstWin?.mean_fd_count > 0
  ? ((lastWin?.mean_fd_count - firstWin?.mean_fd_count) / firstWin.mean_fd_count) * 100
  : 0;

// ── Health fail summary ───────────────────────────────────────────────────────

const totalHealthChecks = samples.filter(s => s.health_ok !== undefined).length;
const totalHealthFails  = samples.filter(s => s.health_ok === false).length;
const healthFailPct     = totalHealthChecks > 0
  ? (totalHealthFails / totalHealthChecks) * 100
  : 0;

// ── Verdicts ──────────────────────────────────────────────────────────────────

const memoryLeakFlag      = rssGrowthPct > DRIFT_RSS_PCT;
const fdLeakFlag          = fdSlopePerHr > 50 && fdR2 > 0.7;  // > 50 FDs/hr, strong R²
const crashFlag           = crashed;
const healthFailFlag      = healthFailPct > 1;                  // > 1 % health failures
const thresholdFailFlag   = !k6Passed;

const overallPass = !memoryLeakFlag && !fdLeakFlag && !crashFlag &&
                    !healthFailFlag && !thresholdFailFlag;

// ── Sparkline generation ──────────────────────────────────────────────────────

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

/**
 * sparkline(values) → string
 */
function sparkline(values, width = 60) {
  if (!values.length) return '(no data)';
  const step   = Math.max(1, Math.floor(values.length / width));
  const buckets = [];
  for (let i = 0; i < values.length; i += step) {
    const slice = values.slice(i, i + step);
    buckets.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const lo = Math.min(...buckets);
  const hi = Math.max(...buckets);
  const range = hi - lo || 1;
  return buckets
    .map(v => SPARK_CHARS[Math.min(7, Math.floor(((v - lo) / range) * 8))])
    .join('');
}

const rssValues     = samples.filter(s => !s.crash).map(s => s.rss_mb   ?? 0);
const cpuValues     = samples.filter(s => !s.crash).map(s => s.cpu_pct  ?? 0);
const fdValues      = samples.filter(s => !s.crash).map(s => s.fd_count ?? 0);
const healthValues  = samples.map(s => s.health_ok ? 1 : 0);

const rssSparkline    = sparkline(rssValues);
const cpuSparkline    = sparkline(cpuValues);
const fdSparkline     = sparkline(fdValues);
const healthSparkline = sparkline(healthValues);

// ── Build summary.json ────────────────────────────────────────────────────────

const summary = {
  schema_version:   1,
  generated_at:     new Date().toISOString(),
  scenario,
  profile,
  duration_s:       durationS,
  target_vus:       targetVus,

  k6: {
    total_requests: totalReqs,
    avg_ms:         avgDurMs,
    p95_ms:         p95Ms,
    p99_ms:         p99Ms,
    p999_ms:        p999Ms,
    error_rate:     errRate,
    passed:         k6Passed,
  },

  memory: {
    rss_slope_mb_per_hr: round2(rssSlopeMbPerHr),
    rss_r2:              round4(rssR2),
    rss_growth_pct:      round2(rssGrowthPct),
    leak_flag:           memoryLeakFlag,
    threshold_pct:       DRIFT_RSS_PCT,
  },

  fd: {
    slope_per_hr:  round2(fdSlopePerHr),
    fd_r2:         round4(fdR2),
    growth_pct:    round2(fdGrowthPct),
    leak_flag:     fdLeakFlag,
  },

  health: {
    total_checks:    totalHealthChecks,
    total_failures:  totalHealthFails,
    fail_pct:        round2(healthFailPct),
    flag:            healthFailFlag,
  },

  crashes: {
    count:  crashCount,
    flag:   crashFlag,
    events: crashSamples.map(s => ({ ts: s.ts, elapsed_s: s.elapsed_s })),
  },

  windows: windowStats,

  verdicts: {
    memory_leak:       memoryLeakFlag,
    fd_leak:           fdLeakFlag,
    crash:             crashFlag,
    health_failures:   healthFailFlag,
    threshold_failure: thresholdFailFlag,
    overall:           overallPass ? 'PASS' : 'FAIL',
  },
};

// ── Build report.md ───────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';
const icon = (flag) => flag ? FAIL : PASS;

function fmtMb(v) { return `${round2(v)} MiB`; }
function fmtMs(v) { return `${round2(v)} ms`; }
function fmtPct(v) { return `${round4(v * 100)} %`; }

const reportLines = [
  `# Soak Test Report — ${profile}`,
  '',
  `**Generated:** ${summary.generated_at}`,
  `**Scenario:** \`${scenario}\``,
  `**Duration:** ${formatDurationS(durationS)}`,
  `**Target VUs:** ${targetVus}`,
  '',
  '---',
  '',
  `## Overall Verdict: ${overallPass ? `${PASS} PASS` : `${FAIL} FAIL`}`,
  '',
  '| Check | Result | Detail |',
  '| ----- | ------ | ------ |',
  `| k6 Thresholds      | ${icon(thresholdFailFlag)}  | p99=${fmtMs(p99Ms)} · err=${fmtPct(errRate)} |`,
  `| Memory Leak        | ${icon(memoryLeakFlag)}  | RSS slope: ${round2(rssSlopeMbPerHr)} MiB/hr · growth: ${round2(rssGrowthPct)} % (threshold ${DRIFT_RSS_PCT} %) |`,
  `| FD Leak            | ${icon(fdLeakFlag)}  | FD slope: ${round2(fdSlopePerHr)} /hr · R²=${round4(fdR2)} |`,
  `| Crashes            | ${icon(crashFlag)}  | ${crashCount} crash event(s) |`,
  `| Health Failures    | ${icon(healthFailFlag)}  | ${totalHealthFails}/${totalHealthChecks} checks failed (${round2(healthFailPct)} %) |`,
  '',
  '---',
  '',
  '## k6 Performance Summary',
  '',
  '| Metric | Value |',
  '| ------ | ----- |',
  `| Total Requests | ${totalReqs.toLocaleString()} |`,
  `| Avg Latency    | ${fmtMs(avgDurMs)} |`,
  `| P95 Latency    | ${fmtMs(p95Ms)} |`,
  `| P99 Latency    | ${fmtMs(p99Ms)} |`,
  `| P99.9 Latency  | ${fmtMs(p999Ms)} |`,
  `| Error Rate     | ${fmtPct(errRate)} |`,
  `| Est. RPS       | ${durationS > 0 ? round2(totalReqs / durationS) : 'n/a'} |`,
  '',
  '---',
  '',
  '## Resource Usage Over Time',
  '',
  `**Total samples:** ${samples.length}  `,
  `**Sample interval:** ~${samples.length > 1 ? round2((samples[samples.length-1].elapsed_s - samples[0].elapsed_s) / (samples.length - 1)) : '?'} s`,
  '',
  '### RSS (MiB)',
  '',
  `\`\`\``,
  rssSparkline,
  `\`\`\``,
  '',
  `Min: ${round2(Math.min(...rssValues))} MiB · Max: ${round2(Math.max(...rssValues))} MiB · Slope: ${round2(rssSlopeMbPerHr)} MiB/hr`,
  '',
  '### CPU %',
  '',
  `\`\`\``,
  cpuSparkline,
  `\`\`\``,
  '',
  `Min: ${round2(Math.min(...cpuValues))} % · Max: ${round2(Math.max(...cpuValues))} %`,
  '',
  '### Open FDs',
  '',
  `\`\`\``,
  fdSparkline,
  `\`\`\``,
  '',
  `Min: ${Math.min(...fdValues)} · Max: ${Math.max(...fdValues)} · Slope: ${round2(fdSlopePerHr)} /hr`,
  '',
  '### Health Check (1=OK, 0=fail)',
  '',
  `\`\`\``,
  healthSparkline,
  `\`\`\``,
  '',
  `Failures: ${totalHealthFails} / ${totalHealthChecks}`,
  '',
  '---',
  '',
  '## Window Analysis',
  '',
  '| Window | Samples | Avg RSS (MiB) | Max RSS (MiB) | Avg CPU % | Avg FDs | Health Fails |',
  '| ------ | ------- | ------------- | ------------- | --------- | ------- | ------------ |',
  ...windowStats.map(w =>
    `| ${w.window} | ${w.sample_count} | ${w.mean_rss_mb} | ${w.max_rss_mb} | ${w.mean_cpu_pct} | ${w.mean_fd_count} | ${w.health_fails} |`
  ),
  '',
  `**Window 1 → Window ${N_WINDOWS} RSS delta:** ${round2(rssGrowthPct)} %`,
  `**Window 1 → Window ${N_WINDOWS} FD delta:** ${round2(fdGrowthPct)} %`,
  '',
];

// Add crash section if there were crashes
if (crashed) {
  reportLines.push('---', '', '## Crash Events', '');
  for (const ev of summary.crashes.events) {
    reportLines.push(
      `- **Crash at** ts=${ev.ts} (elapsed ${formatDurationS(ev.elapsed_s)})`
    );
  }
  reportLines.push('');
}

// ── Key insights ──────────────────────────────────────────────────────────────

reportLines.push('---', '', '## Key Insights', '');

if (!memoryLeakFlag) {
  reportLines.push(
    `${PASS} **No memory leak detected** — RSS slope of ${round2(rssSlopeMbPerHr)} MiB/hr ` +
    `is within the ${DRIFT_RSS_PCT} % growth threshold over the full run.`
  );
} else {
  reportLines.push(
    `${FAIL} **Memory leak suspected** — RSS grew ${round2(rssGrowthPct)} % ` +
    `(threshold ${DRIFT_RSS_PCT} %); slope=${round2(rssSlopeMbPerHr)} MiB/hr, R²=${round4(rssR2)}.`
  );
}

if (!fdLeakFlag) {
  reportLines.push(
    `${PASS} **No FD leak detected** — FD slope of ${round2(fdSlopePerHr)} /hr with R²=${round4(fdR2)}.`
  );
} else {
  reportLines.push(
    `${FAIL} **FD leak suspected** — FDs growing at ${round2(fdSlopePerHr)} /hr with R²=${round4(fdR2)}.`
  );
}

if (!crashFlag) {
  reportLines.push(`${PASS} **No crashes** — process stayed alive for the full ${formatDurationS(durationS)}.`);
} else {
  reportLines.push(`${FAIL} **${crashCount} crash event(s) detected** — see Crash Events section.`);
}

if (!healthFailFlag) {
  reportLines.push(`${PASS} **Health checks clean** — ${totalHealthFails}/${totalHealthChecks} failures (${round2(healthFailPct)} %).`);
} else {
  reportLines.push(`${WARN} **Health failures detected** — ${totalHealthFails}/${totalHealthChecks} checks failed (${round2(healthFailPct)} %).`);
}

reportLines.push('');

// ── Write outputs ─────────────────────────────────────────────────────────────

const summaryPath = path.join(outDir, 'soak-summary.json');
const reportPath  = path.join(outDir, 'soak-report.md');
const reportText  = reportLines.join('\n');

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
fs.writeFileSync(reportPath,  reportText);

console.log(`[soak-report] Written: ${summaryPath}`);
console.log(`[soak-report] Written: ${reportPath}`);
console.log(`[soak-report] Verdict: ${summary.verdicts.overall}`);

if (PRINT_STDOUT) {
  process.stdout.write('\n' + reportText + '\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(v) { return Math.round((v ?? 0) * 100) / 100; }
function round4(v) { return Math.round((v ?? 0) * 10000) / 10000; }

function formatDurationS(s) {
  if (s == null) return 'n/a';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ── Exit code ─────────────────────────────────────────────────────────────────

process.exit(overallPass ? 0 : 1);
