'use strict';
/**
 * proxy.js
 *
 * Responsible for:
 *   1. Finding the @flexgate/proxy Go binary via the same resolution
 *      logic as @flexgate/proxy's run.js (but without spawning).
 *   2. Spawning the binary in "lite mode" (no DB, no Redis required).
 *   3. Polling the /health endpoint until the server is ready.
 *   4. Returning a handle that callers can use to stop the process.
 *
 * "Lite mode" means:
 *   - Only the proxy + admin API ports are opened.
 *   - DB / Redis connections are skipped (Go binary reads env vars).
 *   - HAProxy dependency is not required.
 *
 * The binary is started with:
 *   FLEXGATE_LITE=true flexgate-proxy [--config <file>]
 *
 * Environment variables honoured:
 *   FLEXGATE_BINARY      — absolute path override for the Go binary
 *   FLEXGATE_ADMIN_PORT  — admin API port  (default: 9090)
 *   FLEXGATE_PROXY_PORT  — proxy port      (default: 8080)
 *   FLEXGATE_UI_PORT     — admin UI port   (default: 3000)
 *   FLEXGATE_CONFIG      — path to flexgate.yaml / flexgate.json
 */

const cp   = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');

const log = require('./logger');

// ── Constants ─────────────────────────────────────────────────────────────────

const IS_WINDOWS   = process.platform === 'win32';
const EXE_NAME     = IS_WINDOWS ? 'flexgate-proxy.exe' : 'flexgate-proxy';
const HEALTH_PATH  = '/health';
const POLL_INTERVAL_MS  = 300;
const POLL_TIMEOUT_MS   = 30_000;  // 30 s — enough even on slow CI

const PLATFORM_PKGS = {
  'linux-x64':    '@flexgate/proxy-linux-x64',
  'linux-arm64':  '@flexgate/proxy-linux-arm64',
  'darwin-x64':   '@flexgate/proxy-darwin-x64',
  'darwin-arm64': '@flexgate/proxy-darwin-arm64',
  'win32-x64':    '@flexgate/proxy-win32-x64',
};

// ── Binary resolution ─────────────────────────────────────────────────────────

function resolvePackageDir(pkgName) {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'node_modules', pkgName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findBinary() {
  // 1. Explicit env override.
  if (process.env.FLEXGATE_BINARY) {
    const p = process.env.FLEXGATE_BINARY;
    if (fs.existsSync(p)) return p;
    log.warn(`FLEXGATE_BINARY="${p}" not found, falling back.`);
  }

  // 2. Binary shipped inside the @flexgate/proxy package (run.js sibling).
  const proxyPkgDir = resolvePackageDir('@flexgate/proxy');
  if (proxyPkgDir) {
    const local = path.join(proxyPkgDir, 'bin', EXE_NAME);
    if (fs.existsSync(local)) return local;
  }

  // 3. Optional platform package.
  const key = `${process.platform}-${process.arch}`;
  const pkg  = PLATFORM_PKGS[key];
  if (pkg) {
    const pkgDir = resolvePackageDir(pkg);
    if (pkgDir) {
      const bin = path.join(pkgDir, 'bin', EXE_NAME);
      if (fs.existsSync(bin)) return bin;
    }
  }

  // 4. PATH lookup.
  try {
    const cmd = IS_WINDOWS ? `where ${EXE_NAME}` : `which ${EXE_NAME}`;
    const result = cp.execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim().split('\n')[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch (_) { /* not on PATH */ }

  return null;
}

// ── Health polling ────────────────────────────────────────────────────────────

/**
 * Polls GET http://localhost:<adminPort>/health every POLL_INTERVAL_MS ms.
 * Resolves when the server returns HTTP 200, rejects after POLL_TIMEOUT_MS.
 */
function waitForHealth(adminPort) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(
          `FlexGate did not become healthy within ${POLL_TIMEOUT_MS / 1000}s. ` +
          `Check logs for startup errors.`
        ));
      }

      const req = http.get({
        hostname: '127.0.0.1',
        port: adminPort,
        path: HEALTH_PATH,
        timeout: 2000,
      }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          // drain the body so the socket closes properly
          res.resume();
          resolve();
        } else {
          res.resume();
          setTimeout(attempt, POLL_INTERVAL_MS);
        }
      });

      req.on('error', () => setTimeout(attempt, POLL_INTERVAL_MS));
      req.on('timeout', () => { req.destroy(); setTimeout(attempt, POLL_INTERVAL_MS); });
    }

    attempt();
  });
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

