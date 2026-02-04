#!/usr/bin/env node

/**
 * FlexGate CLI
 * Command-line interface for FlexGate Proxy
 */

const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const commands = {
  start: 'Start the FlexGate proxy server',
  init: 'Generate a default configuration file',
  migrate: 'Run database migrations',
  status: 'Check the status of FlexGate',
  docs: 'Open documentation',
  help: 'Show this help message',
  version: 'Show version information'
};

function showHelp() {
  console.log('');
  console.log(colors.cyan + colors.bright + '🚀 FlexGate Proxy CLI' + colors.reset);
  console.log('');
  console.log(colors.bright + 'Usage:' + colors.reset);
  console.log('  flexgate <command> [options]');
  console.log('');
  console.log(colors.bright + 'Commands:' + colors.reset);
  console.log('');
  
  Object.entries(commands).forEach(([cmd, desc]) => {
    console.log(`  ${colors.green}${cmd.padEnd(15)}${colors.reset} ${desc}`);
  });
  
  console.log('');
  console.log(colors.bright + 'Options:' + colors.reset);
  console.log('');
  console.log(`  ${colors.green}--config, -c${colors.reset}    Path to configuration file`);
  console.log(`  ${colors.green}--port, -p${colors.reset}      Port to run on (default: 8080)`);
  console.log(`  ${colors.green}--host, -h${colors.reset}      Host to bind to (default: 0.0.0.0)`);
  console.log(`  ${colors.green}--help${colors.reset}          Show help`);
  console.log(`  ${colors.green}--version, -v${colors.reset}   Show version`);
  console.log('');
  console.log(colors.bright + 'Examples:' + colors.reset);
  console.log('');
  console.log(`  ${colors.cyan}flexgate start${colors.reset}                    Start with default config`);
  console.log(`  ${colors.cyan}flexgate start --port 3000${colors.reset}        Start on port 3000`);
  console.log(`  ${colors.cyan}flexgate start -c config.yml${colors.reset}      Start with custom config`);
  console.log(`  ${colors.cyan}flexgate init${colors.reset}                     Generate config file`);
  console.log(`  ${colors.cyan}flexgate migrate${colors.reset}                  Run database migrations`);
  console.log('');
}

function showVersion() {
  const packageJson = require('../../package.json');
  console.log('');
  console.log(`${colors.bright}FlexGate Proxy${colors.reset} v${packageJson.version}`);
  console.log('');
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log('');
}

