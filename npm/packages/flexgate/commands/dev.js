'use strict';
/**
 * commands/dev.js
 *
 * `flexgate dev` — best developer experience for working on FlexGate.
 *
 * What it does differently from `flexgate start`
 * ───────────────────────────────────────────────
 *   • Always lite mode (no DB / Redis / HAProxy required).
 *   • Sets FLEXGATE_ENV=development + FLEXGATE_LOG_LEVEL=debug on child.
 *   • Pipes proxy stdout/stderr through log.pipe() so every proxy log line
 *     is visible in the same terminal (respects FLEXGATE_VERBOSE / DEBUG).
 *   • Compact devBanner instead of the full ASCII banner.
 *   • Auto-opens the browser to /setup or /dashboard (suppressible with --no-ui).
 *   • --watch  restarted the proxy whenever config files change on disk.
 *   • --inspect passes a debug port to the Go binary for remote debugging.
 *   • SIGUSR2 restart (nodemon / pm2 compatibility).
 *   • Prints a "cheat-sheet" of useful tips at the end.
 *
 * Environment variables read
 * ──────────────────────────
 *   FLEXGATE_VERBOSE=1   Stream all proxy log lines to the terminal.
 *   DEBUG=1              Same as FLEXGATE_VERBOSE=1.
 *   FLEXGATE_NO_UI=1     Skip browser auto-open (same as --no-ui).
 *   FLEXGATE_PROXY_PORT  Override proxy port.
 *   FLEXGATE_ADMIN_PORT  Override admin port.
 *   FLEXGATE_UI_PORT     Override UI dev-server port.
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const http    = require('http');

const log     = require('../lib/logger');
const proxy   = require('../lib/proxy');
const detect  = require('../lib/detect');
const browser = require('../lib/browser');

const PID_FILE = path.join(os.tmpdir(), 'flexgate-dev.pid');

// ── PID helpers ───────────────────────────────────────────────────────────────

function writePid(pid) {
  try { fs.writeFileSync(PID_FILE, String(pid), 'utf8'); } catch { /* ignore */ }
}

function clearPid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function readPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10); } catch { return null; }
}

function isProcessRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ── Health probe ──────────────────────────────────────────────────────────────

function quickProbe(port) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/health`,
      { timeout: 1500 },
      (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300); },
    );
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function resolveUiBase(uiPort, proxyPort) {
  const uiUp = await quickProbe(uiPort).catch(() => false);
  return `http://localhost:${uiUp ? uiPort : proxyPort}`;
}

// ── Config file watcher ───────────────────────────────────────────────────────

const DEFAULT_WATCH_PATHS = [
  'config/flexgate.json',
  'config/flexgate.development.json',
  'config/proxy.yml',
  'flexgate.json',
  'flexgate.yaml',
  'flexgate.yml',
];

/**
 * Watch config files and call `onChange` when any of them are modified.
 * Returns a cleanup function.
 *
 * @param {string[]} paths      Paths to watch (relative to cwd or absolute)
 * @param {Function} onChange   Called with (changedPath) on modification
 * @returns {() => void}        Cleanup — call to stop watching
 */
function watchConfigs(paths, onChange) {
  const watchers = [];
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) continue;
    try {
      const w = fs.watch(abs, { persistent: false }, (event) => {
        if (event === 'change') onChange(abs);
      });
      watchers.push(w);
      log.verbose(`Watching ${abs}`);
    } catch { /* file may have disappeared — ignore */ }
  }
  return () => watchers.forEach(w => { try { w.close(); } catch { /* ignore */ } });
}

// ── Dev proxy lifecycle ───────────────────────────────────────────────────────

/**
 * Start the dev proxy and set up all signal handling.
 * Returns the proxy handle.
 *
 * @param {object} opts  Resolved option values (ports, config, …)
 * @returns {Promise<object>} proxy handle
 */
async function startDevProxy(opts) {
  const verbose = log.IS_VERBOSE;

  log.step(1, 3, 'Starting FlexGate proxy (development / lite mode)…');

  const handle = await proxy.startAndWait({
    proxyPort: opts.proxyPort,
    adminPort: opts.adminPort,
    lite:      true,
    config:    opts.config,
    // 'pipe' stdio so we can stream lines through log.pipe() in verbose mode.
    // In non-verbose mode use 'inherit' (proxy logs go straight to terminal).
    pipe:    verbose,
    quiet:  !verbose && opts.quiet,
    env: {
      FLEXGATE_ENV:       'development',
      FLEXGATE_LOG_LEVEL: verbose ? 'debug' : 'info',
      ...(opts.inspectPort ? { FLEXGATE_DEBUG_PORT: String(opts.inspectPort) } : {}),
    },
  });

  writePid(handle.child.pid);

  // Stream proxy I/O through verbose log lines when --verbose / DEBUG=1.
  if (verbose) {
    log.pipe(handle.child.stdout, 'stdout');
    log.pipe(handle.child.stderr, 'stderr');
  }

  return handle;
}

