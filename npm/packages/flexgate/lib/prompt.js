'use strict';
/**
 * lib/prompt.js
 *
 * Thin, testable wrapper around `@inquirer/prompts` (ESM v8).
 *
 * Why not require() directly?
 * ───────────────────────────
 * `@inquirer/prompts` is pure ESM (package.json "type":"module").  This
 * package is CommonJS, so we consume it via dynamic import() — the same
 * pattern used for the `open` package in browser.js.
 *
 * Public API
 * ──────────
 *   ask(questions)   → Promise<object>   answers keyed by question.name
 *   confirm(message) → Promise<boolean>
 *
 * Each question object shape
 * ──────────────────────────
 *   { type: 'select'|'input'|'confirm', name, message, choices?, default? }
 *
 *   'select'  → renders an arrow-key list (uses inquirer `select`)
 *   'input'   → free-text input           (uses inquirer `input`)
 *   'confirm' → yes/no                    (uses inquirer `confirm`)
 *
 * Fallback (no TTY / CI)
 * ──────────────────────
 * When stdout is not a TTY (piped output, CI) `ask()` automatically falls back
 * to default values so scripts that call `flexgate configure --yes` or pipe
 * output to a file don't hang waiting for keyboard input.
 *
 * Override in tests
 * ─────────────────
 * Call setAnswerProvider(fn) to inject a custom answer function.  Reset with
 * resetAnswerProvider().  The fn receives the question object and must return
 * the answer value (synchronously or as a Promise).
 */

const log = require('./logger');

// ── Answer provider (seam for tests) ─────────────────────────────────────────

/** @type {((q: object) => any)|null} */
let _answerProvider = null;

function setAnswerProvider(fn)  { _answerProvider = fn; }
function resetAnswerProvider()  { _answerProvider = null; }

// ── ESM loader ────────────────────────────────────────────────────────────────

let _promptsPromise = null;

/**
 * Lazily load @inquirer/prompts.
 * Returns { select, input, confirm } or null if the package is unavailable.
 */
function loadPrompts() {
  if (!_promptsPromise) {
    _promptsPromise = import('@inquirer/prompts')
      .catch((err) => {
        if (process.env.DEBUG) {
          process.stderr.write(
            `[prompt] @inquirer/prompts unavailable: ${err.message} — using fallback\n`,
          );
        }
        return null;
      });
  }
  return _promptsPromise;
}

// ── Non-TTY fallback ──────────────────────────────────────────────────────────

/**
 * Resolve a question to its default value in a non-interactive context.
 * For 'select', returns the value of the first choice.
 *
 * @param {object} q
 * @returns {*}
 */
function resolveDefault(q) {
  if (q.default !== undefined) return q.default;
  if (q.type === 'select' && Array.isArray(q.choices) && q.choices.length > 0) {
    const first = q.choices[0];
    return typeof first === 'object' ? first.value : first;
  }
  if (q.type === 'confirm') return true;
  return '';
}

// ── Core ask() ────────────────────────────────────────────────────────────────

/**
 * Ask a list of questions interactively and return an answers object.
 *
 * @param {Array<{
 *   type:    'select'|'input'|'confirm',
 *   name:    string,
 *   message: string,
 *   choices?: Array<string|{name:string, value:string}>,
 *   default?: any,
 * }>} questions
 * @returns {Promise<Record<string, any>>}
 */
async function ask(questions) {
  const answers = {};

  for (const q of questions) {
    // ── Injected test provider ─────────────────────────────────────────────
    if (_answerProvider) {
      answers[q.name] = await _answerProvider(q);
      continue;
    }

    // ── Non-TTY / CI fallback ──────────────────────────────────────────────
    if (!process.stdout.isTTY) {
      const val = resolveDefault(q);
      log.detail(`${q.message}  [non-interactive: ${String(val)}]`);
      answers[q.name] = val;
      continue;
    }

    // ── Interactive inquirer ───────────────────────────────────────────────
    const mod = await loadPrompts();

    if (!mod) {
      // Package not installed — degrade gracefully to default.
      const val = resolveDefault(q);
      log.warn(`@inquirer/prompts not installed — using default for "${q.name}": ${String(val)}`);
      log.detail('Install with:  npm install @inquirer/prompts');
      answers[q.name] = val;
      continue;
    }

    const { select, input, confirm } = mod;

    switch (q.type) {
      case 'select':
        answers[q.name] = await select({
          message: q.message,
          choices: (q.choices || []).map((c) =>
            typeof c === 'string' ? { name: c, value: c } : c,
          ),
          default: q.default,
        });
        break;

      case 'confirm':
        answers[q.name] = await confirm({
          message: q.message,
          default: q.default !== undefined ? !!q.default : true,
        });
        break;

      case 'input':
      default:
        answers[q.name] = await input({
          message: q.message,
          default: q.default !== undefined ? String(q.default) : undefined,
        });
        break;
    }
  }

  return answers;
}

/**
 * Single yes/no convenience wrapper.
 *
 * @param {string}  message
 * @param {boolean} [defaultValue=true]
 * @returns {Promise<boolean>}
 */
async function confirm(message, defaultValue = true) {
  const result = await ask([{ type: 'confirm', name: '_', message, default: defaultValue }]);
  return result._;
}

module.exports = { ask, confirm, setAnswerProvider, resetAnswerProvider };
