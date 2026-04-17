'use strict';
/**
 * lib/config-store.js
 *
 * LOCAL connection preferences store for the FlexGate CLI.
 *
 * Stage 7 principle
 * ─────────────────
 * The CLI must NOT maintain a separate copy of runtime state (routes,
 * settings, proxy adapter config, etc.).  The backend is the single source
 * of truth for all of that.
 *
 * What IS stored locally
 * ──────────────────────
 * Only the *connection* preferences needed to reach the backend:
 *
 *   ~/.flexgate/config.json
 *   {
 *     "connection": {
 *       "port":  9090,
 *       "host":  "127.0.0.1",
 *       "user":  "",
 *       "pass":  "",
 *       "https": false
 *     }
 *   }
 *
 * This is intentionally thin — just enough so the user can run
 * `flexgate route list` without typing --admin-port every time.
 *
 * Environment variables
 * ─────────────────────
 *   FLEXGATE_CONFIG_DIR   Override ~/.flexgate directory
 *
 * Public API
 * ──────────
 *   readLocalConfig()               → object  (or {})
 *   writeLocalConfig(patch)         → void    (deep-merges)
 *   readConnection()                → ConnectionPrefs | {}
 *   saveConnection(prefs)           → void
 *   configFilePath()                → string
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Paths ─────────────────────────────────────────────────────────────────────

function configDir() {
  return process.env.FLEXGATE_CONFIG_DIR
    || path.join(os.homedir(), '.flexgate');
}

function configFilePath() {
  return path.join(configDir(), 'config.json');
}

// ── File helpers ──────────────────────────────────────────────────────────────

/**
 * Read and parse the local config file.
 * Returns {} if the file doesn't exist or is malformed.
 * @returns {object}
 */
function readLocalConfig() {
  const p = configFilePath();
  try {
    const raw    = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* file missing or corrupt */ }
  return {};
}

/**
 * Deep-merge `patch` into the existing local config and write it back.
 * Creates the config directory and file if they don't exist.
 * @param {object} patch
 */
function writeLocalConfig(patch) {
  const dir = configDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = readLocalConfig();
  const merged   = deepMerge(existing, patch);
  fs.writeFileSync(configFilePath(), JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) &&
        base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Connection preferences ────────────────────────────────────────────────────

/**
 * Read the stored connection preferences.
 * @returns {{ port?:number, host?:string, user?:string, pass?:string, https?:boolean }}
 */
function readConnection() {
  return readLocalConfig().connection ?? {};
}

/**
 * Save connection preferences (merged with existing).
 * @param {{ port?:number, host?:string, user?:string, pass?:string, https?:boolean }} prefs
 */
function saveConnection(prefs) {
  writeLocalConfig({ connection: prefs });
}

module.exports = {
  readLocalConfig,
  writeLocalConfig,
  readConnection,
  saveConnection,
  configFilePath,
};
