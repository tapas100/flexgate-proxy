'use strict';
/**
 * lib/api-client.js
 *
 * Single canonical HTTP client for the FlexGate admin API.
 *
 * Design principles
 * ─────────────────
 *   • Node built-in `http` / `https` only — zero third-party deps.
 *   • All CLI commands that need to talk to the backend go through this module.
 *     There is no other HTTP layer for admin API calls.
 *   • Returns a typed ApiResult so callers never have to inspect raw status
 *     codes themselves:
 *       { ok: true,  data: <parsed JSON>,           status: 200 }
 *       { ok: false, error: "<message>", status: 404, code: 'NOT_FOUND' }
 *   • One automatic retry on transient network errors (ECONNRESET etc.).
 *   • Hard 8 s timeout — the CLI must never hang indefinitely.
 *   • DEBUG=1 traces every request + response to stderr.
 *   • Degradation: 404 / 405 are surfaced as { ok:false, code:'NOT_FOUND' }
 *     so individual wrappers can decide how to handle them (not silently swallowed).
 *
 * Configuration (resolved in this priority order)
 * ─────────────────────────────────────────────────
 *   1. Options passed to request() / the ApiClient constructor.
 *   2. Environment variables:
 *        FLEXGATE_ADMIN_PORT   (default: 9090)
 *        FLEXGATE_ADMIN_HOST   (default: 127.0.0.1)
 *        FLEXGATE_ADMIN_USER   (default: '')
 *        FLEXGATE_ADMIN_PASS   (default: '')
 *        FLEXGATE_ADMIN_HTTPS  (default: false)
 *   3. ~/.flexgate/config.json  { connection: { port, host, user, pass, https } }
 *      (read once at first use, never cached across calls so tests can change it)
 *
 * Public API
 * ──────────
 *   createClient(opts?)           → ApiClient
 *   defaultClient()               → ApiClient   (lazily-created singleton)
 *
 * ApiClient methods
 * ─────────────────
 *   client.get(path, opts?)       → Promise<ApiResult>
 *   client.post(path, body, opts?)→ Promise<ApiResult>
 *   client.put(path, body, opts?) → Promise<ApiResult>
 *   client.patch(path, body, opts?)→Promise<ApiResult>
 *   client.delete(path, opts?)    → Promise<ApiResult>
 *   client.request(method, path, body?, opts?) → Promise<ApiResult>
 *
 * ApiResult shape
 * ───────────────
 *   { ok: true,  data: any,    status: number }
 *   { ok: false, error: string, status: number, code: ErrorCode }
 *
 * ErrorCode values
 * ────────────────
 *   'NOT_FOUND'       HTTP 404
 *   'CONFLICT'        HTTP 409
 *   'UNPROCESSABLE'   HTTP 422
 *   'UNAUTHORIZED'    HTTP 401 / 403
 *   'SERVER_ERROR'    HTTP 5xx
 *   'NETWORK_ERROR'   Connection refused / timeout / DNS failure
 *   'API_ERROR'       Any other non-2xx
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES     = 512 * 1024; // 512 KiB — generous for route lists

// ── Error codes ───────────────────────────────────────────────────────────────

const STATUS_CODE_MAP = {
  401: 'UNAUTHORIZED',
  403: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
};

function errorCode(status) {
  if (STATUS_CODE_MAP[status]) return STATUS_CODE_MAP[status];
  if (status >= 500)           return 'SERVER_ERROR';
  return 'API_ERROR';
}

// ── Connection config helpers ─────────────────────────────────────────────────

/**
 * Read the connection stanza from ~/.flexgate/config.json (if it exists).
 * Called fresh on every request — no module-level cache — so tests can
 * manipulate FLEXGATE_CONFIG_DIR between calls.
 */
