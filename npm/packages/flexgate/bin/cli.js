#!/usr/bin/env node
'use strict';
/**
 * bin/cli.js — DEPRECATED shim
 *
 * This file is kept for backwards compatibility only.
 * The canonical entry point is now bin/flexgate.js (commander-based).
 *
 * Any invocation of this file is forwarded to flexgate.js transparently.
 */
require('./flexgate.js');


const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const http    = require('http');

const log     = require('../lib/logger');
const proxy   = require('../lib/proxy');
const detect  = require('../lib/detect');
const browser = require('../lib/browser');

const PKG     = require('../package.json');
const PID_FILE = path.join(os.tmpdir(), 'flexgate.pid');

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--no-browser') { args.flags.noBrowser = true; continue; }
    if (arg === '--no-lite')    { args.flags.noLite    = true; continue; }

    const pair = (long, short) => arg === long || arg === short;

    if (pair('--port',       '-p')) { args.flags.proxyPort  = parseInt(argv[++i], 10); continue; }
    if (pair('--admin-port', '-a')) { args.flags.adminPort  = parseInt(argv[++i], 10); continue; }
    if (pair('--ui-port',    '-u')) { args.flags.uiPort     = parseInt(argv[++i], 10); continue; }
    if (pair('--config',     '-c')) { args.flags.config     = argv[++i];              continue; }

    if (!arg.startsWith('-')) {
      args.positional.push(arg);
    }
  }

  return args;
}

// ── PID file helpers ──────────────────────────────────────────────────────────

function writePid(pid) {
  try { fs.writeFileSync(PID_FILE, String(pid), 'utf8'); } catch { /* ignore */ }
}

function readPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10); } catch { return null; }
}

function clearPid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

// ── Health probe (raw http, no proxy.js) ─────────────────────────────────────

