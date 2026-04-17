'use strict';
/**
 * browser.js
 *
 * Cross-platform "open URL in default browser" helper.
 *
 * Uses the `open` npm package (v10, ESM) loaded via dynamic import() so this
 * CommonJS module can consume it without an ESM wrapper file.
 *
 * Key guarantees:
 *   • open-once guard — the same URL is never opened twice per process.
 *     Subsequent calls with the same URL are silent no-ops.
 *   • Never rejects — on any failure it logs a warning + the manual URL.
 *   • URL is validated (must be http:// or https://) before being passed
 *     to the OS, preventing accidental shell-injection via malformed URLs.
 *   • Respects --no-ui / FLEXGATE_NO_UI=1 env var (checked at call time,
 *     not at module load, so tests can set the env after require()).
 *
 * Public API
 * ──────────
 *   openBrowser(url, opts?)   → Promise<void>  (always resolves)
 *   resetOpenGuard()          → void            (test helper)
 */

const { URL } = require('url');
const log     = require('./logger');

// ── Open-once guard ───────────────────────────────────────────────────────────

/**
 * Set of URLs already opened in this process.
 * Cleared only by resetOpenGuard() (used in tests).
 * @type {Set<string>}
 */
const _opened = new Set();

/**
 * Reset the open-once guard.  Call this between tests so each test starts
 * with a clean state.
 */
function resetOpenGuard() {
  _opened.clear();
}

// ── ESM open() loader ─────────────────────────────────────────────────────────

/** Cached promise so we only dynamic-import once per process. */
let _openPromise = null;

/**
 * Lazily load the `open` ESM package.
 * Returns the default export (the open() function).
 *
 * @returns {Promise<Function>}
 */
function loadOpen() {
  if (!_openPromise) {
    _openPromise = import('open')
      .then((mod) => mod.default)
      .catch((err) => {
        // If `open` is not installed (e.g. in a bare-bones environment),
        // fall back gracefully to the native spawn strategy.
        if (process.env.DEBUG) {
          process.stderr.write(`[browser] open package unavailable: ${err.message} — using native fallback\n`);
        }
        return null; // signal to use native fallback
      });
  }
  return _openPromise;
}

// ── Native spawn fallback ─────────────────────────────────────────────────────

const { spawn } = require('child_process');
const IS_WIN    = process.platform === 'win32';

function spawnDetached(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      detached: true,
      stdio:    'ignore',
      shell:    IS_WIN && cmd === 'cmd',
    });
    child.on('error', reject);
    setTimeout(() => {
      try { child.unref(); } catch { /* ignore */ }
      resolve();
    }, 150);
  });
}

async function openNative(href) {
  const platform = process.platform;
  let cmd, args;

  if (platform === 'darwin') {
    cmd = 'open'; args = [href];
  } else if (platform === 'win32') {
    cmd = 'cmd'; args = ['/c', 'start', '""', href];
  } else {
    cmd = 'xdg-open'; args = [href];
  }

  try {
    await spawnDetached(cmd, args);
    return;
  } catch { /* try sensible-browser */ }

  if (platform !== 'darwin' && platform !== 'win32') {
    try { await spawnDetached('sensible-browser', [href]); return; } catch { /* ignore */ }
  }

  throw new Error(`No browser launcher found (tried ${cmd})`);
}

// ── URL validation ────────────────────────────────────────────────────────────

/**
 * Parse and validate `url`.  Returns the normalised href, or throws.
 * @param {string} url
 * @returns {string}
 */
function safeUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsafe URL protocol: ${parsed.protocol}`);
  }
  return parsed.href;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Open `url` in the user's default browser.
 *
 * @param {string}  url            Must start with http:// or https://
 * @param {object}  [opts]
 * @param {boolean} [opts.force]   Bypass the open-once guard (re-open even if
 *                                 this URL was already opened in this process)
 * @returns {Promise<void>}        Always resolves — never rejects.
 */
async function openBrowser(url, opts = {}) {
  // ── Guard: FLEXGATE_NO_UI env var ─────────────────────────────────────────
  if (process.env.FLEXGATE_NO_UI === '1' || process.env.FLEXGATE_NO_UI === 'true') {
    log.detail(`Browser open suppressed (FLEXGATE_NO_UI).  Open manually → ${url}`);
    return;
  }

  // ── Validate URL ──────────────────────────────────────────────────────────
  let href;
  try {
    href = safeUrl(url);
  } catch (err) {
    log.warn(`Cannot open browser — invalid URL: ${url} (${err.message})`);
    return;
  }

  // ── Open-once guard ───────────────────────────────────────────────────────
  if (!opts.force && _opened.has(href)) {
    if (process.env.DEBUG) {
      process.stderr.write(`[browser] skipping already-opened URL: ${href}\n`);
    }
    return;
  }
  _opened.add(href);

  // ── Open via `open` package (preferred) or native fallback ────────────────
  const openFn = await loadOpen();

  try {
    if (openFn) {
      // `open` package — handles macOS, Linux, Windows cleanly.
      await openFn(href, { wait: false });
    } else {
      // Native spawn fallback (open package not installed).
      await openNative(href);
    }
    log.detail(`Opened browser → ${href}`);
  } catch (err) {
    log.warn(`Could not open browser automatically (${err.message}).`);
    log.url(`Open manually → ${href}`);
  }
}

module.exports = { openBrowser, resetOpenGuard };
