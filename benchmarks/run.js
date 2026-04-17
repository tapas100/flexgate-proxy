#!/usr/bin/env node
/**
 * benchmarks/run.js
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FlexGate Real-Time Benchmark Runner — Stage 1                       ║
 * ║                                                                      ║
 * ║  Spawns k6 for each scenario, parses its JSON output stream, and     ║
 * ║  emits structured metric events that Stage 2 (the SSE server) can    ║
 * ║  subscribe to via the EventEmitter API.                              ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ── Programmatic API (Stage 2 will use this) ──────────────────────────
 *
 *   const { BenchmarkRunner } = require('./benchmarks/run.js');
 *
 *   const runner = new BenchmarkRunner({ profile: 'ci' });
 *
 *   runner.on('metric',   (event) => { ... });   // live data point
 *   runner.on('progress', (event) => { ... });   // scenario status update
 *   runner.on('summary',  (event) => { ... });   // scenario finished
 *   runner.on('done',     (event) => { ... });   // all scenarios finished
 *   runner.on('error',    (err)   => { ... });
 *
 *   await runner.run();                          // runs all 5 sequentially
 *   // OR
 *   await runner.runScenario('baseline');        // run a single scenario
 *
 * ── CLI usage ─────────────────────────────────────────────────────────
 *
 *   node benchmarks/run.js                       # all scenarios, ci profile
 *   node benchmarks/run.js --scenario baseline   # single scenario
 *   node benchmarks/run.js --profile full        # full profile
 *   node benchmarks/run.js --list                # list available scenarios
 *
 * ── k6 JSON output format ─────────────────────────────────────────────
 *
 *   k6 --out json=- emits NDJSON (one JSON object per line).
 *   Each line is one of:
 *     { type: 'Point', data: { time, value, tags }, metric: 'http_req_duration' }
 *     { type: 'Point', data: { time, value, tags }, metric: 'http_reqs' }
 *     { type: 'Point', data: { time, value, tags }, metric: 'http_req_failed' }
 *     { type: 'Point', data: { time, value, tags }, metric: 'vus' }
 *
 *   We aggregate these into 1-second windows and emit 'metric' events.
 */

'use strict';

const { spawn }        = require('child_process');
const { EventEmitter } = require('events');
const path             = require('path');
const fs               = require('fs');
const http             = require('http');
const https            = require('https');

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const BENCH_DIR = __dirname;

const SCENARIOS = [
  {
    name:   'baseline',
    script: path.join(BENCH_DIR, 'baseline.js'),
    target: process.env.BASELINE_URL || 'http://127.0.0.1:9000',
    port:   9000,
  },
  {
    name:   'nginx',
    script: path.join(BENCH_DIR, 'nginx.js'),
    target: process.env.NGINX_URL    || 'http://127.0.0.1:9001',
    port:   9001,
  },
  {
    name:   'haproxy',
    script: path.join(BENCH_DIR, 'haproxy.js'),
    target: process.env.HAPROXY_URL  || 'http://127.0.0.1:9002',
    port:   9002,
  },
  {
    name:   'flexgate-inline',
    script: path.join(BENCH_DIR, 'flexgate-inline.js'),
    target: process.env.FG_INLINE_URL || 'http://127.0.0.1:9003',
    port:   9003,
  },
  {
    name:   'flexgate-mirror',
    script: path.join(BENCH_DIR, 'flexgate-mirror.js'),
    target: process.env.FG_MIRROR_URL || 'http://127.0.0.1:8081',
    port:   8081,
  },
];

// Metrics we care about from the k6 JSON stream
const WATCHED_METRICS = new Set([
  'http_req_duration',
  'http_reqs',
  'http_req_failed',
  'vus',
  'vus_max',
  'http_req_waiting',
  'http_req_connecting',
  'iteration_duration',
]);

// ── Metric window aggregator ──────────────────────────────────────────────────

/**
 * Accumulates raw k6 data points within 1-second windows and computes
 * rolling statistics (p50, p95, p99, mean, rps, error_rate).
 */
// Maximum duration samples kept per 1-second bucket (reservoir sampling).
// At 40k RPS this saves ~800 KB/bucket vs storing every point.
const MAX_DURATION_SAMPLES = 2000;

class MetricWindow {
  constructor(windowMs = 1000) {
    this._windowMs   = windowMs;
    this._buckets    = new Map(); // windowKey → { durations[], reqs, errors, vus, _sampleCount }
  }