/**
 * Start the FlexGate Go binary (or fall back to an npm script).
 *
 * @param {object}  opts
 * @param {number}  [opts.adminPort]   Admin API port  (default: 9090)
 * @param {number}  [opts.proxyPort]   Proxy port      (default: 8080)
 * @param {string}  [opts.config]      Path to config file (alias: configFile)
 * @param {boolean} [opts.lite=true]   Lite mode — skips DB/Redis startup
 * @param {boolean} [opts.quiet]       Suppress binary stdout (keep stderr only for errors)
 * @param {object}  [opts.env]         Extra environment variables merged into child env
 *
 * @returns {{ child: ChildProcess, adminPort: number, proxyPort: number,
 *             binaryPath: string, mode: 'binary'|'npm', stop: () => void }}
 */
function start(opts = {}) {
  const adminPort  = opts.adminPort  || parseInt(process.env.FLEXGATE_ADMIN_PORT || '9090', 10);
  const proxyPort  = opts.proxyPort  || parseInt(process.env.FLEXGATE_PROXY_PORT || '8080', 10);
  // Accept both opts.config and legacy opts.configFile.
  const configFile = opts.config || opts.configFile || process.env.FLEXGATE_CONFIG || null;
  const lite       = opts.lite !== false; // default true

  // ── Resolve child command ──────────────────────────────────────────────────
  // Strategy: Go binary preferred; if missing, fall back to `npm run start`
  // inside the workspace root so the dev workflow still works without a
  // compiled binary.

  let spawnCmd, spawnArgs, mode;

  const binaryPath = findBinary();
  if (binaryPath) {
    spawnCmd  = binaryPath;
    spawnArgs = configFile ? ['--config', configFile] : [];
    mode      = 'binary';
  } else {
    // Fallback: npm script.  Requires a package.json with `scripts.start` in
    // one of the ancestor directories.  Warns the user so they know it's a
    // degraded path.
    log.warn('Go binary not found — falling back to `npm run start`.');
    log.detail('Install the binary with:  npm install @flexgate/proxy');
    spawnCmd  = IS_WINDOWS ? 'npm.cmd' : 'npm';
    spawnArgs = ['run', 'start'];
    mode      = 'npm';
  }

  // ── Build child environment ────────────────────────────────────────────────
  const env = {
    ...process.env,
    FLEXGATE_LITE:       lite  ? 'true' : 'false',
    FLEXGATE_ADMIN_PORT: String(adminPort),
    FLEXGATE_PROXY_PORT: String(proxyPort),
    // Caller-supplied extras (e.g. FLEXGATE_ENV=development from `dev` command).
    ...(opts.env || {}),
  };

  // ── Spawn ──────────────────────────────────────────────────────────────────
  // stdio modes:
  //   'inherit' (default) — child I/O flows straight to terminal
  //   'pipe'              — caller receives child.stdout + child.stderr streams
  //   'quiet'             — both suppressed; only panic/error lines on stderr
  let stdioMode;
  if (opts.pipe) {
    stdioMode = ['ignore', 'pipe', 'pipe'];
  } else if (opts.quiet) {
    stdioMode = ['ignore', 'ignore', 'pipe'];
  } else {
    stdioMode = 'inherit';
  }

  const child = cp.spawn(spawnCmd, spawnArgs, {
    env,
    stdio: stdioMode,
    windowsHide: true,
    // npm fallback needs shell on Windows; binary does not.
    shell: mode === 'npm' && IS_WINDOWS,
  });

  if (opts.quiet && child.stderr) {
    child.stderr.on('data', (d) => {
      // Only surface lines that look like errors to avoid noise.
      const line = d.toString();
      if (/error|fatal|panic/i.test(line)) process.stderr.write(line);
    });
  }

  child.on('error', (err) => {
    log.error(`Failed to start FlexGate (${mode}): ${err.message}`);
    if (mode === 'binary' && err.code === 'EACCES') {
      log.detail(`Try:  chmod +x ${binaryPath}`);
    }
    if (mode === 'npm' && err.code === 'ENOENT') {
      log.detail('npm not found on PATH — cannot use fallback.');
    }
  });

  function stop() {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  return { child, adminPort, proxyPort, binaryPath: binaryPath ?? spawnCmd, mode, stop };
}

// ── Main exported façade ──────────────────────────────────────────────────────

/**
 * startAndWait — start the proxy and block until the health endpoint responds.
 *
 * Resolves with the same handle returned by start().
 * Rejects (after 30 s) if the process does not become healthy in time.
 *
 * @param {object} opts  — same shape as start()
 */
async function startAndWait(opts = {}) {
  const handle  = start(opts);
  const spinner = log.spinner('Waiting for FlexGate to become ready');

  try {
    await waitForHealth(handle.adminPort);
    spinner.succeed(`FlexGate ready  →  port ${handle.adminPort}`);
  } catch (err) {
    spinner.fail('FlexGate did not become healthy in time');
    handle.stop();
    throw err;
  }

  return handle;
}

module.exports = { findBinary, start, startAndWait, waitForHealth };