async function initConfig() {
  const configPath = path.join(process.cwd(), 'flexgate.config.yml');
  
  if (fs.existsSync(configPath)) {
    console.log('');
    console.log(colors.yellow + '⚠️  Configuration file already exists: flexgate.config.yml' + colors.reset);
    console.log('');
    console.log('To overwrite, delete the existing file and run this command again.');
    console.log('');
    return;
  }
  
  const defaultConfig = `# FlexGate Proxy Configuration
# Generated on ${new Date().toISOString()}

server:
  port: 8080
  host: '0.0.0.0'
  # Environment: development | production
  env: development

# Upstream services to proxy
upstreams:
  - id: example-api
    name: Example API
    target: http://localhost:3000
    routes:
      - /api
    healthCheck:
      enabled: true
      path: /health
      interval: 30000  # 30 seconds
      timeout: 5000    # 5 seconds
      unhealthyThreshold: 3
    circuitBreaker:
      enabled: true
      threshold: 50       # 50% error rate
      timeout: 30000      # 30 seconds
      resetTimeout: 10000 # 10 seconds

# Rate limiting configuration
rateLimiting:
  enabled: true
  windowMs: 60000  # 1 minute
  max: 100         # 100 requests per window
  message: 'Too many requests, please try again later'
  
  # Per-route overrides (optional)
  routes:
    '/api/heavy': { max: 10 }
    '/api/light': { max: 1000 }

# Circuit breaker (global)
circuitBreaker:
  enabled: true
  threshold: 50        # Open circuit at 50% error rate
  timeout: 30000       # Half-open after 30 seconds
  resetTimeout: 10000  # Close after 10 seconds of success

# Database configuration
database:
  enabled: true
  # PostgreSQL connection string
  url: postgresql://flexgate:flexgate@localhost:5432/flexgate
  # Or use SQLite for development
  # type: sqlite
  # filename: ./flexgate.db

# Monitoring and observability
monitoring:
  enabled: true
  prometheusPort: 9090
  
# Logging
logging:
  level: info  # error | warn | info | debug
  format: json # json | simple
  
# Admin UI
adminUI:
  enabled: true
  path: /admin

# Webhooks
webhooks:
  enabled: false
  # endpoints:
  #   - id: slack-alerts
  #     url: https://hooks.slack.com/services/XXX
  #     events: [upstream:health:failed, circuit_breaker:opened]

# CORS
cors:
  enabled: true
  origin: '*'
  methods: [GET, POST, PUT, DELETE, PATCH, OPTIONS]
  credentials: true

# Redis (for rate limiting)
redis:
  enabled: false
  url: redis://localhost:6379
  
# NATS (for event streaming)
nats:
  enabled: false
  url: nats://localhost:4222
`;

  try {
    fs.writeFileSync(configPath, defaultConfig, 'utf8');
    console.log('');
    console.log(colors.green + '✅ Configuration file created: flexgate.config.yml' + colors.reset);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Edit ${colors.cyan}flexgate.config.yml${colors.reset} to match your setup`);
    console.log(`  2. Run ${colors.cyan}flexgate start${colors.reset} to start the gateway`);
    console.log('');
  } catch (error) {
    console.error(colors.red + '❌ Error creating configuration file:' + colors.reset, error.message);
    process.exit(1);
  }
}

async function startServer(options = {}) {
  console.log('');
  console.log(colors.cyan + '🚀 Starting FlexGate Proxy...' + colors.reset);
  console.log('');
  
  try {
    // Set environment variables from options
    if (options.port) process.env.PORT = options.port;
    if (options.host) process.env.HOST = options.host;
    if (options.config) process.env.CONFIG_PATH = path.resolve(options.config);
    
    // Import and start the server
    const appPath = path.join(__dirname, '../../dist/bin/www.js');
    
    if (!fs.existsSync(appPath)) {
      throw new Error('FlexGate binary not found. Make sure the package is properly installed.');
    }
    
    require(appPath);
  } catch (error) {
    console.error(colors.red + '❌ Failed to start FlexGate:' + colors.reset);
    console.error(error.message);
    console.log('');
    console.log('Try:');
    console.log(`  ${colors.cyan}npm install flexgate-proxy${colors.reset} - Reinstall the package`);
    console.log(`  ${colors.cyan}flexgate help${colors.reset} - View help`);
    console.log('');
    process.exit(1);
  }
}

async function runMigrations() {
  console.log('');
  console.log(colors.cyan + '📦 Running database migrations...' + colors.reset);
  console.log('');
  
  try {
    const migratePath = path.join(__dirname, '../../dist/migrations/run.js');
    
    if (!fs.existsSync(migratePath)) {
      throw new Error('Migration files not found.');
    }
    
    require(migratePath);
    
    console.log('');
    console.log(colors.green + '✅ Migrations completed successfully' + colors.reset);
    console.log('');
  } catch (error) {
    console.error(colors.red + '❌ Migration failed:' + colors.reset, error.message);
    process.exit(1);
  }
}

async function checkStatus() {
  console.log('');
  console.log(colors.cyan + '🔍 Checking FlexGate status...' + colors.reset);
  console.log('');
  
  // Try to connect to default port
  const http = require('http');
  const port = process.env.PORT || 8080;
  
  const req = http.get(`http://localhost:${port}/health`, (res) => {
    if (res.statusCode === 200) {
      console.log(colors.green + `✅ FlexGate is running on port ${port}` + colors.reset);
      console.log('');
      console.log(`Admin UI: ${colors.cyan}http://localhost:${port}/admin${colors.reset}`);
      console.log(`Metrics: ${colors.cyan}http://localhost:${port}/metrics${colors.reset}`);
      console.log('');
    } else {
      console.log(colors.yellow + `⚠️  FlexGate responded with status ${res.statusCode}` + colors.reset);
      console.log('');
    }
  });
  
  req.on('error', () => {
    console.log(colors.red + `❌ FlexGate is not running on port ${port}` + colors.reset);
    console.log('');
    console.log(`Start it with: ${colors.cyan}flexgate start${colors.reset}`);
    console.log('');
  });
}

function openDocs() {
  console.log('');
  console.log(colors.cyan + '📖 Opening documentation...' + colors.reset);
  console.log('');
  console.log('Documentation: ' + colors.blue + 'https://github.com/tapas100/flexgate-proxy' + colors.reset);
  console.log('');
  
  // Try to open in browser
  const { exec } = require('child_process');
  const url = 'https://github.com/tapas100/flexgate-proxy';
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  
  exec(`${command} ${url}`, (error) => {
    if (error) {
      console.log('Could not open browser automatically. Please visit the URL above.');
    }
  });
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  let command = 'help';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      const value = args[i + 1];
      
      if (key === 'config' || key === 'c') {
        options.config = value;
        i++;
      } else if (key === 'port' || key === 'p') {
        options.port = value;
        i++;
      } else if (key === 'host' || key === 'h') {
        options.host = value;
        i++;
      } else if (key === 'help') {
        command = 'help';
      } else if (key === 'version' || key === 'v') {
        command = 'version';
      }
    } else {
      command = arg;
    }
  }
  
  return { command, options };
}

// Main CLI handler
async function main() {
  const { command, options } = parseArgs();
  
  switch (command) {
    case 'start':
      await startServer(options);
      break;
    case 'init':
      await initConfig();
      break;
    case 'migrate':
      await runMigrations();
      break;
    case 'status':
      await checkStatus();
      break;
    case 'docs':
      openDocs();
      break;
    case 'version':
      showVersion();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

// Run CLI
if (require.main === module) {
  main().catch((error) => {
    console.error(colors.red + '❌ Error:' + colors.reset, error.message);
    process.exit(1);
  });
}

module.exports = { main, parseArgs };