  /**
   * Ingest a single k6 Point record.
   *
   * @param {object} point  - { type, metric, data: { time, value, tags } }
   */
  ingest(point) {
    if (!WATCHED_METRICS.has(point.metric)) return;

    // k6 times are RFC3339 strings
    const ts         = new Date(point.data.time).getTime();
    const windowKey  = Math.floor(ts / this._windowMs) * this._windowMs;

    if (!this._buckets.has(windowKey)) {
      this._buckets.set(windowKey, {
        ts:           windowKey,
        durations:    [],
        reqs:         0,
        errors:       0,
        vus:          0,
        _sampleCount: 0, // total duration samples seen (for reservoir)
      });
    }

    const b = this._buckets.get(windowKey);

    switch (point.metric) {
      case 'http_req_duration':
      case 'http_req_waiting': {
        // Reservoir sampling — keep at most MAX_DURATION_SAMPLES per bucket
        // so p99 stays statistically accurate without unbounded memory growth.
        b._sampleCount += 1;
        if (b.durations.length < MAX_DURATION_SAMPLES) {
          b.durations.push(point.data.value);
        } else {
          // Replace a random existing slot with probability MAX/n
          const j = Math.floor(Math.random() * b._sampleCount);
          if (j < MAX_DURATION_SAMPLES) {
            b.durations[j] = point.data.value;
          }
        }
        break;
      }
      case 'http_reqs':
        b.reqs += point.data.value;
        break;
      case 'http_req_failed':
        if (point.data.value > 0) b.errors += 1;
        break;
      case 'vus':
        // Take the latest VU count within the window
        b.vus = Math.max(b.vus, point.data.value);
        break;
    }
  }

  /**
   * Flush all complete windows (everything except the most recent bucket).
   *
   * @returns {Array<MetricSnapshot>}  - sorted ascending by timestamp
   */
  flush() {
    const keys    = Array.from(this._buckets.keys()).sort((a, b) => a - b);
    if (keys.length <= 1) return []; // keep the live bucket

    const complete = keys.slice(0, -1);
    const results  = complete.map((k) => this._summarise(this._buckets.get(k)));
    complete.forEach((k) => this._buckets.delete(k));
    return results;
  }

