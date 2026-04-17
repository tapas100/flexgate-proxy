'use strict';
/**
 * commands/start.js
 *
 * `flexgate start` — start the FlexGate backend and open the browser.
 *
 * Execution sequence
 * ──────────────────
 *   0. Pre-flight: is the backend already running?
 *      → If yes, skip spawn and jump straight to browser open.
 *   1. Announce startup  →  🚀 FlexGate starting...
 *   2. Spawn Go binary (or npm fallback) — does NOT block the CLI event loop.
 *   3. Poll /health until ready (max 30 s).
 *   4. Detect setup state  →  GET /api/setup/status
 *   5. Open browser  →  /setup (first run) | /dashboard (returning user)
 *   6. Print summary block and idle — process stays alive as a supervisor.
 *      Ctrl-C / SIGTERM forwards SIGTERM to the child and exits cleanly.
 *
 * Output (exact format required by spec)
 * ───────────────────────────────────────
 *   🚀 FlexGate starting...
 *   Running in Lite Mode
 *   API: http://localhost:9090
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const http    = require('http');

const log     = require('../lib/logger');
const proxy   = require('../lib/proxy');
const detect  = require('../lib/detect');
const browser = require('../lib/browser');

const PID_FILE = path.join(os.tmpdir(), 'flexgate.pid');

// ── PID helpers ───────────────────────────────────────────────────────────────

function writePid(pid) {
  try { fs.writeFileSync(PID_FILE, String(pid), 'utf8'); } catch { /* ignore */ }
}

function readPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10); } catch { return null; }
}

function clearPid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function isProcessRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ── Health probe ──────────────────────────────────────────────────────────────

/** Single non-blocking probe — resolves true/false quickly. */
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

/** Resolve the best URL base for the UI (dev server preferred over proxy). */
async function resolveUiBase(uiPort, proxyPort) {
  const uiUp = await quickProbe(uiPort).catch(() => false);
  return `http://localhost:${uiUp ? uiPort : proxyPort}`;
}

// ── Signal / lifecycle wiring ─────────────────────────────────────────────────

/**
 * Wire SIGINT + SIGTERM so Ctrl-C cleanly stops the Go child and removes
 * the PID file before we exit.  Also watch the child's exit event so a
 * crash surfaces a clear message.
 *
 * @param {{ child: import('child_process').ChildProcess, stop: () => void }} handle
 */
function wireSignals(handle) {
  const stopAll = (sig) => {
    log.br();
    log.info(`Caught ${sig} — shutting down FlexGate…`);
    handle.stop();
    clearPid();
    process.exit(0);
  };

  process.once('SIGINT',  () => stopAll('SIGINT'));
  process.once('SIGTERM', () => stopAll('SIGTERM'));

  handle.child.once('exit', (code, signal) => {
    clearPid();
    if (signal) {
      // Killed by an external signal — normal in tests / Docker stop.
      log.info(`FlexGate process received ${signal}`);
      process.exit(0);
    }
    if (code !== 0 && code !== null) {
      log.error(`FlexGate exited unexpectedly (code ${code})`);
      log.detail('Run with DEBUG=1 to see full output.');
      process.exit(code);
    }
    process.exit(0);
  });
}

// ── Core action ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts  Values parsed by commander
 * @param {number}  opts.port        Proxy port
 * @param {number}  opts.adminPort   Admin API port
 * @param {number}  opts.uiPort      Admin UI dev-server port
 * @param {string}  [opts.config]    Config file path
 * @param {boolean} opts.ui          true = open browser (--no-ui → false)
 * @param {boolean} [opts.browser]   legacy alias for opts.ui (--no-browser)
 * @param {boolean} opts.lite        true = lite mode (--no-lite → false)
 */
