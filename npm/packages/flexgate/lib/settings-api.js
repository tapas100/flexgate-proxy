'use strict';
/**
 * lib/settings-api.js
 *
 * Typed API wrapper for the FlexGate settings resource.
 *
 * Backend endpoints (all authenticated)
 * ──────────────────────────────────────
 *   GET  /api/settings   Read current settings
 *   PUT  /api/settings   Replace settings (full document)
 *
 * Note: the backend has no PATCH endpoint; partial updates are implemented
 * here in the client by doing GET → merge → PUT.
 *
 * Stage 7 rule: settings are never cached locally.
 * Every read goes to the backend; every write goes to the backend.
 *
 * Public API
 * ──────────
 *   getSettings(opts?)              → Promise<ApiResult<Settings>>
 *   updateSettings(data, opts?)     → Promise<ApiResult<Settings>>
 *   patchSettings(partial, opts?)   → Promise<ApiResult<Settings>>
 *   getProxyAdapter(opts?)          → Promise<ApiResult<ProxyAdapterConfig>>
 *   setProxyAdapter(type, mode, opts?)→Promise<ApiResult<ProxyAdapterConfig>>
 *
 * Settings shape (mirrors Settings struct in settings.go)
 * ───────────────────────────────────────────────────────
 *   proxy_read_timeout_sec   number
 *   proxy_write_timeout_sec  number
 *   proxy_idle_timeout_sec   number
 *   cors_enabled             boolean
 *   cors_allow_origins       string[]
 *   log_level                string   "debug"|"info"|"warn"|"error"
 *   log_format               string   "json"|"text"
 *   haproxy_socket           string
 *   haproxy_stats_url        string
 *   admin_auth_enabled       boolean
 *   admin_username           string
 *   updated_at?              string
 *
 * ProxyAdapterConfig shape (stored inside settings as extra fields)
 * ─────────────────────────────────────────────────────────────────
 *   proxy_adapter_type  string   "nginx"|"haproxy"|"none"
 *   proxy_adapter_mode  string   "inline"|"mirror"|"selective"
 */

const { defaultClient } = require('./api-client');

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Read current settings from the backend.
 *
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
function getSettings(opts = {}) {
  return defaultClient().get('/api/settings', opts);
}

/**
 * Replace settings with a full document.
 *
 * @param {object} data   Full settings body
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
function updateSettings(data, opts = {}) {
  if (!data || typeof data !== 'object') {
    return Promise.resolve({
      ok:     false,
      error:  'settings data must be an object',
      status: 0,
      code:   'VALIDATION_ERROR',
    });
  }
  return defaultClient().put('/api/settings', data, opts);
}

/**
 * Partial-update settings.
 * Fetches the current settings, merges the partial values, then PUTs the
 * merged document back.
 *
 * @param {object} partial   Keys to update
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
async function patchSettings(partial, opts = {}) {
  const current = await getSettings(opts);
  if (!current.ok) return current;

  const merged = { ...current.data, ...partial };
  // Strip read-only / server-set fields before writing back.
  delete merged.updated_at;

  return updateSettings(merged, opts);
}

// ── Proxy adapter helpers ─────────────────────────────────────────────────────

/**
 * Read the proxy adapter config from the backend settings.
 * Returns { proxy_adapter_type, proxy_adapter_mode } or null if not set.
 *
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
async function getProxyAdapter(opts = {}) {
  const result = await getSettings(opts);
  if (!result.ok) return result;

  const { proxy_adapter_type, proxy_adapter_mode } = result.data;
  return {
    ok:     true,
    status: result.status,
    data: (proxy_adapter_type || proxy_adapter_mode)
      ? { proxy_adapter_type, proxy_adapter_mode }
      : null,
  };
}

/**
 * Set the proxy adapter type and mode via a settings patch.
 *
 * @param {string} type  'nginx'|'haproxy'|'none'
 * @param {string} mode  'inline'|'mirror'|'selective'
 * @param {object} [opts]
 * @returns {Promise<ApiResult>}
 */
function setProxyAdapter(type, mode, opts = {}) {
  return patchSettings({ proxy_adapter_type: type, proxy_adapter_mode: mode }, opts);
}

module.exports = {
  getSettings,
  updateSettings,
  patchSettings,
  getProxyAdapter,
  setProxyAdapter,
};
