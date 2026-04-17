'use strict';
/**
 * ecosystem.config.js — PM2 process configuration for FlexGate
 *
 * Usage
 * ─────
 *   pm2 start ecosystem.config.js                          # start all apps
 *   pm2 start ecosystem.config.js --only flexgate-proxy    # proxy only
 *   pm2 start ecosystem.config.js --only flexgate-admin-ui # UI only
 *   pm2 start ecosystem.config.js --only benchmark-runner  # run benchmarks
 *   pm2 stop  ecosystem.config.js
 *   pm2 reload ecosystem.config.js                         # zero-downtime reload
 *   pm2 logs                                               # tail all logs
 *   pm2 monit                                              # live dashboard
 *   pm2 save && pm2 startup                                # survive reboots
 *
 * Apps
 * ────
 *   flexgate-proxy      Go binary  ./flexgate  on :8080 (proxy) + :9090 (admin API)
 *   flexgate-admin-ui   Vite/CRA   admin-ui/   on :3000  (dev hot-reload server)
 *   benchmark-runner    Node.js    benchmarks/run.js  (one-shot, no autorestart)
 *
 * Benchmark quick-start
 * ─────────────────────
 *   # Start the stack first, then kick off a benchmark run:
 *   pm2 start ecosystem.config.js --only flexgate-proxy --only flexgate-admin-ui
 *   pm2 start ecosystem.config.js --only benchmark-runner
 *
 *   # Watch live in PM2:
 *   pm2 logs benchmark-runner
 *
 *   # Override the admin API URL or credentials:
 *   BENCHMARK_API_URL=http://prod:8080 pm2 start ecosystem.config.js --only benchmark-runner
 *
 *   # Run a single scenario only:
 *   BENCHMARK_SCENARIO=baseline pm2 start ecosystem.config.js --only benchmark-runner
 *
 *   # Run the full load profile instead of ci:
 *   BENCHMARK_PROFILE=full pm2 start ecosystem.config.js --only benchmark-runner
 *
 * Environment override examples
 * ─────────────────────────────
 *   FLEXGATE_PROXY_PORT=8081 pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --env production
 */

const path = require('path');

const ROOT    = __dirname;
const LOGS    = path.join(ROOT, 'logs');
const BINARY  = path.join(ROOT, 'flexgate');
const CONFIG  = path.join(ROOT, 'flexgate.yaml');
const ADMIN   = path.join(ROOT, 'admin-ui');