async function action(opts) {
  const proxyPort = opts.port      ?? parseInt(process.env.FLEXGATE_PROXY_PORT ?? '8080', 10);
  const adminPort = opts.adminPort ?? parseInt(process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const uiPort    = opts.uiPort    ?? parseInt(process.env.FLEXGATE_UI_PORT    ?? '3000', 10);
  const liteMode  = opts.lite    !== false;
  // --no-ui (primary) or legacy --no-browser both suppress the browser open.
  // FLEXGATE_NO_UI=1 env var is also checked inside openBrowser() itself.
  const openUrl   = opts.ui !== false && opts.browser !== false;

  // ── 0. Pre-flight: already running? ───────────────────────────────────────
  const existingPid     = readPid();
  const existingRunning = isProcessRunning(existingPid);
  const adminAlreadyUp  = await quickProbe(adminPort);

  if (adminAlreadyUp && existingRunning) {
    log.warn(`FlexGate is already running (PID ${existingPid}, admin port ${adminPort}).`);
    log.detail('Use `flexgate stop` to stop it, or `flexgate status` to inspect.');

    if (openUrl) {
      const detection = await detect.detectSetupState(adminPort).catch(() => ({
        uiPath: '/setup',
      }));
      const uiPath  = detection.uiPath;
      const base    = await resolveUiBase(uiPort, proxyPort);
      const url     = `${base}${uiPath}`;
      log.br();
      log.info(`Opening existing instance → ${url}`);
      await browser.openBrowser(url);
    }
    return; // do not start a second process
  }

  // Clean up stale PID file if the process is no longer alive.
  if (existingPid && !existingRunning) clearPid();

  // ── 1. Announce ────────────────────────────────────────────────────────────
  log.banner();
  process.stdout.write('🚀 FlexGate starting...\n');
  process.stdout.write(`Running in ${liteMode ? 'Lite Mode' : 'Full Mode'}\n`);
  process.stdout.write(`API: http://localhost:${adminPort}\n`);
  log.br();

  // ── 2 + 3. Spawn & wait for health ────────────────────────────────────────
  // proxy.startAndWait() is non-blocking from the CLI's perspective:
  // it spawns the child (which runs independently as a separate process),
  // then polls /health via Node's async I/O — the CLI never blocks
  // synchronously during this step.
  let handle;
  try {
    handle = await proxy.startAndWait({
      proxyPort,
      adminPort,
      lite:   liteMode,
      config: opts.config,
    });
  } catch (err) {
    log.error(`Failed to start FlexGate: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }

  writePid(handle.child.pid);
  wireSignals(handle);

  if (process.env.DEBUG) {
    log.detail(`binary: ${handle.binaryPath}  (${handle.mode})`);
  }

  // ── 4. Detect setup state ──────────────────────────────────────────────────
  // detectSetupState() calls GET /api/setup/status and returns a full result:
  //   { state, uiPath, shouldSetup, message }
  //
  // Decision:
  //   isSetupComplete === false  → state='required' → uiPath='/setup'
  //   isSetupComplete === true   → state='complete' → uiPath='/dashboard'
  //   404 / network error        → state='required' or 'error' → uiPath='/setup'
  const detection = await detect.detectSetupState(adminPort).catch(() => ({
    state:       'error',
    uiPath:      '/setup',
    shouldSetup: true,
    message:     'Could not reach setup API — opening wizard to be safe',
  }));

  // Log the human-readable state message.
  if (detection.state === 'complete') {
    log.success(detection.message);
  } else {
    log.info(detection.message);
  }

  const uiPath = detection.uiPath;  // '/setup' or '/dashboard'

  // ── 5. Open browser ────────────────────────────────────────────────────────
  const base = await resolveUiBase(uiPort, proxyPort);
  const url  = `${base}${uiPath}`;

  if (openUrl) {
    await browser.openBrowser(url);
  }

  // ── 6. Summary block ───────────────────────────────────────────────────────
  log.br();
  log.info(`Admin UI   →  ${url}${openUrl ? '' : '  (open manually)'}`);
  log.detail(`Proxy      →  http://localhost:${handle.proxyPort}`);
  log.detail(`Admin API  →  http://localhost:${handle.adminPort}`);
  log.detail(`PID        →  ${handle.child.pid}`);
  log.br();
  log.info('FlexGate is running.  Press Ctrl+C to stop.');
}

// ── Commander registration ────────────────────────────────────────────────────

/**
 * Attach `flexgate start` to a commander Program.
 * @param {import('commander').Command} program
 */
function register(program) {
  program
    .command('start')
    .description('Start FlexGate backend (lite mode by default) and open the browser')
    .option('-p, --port <n>',        'Proxy listening port',          '8080')
    .option('-a, --admin-port <n>',  'Admin API port',                '9090')
    .option('-u, --ui-port <n>',     'Admin UI dev-server port',      '3000')
    .option('-c, --config <file>',   'Path to flexgate config file')
    .option('--no-ui',               'Skip automatic browser open')
    .option('--no-browser',          false)   // hidden legacy alias for --no-ui
    .option('--no-lite',             'Disable lite mode (requires full config + DB/Redis)')
    .action((opts) => {
      // Commander passes string defaults for <n> options; coerce to integers.
      opts.port      = parseInt(opts.port,      10);
      opts.adminPort = parseInt(opts.adminPort, 10);
      opts.uiPort    = parseInt(opts.uiPort,    10);
      action(opts).catch((err) => {
        log.error(`start: ${err.message}`);
        if (process.env.DEBUG) console.error(err);
        process.exit(1);
      });
    });
}

module.exports = { action, register };
