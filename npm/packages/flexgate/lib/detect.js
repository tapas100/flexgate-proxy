'use strict';
/**
 * detect.js
 *
 * Setup-state detection for the FlexGate CLI.
 *
 * This module owns the full decision tree that answers one question:
 *
 *   "Should we open the browser to /setup or /dashboard?"
 *
 * It wraps setup-api.js (the raw HTTP layer) and maps the low-level API
 * response into the four human-readable CLI states:
 *
 *   ┌─────────────┬──────────────────────────────────────────────────────────┐
 *   │ State       │ Meaning                                                   │
 *   ├─────────────┼──────────────────────────────────────────────────────────┤
 *   │ 'complete'  │ GET /api/setup/status → { isSetupComplete: true }        │
 *   │             │ → open /dashboard                                         │
 *   ├─────────────┼──────────────────────────────────────────────────────────┤
 *   │ 'required'  │ GET /api/setup/status → { isSetupComplete: false }       │
 *   │             │ OR endpoint returned 404 (binary not yet wired)          │
 *   │             │ → open /setup                                             │
 *   ├─────────────┼──────────────────────────────────────────────────────────┤
 *   │ 'unknown'   │ API responded but result was not interpretable            │
 *   │             │ → open /setup (safe default)                              │
 *   ├─────────────┼──────────────────────────────────────────────────────────┤
 *   │ 'error'     │ Network failure — admin API unreachable                   │
 *   │             │ → open /setup (safe default, caller may also warn)        │
 *   └─────────────┴──────────────────────────────────────────────────────────┘
 *
 * Public API
 * ──────────
 *   detectSetupState(adminPort)   → Promise<DetectResult>   (full result object)
 *   checkSetupStatus(adminPort)   → Promise<SetupState>     (state string only)
 *   resolveUiPath(adminPort)      → Promise<string|null>    ('/setup' | '/dashboard' | null)
 */

const { getSetupStatus } = require('./setup-api');

// ── Types (JSDoc) ─────────────────────────────────────────────────────────────

/**
 * @typedef {'complete'|'required'|'unknown'|'error'} SetupState
 */

/**
 * @typedef {object} DetectResult
 * @property {SetupState} state        — one of the four states above
 * @property {string}     uiPath       — '/dashboard' | '/setup'
 * @property {boolean}    shouldSetup  — true when the wizard should open
 * @property {string}     message      — human-readable sentence for log output
 */

// ── Decision constants ────────────────────────────────────────────────────────

/** States that mean "send the user to the setup wizard". */
const SETUP_STATES = new Set(['required', 'unknown', 'error']);

/** Per-state human-readable messages printed by the CLI. */
const STATE_MESSAGES = {
  complete: 'Setup already complete — opening dashboard',
  required: 'First-run setup required — opening setup wizard',
  unknown:  'Setup status unknown — opening wizard to be safe',
  error:    'Could not reach setup API — opening wizard to be safe',
};

// ── Core detection ────────────────────────────────────────────────────────────

/**
 * Call GET /api/setup/status and return a fully-resolved DetectResult.
 *
 * Decision flow:
 *
 *   1. Call setup-api.getSetupStatus(adminPort)
 *      → returns 'complete' | 'required' | 'error'
 *
 *   2. Map 'error' from the API layer:
 *      - Keep as 'error' (network-level failure, unreachable)
 *
 *   3. Any other unexpected value from the API layer → 'unknown'
 *
 *   4. Build the DetectResult:
 *      - shouldSetup  = state is NOT 'complete'
 *      - uiPath       = shouldSetup ? '/setup' : '/dashboard'
 *
 * @param {number|string} adminPort
 * @returns {Promise<DetectResult>}
 */
async function detectSetupState(adminPort) {
  const port = parseInt(String(adminPort ?? process.env.FLEXGATE_ADMIN_PORT ?? '9090'), 10);

  if (process.env.DEBUG) {
    process.stderr.write(`[detect] checking setup state on port ${port}\n`);
  }

  // ── Step 1: query the API ──────────────────────────────────────────────────
  const apiResult = await getSetupStatus({ adminPort: port });

  // ── Step 2: map to SetupState ──────────────────────────────────────────────
  /** @type {SetupState} */
  let state;

  switch (apiResult) {
    case 'complete': state = 'complete'; break;
    case 'required': state = 'required'; break;
    case 'error':    state = 'error';    break;
    default:         state = 'unknown';  break;  // future-proof
  }

  if (process.env.DEBUG) {
    process.stderr.write(`[detect] api='${apiResult}' → state='${state}'\n`);
  }

  // ── Step 3: build result ───────────────────────────────────────────────────
  const shouldSetup = SETUP_STATES.has(state);
  const uiPath      = shouldSetup ? '/setup' : '/dashboard';
  const message     = STATE_MESSAGES[state] ?? STATE_MESSAGES.unknown;

  return { state, uiPath, shouldSetup, message };
}

// ── Public convenience wrappers ───────────────────────────────────────────────

/**
 * Return just the SetupState string.
 * Preferred by callers that only need to switch on the state.
 *
 * @param {number|string} adminPort
 * @returns {Promise<SetupState>}
 */
async function checkSetupStatus(adminPort) {
  const { state } = await detectSetupState(adminPort);
  return state;
}

/**
 * Return the UI path to open, or null if the API is completely unreachable
 * and the caller needs to decide what to do.
 *
 * @param {number|string} adminPort
 * @returns {Promise<'/setup'|'/dashboard'|null>}
 */
async function resolveUiPath(adminPort) {
  const { state, uiPath } = await detectSetupState(adminPort);
  if (state === 'error') return null;
  return uiPath;
}

module.exports = { detectSetupState, checkSetupStatus, resolveUiPath };