// ── Cheat-sheet ───────────────────────────────────────────────────────────────

function printCheatSheet(opts, uiUrl) {
  const d = (msg) => log.detail(msg);
  log.br();
  d(`UI       →  ${uiUrl}`);
  d(`Proxy    →  http://localhost:${opts.proxyPort}`);
  d(`Admin    →  http://localhost:${opts.adminPort}`);
  d(`PID      →  ${opts.pid}`);
  log.br();
  d('Ctrl+C        stop the dev proxy');
  if (opts.watch) d('(watching config files for changes — proxy restarts automatically)');
  d('FLEXGATE_VERBOSE=1   stream all proxy logs to this terminal');
  d('flexgate status      check running state from another terminal');
  log.br();
}

// ── Core action ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number}  opts.port         Proxy port
 * @param {number}  opts.adminPort    Admin API port
 * @param {number}  opts.uiPort       Admin UI dev-server port
 * @param {string}  [opts.config]     Config file path
 * @param {boolean} opts.ui           true = open browser (--no-ui → false)
 * @param {boolean} [opts.browser]    legacy alias for opts.ui
 * @param {boolean} [opts.watch]      Watch config files and restart on change
 * @param {number}  [opts.inspectPort] Debug port forwarded to Go binary
 */
async function action(opts) {
  const proxyPort   = opts.port        ?? parseInt(process.env.FLEXGATE_PROXY_PORT ?? '8080', 10);
  const adminPort   = opts.adminPort   ?? parseInt(process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const uiPort      = opts.uiPort      ?? parseInt(process.env.FLEXGATE_UI_PORT    ?? '3000', 10);
  const openUrl     = opts.ui !== false && opts.browser !== false;
  const doWatch     = !!opts.watch;
  const inspectPort = opts.inspectPort ?? null;

  // ── Pre-flight: already running? ──────────────────────────────────────────
  const existingPid = readPid();
  if (isProcessRunning(existingPid)) {
    log.warn(`Dev proxy already running (PID ${existingPid}).`);
    log.detail('Run `flexgate stop --dev` to stop it first.');
    process.exit(1);
  }
  if (existingPid) clearPid(); // stale PID file

  // ── Banner ────────────────────────────────────────────────────────────────
  log.devBanner(proxyPort, adminPort, uiPort);

  // Print hints about the Admin UI dev server.
  log.info('Admin UI dev server:');
  log.detail(`  cd admin-ui && npm start       (serves on port ${uiPort})`);
  log.br();

  if (inspectPort) {
    log.info(`Debug port: ${inspectPort}  (FLEXGATE_DEBUG_PORT=${inspectPort})`);
    log.br();
  }

  // ── Steps 1: Start proxy ───────────────────────────────────────────────────
  const resolvedOpts = { proxyPort, adminPort, uiPort, config: opts.config, inspectPort };
  let handle;
  try {
    handle = await startDevProxy(resolvedOpts);
  } catch (err) {
    log.error(`Failed to start dev proxy: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }

  log.success(`Proxy  →  http://127.0.0.1:${handle.proxyPort}`);
  log.success(`Admin  →  http://127.0.0.1:${handle.adminPort}`);
  log.br();

  // ── Signal wiring ─────────────────────────────────────────────────────────
  let stopWatcher = () => {};

  const stopAll = (sig) => {
    log.br();
    log.info(`Caught ${sig} — stopping dev proxy…`);
    stopWatcher();
    handle.stop();
    clearPid();
    process.exit(0);
  };

  process.once('SIGINT',  () => stopAll('SIGINT'));
  process.once('SIGTERM', () => stopAll('SIGTERM'));

  // SIGUSR2: nodemon / pm2 sends this to trigger a restart.
  process.once('SIGUSR2', () => {
    log.info('Caught SIGUSR2 — restarting dev proxy…');
    stopWatcher();
    handle.stop();
    clearPid();
    // Re-raise so the parent process manager can observe it.
    process.kill(process.pid, 'SIGUSR2');
  });

  handle.child.once('exit', (code, signal) => {
    stopWatcher();
    clearPid();
    if (!signal && code !== 0 && code !== null) {
      log.error(`Dev proxy crashed (exit code ${code})`);
      log.detail('Re-run with FLEXGATE_VERBOSE=1 to see full output.');
      process.exit(code);
    }
    process.exit(0);
  });

  // ── Step 2: Detect setup state ─────────────────────────────────────────────
  log.step(2, 3, 'Detecting setup state…');
  const detection = await detect.detectSetupState(adminPort).catch(() => ({
    state:       'error',
    uiPath:      '/setup',
    shouldSetup: true,
    message:     'Could not reach setup API — opening wizard to be safe',
  }));

  if (detection.state === 'complete') {
    log.success(detection.message);
  } else {
    log.info(detection.message);
  }

  // ── Step 3: Open browser ───────────────────────────────────────────────────
  const base   = await resolveUiBase(uiPort, proxyPort);
  const uiUrl  = `${base}${detection.uiPath}`;

  if (openUrl) {
    log.step(3, 3, `Opening browser → ${detection.uiPath}`);
    await browser.openBrowser(uiUrl);
  } else {
    log.step(3, 3, 'Browser open skipped (--no-ui)');
  }

  // ── Config file watcher ────────────────────────────────────────────────────
  if (doWatch) {
    const watchPaths = opts.config ? [opts.config, ...DEFAULT_WATCH_PATHS] : DEFAULT_WATCH_PATHS;
    let restarting = false;

    stopWatcher = watchConfigs(watchPaths, async (changedPath) => {
      if (restarting) return;
      restarting = true;

      log.br();
      log.event('reload', `Config changed: ${path.relative(process.cwd(), changedPath)}`);
      log.info('Restarting dev proxy…');

      handle.stop();
      clearPid();

      // Brief pause so the OS flushes file-write buffers.
      await new Promise(r => setTimeout(r, 400));

      try {
        handle = await startDevProxy(resolvedOpts);
        writePid(handle.child.pid);
        log.success(`Proxy restarted  →  PID ${handle.child.pid}`);

        // Re-wire the exit handler on the new child.
        handle.child.once('exit', (code, signal) => {
          stopWatcher();
          clearPid();
          if (!signal && code !== 0 && code !== null) {
            log.error(`Dev proxy crashed after reload (code ${code})`);
            process.exit(code);
          }
        });
      } catch (err) {
        log.error(`Restart failed: ${err.message}`);
      }

      restarting = false;
    });

    log.info(`Watching config files for changes  (${DEFAULT_WATCH_PATHS.length} paths)`);
  }

  // ── Cheat-sheet ────────────────────────────────────────────────────────────
  printCheatSheet({
    proxyPort,
    adminPort,
    pid:   handle.child.pid,
    watch: doWatch,
  }, uiUrl);

  log.info('Dev proxy running.  Press Ctrl+C to stop.');
  if (log.IS_VERBOSE) {
    log.verbose('Verbose mode ON — all proxy log lines will appear below');
    log.br();
  } else {
    log.detail('Tip: FLEXGATE_VERBOSE=1 flexgate dev  to stream proxy logs here');
  }
}

// ── Commander registration ────────────────────────────────────────────────────

/**
 * Attach `flexgate dev` to a commander Program.
 * @param {import('commander').Command} program
 */
function register(program) {
  program
    .command('dev')
    .description('Start FlexGate in development mode (lite, verbose logs, auto-open)')
    .option('-p, --port <n>',          'Proxy port',                    '8080')
    .option('-a, --admin-port <n>',    'Admin API port',                '9090')
    .option('-u, --ui-port <n>',       'Admin UI dev-server port',      '3000')
    .option('-c, --config <file>',     'Config file path')
    .option('--no-ui',                 'Skip automatic browser open')
    .option('--no-browser',            false)           // hidden legacy alias
    .option('-w, --watch',             'Restart proxy when config files change')
    .option('--inspect [port]',        'Enable debug port on Go binary', '2345')
    .action((opts) => {
      opts.port      = parseInt(opts.port,      10);
      opts.adminPort = parseInt(opts.adminPort, 10);
      opts.uiPort    = parseInt(opts.uiPort,    10);

      // --inspect with no value sets opts.inspect to true (commander default value)
      if (opts.inspect === true || opts.inspect === '2345') {
        opts.inspectPort = 2345;
      } else if (opts.inspect && opts.inspect !== false) {
        opts.inspectPort = parseInt(opts.inspect, 10);
      } else {
        opts.inspectPort = null;
      }

      action(opts).catch((err) => {
        log.error(`dev: ${err.message}`);
        if (process.env.DEBUG) console.error(err);
        process.exit(1);
      });
    });
}

module.exports = { action, register };
