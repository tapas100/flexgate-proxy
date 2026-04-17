'use strict';
/**
 * commands/open.js
 *
 * `flexgate open` — open the browser to a running FlexGate instance.
 *
 * Checks admin API health, determines setup state, then opens the
 * appropriate UI path (/setup or /dashboard).
 */

const http    = require('http');
const log     = require('../lib/logger');
const detect  = require('../lib/detect');
const browser = require('../lib/browser');

function quickProbe(port) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/health`,
      { timeout: 2000 },
      (res) => resolve(res.statusCode >= 200 && res.statusCode < 300),
    );
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function resolveUiBase(uiPort, proxyPort) {
  const uiUp = await quickProbe(uiPort).catch(() => false);
  return `http://localhost:${uiUp ? uiPort : proxyPort}`;
}

async function action(opts) {
  const adminPort = opts.adminPort ?? parseInt(process.env.FLEXGATE_ADMIN_PORT ?? '9090', 10);
  const proxyPort = opts.port      ?? parseInt(process.env.FLEXGATE_PROXY_PORT ?? '8080', 10);
  const uiPort    = opts.uiPort    ?? parseInt(process.env.FLEXGATE_UI_PORT    ?? '3000', 10);

  const adminUp = await quickProbe(adminPort);
  if (!adminUp) {
    log.error('FlexGate does not appear to be running (admin API unreachable).');
    log.detail('Run `flexgate start` first.');
    process.exit(1);
  }

  const detection = await detect.detectSetupState(adminPort);
  const uiPath = detection.uiPath;
  const base   = await resolveUiBase(uiPort, proxyPort);
  const url    = `${base}${uiPath}`;

  log.info(`Opening → ${url}`);
  await browser.openBrowser(url);
}

function register(program) {
  program
    .command('open')
    .description('Open browser to the running FlexGate instance')
    .option('-p, --port <n>',       'Proxy port',                  '8080')
    .option('-a, --admin-port <n>', 'Admin API port',              '9090')
    .option('-u, --ui-port <n>',    'Admin UI dev-server port',    '3000')
    .action((opts) => {
      opts.port      = parseInt(opts.port,      10);
      opts.adminPort = parseInt(opts.adminPort, 10);
      opts.uiPort    = parseInt(opts.uiPort,    10);
      action(opts).catch((err) => {
        log.error(`open: ${err.message}`);
        process.exit(1);
      });
    });
}

module.exports = { action, register };