function quickProbe(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── Usage ─────────────────────────────────────────────────────────────────────

function printUsage() {
  const b = log.USE_COLOR ? '\x1b[1m' : '';
  const r = log.USE_COLOR ? '\x1b[0m' : '';

  process.stdout.write(`
${b}USAGE${r}
  flexgate <command> [options]

${b}COMMANDS${r}
  start   [options]   Start FlexGate in lite mode and open browser
  status              Show proxy and setup state (does not start anything)
  open    [options]   Open browser to the running instance
  stop                Stop the running proxy (SIGTERM via PID file)
  version             Print version
  help                Print this help

${b}OPTIONS (start / open)${r}
  -p, --port        <n>   Proxy port                 (default: 8080)
  -a, --admin-port  <n>   Admin API port             (default: 9090)
  -u, --ui-port     <n>   Admin UI dev server port   (default: 3000)
  -c, --config      <f>   Config file path
      --no-browser        Skip automatic browser open
      --no-lite           Disable lite mode (use full config)

${b}EXAMPLES${r}
  flexgate start
  flexgate start --port 8081 --admin-port 9091
  flexgate start --no-browser
  flexgate status
  flexgate open
  flexgate stop
`);
}

// ── Command: start ────────────────────────────────────────────────────────────

async function cmdStart(flags) {
  log.banner();

  const proxyPort = flags.proxyPort || parseInt(process.env.FLEXGATE_PROXY_PORT || '8080', 10);
  const adminPort = flags.adminPort || parseInt(process.env.FLEXGATE_ADMIN_PORT || '9090', 10);
  const uiPort    = flags.uiPort    || parseInt(process.env.FLEXGATE_UI_PORT    || '3000', 10);
  const liteMode  = !flags.noLite;
  const openUrl   = !flags.noBrowser;

  // ── Step 1: Start proxy ────────────────────────────────────────────────────
  log.step(1, 3, `Starting FlexGate${liteMode ? ' (lite mode)' : ''}…`);

  let handle;
  try {
    handle = await proxy.startAndWait({
      proxyPort,
      adminPort,
      lite:   liteMode,
      config: flags.config,
    });
  } catch (err) {
    log.error(`Failed to start FlexGate: ${err.message}`);
    process.exit(1);
  }

  writePid(handle.child.pid);

  log.success(`Proxy running on port ${handle.proxyPort}`);
  log.detail(`Admin API  → http://127.0.0.1:${handle.adminPort}`);
  log.detail(`Proxy      → http://127.0.0.1:${handle.proxyPort}`);
  log.br();

  // Forward signals so Ctrl-C cleanly stops the Go binary.
  const stopAll = (signal) => {
    log.br();
    log.info(`Caught ${signal} — shutting down…`);
    handle.stop();
    clearPid();
    process.exit(0);
  };
  process.once('SIGINT',  () => stopAll('SIGINT'));
  process.once('SIGTERM', () => stopAll('SIGTERM'));
  handle.child.once('exit', (code) => {
    clearPid();
    if (code !== 0 && code !== null) {
      log.error(`Proxy exited with code ${code}`);
      process.exit(code);
    }
    process.exit(0);
  });

  // ── Step 2: Detect setup state ─────────────────────────────────────────────
  log.step(2, 3, 'Detecting setup state…');
  const setupState = await detect.checkSetupStatus(adminPort);

  let uiPath;
  switch (setupState) {
    case 'complete':
      log.success('Setup already complete');
      uiPath = '/dashboard';
      break;
    case 'required':
      log.info('First-run setup required');
      uiPath = '/setup';
      break;
    case 'unknown':
      log.warn('Setup status unknown — opening setup wizard to be safe');
      uiPath = '/setup';
      break;
    default: // 'error'
      log.warn('Could not determine setup state — opening setup wizard');
      uiPath = '/setup';
      break;
  }

  // ── Step 3: Open browser ───────────────────────────────────────────────────
  if (openUrl) {
    log.step(3, 3, `Opening browser${uiPath === '/setup' ? ' → setup wizard' : ' → dashboard'}…`);

    // Admin UI runs on a separate dev-server port (or static files served by proxy).
    // In production the proxy itself serves the UI — use proxyPort.
    // In dev the CRA dev server runs on uiPort.
    // Heuristic: if uiPort is reachable, prefer it; otherwise fall back to proxyPort.
    const uiBaseUrl = await resolveUiBase(uiPort, proxyPort);
    const url = `${uiBaseUrl}${uiPath}`;

    await browser.openBrowser(url);
    log.url(`${url}`);
  } else {
    log.step(3, 3, 'Browser open skipped (--no-browser)');
    const uiBaseUrl = `http://localhost:${uiPort}`;
    log.url(`Open manually → ${uiBaseUrl}${uiPath}`);
  }

  log.br();
  log.info('FlexGate is running. Press Ctrl+C to stop.');
}

// ── Command: status ───────────────────────────────────────────────────────────

async function cmdStatus(flags) {
  const adminPort = flags.adminPort || parseInt(process.env.FLEXGATE_ADMIN_PORT || '9090', 10);
  const proxyPort = flags.proxyPort || parseInt(process.env.FLEXGATE_PROXY_PORT || '8080', 10);

  const pid = readPid();
  const pidRunning = pid && isProcessRunning(pid);

  log.info(`PID file:   ${pid ? pid : 'none'}${pid && !pidRunning ? ' (stale)' : ''}`);

  const adminUp = await quickProbe(adminPort);
  const proxyUp = await quickProbe(proxyPort);

  log.info(`Admin API:  ${adminUp ? '✓ up' : '✗ down'} (port ${adminPort})`);
  log.info(`Proxy:      ${proxyUp ? '✓ up' : '✗ down'} (port ${proxyPort})`);

  if (adminUp) {
    const state = await detect.checkSetupStatus(adminPort);
    log.info(`Setup:      ${state}`);
  } else {
    log.info('Setup:      (proxy not reachable)');
  }
}

// ── Command: open ─────────────────────────────────────────────────────────────

async function cmdOpen(flags) {
  const adminPort = flags.adminPort || parseInt(process.env.FLEXGATE_ADMIN_PORT || '9090', 10);
  const proxyPort = flags.proxyPort || parseInt(process.env.FLEXGATE_PROXY_PORT || '8080', 10);
  const uiPort    = flags.uiPort    || parseInt(process.env.FLEXGATE_UI_PORT    || '3000', 10);

  const adminUp = await quickProbe(adminPort);
  if (!adminUp) {
    log.error('FlexGate does not appear to be running (admin API unreachable).');
    log.detail('Run `flexgate start` first.');
    process.exit(1);
  }

  const state = await detect.checkSetupStatus(adminPort);
  const uiPath = state === 'complete' ? '/dashboard' : '/setup';

  const uiBaseUrl = await resolveUiBase(uiPort, proxyPort);
  const url = `${uiBaseUrl}${uiPath}`;

  log.info(`Opening ${url}`);
  await browser.openBrowser(url);
}

// ── Command: stop ─────────────────────────────────────────────────────────────

async function cmdStop() {
  const pid = readPid();
  if (!pid) {
    log.warn('No PID file found. Is FlexGate running?');
    process.exit(1);
  }

  if (!isProcessRunning(pid)) {
    log.warn(`PID ${pid} is not running (stale PID file removed).`);
    clearPid();
    process.exit(1);
  }

  try {
    process.kill(pid, 'SIGTERM');
    log.success(`Sent SIGTERM to PID ${pid}`);
    clearPid();
  } catch (err) {
    log.error(`Failed to stop PID ${pid}: ${err.message}`);
    process.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Prefer the UI dev server on uiPort; if unreachable (production), use proxyPort.
 */
async function resolveUiBase(uiPort, proxyPort) {
  const uiUp = await quickProbe(uiPort).catch(() => false);
  const base = uiUp ? uiPort : proxyPort;
  return `http://localhost:${base}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs[0] === 'help' || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    printUsage();
    return;
  }

  if (rawArgs[0] === 'version' || rawArgs[0] === '--version' || rawArgs[0] === '-v') {
    process.stdout.write(`flexgate/${PKG.version} node/${process.version} ${process.platform}/${process.arch}\n`);
    return;
  }

  const { flags, positional } = parseArgs(rawArgs.slice(1));
  const command = rawArgs[0];

  switch (command) {
    case 'start':
      await cmdStart(flags);
      break;

    case 'status':
      await cmdStatus(flags);
      break;

    case 'open':
      await cmdOpen(flags);
      break;

    case 'stop':
      await cmdStop();
      break;

    default:
      log.error(`Unknown command: ${command}`);
      log.detail('Run `flexgate help` for usage.');
      process.exit(1);
  }
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
