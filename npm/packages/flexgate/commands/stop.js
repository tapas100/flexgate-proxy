'use strict';
/**
 * commands/stop.js
 *
 * `flexgate stop` — send SIGTERM to the running proxy via the PID file.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const log  = require('../lib/logger');

const PID_FILE     = path.join(os.tmpdir(), 'flexgate.pid');
const PID_FILE_DEV = path.join(os.tmpdir(), 'flexgate-dev.pid');

function readPid(file) {
  try { return parseInt(fs.readFileSync(file, 'utf8'), 10); } catch { return null; }
}

function clearPid(file) {
  try { fs.unlinkSync(file); } catch { /* ignore */ }
}

function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function action(opts) {
  const dev = opts.dev ?? false;
  const file = dev ? PID_FILE_DEV : PID_FILE;
  const label = dev ? 'dev' : 'prod';

  const pid = readPid(file);
  if (!pid) {
    log.warn(`No PID file found for ${label} instance. Is FlexGate running?`);
    process.exit(1);
  }

  if (!isProcessRunning(pid)) {
    log.warn(`PID ${pid} (${label}) is not running — removing stale PID file.`);
    clearPid(file);
    process.exit(1);
  }

  try {
    process.kill(pid, 'SIGTERM');
    log.success(`Sent SIGTERM to PID ${pid} (${label})`);
    clearPid(file);
  } catch (err) {
    log.error(`Failed to stop PID ${pid}: ${err.message}`);
    process.exit(1);
  }
}

function register(program) {
  program
    .command('stop')
    .description('Stop the running FlexGate proxy (SIGTERM via PID file)')
    .option('--dev', 'Stop the dev-mode instance instead of prod')
    .action((opts) => {
      action(opts).catch((err) => {
        log.error(`stop: ${err.message}`);
        process.exit(1);
      });
    });
}

module.exports = { action, register };
