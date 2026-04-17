'use strict';
/**
 * setup-api.js
 *
 * Thin HTTP client for the two setup endpoints on the FlexGate admin API:
 *
 *   GET  /api/setup/status    → { isSetupComplete: boolean }
 *   POST /api/setup/complete  → { success: boolean, token?, user?, sessionId? }
 *
 * Design constraints:
 *   - Node built-in `http` / `https` only — zero third-party deps.
 *   - Respects admin Basic-Auth credentials from env / options.
 *   - Treats 404 as "endpoint not yet wired" → graceful degradation.
 *   - Hard 5 s timeout so the CLI never hangs waiting for a dead server.
 *   - Automatic one retry on network error (transient connection reset).
 *
 * Degradation rules (dev / lite mode):
 *   404 on GET  /api/setup/status   → assume setup IS required.
 *   404 on POST /api/setup/complete → treat as stub success.
 */

const http  = require('http');
const https = require('https');

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES     = 64 * 1024; // 64 KiB — status response should be tiny

// ── Low-level helper ──────────────────────────────────────────────────────────

/**
 * Make a single JSON HTTP request.
 *
 * @param {object}  reqOpts          Node http.request options (hostname, port, path, method…)
 * @param {unknown} [body]           Request body — serialised as JSON if provided
 * @returns {Promise<{ status: number, body: unknown, raw: string }>}
 */
function jsonRequest(reqOpts, body = null) {
  return new Promise((resolve, reject) => {
    const module_ = reqOpts.protocol === 'https:' ? https : http;
    const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;

    const options = {
      hostname: reqOpts.hostname || '127.0.0.1',
      port:     reqOpts.port     || 9090,
      path:     reqOpts.path,
      method:   reqOpts.method   || 'GET',
      timeout:  REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(reqOpts.auth
          ? { 'Authorization': `Basic ${Buffer.from(reqOpts.auth).toString('base64')}` }
          : {}),
      },
    };

    const req = module_.request(options, (res) => {
      let raw  = '';
      let size = 0;

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) raw += chunk;
      });
      res.on('end', () => {
        let parsed;
        try   { parsed = JSON.parse(raw); }
        catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed, raw });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error',   reject);

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * jsonRequest with one automatic retry on transient network error.
 *
 * @param {object}  reqOpts
 * @param {unknown} [body]
 * @returns {Promise<{ status: number, body: unknown, raw: string }>}
 */
async function jsonRequestWithRetry(reqOpts, body = null) {
  try {
    return await jsonRequest(reqOpts, body);
  } catch (firstErr) {
    // Only retry on connection-level errors (ECONNRESET, ECONNREFUSED, timeout).
    // Do NOT retry on programmer errors (bad arguments etc.).
    const retryable = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(firstErr.code)
      || firstErr.message === 'Request timed out';
    if (!retryable) throw firstErr;

    if (process.env.DEBUG) {
      process.stderr.write(`[setup-api] retry after: ${firstErr.message}\n`);
    }

    // Brief back-off before retry.
    await new Promise(r => setTimeout(r, 400));
    return jsonRequest(reqOpts, body);
  }
}

// ── Setup API client ──────────────────────────────────────────────────────────

/**
 * @typedef {object} SetupClientOpts
 * @property {number}  [adminPort=9090]  Admin API port
 * @property {string}  [adminUser='']    Basic Auth username (empty = auth disabled)
 * @property {string}  [adminPass='']    Basic Auth password (empty = auth disabled)
 * @property {boolean} [https=false]     Use HTTPS transport
 */

/**
 * GET /api/setup/status
 *
 * Possible returns:
 *   'complete'  200 + { isSetupComplete: true }
 *   'required'  200 + { isSetupComplete: false }   — first run
 *   'required'  404 or 405                         — endpoint not wired yet (lite/dev)
 *   'error'     network failure / unexpected status
 *
 * @param {SetupClientOpts} [opts]
 * @returns {Promise<'complete'|'required'|'error'>}
 */
async function getSetupStatus(opts = {}) {
  const port     = opts.adminPort ?? parseInt(process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const user     = opts.adminUser ?? process.env.FLEXGATE_ADMIN_USER ?? '';
  const pass     = opts.adminPass ?? process.env.FLEXGATE_ADMIN_PASS ?? '';
  const protocol = opts.https ? 'https:' : 'http:';

  if (process.env.DEBUG) {
    process.stderr.write(`[setup-api] GET http://127.0.0.1:${port}/api/setup/status\n`);
  }

  try {
    const { status, body, raw } = await jsonRequestWithRetry({
      protocol,
      hostname: '127.0.0.1',
      port,
      path:   '/api/setup/status',
      method: 'GET',
      auth: (user || pass) ? `${user}:${pass}` : undefined,
    });

    if (process.env.DEBUG) {
      process.stderr.write(`[setup-api] response ${status}: ${raw.slice(0, 200)}\n`);
    }

    // ── Decision tree ─────────────────────────────────────────────────────
    // 404 / 405: endpoint exists in router but is not yet wired, or the binary
    // is an older build.  Safest assumption: setup has not been done.
    if (status === 404 || status === 405) return 'required';

    if (status >= 200 && status < 300) {
      if (typeof body !== 'object' || body === null) {
        // Unexpected non-JSON 2xx — treat conservatively.
        return 'required';
      }
      // isSetupComplete must be explicitly true to be considered done.
      return body.isSetupComplete === true ? 'complete' : 'required';
    }

    // Any other status (5xx, 401, etc.) — cannot determine state.
    return 'error';

  } catch {
    return 'error';
  }
}

/**
 * POST /api/setup/complete
 *
 * @param {{ instanceName?: string, adminEmail?: string, routeId?: string }} payload
 * @param {SetupClientOpts} [opts]
 * @returns {Promise<{ ok: boolean, token?: string, user?: object, sessionId?: string, error?: string }>}
 */
async function postSetupComplete(payload, opts = {}) {
  const port     = opts.adminPort ?? parseInt(process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const user     = opts.adminUser ?? process.env.FLEXGATE_ADMIN_USER ?? '';
  const pass     = opts.adminPass ?? process.env.FLEXGATE_ADMIN_PASS ?? '';
  const protocol = opts.https ? 'https:' : 'http:';

  if (process.env.DEBUG) {
    process.stderr.write(`[setup-api] POST http://127.0.0.1:${port}/api/setup/complete\n`);
  }

  try {
    const { status, body } = await jsonRequestWithRetry({
      protocol,
      hostname: '127.0.0.1',
      port,
      path:   '/api/setup/complete',
      method: 'POST',
      auth: (user || pass) ? `${user}:${pass}` : undefined,
    }, payload);

    // 404 / 405: not wired yet — treat as stub success in dev / lite mode.
    if (status === 404 || status === 405) return { ok: true };

    if (status >= 200 && status < 300) {
      return {
        ok: true,
        ...(typeof body === 'object' && body !== null ? body : {}),
      };
    }

    const errMsg = (typeof body === 'object' && body?.error)
      ? body.error
      : `HTTP ${status}`;
    return { ok: false, error: errMsg };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { getSetupStatus, postSetupComplete };