function readConnectionConfig() {
  try {
    const dir = process.env.FLEXGATE_CONFIG_DIR || path.join(os.homedir(), '.flexgate');
    const raw = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.connection ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve the final set of connection options, merging all three layers.
 *
 * @param {object} [overrides]
 * @returns {{ port, host, user, pass, useHttps }}
 */
function resolveConnection(overrides = {}) {
  const file = readConnectionConfig();
  return {
    port:     overrides.adminPort  ?? parseInt(process.env.FLEXGATE_ADMIN_PORT  ?? file.port ?? '9090', 10),
    host:     overrides.adminHost  ?? process.env.FLEXGATE_ADMIN_HOST  ?? file.host ?? '127.0.0.1',
    user:     overrides.adminUser  ?? process.env.FLEXGATE_ADMIN_USER  ?? file.user ?? '',
    pass:     overrides.adminPass  ?? process.env.FLEXGATE_ADMIN_PASS  ?? file.pass ?? '',
    useHttps: overrides.adminHttps ?? (process.env.FLEXGATE_ADMIN_HTTPS === '1') ?? file.https ?? false,
  };
}

// ── Core HTTP ─────────────────────────────────────────────────────────────────

/**
 * Make a single HTTP(S) request to the admin API.
 *
 * @param {string}  method
 * @param {string}  urlPath
 * @param {unknown} body
 * @param {object}  conn   Resolved connection config
 * @returns {Promise<ApiResult>}
 */
function httpRequest(method, urlPath, body, conn) {
  return new Promise((resolve) => {
    const mod     = conn.useHttps ? https : http;
    const payload = (body !== null && body !== undefined) ? JSON.stringify(body) : null;
    const auth    = (conn.user || conn.pass)
      ? Buffer.from(`${conn.user}:${conn.pass}`).toString('base64')
      : null;

    const options = {
      hostname: conn.host,
      port:     conn.port,
      path:     urlPath,
      method,
      timeout:  REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(auth    ? { 'Authorization': `Basic ${auth}` }            : {}),
      },
    };

    if (process.env.DEBUG) {
      process.stderr.write(`[api-client] ${method} http${conn.useHttps ? 's' : ''}://${conn.host}:${conn.port}${urlPath}\n`);
    }

    const req = mod.request(options, (res) => {
      let raw  = '';
      let size = 0;
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) raw += chunk;
      });
      res.on('end', () => {
        if (process.env.DEBUG) {
          process.stderr.write(`[api-client] ${res.statusCode} ${raw.slice(0, 200)}\n`);
        }

        let data;
        try   { data = JSON.parse(raw); }
        catch { data = raw || null; }

        const status = res.statusCode;
        if (status >= 200 && status < 300) {
          resolve({ ok: true, data, status });
        } else {
          const msg = (data && typeof data === 'object' && data.error)
            ? data.error
            : `HTTP ${status}`;
          resolve({ ok: false, error: msg, status, code: errorCode(status) });
        }
      });
      res.on('error', (err) => {
        resolve({ ok: false, error: err.message, status: 0, code: 'NETWORK_ERROR' });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timed out', status: 0, code: 'NETWORK_ERROR' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, status: 0, code: 'NETWORK_ERROR' });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE']);

/**
 * Attempt the request once; on a retryable network error wait 400 ms and try
 * once more.  Does NOT retry on HTTP-level errors (4xx / 5xx).
 */
async function httpRequestWithRetry(method, urlPath, body, conn) {
  const result = await httpRequest(method, urlPath, body, conn);
  if (
    result.code === 'NETWORK_ERROR' &&
    (RETRYABLE_CODES.has(result._errCode) || result.error === 'Request timed out')
  ) {
    if (process.env.DEBUG) {
      process.stderr.write(`[api-client] retry after: ${result.error}\n`);
    }
    await new Promise(r => setTimeout(r, 400));
    return httpRequest(method, urlPath, body, conn);
  }
  return result;
}

// ── ApiClient class ───────────────────────────────────────────────────────────

class ApiClient {
  /**
   * @param {object} [defaultOpts]
   * @param {number}  [defaultOpts.adminPort]
   * @param {string}  [defaultOpts.adminHost]
   * @param {string}  [defaultOpts.adminUser]
   * @param {string}  [defaultOpts.adminPass]
   * @param {boolean} [defaultOpts.adminHttps]
   */
  constructor(defaultOpts = {}) {
    this._defaults = defaultOpts;
  }

  /**
   * Core request method.
   *
   * @param {string}  method
   * @param {string}  urlPath
   * @param {unknown} [body]
   * @param {object}  [opts]    Per-call overrides (same keys as constructor)
   * @returns {Promise<ApiResult>}
   */
  request(method, urlPath, body = null, opts = {}) {
    const conn = resolveConnection({ ...this._defaults, ...opts });
    return httpRequestWithRetry(method.toUpperCase(), urlPath, body, conn);
  }

  get   (urlPath,       opts = {}) { return this.request('GET',    urlPath, null, opts); }
  post  (urlPath, body, opts = {}) { return this.request('POST',   urlPath, body, opts); }
  put   (urlPath, body, opts = {}) { return this.request('PUT',    urlPath, body, opts); }
  patch (urlPath, body, opts = {}) { return this.request('PATCH',  urlPath, body, opts); }
  delete(urlPath,       opts = {}) { return this.request('DELETE', urlPath, null, opts); }
}

// ── Default singleton ─────────────────────────────────────────────────────────

let _default = null;

/**
 * Return a lazily-created default ApiClient that reads its connection from
 * env vars and the config file at call time.
 * Tests can call resetDefaultClient() to force a fresh instance.
 */
function defaultClient() {
  if (!_default) _default = new ApiClient();
  return _default;
}

function resetDefaultClient() { _default = null; }

function createClient(opts = {}) { return new ApiClient(opts); }

module.exports = { ApiClient, createClient, defaultClient, resetDefaultClient };
