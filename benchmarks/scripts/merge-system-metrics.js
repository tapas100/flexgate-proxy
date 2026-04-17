#!/usr/bin/env node
/**
 * benchmarks/scripts/merge-system-metrics.js
 *
 * Merges a `.jsonl` file produced by collect-metrics.sh into the matching
 * scenario result `.json` file, populating the `metrics.system` block.
 *
 * Usage
 * ─────
 *   node benchmarks/scripts/merge-system-metrics.js \
 *        <result.json> <system.jsonl>
 *
 * The result file is updated in-place.
 *
 * JSONL format (one object per line, produced by collect-metrics.sh):
 *   { "ts": 1712345678, "proxy_cpu": 12.3, "proxy_rss_kb": 45678,
 *     "echo_cpu": 4.1, "loadavg_1min": 0.82 }
 *
 * Computed fields written into metrics.system:
 *   proxy_cpu_pct_mean  — mean CPU % of the proxy process across all samples
 *   proxy_cpu_pct_max   — peak CPU %
 *   proxy_rss_mb_mean   — mean RSS in MiB (converted from KiB)
 *   proxy_rss_mb_max    — peak RSS in MiB
 *   echo_cpu_pct_mean   — mean CPU % of the echo server process
 *   loadavg_1min_mean   — mean 1-minute load average across the run
 *   sample_count        — number of samples collected
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function main() {
  const [resultFile, systemFile] = process.argv.slice(2);

  if (!resultFile || !systemFile) {
    console.error(
      'Usage: merge-system-metrics.js <result.json> <system.jsonl>'
    );
    process.exit(1);
  }

  // ── Load result ────────────────────────────────────────────────────────────
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch (e) {
    console.error(`Cannot read result file ${resultFile}: ${e.message}`);
    process.exit(1);
  }

  // ── Load JSONL samples ─────────────────────────────────────────────────────
  let samples;
  try {
    samples = fs.readFileSync(systemFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line, i) => {
        try { return JSON.parse(line); }
        catch (e) {
          process.stderr.write(`  ⚠  Skipping malformed JSONL line ${i + 1}: ${e.message}\n`);
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    console.error(`Cannot read system file ${systemFile}: ${e.message}`);
    process.exit(1);
  }

  if (samples.length === 0) {
    console.warn('No valid samples in system file — skipping merge');
    process.exit(0);
  }

  // ── Compute stats ──────────────────────────────────────────────────────────
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const max  = (arr) => Math.max(...arr);
  const pick = (key) => samples.map(s => s[key]).filter(v => v !== undefined && v !== null);

  const proxyCpus    = pick('proxy_cpu');
  const proxyRssKbs  = pick('proxy_rss_kb');
  const echoCpus     = pick('echo_cpu');
  const loadavgs     = pick('loadavg_1min');

  const KiB_TO_MiB = 1 / 1024;
  const r2 = (v) => Math.round(v * 100) / 100;

  const system = {
    proxy_cpu_pct_mean:  proxyCpus.length   ? r2(mean(proxyCpus))                    : null,
    proxy_cpu_pct_max:   proxyCpus.length   ? r2(max(proxyCpus))                     : null,
    proxy_rss_mb_mean:   proxyRssKbs.length ? r2(mean(proxyRssKbs) * KiB_TO_MiB)     : null,
    proxy_rss_mb_max:    proxyRssKbs.length ? r2(max(proxyRssKbs)  * KiB_TO_MiB)     : null,
    echo_cpu_pct_mean:   echoCpus.length    ? r2(mean(echoCpus))                     : null,
    loadavg_1min_mean:   loadavgs.length    ? r2(mean(loadavgs))                     : null,
    sample_count:        samples.length,
  };

  // ── Merge into result ──────────────────────────────────────────────────────
  if (!result.metrics) result.metrics = {};
  result.metrics.system = system;

  // ── Write back ─────────────────────────────────────────────────────────────
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

  console.log(
    `  ✔  Merged ${samples.length} system samples into ${path.basename(resultFile)}`
  );
  console.log(
    `     proxy CPU: mean=${system.proxy_cpu_pct_mean}% max=${system.proxy_cpu_pct_max}%` +
    `  RSS: mean=${system.proxy_rss_mb_mean}MiB max=${system.proxy_rss_mb_max}MiB`
  );
}

main();
