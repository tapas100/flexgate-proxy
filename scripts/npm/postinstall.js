#!/usr/bin/env node

/**
 * Post-install script for FlexGate Proxy
 * Runs after npm install to welcome users and provide setup guidance
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

function printBanner() {
  console.log('');
  console.log(colors.cyan + '╔══════════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.cyan + '║                                                                  ║' + colors.reset);
  console.log(colors.cyan + '║' + colors.bright + '  🚀 FlexGate Proxy - Successfully Installed! 🚀                 ' + colors.reset + colors.cyan + '║' + colors.reset);
  console.log(colors.cyan + '║                                                                  ║' + colors.reset);
  console.log(colors.cyan + '╚══════════════════════════════════════════════════════════════════╝' + colors.reset);
  console.log('');
}

function printQuickStart() {
  console.log(colors.bright + '⚡ Quick Start:' + colors.reset);
  console.log('');
  console.log(colors.green + '  # Start with default configuration' + colors.reset);
  console.log('  npx flexgate start');
  console.log('');
  console.log(colors.green + '  # Generate config file' + colors.reset);
  console.log('  npx flexgate init');
  console.log('');
  console.log(colors.green + '  # Start with custom config' + colors.reset);
  console.log('  npx flexgate start --config flexgate.config.yml');
  console.log('');
}

function printFeatures() {
  console.log(colors.bright + '✨ What You Get:' + colors.reset);
  console.log('');
  console.log('  ✅ Reverse Proxy & Load Balancing');
  console.log('  ✅ Rate Limiting & Circuit Breaker');
  console.log('  ✅ Health Checks & Auto-failover');
  console.log('  ✅ Prometheus Metrics & Observability');
  console.log('  ✅ Request/Response Logging');
  console.log('  ✅ Admin UI Dashboard');
  console.log('  ✅ Webhook Events');
  console.log('  ✅ Database Persistence');
  console.log('');
}

function printProgrammaticUsage() {
  console.log(colors.bright + '💻 Programmatic Usage:' + colors.reset);
  console.log('');
  console.log(colors.blue + '  import { FlexGate } from \'flexgate-proxy\';' + colors.reset);
  console.log('  ');
  console.log('  const gateway = new FlexGate({');
  console.log('    port: 8080,');
  console.log('    upstreams: [{');
  console.log('      id: \'my-api\',');
  console.log('      target: \'http://localhost:3000\',');
  console.log('      routes: [\'/api\']');
  console.log('    }]');
  console.log('  });');
  console.log('  ');
  console.log('  await gateway.start();');
  console.log('');
}

function printNextSteps() {
  console.log(colors.bright + '📚 Next Steps:' + colors.reset);
  console.log('');
  console.log('  1. Read the Quick Start: ' + colors.cyan + 'npx flexgate docs' + colors.reset);
  console.log('  2. Generate config: ' + colors.cyan + 'npx flexgate init' + colors.reset);
  console.log('  3. Start the gateway: ' + colors.cyan + 'npx flexgate start' + colors.reset);
  console.log('  4. View admin UI: ' + colors.cyan + 'http://localhost:8080/admin' + colors.reset);
  console.log('');
}

function printResources() {
  console.log(colors.bright + '🔗 Resources:' + colors.reset);
  console.log('');
  console.log('  📖 Documentation: ' + colors.cyan + 'https://github.com/tapas100/flexgate-proxy' + colors.reset);
  console.log('  🐛 Issues: ' + colors.cyan + 'https://github.com/tapas100/flexgate-proxy/issues' + colors.reset);
  console.log('  💬 Discussions: ' + colors.cyan + 'https://github.com/tapas100/flexgate-proxy/discussions' + colors.reset);
  console.log('  ⭐ Star us: ' + colors.cyan + 'https://github.com/tapas100/flexgate-proxy' + colors.reset);
  console.log('');
}

function printFooter() {
  console.log(colors.yellow + '───────────────────────────────────────────────────────────────────' + colors.reset);
  console.log('');
  console.log('  ' + colors.bright + 'Happy proxying! 🎉' + colors.reset);
  console.log('');
  console.log('  ' + colors.blue + 'Built with ❤️  by @tapas100' + colors.reset);
  console.log('');
}

function checkIfGlobalInstall() {
  const isGlobal = process.env.npm_config_global === 'true';
  if (isGlobal) {
    console.log(colors.green + '  ℹ️  Global installation detected. You can now run: ' + colors.cyan + 'flexgate' + colors.reset);
    console.log('');
  }
}

function main() {
  try {
    printBanner();
    checkIfGlobalInstall();
    printFeatures();
    printQuickStart();
    printProgrammaticUsage();
    printNextSteps();
    printResources();
    printFooter();
  } catch (error) {
    console.error('Post-install script error:', error.message);
    // Don't fail the installation if post-install has issues
  }
}

// Only run if executed directly (not required as module)
if (require.main === module) {
  main();
}

module.exports = { main };
