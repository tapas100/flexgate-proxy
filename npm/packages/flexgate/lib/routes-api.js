'use strict';
/**
 * lib/routes-api.js
 *
 * Typed API wrapper for the FlexGate routes resource.
 *
 * Backend endpoints (all authenticated)
 * ──────────────────────────────────────
 *   GET    /api/routes          List all routes
 *   POST   /api/routes          Create a route
 *   PUT    /api/routes/:id      Replace a route
 *   DELETE /api/routes/:id      Soft-delete a route
 *
 * All write operations go directly to the backend — no local cache,
 * no local file.  The backend is the single source of truth (Stage 7 rule).
 *
 * Public API
 * ──────────
 *   listRoutes(opts?)                      → Promise<ApiResult<RouteList>>
 *   getRoute(id, opts?)                    → Promise<ApiResult<Route>>
 *   createRoute(data, opts?)               → Promise<ApiResult<Route>>
 *   updateRoute(id, data, opts?)           → Promise<ApiResult<Route>>
 *   deleteRoute(id, opts?)                 → Promise<ApiResult<void>>
 *   enableRoute(id, opts?)                 → Promise<ApiResult<Route>>
 *   disableRoute(id, opts?)                → Promise<ApiResult<Route>>
 *
 * Route shape (mirrors RouteRecord in routes.go)
 * ──────────────────────────────────────────────
 *   {
 *     id?         string      internal UUID (assigned by DB)
 *     route_id    string      stable human-readable identifier (required)
 *     path        string      URL path prefix (required)   e.g. "/api"
 *     upstream    string      target URL (required)         e.g. "https://example.com"
 *     methods?    string[]    HTTP methods allowed          default: all
 *     strip_path? string      prefix to strip before forwarding
 *     add_headers?{k:v}       headers to inject on upstream request
 *     timeout_ms? number      per-request timeout in ms
 *     enabled     boolean     whether the route is active   default: true
 *     description?string
 *     tags?       string[]
 *     created_at? string
 *     updated_at? string
 *   }
 *
 * Opts (all optional, passed through to ApiClient)
 * ─────────────────────────────────────────────────
 *   adminPort, adminHost, adminUser, adminPass, adminHttps
 */

const { defaultClient } = require('./api-client');

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate the minimum fields required to create a route.
 * Returns an error message string, or null if valid.
 *
 * @param {object} data
 * @returns {string|null}
 */
function validateRouteData(data) {
  const problems = [];
  if (!data.route_id || !String(data.route_id).trim()) problems.push('"route_id" is required');
  if (!data.path     || !String(data.path).trim())     problems.push('"path" is required');
  if (!data.upstream || !String(data.upstream).trim()) problems.push('"upstream" is required');
  return problems.length ? problems.join('; ') : null;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * List all non-deleted routes.
 *
 * @param {object} [opts]
 * @returns {Promise<{ok:true, data:{routes:object[], total:number}, status:number}
 *                 |{ok:false, error:string, status:number, code:string}>}
 */
function listRoutes(opts = {}) {
  return defaultClient().get('/api/routes', opts);
}

/**
 * Get a single route by its internal UUID.
 * Note: the backend has no dedicated GET /api/routes/:id endpoint;
 * we fetch the list and filter client-side.
 *
 * @param {string} id   Internal UUID or route_id string
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
async function getRoute(id, opts = {}) {
  const result = await listRoutes(opts);
  if (!result.ok) return result;

  const routes = result.data?.routes ?? [];
  // Match on internal UUID first, fall back to route_id.
  const found  = routes.find(r => r.id === id || r.route_id === id);
  if (!found) {
    return { ok: false, error: `Route "${id}" not found`, status: 404, code: 'NOT_FOUND' };
  }
  return { ok: true, data: found, status: 200 };
}

/**
 * Create a new route.
 *
 * @param {object} data   Route fields (route_id, path, upstream required)
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
function createRoute(data, opts = {}) {
  const err = validateRouteData(data);
  if (err) return Promise.resolve({ ok: false, error: err, status: 0, code: 'VALIDATION_ERROR' });

  // Default enabled to true if not specified.
  const payload = { enabled: true, methods: [], ...data };
  return defaultClient().post('/api/routes', payload, opts);
}

/**
 * Replace an existing route (full update).
 *
 * @param {string} id     Internal UUID
 * @param {object} data   Full route body
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
function updateRoute(id, data, opts = {}) {
  const err = validateRouteData(data);
  if (err) return Promise.resolve({ ok: false, error: err, status: 0, code: 'VALIDATION_ERROR' });

  return defaultClient().put(`/api/routes/${encodeURIComponent(id)}`, data, opts);
}

/**
 * Soft-delete a route by its internal UUID.
 *
 * @param {string} id
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
function deleteRoute(id, opts = {}) {
  return defaultClient().delete(`/api/routes/${encodeURIComponent(id)}`, opts);
}

/**
 * Enable a route (set enabled=true).
 *
 * @param {string} id   Internal UUID or route_id
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
async function enableRoute(id, opts = {}) {
  const current = await getRoute(id, opts);
  if (!current.ok) return current;
  return updateRoute(current.data.id, { ...current.data, enabled: true }, opts);
}

/**
 * Disable a route (set enabled=false).
 *
 * @param {string} id   Internal UUID or route_id
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
async function disableRoute(id, opts = {}) {
  const current = await getRoute(id, opts);
  if (!current.ok) return current;
  return updateRoute(current.data.id, { ...current.data, enabled: false }, opts);
}

module.exports = {
  listRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute,
  enableRoute,
  disableRoute,
  validateRouteData,  // exported so commands can use it for pre-flight checks
};
