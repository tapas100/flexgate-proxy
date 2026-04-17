'use strict';
/**
 * commands/configure.js
 *
 * `flexgate configure` — interactive proxy adapter setup wizard.
 *
 * Asks two questions:
 *
 *   1. Which proxy are you using?
 *      → Nginx  →  HAProxy  →  None (standalone)
 *
 *   2. Which traffic mode?
 *      → Inline    all requests flow through FlexGate before hitting the proxy
 *      → Mirror    requests are duplicated to FlexGate (shadow mode, no impact)
 *      → Selective only routes tagged in config are intercepted
 *
 * Then:
 *   • Writes  ~/.flexgate/config.json    (always)
 *   • POSTs   POST /api/config/proxy-adapter  (best-effort; warns on failure)
 *   • Prints  a summary + next-step hint
 *
 * Options
 * ───────
 *   -a, --admin-port <n>   Admin API port (default: 9090)
 *   --yes                  Accept all defaults (non-interactive / CI mode)
 *   --type <type>          Pre-fill proxy type  (nginx|haproxy|none)
 *   --mode <mode>          Pre-fill traffic mode (inline|mirror|selective)
 *   --json                 Print result as JSON and exit (machine-readable)
 *
 * Environment variables
 * ─────────────────────
 *   FLEXGATE_ADMIN_PORT   Override admin port
 *   FLEXGATE_CONFIG_DIR   Override ~/.flexgate directory
 *
 * Stage 7 note
 * ────────────
 * Proxy adapter config is persisted ONLY to the backend via
 * settings-api.setProxyAdapter().  The local config file (~/.flexgate/config.json)
 * stores ONLY connection preferences (port/host/credentials).
 */

const log          = require('../lib/logger');
const prompt       = require('../lib/prompt');
const settingsApi  = require('../lib/settings-api');
const configStore  = require('../lib/config-store');

// ── Question definitions ──────────────────────────────────────────────────────

const PROXY_TYPE_CHOICES = [
  { name: 'Nginx',              value: 'nginx'   },
  { name: 'HAProxy',            value: 'haproxy' },
  { name: 'None (standalone)',  value: 'none'    },
];

const PROXY_MODE_CHOICES = [
  {
    name:  'Inline    — all traffic routed through FlexGate',
    value: 'inline',
  },
  {
    name:  'Mirror    — shadow copy only (zero production impact)',
    value: 'mirror',
  },
  {
    name:  'Selective — only tagged routes are intercepted',
    value: 'selective',
  },
];

// Mode choices are contextual — some combinations don't apply.
// 'none' + 'inline' is the natural standalone mode; disable mirror/selective
// since there is no upstream proxy to mirror/filter from.
const MODE_CHOICES_FOR = {
  nginx:   PROXY_MODE_CHOICES,
  haproxy: PROXY_MODE_CHOICES,
  none:    PROXY_MODE_CHOICES.filter(c => c.value === 'inline'),
};

// ── Questions builder ─────────────────────────────────────────────────────────

/**
 * Build the list of questions to ask, respecting any pre-filled --type /
 * --mode flags so the user isn't re-asked for values they already provided.
 *
 * @param {{ type?: string, mode?: string, yes: boolean }} opts
 * @returns {Array<object>}
 */
