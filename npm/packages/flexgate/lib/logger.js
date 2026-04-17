'use strict';
/**
 * logger.js
 *
 * Minimal pretty-printer for CLI output.
 * No third-party deps — only ANSI escape codes + process.stdout/stderr.
 *
 * Usage:
 *   const log = require('./logger');
 *   log.info('Server started');
 *   log.success('Setup complete');
 *   log.warn('No binary found, using PATH');
 *   log.error('Connection refused');
 *   log.step(1, 3, 'Detecting setup state…');
 *   log.banner();
 */

const IS_TTY    = process.stdout.isTTY;
const NO_COLOR  = process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb';
const USE_COLOR = IS_TTY && !NO_COLOR;

// Verbose mode: enabled by DEBUG=1 or FLEXGATE_VERBOSE=1
const IS_VERBOSE = process.env.DEBUG === '1' || process.env.DEBUG === 'true'
  || process.env.FLEXGATE_VERBOSE === '1' || process.env.FLEXGATE_VERBOSE === 'true';

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const c = {
  reset:   USE_COLOR ? '\x1b[0m'  : '',
  bold:    USE_COLOR ? '\x1b[1m'  : '',
  dim:     USE_COLOR ? '\x1b[2m'  : '',
  cyan:    USE_COLOR ? '\x1b[36m' : '',
  green:   USE_COLOR ? '\x1b[32m' : '',
  yellow:  USE_COLOR ? '\x1b[33m' : '',
  red:     USE_COLOR ? '\x1b[31m' : '',
  blue:    USE_COLOR ? '\x1b[34m' : '',
  magenta: USE_COLOR ? '\x1b[35m' : '',
  white:   USE_COLOR ? '\x1b[37m' : '',
};

