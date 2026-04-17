#!/usr/bin/env node
'use strict';
/**
 * bin/flexgate.js — FlexGate CLI entry point
 *
 * Built with commander.js.  Commands live in ../commands/ so each one is
 * independently testable and the main file stays small.
 *
 * Usage
 * ─────
 *   flexgate start   [options]   Start proxy (lite mode) + open browser
 *   flexgate dev     [options]   Start proxy in development mode
 *   flexgate status  [options]   Print proxy / setup health
 *   flexgate open    [options]   Open browser to running instance
 *   flexgate stop    [options]   Stop running proxy via PID file
 */

const { Command } = require('commander');
const log         = require('../lib/logger');
const PKG         = require('../package.json');

// ── Build program ─────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('flexgate')
  .description('Start, manage, and onboard your FlexGate API gateway')
  .version(
    `${PKG.version} (node ${process.version} · ${process.platform}/${process.arch})`,
    '-v, --version',
    'Print version information',
  )
  // Custom help output: print banner before built-in help text.
  .addHelpCommand('help [command]', 'Display help for a command')
  .hook('preAction', () => {
    // Nothing global needed yet — reserved for future telemetry opt-in, etc.
  });

// ── Register commands ─────────────────────────────────────────────────────────

require('../commands/start')    .register(program);
require('../commands/dev')      .register(program);
require('../commands/configure').register(program);
require('../commands/route')    .register(program);
require('../commands/status')   .register(program);
require('../commands/open')     .register(program);
require('../commands/stop')     .register(program);
require('../commands/doctor')   .register(program);

// ── Error handling ────────────────────────────────────────────────────────────

// Commander exits on unknown commands by default; catch and pretty-print.
program.on('command:*', (operands) => {
  log.error(`Unknown command: ${operands[0]}`);
  log.detail('Run `flexgate --help` to see available commands.');
  process.exit(1);
});

// ── Parse ─────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