  /**
   * Flush ALL buckets including the live one (call on scenario end).
   *
   * @returns {Array<MetricSnapshot>}
   */
  flushAll() {
    const keys   = Array.from(this._buckets.keys()).sort((a, b) => a - b);
    const result = keys.map((k) => this._summarise(this._buckets.get(k)));
    this._buckets.clear();
    return result;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _summarise(b) {
    const sorted = b.durations.slice().sort((a, c) => a - c);
    const n      = sorted.length;

    const pct = (p) => n > 0
      ? sorted[Math.min(Math.floor(p * n), n - 1)]
      : null;

    const mean = n > 0
      ? sorted.reduce((acc, v) => acc + v, 0) / n
      : null;

    return {
      ts:           b.ts,
      rps:          b.reqs,                // requests in this 1-s window
      vus:          b.vus,
      error_rate:   b.reqs > 0 ? b.errors / b.reqs : 0,
      latency: {
        mean: mean !== null ? +mean.toFixed(3) : null,
        p50:  pct(0.50) !== null ? +pct(0.50).toFixed(3) : null,
        p95:  pct(0.95) !== null ? +pct(0.95).toFixed(3) : null,
        p99:  pct(0.99) !== null ? +pct(0.99).toFixed(3) : null,
      },
    };
  }
}

// ── BenchmarkRunner ───────────────────────────────────────────────────────────

class BenchmarkRunner extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} [opts.profile='ci']            - 'ci' | 'full'
   * @param {string} [opts.k6Binary='k6']           - path to k6 executable
   * @param {string[]} [opts.scenarios]             - subset of scenario names to run
   * @param {boolean} [opts.saveResults=true]       - write result JSON to disk
   * @param {number} [opts.flushIntervalMs=1000]    - how often to emit metric events
   */
  constructor(opts = {}) {
    super();

    this.profile         = opts.profile          || process.env.PROFILE || 'ci';
    this.k6Binary        = opts.k6Binary         || process.env.K6_BIN  || 'k6';
    this.saveResults     = opts.saveResults !== false;
    this.flushIntervalMs = opts.flushIntervalMs  || 1000;

    // Filter scenarios if caller specified a subset
    if (opts.scenarios && opts.scenarios.length) {
      this.scenarios = SCENARIOS.filter((s) => opts.scenarios.includes(s.name));
    } else {
      this.scenarios = SCENARIOS;
    }

    this._currentProcess = null;
    this._aborted        = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run all configured scenarios sequentially.
   * Resolves with an array of per-scenario result summaries.
   */
  async run() {
    const results = [];
    this._aborted = false;

    this.emit('start', {
      scenarios: this.scenarios.map((s) => s.name),
      profile:   this.profile,
      ts:        Date.now(),
    });

    // Signal run start to Go backend — resets the in-memory store
    apiPost('/api/benchmarks/start', {
      scenario: this.scenarios[0]?.name || '',
    });

    for (const scenario of this.scenarios) {
      if (this._aborted) break;
      const result = await this.runScenario(scenario.name);
      results.push(result);
    }

    this.emit('done', { results, ts: Date.now() });

    // Signal run complete to Go backend
    apiPost('/api/benchmarks/complete', {});

    return results;
  }

  /**
   * Run a single scenario by name.
   *
   * @param {string} name  - one of 'baseline' | 'nginx' | 'haproxy' |
   *                         'flexgate-inline' | 'flexgate-mirror'
   * @returns {Promise<ScenarioResult>}
   */
  runScenario(name) {
    const cfg = SCENARIOS.find((s) => s.name === name);
    if (!cfg) {
      return Promise.reject(new Error(`Unknown scenario: "${name}"`));
    }

    return new Promise((resolve, reject) => {
      const window      = new MetricWindow(this.flushIntervalMs);
      let   rawLineCount = 0;  // counter only — never store the raw strings
      let   stdoutBuf   = '';
      let   exitCode    = null;
      let   summary     = null;

      // ── Emit progress ────────────────────────────────────────────────────
      this.emit('progress', {
        scenario: name,
        status:   'running',
        ts:       Date.now(),
      });

      // Signal scenario start to Go backend
      apiPost('/api/benchmarks/progress', {
        scenario:  name,
        status:    'running',
        exit_code: 0,
      });

      // ── Build k6 command ─────────────────────────────────────────────────
      const args = [
        'run',
        '--out', 'json=-',          // stream JSON metrics to stdout
        '--quiet',                   // suppress progress bar (cleaner stdout)
        '--env', `TARGET_URL=${cfg.target}`,
        '--env', `PROFILE=${this.profile}`,
        '--env', `GIT_SHA=${process.env.GIT_SHA || 'dev'}`,
        cfg.script,
      ];

      const child = spawn(this.k6Binary, args, {
        cwd:   REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env:   Object.assign({}, process.env, {
          TARGET_URL: cfg.target,
          PROFILE:    this.profile,
        }),
      });

      this._currentProcess = child;

      // ── Periodic flush → emit metric events ──────────────────────────────
      const flushTimer = setInterval(() => {
        const snapshots = window.flush();
        snapshots.forEach((snap) => {
          const event = { scenario: name, ...snap };
          this.emit('metric', event);

          // POST live data-point to Go backend (best-effort)
          apiPost('/api/benchmarks/ingest', {
            scenario:  name,
            rps:       snap.rps,
            p50:       snap.latency.p50  || 0,
            p95:       snap.latency.p95  || 0,
            p99:       snap.latency.p99  || 0,
            errors:    snap.error_rate   || 0,
            vus:       snap.vus          || 0,
            timestamp: new Date(snap.ts).toISOString(),
          });
        });
      }, this.flushIntervalMs);

      // ── stdout — k6 NDJSON stream ─────────────────────────────────────────
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk;
        const lines = stdoutBuf.split('\n');
        stdoutBuf   = lines.pop(); // keep the partial trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          rawLineCount += 1;

          let parsed;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            // Not JSON — k6 textSummary output; collect but don't parse
            continue;
          }

          if (parsed.type === 'Point') {
            window.ingest(parsed);
          } else if (parsed.type === 'Metric') {
            // Metric registration record — useful for debugging but not streamed
          }
        }
      });

      // ── stderr — k6 logs, errors, textSummary ────────────────────────────
      const stderrChunks = [];
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
        // Forward to caller as log events
        chunk.split('\n').filter(Boolean).forEach((line) => {
          this.emit('log', { scenario: name, level: 'info', msg: line.trim() });
        });
      });

      // ── Process exit ──────────────────────────────────────────────────────
      child.on('close', (code) => {
        clearInterval(flushTimer);

        // Flush remaining metric buckets
        const finalSnapshots = window.flushAll();
        finalSnapshots.forEach((snap) => {
          const event = { scenario: name, ...snap };
          this.emit('metric', event);
          apiPost('/api/benchmarks/ingest', {
            scenario:  name,
            rps:       snap.rps,
            p50:       snap.latency.p50  || 0,
            p95:       snap.latency.p95  || 0,
            p99:       snap.latency.p99  || 0,
            errors:    snap.error_rate   || 0,
            vus:       snap.vus          || 0,
            timestamp: new Date(snap.ts).toISOString(),
          });
        });

        exitCode = code;

        // Parse the handleSummary JSON envelope that k6 wrote to
        // benchmarks/results/<scenario>-<ts>.json (if saveResults is on)
        summary = this._findLatestResult(name);

        const result = {
          scenario:    name,
          exitCode:    code,
          passed:      code === 0,
          summary,
          rawLineCount: rawLineCount,
          ts:          Date.now(),
        };

        const finalStatus = code === 0 ? 'passed' : 'failed';

        this.emit('progress', {
          scenario: name,
          status:   finalStatus,
          exitCode: code,
          ts:       Date.now(),
        });

        this.emit('summary', result);

        // POST final status to Go backend
        apiPost('/api/benchmarks/progress', {
          scenario:  name,
          status:    finalStatus,
          exit_code: code,
        });

        // POST final summary envelope if we have one
        if (summary) {
          const m = summary.metrics || {};
          apiPost('/api/benchmarks/summary', {
            scenario:   name,
            passed:     code === 0,
            exit_code:  code,
            started_at: new Date(result.ts - 60000).toISOString(), // approx
            ended_at:   new Date(result.ts).toISOString(),
            summary: {
              rps_mean:       m.rps?.mean          || 0,
              p50:            m.latency_ms?.p50    || 0,
              p95:            m.latency_ms?.p95    || 0,
              p99:            m.latency_ms?.p99    || 0,
              error_rate_pct: m.error_rate_pct     || 0,
            },
          });
        }

        if (code !== 0 && !this._aborted) {
          // Non-zero exit = threshold breach or k6 error.
          // We resolve (not reject) so the runner continues to next scenario.
          this.emit('warn', {
            scenario: name,
            msg: `k6 exited with code ${code} — thresholds may have been breached`,
          });
        }

        resolve(result);
      });

      child.on('error', (err) => {
        clearInterval(flushTimer);
        const isNotFound = err.code === 'ENOENT';
        const hint = isNotFound
          ? `\n  → Install k6: https://k6.io/docs/getting-started/installation/`
          : '';
        this.emit('error', new Error(`Failed to spawn k6: ${err.message}${hint}`));
        reject(err);
      });
    });
  }

  /**
   * Abort any currently running scenario.
   */
  abort() {
    this._aborted = true;
    if (this._currentProcess) {
      this._currentProcess.kill('SIGTERM');
      this._currentProcess = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Find and parse the most recently written result JSON for a scenario.
   * Returns null if not found.
   */
  _findLatestResult(scenarioName) {
    const resultsDir = path.join(BENCH_DIR, 'results');
    if (!fs.existsSync(resultsDir)) return null;

    const pattern = `${scenarioName}-`;
    const files   = fs.readdirSync(resultsDir)
      .filter((f) => f.startsWith(pattern) && f.endsWith('.json'))
      .sort()
      .reverse();

    if (!files.length) return null;

    try {
      const raw = fs.readFileSync(path.join(resultsDir, files[0]), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

// ── API poster — forwards events to the Go backend ───────────────────────────
//
// When BENCHMARK_API_URL is set (e.g. http://localhost:8080), the runner
// POSTs each metric snapshot and lifecycle event to the Go admin API so the
// SSE hub (Stage 3) can broadcast them to browser clients in real time.
//
// If the variable is unset, or a request fails, the runner logs a warning and
// continues — the API push is best-effort and never blocks k6 execution.

const API_BASE = process.env.BENCHMARK_API_URL
  ? process.env.BENCHMARK_API_URL.replace(/\/$/, '')
  : null;

const API_USER = process.env.BENCHMARK_API_USER || 'admin';
const API_PASS = process.env.BENCHMARK_API_PASS || 'admin';

/**
 * Fire-and-forget JSON POST to the Go benchmark API.
 *
 * @param {string} path   - e.g. '/api/benchmarks/ingest'
 * @param {object} body   - will be JSON-serialised
 */
function apiPost(path, body) {
  if (!API_BASE) return; // streaming disabled

  const payload  = JSON.stringify(body);
  const url      = new URL(API_BASE + path);
  const isHttps  = url.protocol === 'https:';
  const lib      = isHttps ? https : http;
  const auth     = Buffer.from(`${API_USER}:${API_PASS}`).toString('base64');

  const opts = {
    hostname: url.hostname,
    port:     url.port || (isHttps ? 443 : 80),
    path:     url.pathname + url.search,
    method:   'POST',
    headers:  {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization':  `Basic ${auth}`,
    },
  };

  const req = lib.request(opts, (res) => {
    // Drain response body to free the socket
    res.resume();
  });

  req.on('error', (err) => {
    // Best-effort — don't crash the runner
    process.stderr.write(`[benchmark/api] POST ${path} failed: ${err.message}\n`);
  });

  req.write(payload);
  req.end();
}

// ── Exports (for Stage 2 SSE server) ─────────────────────────────────────────

module.exports = { BenchmarkRunner, SCENARIOS, apiPost };

// ── CLI entry-point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  // --list
  if (args.includes('--list')) {
    console.log('Available scenarios:');
    SCENARIOS.forEach((s) => {
      console.log(`  ${s.name.padEnd(20)} → ${s.target}`);
    });
    process.exit(0);
  }

  // --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
FlexGate Benchmark Runner

Usage:
  node benchmarks/run.js [options]

Options:
  --scenario <name>   Run a single scenario (default: all)
  --profile  <name>   'ci' (default) or 'full'
  --list              List available scenarios and their targets
  --help, -h          Show this help

Environment variables:
  PROFILE             ci | full  (overridden by --profile)
  K6_BIN              Path to k6 binary (default: k6)
  BASELINE_URL        Override baseline target URL
  NGINX_URL           Override nginx target URL
  HAPROXY_URL         Override haproxy target URL
  FG_INLINE_URL       Override flexgate-inline target URL
  FG_MIRROR_URL       Override flexgate-mirror target URL

Backend streaming (real-time UI):
  BENCHMARK_API_URL   Base URL of the FlexGate admin API
                      e.g. http://localhost:8080
                      When set, live metrics are POSTed to the backend
                      and pushed to the dashboard via SSE.
                      When unset, the runner still works but no live UI.
  BENCHMARK_API_USER  Basic-auth username  (default: admin)
  BENCHMARK_API_PASS  Basic-auth password  (default: admin)

Quick start:
  BENCHMARK_API_URL=http://localhost:8080 npm run benchmark
    `.trim());
    process.exit(0);
  }

  // Parse flags
  const scenarioFlag = args.indexOf('--scenario');
  const profileFlag  = args.indexOf('--profile');

  const scenarioArg = scenarioFlag !== -1 ? args[scenarioFlag + 1] : null;
  const profileArg  = profileFlag  !== -1 ? args[profileFlag  + 1] : null;

  const runnerOpts = {
    profile:   profileArg  || process.env.PROFILE || 'ci',
    scenarios: scenarioArg ? [scenarioArg] : null,
  };

  const runner = new BenchmarkRunner(runnerOpts);

  // ── Wire up console output ──────────────────────────────────────────────
  runner.on('start', ({ scenarios, profile }) => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  FlexGate Benchmark Runner`);
    console.log(`  Profile  : ${profile}`);
    console.log(`  Scenarios: ${scenarios.join(', ')}`);
    console.log(`${'─'.repeat(60)}\n`);
  });

  runner.on('progress', ({ scenario, status }) => {
    const icon = { running: '▶', passed: '✔', failed: '✘' }[status] || '•';
    console.log(`  [${icon}] ${scenario.padEnd(20)} ${status}`);
  });

  runner.on('metric', ({ scenario, ts, rps, latency, vus, error_rate }) => {
    if (rps === 0 && !latency.p50) return; // skip empty windows
    const p99 = latency.p99 != null ? `p99=${latency.p99.toFixed(1)}ms` : '';
    console.log(
      `      ${scenario.padEnd(20)} ` +
      `rps=${String(rps).padStart(5)}  ` +
      `vus=${String(vus).padStart(3)}  ` +
      `${p99.padEnd(14)}  ` +
      `err=${(error_rate * 100).toFixed(2)}%`
    );
  });

  runner.on('warn',  ({ scenario, msg }) => console.warn(`  [!] ${scenario}: ${msg}`));
  runner.on('error', (err)              => console.error(`\n  [✘] Runner error: ${err.message}\n`));
  runner.on('log',   ({ msg })          => {}); // suppress k6 stderr noise in CLI

  runner.on('done', ({ results }) => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  Results:');
    results.forEach(({ scenario, passed, exitCode }) => {
      const icon = passed ? '✔' : '✘';
      console.log(`    [${icon}] ${scenario.padEnd(22)} exit=${exitCode}`);
    });
    console.log(`${'─'.repeat(60)}\n`);

    const anyFailed = results.some((r) => !r.passed);
    process.exit(anyFailed ? 1 : 0);
  });

  // ── Run ──────────────────────────────────────────────────────────────────
  runner.run().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(2);
  });
}