module.exports = {
  apps: [

    // ── 1. FlexGate proxy (Go binary) ───────────────────────────────────────
    {
      name:         'flexgate-proxy',

      // The compiled Go binary — no interpreter needed.
      script:       BINARY,
      args:         `--config ${CONFIG}`,

      // Working directory so relative paths in the config resolve correctly.
      cwd:          ROOT,

      // ── Process management ───────────────────────────────────────────────
      // 'fork' is correct for native binaries (cluster mode is Node-only).
      exec_mode:    'fork',
      instances:    1,

      // Restart policy: back-off from 100 ms → 1 s → 5 s → 15 s (max).
      autorestart:  true,
      restart_delay: 1000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,

      // Treat a process that exits within 15 s of start as a crash.
      // (The Go binary takes ~3-4 s to become healthy; give it headroom.)
      min_uptime:   '15s',

      // Watch flexgate.yaml for changes and auto-reload.
      watch:        ['flexgate.yaml'],
      watch_delay:  1000,
      ignore_watch: ['node_modules', 'logs', '*.log', '.git', 'admin-ui'],

      // ── Logging ──────────────────────────────────────────────────────────
      out_file:     path.join(LOGS, 'proxy.out.log'),
      error_file:   path.join(LOGS, 'proxy.err.log'),
      merge_logs:   false,
      // Rotate logs daily; keep 14 days.
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ── Environment (development) ─────────────────────────────────────────
      env: {
        FLEXGATE_PROXY_PORT:  '8080',
        FLEXGATE_ADMIN_PORT:  '9090',
        FLEXGATE_LITE:        'false',
        FLEXGATE_ENV:         'development',
        FLEXGATE_LOG_LEVEL:   'info',
        FLEXGATE_LOG_FORMAT:  'pretty',
      },

      // ── Environment (production) ──────────────────────────────────────────
      env_production: {
        FLEXGATE_PROXY_PORT:  '8080',
        FLEXGATE_ADMIN_PORT:  '9090',
        FLEXGATE_LITE:        'false',
        FLEXGATE_ENV:         'production',
        FLEXGATE_LOG_LEVEL:   'warn',
        FLEXGATE_LOG_FORMAT:  'json',
      },
    },

    // ── 2. Admin UI dev server (React / Vite) ───────────────────────────────
    // Only run this in development.  In production serve the build/ directory
    // via a static file server or the Go binary's embedded FS.
    {
      name:         'flexgate-admin-ui',
      script:       'npm',
      args:         'start',
      cwd:          ADMIN,

      exec_mode:    'fork',
      instances:    1,

      // The React dev server is long-lived; don't restart on clean exit.
      autorestart:  true,
      max_restarts: 5,
      min_uptime:   '10s',

      // Don't watch files — CRA/Vite has its own HMR watcher.
      watch:        false,

      // ── Logging ──────────────────────────────────────────────────────────
      out_file:     path.join(LOGS, 'admin-ui.out.log'),
      error_file:   path.join(LOGS, 'admin-ui.err.log'),
      merge_logs:   false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ── Environment ───────────────────────────────────────────────────────
      env: {
        PORT:                      '3000',
        BROWSER:                   'none',   // suppress auto-open (CLI handles it)
        REACT_APP_ADMIN_API_URL:   'http://localhost:9090',
        GENERATE_SOURCEMAP:        'false',
        // Suppress CRA's "Update available" notice in CI/pm2.
        CI:                        'false',
      },

      env_production: {
        // In production the UI is pre-built; skip this app entirely.
        // pm2 start ecosystem.config.js --env production --only flexgate-proxy
        PORT:                    '3000',
        NODE_ENV:                'production',
        REACT_APP_ADMIN_API_URL: 'http://localhost:9090',
      },
    },

    // ── 3. Benchmark runner (Node.js, one-shot) ──────────────────────────────
    //
    // Spawns k6 for each scenario sequentially, streams 1-second metric
    // snapshots to the Go admin API, which broadcasts them to connected
    // browser tabs via SSE so the /benchmarks dashboard updates in real time.
    //
    // This app is NOT started automatically when you run `pm2 start ecosystem`.
    // Start it explicitly:
    //
    //   pm2 start ecosystem.config.js --only benchmark-runner
    //
    // The process exits (code 0) when all scenarios complete.
    // PM2 will not restart it (autorestart: false).
    //
    // Logs are written to logs/benchmark.out.log and logs/benchmark.err.log.
    // Open the live dashboard:
    //   pm2 logs benchmark-runner --lines 200
    {
      name:         'benchmark-runner',
      script:       path.join(ROOT, 'benchmarks', 'pm2-run.js'),

      // All runtime config is passed via env vars (see env block below).
      // BENCHMARK_SCENARIO and PROFILE are read by pm2-run.js at startup.
      args:         '',

      // Limit Node.js heap to 512 MB — the runner processes k6 JSON output
      // in a streaming fashion (reservoir-sampled), so 512 MB is ample.
      node_args:    '--max-old-space-size=512',

      cwd:          ROOT,
      exec_mode:    'fork',
      instances:    1,

      // ── One-shot: do not restart after the run finishes ───────────────────
      autorestart:  false,
      watch:        false,

      // ── Logging ──────────────────────────────────────────────────────────
      out_file:          path.join(LOGS, 'benchmark.out.log'),
      error_file:        path.join(LOGS, 'benchmark.err.log'),
      merge_logs:        false,
      log_date_format:   'YYYY-MM-DD HH:mm:ss Z',

      // ── Environment (development) ─────────────────────────────────────────
      env: {
        // Where to push metrics so the SSE hub can broadcast them to the UI.
        // Matches the Go admin API default port.
        BENCHMARK_API_URL:  'http://localhost:8080',
        BENCHMARK_API_USER: 'admin',
        BENCHMARK_API_PASS: 'admin',

        // k6 load profile: 'ci' (fast, ~60 s/scenario) or 'full' (~10 min).
        // Override: BENCHMARK_PROFILE=full pm2 start ... --only benchmark-runner
        PROFILE: 'ci',

        // Run a single scenario instead of all five.
        // Override: BENCHMARK_SCENARIO=baseline pm2 start ...
        // Leave empty to run all scenarios.
        BENCHMARK_SCENARIO: '',

        // Path to k6 binary.  Resolved from PATH by default.
        K6_BIN: 'k6',
      },

      // ── Environment (production) ──────────────────────────────────────────
      env_production: {
        BENCHMARK_API_URL:  'http://localhost:8080',
        BENCHMARK_API_USER: 'admin',
        BENCHMARK_API_PASS: 'admin',
        PROFILE:            'full',
        BENCHMARK_SCENARIO: '',
        K6_BIN:             'k6',
      },
    },
  ],
};
