'use strict';
/**
 * commands/status.js
 *
 * `flexgate status` — show the live state of a running FlexGate instance.
 *
 * Output (human-readable)
 * ───────────────────────
 *   Proxy:    running
 *   Version:  dev
 *   Mode:     lite
 *   Routes:   3
 *   Uptime:   2m 14s
 *
 * Output (--json)
 * ───────────────
 *   {
 *     "proxy": "running",
 *     "version": "dev",
 *     "mode": "lite",
 *     "routes": 3,
 *     "uptime": "2m 14s",
 *     "uptime_secs": 134,
 *     "admin_url": "http://127.0.0.1:9090",
 *     "proxy_url": "http://127.0.0.1:8080"
 *   }
 *
 * APIs used
 * ─────────
 *   GET /health           Simple liveness check  { status:"ok" }
 *   GET /api/health       Version + component health
 *   GET /api/routes       Route count
 *   GET /api/settings     proxy_adapter_type → Mode
 *
 * Exit codes
 * ──────────
 *   0  Proxy is running (admin API answered)
 *   1  Proxy is not reachable
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');

const log         = require('../lib/logger');
const { defaultClient, resetDefaultClient } = require('../lib/api-client');

const PID_FILE     = path.join(os.tmpdir(), 'flexgate.pid');
const PID_FILE_DEV = path.join(os.tmpdir(), 'flexgate-dev.pid');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Read an integer PID from a file, returns null on any error. */
function readPid(file) {
  try { return parseInt(fs.readFileSync(file, 'utf8'), 10); } catch { return null; }
}

/** Return true if the process is alive (signal 0). */
function isProcessRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Probe GET /health on the given port.
 * Returns true when the server responds 2xx within 2 s.
 */
function probeHealth(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/health', timeout: 2000 },
      (res) => {
        // drain so the socket closes cleanly
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Derive uptime from the mtime of the PID file (written when the process was
 * started by `flexgate start`).  Returns null when the file does not exist or
 * when no alive PID is found in either PID file.
 *
 * @param {number} [pid]
 * @returns {{ secs: number, pretty: string } | null}
 */
function deriveUptime(pid) {
  // Try to stat whichever PID file is alive.
  for (const file of [PID_FILE, PID_FILE_DEV]) {
    try {
      const stat = fs.statSync(file);
      const secs = Math.floor((Date.now() - stat.mtimeMs) / 1000);
      if (secs < 0) continue;
      return { secs, pretty: formatUptime(secs) };
    } catch { /* no file */ }
  }
  return null;
}

/**
 * Format a duration in seconds to a human string.
 * e.g.  134 → "2m 14s"   3602 → "1h 0m"   45 → "45s"
 *
 * @param {number} secs
 * @returns {string}
 */
function formatUptime(secs) {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Column-aligned key/value row using the logger.
 * Label is left-padded to 10 chars so values line up.
 *
 * @param {string} label
 * @param {string} value
 */
function row(label, value) {
  const pad = ' '.repeat(Math.max(0, 10 - label.length));
  process.stdout.write(`  ${label}${pad}  ${value}\n`);
}

// ── Main action ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number}  [opts.adminPort]
 * @param {number}  [opts.port]
 * @param {boolean} [opts.json]
 */
async function action(opts = {}) {
  const adminPort = parseInt(opts.adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const proxyPort = parseInt(opts.port      ?? process.env.FLEXGATE_PROXY_PORT ?? '8080', 10);
  const host      = opts.adminHost ?? process.env.FLEXGATE_ADMIN_HOST ?? '127.0.0.1';

  const clientOpts = { adminPort, adminHost: host };

  // Re-seed the singleton so every fetch below uses the right port/host.
  resetDefaultClient();

  // ── 1. Liveness (fast path) ───────────────────────────────────────────────
  const proxyRunning = await probeHealth(host, adminPort);

  // ── 2. Detailed health (version + components) ─────────────────────────────
  let version = 'unknown';
  if (proxyRunning) {
    const healthRes = await defaultClient().get('/api/health', clientOpts);
    if (healthRes.ok && healthRes.data?.version) {
      version = healthRes.data.version;
    }
  }

  // ── 3. Route count ────────────────────────────────────────────────────────
  let routeCount = null;   // null = unknown (not an error worth surfacing)
  if (proxyRunning) {
    const routesRes = await defaultClient().get('/api/routes', clientOpts);
    if (routesRes.ok) {
      const routes = routesRes.data?.routes ?? routesRes.data;
      routeCount = Array.isArray(routes) ? routes.length : (routesRes.data?.total ?? 0);
    }
  }

  // ── 4. Mode (proxy_adapter_type from settings, default "lite") ────────────
  let mode = 'lite';
  if (proxyRunning) {
    const settingsRes = await defaultClient().get('/api/settings', clientOpts);
    if (settingsRes.ok && settingsRes.data?.proxy_adapter_type) {
      mode = settingsRes.data.proxy_adapter_type;
    }
  }

  // ── 5. Uptime ─────────────────────────────────────────────────────────────
  const pid    = readPid(PID_FILE);
  const devPid = readPid(PID_FILE_DEV);
  const alivePid = isProcessRunning(pid) ? pid
                 : isProcessRunning(devPid) ? devPid
                 : null;

  const uptimeInfo = proxyRunning ? deriveUptime(alivePid) : null;
  const uptimePretty = uptimeInfo ? uptimeInfo.pretty : (proxyRunning ? 'unknown' : '—');

  // ── Output ────────────────────────────────────────────────────────────────
  const statusWord = proxyRunning ? 'running' : 'stopped';

  if (opts.json) {
    const out = {
      proxy:       statusWord,
      version,
      mode,
      routes:      routeCount,
      uptime:      uptimePretty,
      uptime_secs: uptimeInfo?.secs ?? null,
      admin_url:   `http://${host}:${adminPort}`,
      proxy_url:   `http://${host}:${proxyPort}`,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    process.stdout.write('\n');
    row('Proxy',   proxyRunning ? `\x1b[32mrunning\x1b[0m` : `\x1b[31mstopped\x1b[0m`);
    row('Version', version);
    row('Mode',    mode);
    row('Routes',  routeCount !== null ? String(routeCount) : '—');
    row('Uptime',  uptimePretty);
    process.stdout.write('\n');
  }

  if (!proxyRunning) process.exit(1);
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Attach `flexgate status` to a commander Program.
 * @param {import('commander').Command} program
 */
function register(program) {
  program
    .command('status')
    .description('Show live proxy status — proxy state, mode, route count, uptime')
    .option('-p, --port <n>',        'Proxy port (default: 8080)',       '8080')
    .option('-a, --admin-port <n>',  'Admin API port (default: 9090)',   '9090')
    .option('--json',                'Output as JSON (machine-readable)')
    .action((opts) => {
      opts.port      = parseInt(opts.port,      10);
      opts.adminPort = parseInt(opts.adminPort, 10);
      action(opts).catch((err) => {
        log.error(`status: ${err.message}`);
        if (process.env.DEBUG) console.error(err);
        process.exit(1);
      });
    });
}

module.exports = { action, register };
