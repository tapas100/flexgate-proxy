#!/usr/bin/env node

/**
 * FlexGate CLI - Configure FlexGate from command line
 * Usage: flexgate <command> [options]
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// Configuration file paths
const CONFIG_DIR = process.env.FLEXGATE_CONFIG_DIR || path.join(process.cwd(), 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'flexgate.json');
const ENV_FILE = path.join(process.cwd(), '.env');

// Default configuration
const DEFAULT_CONFIG = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    environment: 'production',
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'flexgate',
    user: 'flexgate',
    password: 'flexgate',
    ssl: false,
    poolMin: 2,
    poolMax: 10,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
  },
  security: {
    corsOrigins: ['http://localhost:3001'],
    corsEnabled: true,
    rateLimitEnabled: true,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 100,
  },
  logging: {
    level: 'info',
    format: 'json',
    destination: 'file',
    maxFiles: 10,
    maxSize: '10m',
  },
  monitoring: {
    metricsEnabled: true,
    prometheusPort: 9090,
    healthCheckInterval: 30000,
  },
};

// Load configuration from file
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

// Save configuration to file
async function saveConfig(config) {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(chalk.green('✅ Configuration saved to:'), CONFIG_FILE);
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Failed to save configuration:'), error.message);
    return false;
  }
}

// Generate .env file from configuration
async function generateEnvFile(config) {
  const envContent = `# FlexGate Environment Configuration
# Generated on ${new Date().toISOString()}

# Server
NODE_ENV=${config.server.environment}
PORT=${config.server.port}
HOST=${config.server.host}

# Database
DATABASE_URL=postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.name}
DB_POOL_MIN=${config.database.poolMin}
DB_POOL_MAX=${config.database.poolMax}
DB_SSL=${config.database.ssl}

# Redis
REDIS_URL=redis://${config.redis.password ? `:${config.redis.password}@` : ''}${config.redis.host}:${config.redis.port}/${config.redis.db}

# Security
CORS_ORIGIN=${config.security.corsOrigins.join(',')}
CORS_ENABLED=${config.security.corsEnabled}
RATE_LIMIT_ENABLED=${config.security.rateLimitEnabled}
RATE_LIMIT_WINDOW_MS=${config.security.rateLimitWindowMs}
RATE_LIMIT_MAX_REQUESTS=${config.security.rateLimitMaxRequests}

# Logging
LOG_LEVEL=${config.logging.level}
LOG_FORMAT=${config.logging.format}
LOG_DESTINATION=${config.logging.destination}
LOG_MAX_FILES=${config.logging.maxFiles}
LOG_MAX_SIZE=${config.logging.maxSize}

# Monitoring
METRICS_ENABLED=${config.monitoring.metricsEnabled}
PROMETHEUS_PORT=${config.monitoring.prometheusPort}
HEALTH_CHECK_INTERVAL=${config.monitoring.healthCheckInterval}
`;

  try {
    await fs.writeFile(ENV_FILE, envContent);
    console.log(chalk.green('✅ Environment file generated:'), ENV_FILE);
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Failed to generate .env file:'), error.message);
    return false;
  }
}

// Display configuration
function displayConfig(config) {
  console.log(chalk.blue('\n📋 Current Configuration:\n'));
  console.log(chalk.yellow('Server:'));
  console.log(`  Port: ${config.server.port}`);
  console.log(`  Host: ${config.server.host}`);
  console.log(`  Environment: ${config.server.environment}`);
  
  console.log(chalk.yellow('\nDatabase:'));
  console.log(`  Host: ${config.database.host}:${config.database.port}`);
  console.log(`  Name: ${config.database.name}`);
  console.log(`  User: ${config.database.user}`);
  console.log(`  SSL: ${config.database.ssl}`);
  
  console.log(chalk.yellow('\nRedis:'));
  console.log(`  Host: ${config.redis.host}:${config.redis.port}`);
  console.log(`  Database: ${config.redis.db}`);
  
  console.log(chalk.yellow('\nSecurity:'));
  console.log(`  CORS Enabled: ${config.security.corsEnabled}`);
  console.log(`  Rate Limiting: ${config.security.rateLimitEnabled}`);
  
  console.log(chalk.yellow('\nLogging:'));
  console.log(`  Level: ${config.logging.level}`);
  console.log(`  Format: ${config.logging.format}`);
  
  console.log(chalk.yellow('\nMonitoring:'));
  console.log(`  Metrics: ${config.monitoring.metricsEnabled}`);
  console.log(`  Prometheus Port: ${config.monitoring.prometheusPort}\n`);
}

// Initialize command
program
  .command('init')
  .description('Initialize FlexGate configuration')
  .option('-i, --interactive', 'Interactive configuration wizard')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    console.log(chalk.blue('🚀 FlexGate Configuration Wizard\n'));

    // Check if config exists
    try {
      await fs.access(CONFIG_FILE);
      if (!options.force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Configuration file already exists. Overwrite?',
            default: false,
          },
        ]);
        if (!overwrite) {
          console.log(chalk.yellow('ℹ️  Configuration initialization cancelled'));
          return;
        }
      }
    } catch {
      // File doesn't exist, continue
    }

    let config = { ...DEFAULT_CONFIG };

    if (options.interactive) {
      // Interactive wizard
      const answers = await inquirer.prompt([
        {
          type: 'number',
          name: 'serverPort',
          message: 'Server port:',
          default: 3000,
        },
        {
          type: 'list',
          name: 'environment',
          message: 'Environment:',
          choices: ['development', 'production', 'staging'],
          default: 'production',
        },
        {
          type: 'input',
          name: 'dbHost',
          message: 'Database host:',
          default: 'localhost',
        },
        {
          type: 'number',
          name: 'dbPort',
          message: 'Database port:',
          default: 5432,
        },
        {
          type: 'input',
          name: 'dbName',
          message: 'Database name:',
          default: 'flexgate',
        },
        {
          type: 'input',
          name: 'dbUser',
          message: 'Database user:',
          default: 'flexgate',
        },
        {
          type: 'password',
          name: 'dbPassword',
          message: 'Database password:',
          default: 'flexgate',
        },
        {
          type: 'input',
          name: 'redisHost',
          message: 'Redis host:',
          default: 'localhost',
        },
        {
          type: 'number',
          name: 'redisPort',
          message: 'Redis port:',
          default: 6379,
        },
        {
          type: 'confirm',
          name: 'enableMetrics',
          message: 'Enable Prometheus metrics?',
          default: true,
        },
      ]);

      // Update config with answers
      config.server.port = answers.serverPort;
      config.server.environment = answers.environment;
      config.database.host = answers.dbHost;
      config.database.port = answers.dbPort;
      config.database.name = answers.dbName;
      config.database.user = answers.dbUser;
      config.database.password = answers.dbPassword;
      config.redis.host = answers.redisHost;
      config.redis.port = answers.redisPort;
      config.monitoring.metricsEnabled = answers.enableMetrics;
    }

    // Save configuration
    await saveConfig(config);
    await generateEnvFile(config);

    console.log(chalk.green('\n✅ FlexGate initialized successfully!'));
    console.log(chalk.blue('\nNext steps:'));
    console.log('  1. Review configuration: flexgate config show');
    console.log('  2. Start database: npm run db:start');
    console.log('  3. Run migrations: npm run db:migrate');
    console.log('  4. Start FlexGate: npm start\n');
  });

// Config command group
const configCmd = program.command('config').description('Manage FlexGate configuration');

// Show configuration
configCmd
  .command('show')
  .description('Display current configuration')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const config = await loadConfig();
    
    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      displayConfig(config);
    }
  });

// Set configuration value
configCmd
  .command('set <key> <value>')
  .description('Set a configuration value (e.g., server.port 8080)')
  .action(async (key, value) => {
    const config = await loadConfig();
    
    // Parse key path (e.g., "server.port")
    const keys = key.split('.');
    let current = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    // Parse value (convert to appropriate type)
    let parsedValue = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(value)) parsedValue = Number(value);
    
    current[keys[keys.length - 1]] = parsedValue;
    
    await saveConfig(config);
    await generateEnvFile(config);
    
    console.log(chalk.green(`✅ Set ${key} = ${parsedValue}`));
  });

// Get configuration value
configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action(async (key) => {
    const config = await loadConfig();
    
    const keys = key.split('.');
    let value = config;
    
    for (const k of keys) {
      value = value[k];
      if (value === undefined) {
        console.log(chalk.red(`❌ Key not found: ${key}`));
        return;
      }
    }
    
    console.log(value);
  });

// Import configuration from JSON
configCmd
  .command('import <file>')
  .description('Import configuration from JSON file')
  .action(async (file) => {
    try {
      const data = await fs.readFile(file, 'utf-8');
      const config = JSON.parse(data);
      
      await saveConfig(config);
      await generateEnvFile(config);
      
      console.log(chalk.green(`✅ Configuration imported from ${file}`));
      displayConfig(config);
    } catch (error) {
      console.error(chalk.red('❌ Failed to import configuration:'), error.message);
    }
  });

// Export configuration to JSON
configCmd
  .command('export <file>')
  .description('Export configuration to JSON file')
  .action(async (file) => {
    try {
      const config = await loadConfig();
      await fs.writeFile(file, JSON.stringify(config, null, 2));
      console.log(chalk.green(`✅ Configuration exported to ${file}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to export configuration:'), error.message);
    }
  });

// Reset to defaults
configCmd
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-f, --force', 'Skip confirmation')
  .action(async (options) => {
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Reset configuration to defaults?',
          default: false,
        },
      ]);
      if (!confirm) {
        console.log(chalk.yellow('ℹ️  Reset cancelled'));
        return;
      }
    }
    
    await saveConfig(DEFAULT_CONFIG);
    await generateEnvFile(DEFAULT_CONFIG);
    console.log(chalk.green('✅ Configuration reset to defaults'));
  });

// Database commands
const dbCmd = program.command('db').description('Database management');

dbCmd
  .command('test')
  .description('Test database connection')
  .action(async () => {
    const config = await loadConfig();
    console.log(chalk.blue('🔍 Testing database connection...'));
    
    try {
      const { default: pg } = await import('pg');
      const client = new pg.Client({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
      });
      
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      
      console.log(chalk.green('✅ Database connection successful'));
    } catch (error) {
      console.error(chalk.red('❌ Database connection failed:'), error.message);
    }
  });

// Redis commands
const redisCmd = program.command('redis').description('Redis management');

redisCmd
  .command('test')
  .description('Test Redis connection')
  .action(async () => {
    const config = await loadConfig();
    console.log(chalk.blue('🔍 Testing Redis connection...'));
    
    try {
      const { createClient } = await import('redis');
      const client = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
        },
        password: config.redis.password || undefined,
        database: config.redis.db,
      });
      
      await client.connect();
      await client.ping();
      await client.quit();
      
      console.log(chalk.green('✅ Redis connection successful'));
    } catch (error) {
      console.error(chalk.red('❌ Redis connection failed:'), error.message);
    }
  });

// Health check command
program
  .command('health')
  .description('Check FlexGate health')
  .action(async () => {
    const config = await loadConfig();
    console.log(chalk.blue('🏥 Running health checks...\n'));
    
    // Check API
    try {
      const response = await fetch(`http://localhost:${config.server.port}/health`);
      if (response.ok) {
        console.log(chalk.green('✅ FlexGate API: healthy'));
      } else {
        console.log(chalk.red('❌ FlexGate API: unhealthy'));
      }
    } catch (error) {
      console.log(chalk.red('❌ FlexGate API: not responding'));
    }
    
    // Check database
    try {
      const { default: pg } = await import('pg');
      const client = new pg.Client({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
      });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(chalk.green('✅ PostgreSQL: healthy'));
    } catch (error) {
      console.log(chalk.red('❌ PostgreSQL: unhealthy'));
    }
    
    // Check Redis
    try {
      const { createClient } = await import('redis');
      const client = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
        },
        password: config.redis.password || undefined,
      });
      await client.connect();
      await client.ping();
      await client.quit();
      console.log(chalk.green('✅ Redis: healthy'));
    } catch (error) {
      console.log(chalk.red('❌ Redis: unhealthy'));
    }
    
    console.log('');
  });

// Version
program.version('0.1.0-beta.1', '-v, --version', 'Output the current version');

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