function fmt(color, prefix, msg) {
  return `${color}${c.bold}${prefix}${c.reset} ${msg}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

const log = {
  /**
   * Print the FlexGate banner. Called once at startup.
   */
  banner() {
    const line = `${c.cyan}${c.bold}`;
    process.stdout.write(`\n`);
    process.stdout.write(`${line}  ███████╗██╗     ███████╗██╗  ██╗ ██████╗  █████╗ ████████╗███████╗${c.reset}\n`);
    process.stdout.write(`${line}  ██╔════╝██║     ██╔════╝╚██╗██╔╝██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝${c.reset}\n`);
    process.stdout.write(`${line}  █████╗  ██║     █████╗   ╚███╔╝ ██║  ███╗███████║   ██║   █████╗  ${c.reset}\n`);
    process.stdout.write(`${line}  ██╔══╝  ██║     ██╔══╝   ██╔██╗ ██║   ██║██╔══██║   ██║   ██╔══╝  ${c.reset}\n`);
    process.stdout.write(`${line}  ██║     ███████╗███████╗██╔╝ ██╗╚██████╔╝██║  ██║   ██║   ███████╗${c.reset}\n`);
    process.stdout.write(`${line}  ╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝${c.reset}\n`);
    process.stdout.write(`\n`);
    process.stdout.write(`  ${c.dim}API Gateway & Reverse Proxy${c.reset}\n\n`);
  },

  info(msg) {
    process.stdout.write(fmt(c.blue,    'ℹ', msg) + '\n');
  },

  success(msg) {
    process.stdout.write(fmt(c.green,   '✔', msg) + '\n');
  },

  warn(msg) {
    process.stderr.write(fmt(c.yellow,  '⚠', msg) + '\n');
  },

  error(msg) {
    process.stderr.write(fmt(c.red,     '✖', msg) + '\n');
  },

  /** Dimmed secondary detail line. */
  detail(msg) {
    process.stdout.write(`  ${c.dim}${msg}${c.reset}\n`);
  },

  /** Progress step indicator: [1/3] message */
  step(current, total, msg) {
    const badge = `${c.cyan}[${current}/${total}]${c.reset}`;
    process.stdout.write(`${badge} ${msg}\n`);
  },

  /** Blank line */
  br() {
    process.stdout.write('\n');
  },

  /**
   * Verbose line — only printed when DEBUG=1 or FLEXGATE_VERBOSE=1.
   * Dimmed magenta so it stands out from normal detail lines but doesn't
   * compete with info/warn/error.
   */
  verbose(msg) {
    if (!IS_VERBOSE) return;
    process.stdout.write(`  ${c.magenta}${c.dim}⟩ ${msg}${c.reset}\n`);
  },

  /**
   * Dev-mode event line — used to stream proxy events (requests, reloads…)
   * in a compact format that doesn't interfere with the step progress above.
   * Only printed in verbose mode.
   *
   * @param {'req'|'res'|'err'|'reload'|'info'} type
   * @param {string} msg
   */
  event(type, msg) {
    if (!IS_VERBOSE) return;
    const icons = { req: '→', res: '←', err: '✖', reload: '↺', info: '·' };
    const colors = {
      req:    c.cyan,
      res:    c.green,
      err:    c.red,
      reload: c.yellow,
      info:   c.dim,
    };
    const icon  = icons[type]  ?? '·';
    const color = colors[type] ?? c.dim;
    process.stdout.write(`  ${color}${icon}${c.reset} ${c.dim}${msg}${c.reset}\n`);
  },

  /**
   * Dev banner — a compact coloured header printed at dev-mode startup.
   * Replaces the full ASCII-art banner when running in dev mode.
   */
  devBanner(proxyPort, adminPort, uiPort) {
    const sep  = USE_COLOR ? `${c.dim}${'─'.repeat(52)}${c.reset}` : '─'.repeat(52);
    process.stdout.write('\n');
    process.stdout.write(`${c.cyan}${c.bold}  ⚡ FlexGate${c.reset}  ${c.yellow}${c.bold}DEV MODE${c.reset}\n`);
    process.stdout.write(`  ${sep}\n`);
    process.stdout.write(`  ${c.dim}Proxy ${c.reset}  ${c.cyan}http://localhost:${proxyPort}${c.reset}\n`);
    process.stdout.write(`  ${c.dim}Admin ${c.reset}  ${c.cyan}http://localhost:${adminPort}${c.reset}\n`);
    process.stdout.write(`  ${c.dim}UI    ${c.reset}  ${c.cyan}http://localhost:${uiPort}${c.reset}\n`);
    process.stdout.write(`  ${sep}\n\n`);
  },

  /**
   * Pipe a readable stream (e.g. child.stdout / child.stderr) to the terminal
   * as verbose event lines.  Each line is tagged with the given source label.
   *
   * @param {NodeJS.ReadableStream} stream
   * @param {'stdout'|'stderr'} source
   */
  pipe(stream, source) {
    if (!stream) return;
    const isErr = source === 'stderr';
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        if (isErr) {
          // Always surface error lines regardless of verbose mode.
          if (/error|fatal|panic/i.test(line)) {
            process.stderr.write(fmt(c.red, '✖', `[proxy] ${line}`) + '\n');
          } else {
            log.verbose(`[proxy/err] ${line}`);
          }
        } else {
          log.verbose(`[proxy] ${line}`);
        }
      }
    });
    stream.on('end', () => {
      if (buf.trimEnd()) log.verbose(`[proxy] ${buf.trimEnd()}`);
    });
  },

  /** Highlighted URL — log.url(href) or log.url(label, href) */
  url(labelOrHref, href) {
    // Allow both log.url('http://…') and log.url('Admin UI', 'http://…')
    const hasLabel = href !== undefined;
    const link     = USE_COLOR ? `\x1b[4m${c.cyan}${hasLabel ? href : labelOrHref}${c.reset}` : (hasLabel ? href : labelOrHref);
    if (hasLabel) {
      process.stdout.write(`  ${c.bold}${labelOrHref}${c.reset}  ${link}\n`);
    } else {
      process.stdout.write(`  ${link}\n`);
    }
  },

  /**
   * Spinner — returns a { stop() } handle.
   * Only spins when stdout is a real TTY.
   */
  spinner(msg) {
    if (!IS_TTY) {
      process.stdout.write(`${msg}…\n`);
      return { stop: () => {}, succeed: (m) => log.success(m), fail: (m) => log.error(m) };
    }

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const id = setInterval(() => {
      process.stdout.write(`\r${c.cyan}${frames[i % frames.length]}${c.reset} ${msg} `);
      i++;
    }, 80);

    return {
      stop() { clearInterval(id); process.stdout.write('\r\x1b[2K'); },
      succeed(m) { clearInterval(id); process.stdout.write(`\r\x1b[2K`); log.success(m || msg); },
      fail(m)    { clearInterval(id); process.stdout.write(`\r\x1b[2K`); log.error(m || msg); },
    };
  },
};

module.exports = log;
module.exports.USE_COLOR  = USE_COLOR;
module.exports.IS_VERBOSE = IS_VERBOSE;