function buildQuestions(opts) {
  const qs = [];

  if (!opts.type) {
    qs.push({
      type:    'select',
      name:    'type',
      message: 'Which proxy are you using?',
      choices: PROXY_TYPE_CHOICES,
    });
  }

  // Mode question is always added — even if --type is pre-filled — unless
  // --mode is also pre-filled.  We defer building it until after we know the
  // type (see resolveAnswers below).
  if (!opts.mode) {
    qs.push({
      type:    '__mode_deferred__', // sentinel; resolved after type is known
      name:    'mode',
      message: 'Which traffic mode?',
    });
  }

  return qs;
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set(['nginx', 'haproxy', 'none']);
const VALID_MODES = new Set(['inline', 'mirror', 'selective']);

function validateType(v) {
  if (!VALID_TYPES.has(v)) {
    throw new Error(
      `Invalid proxy type "${v}". Valid values: ${[...VALID_TYPES].join(', ')}`,
    );
  }
}

function validateMode(v, type) {
  if (!VALID_MODES.has(v)) {
    throw new Error(
      `Invalid mode "${v}". Valid values: ${[...VALID_MODES].join(', ')}`,
    );
  }
  if (type === 'none' && v !== 'inline') {
    throw new Error(
      `Mode "${v}" is not available when proxy type is "none". Only "inline" is supported.`,
    );
  }
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Run the interactive prompts and return { type, mode }.
 *
 * @param {{ type?: string, mode?: string, yes: boolean }} opts
 * @returns {Promise<{ type: string, mode: string }>}
 */
async function resolveAnswers(opts) {
  // Start with any pre-filled values.
  const result = {
    type: opts.type || null,
    mode: opts.mode || null,
  };

  // ── Proxy type ─────────────────────────────────────────────────────────────
  if (!result.type) {
    if (opts.yes) {
      // --yes: accept first choice as default.
      result.type = PROXY_TYPE_CHOICES[0].value;
      log.detail(`Proxy type: ${result.type}  (default)`);
    } else {
      const answers = await prompt.ask([
        {
          type:    'select',
          name:    'type',
          message: 'Which proxy are you using?',
          choices: PROXY_TYPE_CHOICES,
        },
      ]);
      result.type = answers.type;
    }
  }

  // ── Traffic mode ───────────────────────────────────────────────────────────
  // Force inline for 'none' regardless of what the user might pass.
  if (result.type === 'none') {
    if (result.mode && result.mode !== 'inline') {
      log.warn(`Mode "${result.mode}" is not available with proxy type "none" — forcing inline.`);
    }
    result.mode = 'inline';
  }

  if (!result.mode) {
    const modeChoices = MODE_CHOICES_FOR[result.type] || PROXY_MODE_CHOICES;

    if (opts.yes || modeChoices.length === 1) {
      result.mode = modeChoices[0].value;
      log.detail(`Traffic mode: ${result.mode}  (default)`);
    } else {
      const answers = await prompt.ask([
        {
          type:    'select',
          name:    'mode',
          message: 'Which traffic mode?',
          choices: modeChoices,
        },
      ]);
      result.mode = answers.mode;
    }
  }

  return result;
}

// ── Summary printer ───────────────────────────────────────────────────────────

function printSummary(type, mode, backendOk, adminPort) {
  log.br();
  log.success('Proxy adapter configured');
  log.br();

  const row = (label, value) => {
    const pad = 14;
    log.detail(`${label.padEnd(pad)}${value}`);
  };

  row('Type:', PROXY_TYPE_CHOICES.find(c => c.value === type)?.name || type);
  row('Mode:', PROXY_MODE_CHOICES.find(c => c.value === mode)?.name?.split('—')[0].trim() || mode);

  if (backendOk) {
    row('Backend:', `✔  synced  (http://127.0.0.1:${adminPort})`);
  } else {
    row('Backend:', '⚠  not reached — run `flexgate configure` again once the proxy is started');
  }

  log.br();
  log.detail('Next steps:');
  log.detail('  flexgate start          start the proxy with this config');
  log.detail('  flexgate configure      re-run this wizard at any time');
  log.br();
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number}  opts.adminPort
 * @param {boolean} opts.yes
 * @param {string}  [opts.type]
 * @param {string}  [opts.mode]
 * @param {boolean} [opts.json]
 */
async function action(opts) {
  const adminPort = opts.adminPort ?? parseInt(process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);

  // ── Validate any pre-filled flags ────────────────────────────────────────
  if (opts.type) {
    try   { validateType(opts.type); }
    catch (e) { log.error(e.message); process.exit(1); }
  }
  if (opts.mode) {
    try   { validateMode(opts.mode, opts.type ?? ''); }
    catch (e) { log.error(e.message); process.exit(1); }
  }

  // ── Show existing config from backend ────────────────────────────────────
  if (!opts.yes && !opts.json) {
    const existing = await settingsApi.getProxyAdapter({ adminPort }).catch(() => null);
    if (existing?.ok && existing.data) {
      const { proxy_adapter_type, proxy_adapter_mode } = existing.data;
      log.info('Current proxy adapter config (from backend):');
      log.detail(`  Type: ${proxy_adapter_type}   Mode: ${proxy_adapter_mode}`);
      log.br();
    }
  }

  // ── Banner (only when interactive) ──────────────────────────────────────
  if (!opts.json && !opts.yes) {
    log.br();
    log.info('Configure your proxy adapter');
    log.detail('Use arrow keys to select, Enter to confirm.');
    log.br();
  }

  // ── Prompt ────────────────────────────────────────────────────────────────
  let type, mode;
  try {
    ({ type, mode } = await resolveAnswers(opts));
  } catch (err) {
    // User hit Ctrl+C inside inquirer — exit cleanly.
    if (err.name === 'ExitPromptError' || err.message?.includes('cancelled')) {
      log.br();
      log.warn('Configuration cancelled.');
      process.exit(0);
    }
    throw err;
  }

  // ── Final validation ─────────────────────────────────────────────────────
  try {
    validateType(type);
    validateMode(mode, type);
  } catch (e) {
    log.error(e.message);
    process.exit(1);
  }

  // ── Persist to backend (single source of truth) ───────────────────────────
  const saveResult = await settingsApi.setProxyAdapter(type, mode, { adminPort });
  const backendOk  = saveResult.ok;

  if (!backendOk) {
    log.verbose(`Backend error: ${saveResult.error} (code: ${saveResult.code})`);
  }

  // ── Save connection prefs locally (port/host only — not state) ────────────
  configStore.saveConnection({ port: adminPort });

  // ── Output ────────────────────────────────────────────────────────────────
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      type,
      mode,
      backend: backendOk,
    }, null, 2) + '\n');
    return;
  }

  printSummary(type, mode, backendOk, adminPort);
}

// ── Commander registration ────────────────────────────────────────────────────

/**
 * Attach `flexgate configure` to a commander Program.
 * @param {import('commander').Command} program
 */
function register(program) {
  program
    .command('configure')
    .alias('config')
    .description('Interactively configure the proxy adapter type and traffic mode')
    .option('-a, --admin-port <n>',  'Admin API port', '9090')
    .option('--type <type>',         'Proxy type: nginx|haproxy|none')
    .option('--mode <mode>',         'Traffic mode: inline|mirror|selective')
    .option('--yes',                 'Accept defaults / non-interactive mode')
    .option('--json',                'Output result as JSON')
    .action((opts) => {
      opts.adminPort = parseInt(opts.adminPort, 10);

      action(opts).catch((err) => {
        log.error(`configure: ${err.message}`);
        if (process.env.DEBUG) console.error(err);
        process.exit(1);
      });
    });
}

module.exports = { action, register, PROXY_TYPE_CHOICES, PROXY_MODE_CHOICES };
