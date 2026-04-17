'use strict';
/**
 * Public API surface for the `flexgate` package.
 *
 * Consumers that `require('flexgate')` programmatically get access to the
 * same building blocks the CLI uses, so they can embed FlexGate startup
 * logic in their own scripts.
 *
 * @example
 * const { proxy, detect, browser } = require('flexgate');
 *
 * const handle = await proxy.startAndWait({ lite: true });
 * const state  = await detect.checkSetupStatus(handle.adminPort);
 * if (state !== 'complete') await browser.openBrowser('http://localhost:3000/setup');
 */

module.exports = {
  proxy:       require('./proxy'),
  detect:      require('./detect'),
  browser:     require('./browser'),
  setupApi:    require('./setup-api'),
  logger:      require('./logger'),
  prompt:      require('./prompt'),
  configStore: require('./config-store'),
  apiClient:   require('./api-client'),
  routesApi:   require('./routes-api'),
  settingsApi: require('./settings-api'),
};
