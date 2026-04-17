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

// AI helper functions
async function makeApiRequest(endpoint, method = 'GET', body = null) {
  const config = await loadConfig();
  const baseUrl = `http://localhost:${config.server.port}`;
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(chalk.red('❌ API Request failed:'), error.message);
    process.exit(1);
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatPercentage(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function displayTable(data, columns) {
  if (data.length === 0) {
    console.log(chalk.yellow('No data to display'));
    return;
  }
  
  // Calculate column widths
  const widths = {};
  columns.forEach(col => {
    widths[col.key] = Math.max(
      col.label.length,
      ...data.map(row => String(col.format ? col.format(row[col.key]) : row[col.key] || '').length)
    );
  });
  
  // Print header
  const header = columns.map(col => col.label.padEnd(widths[col.key])).join('  ');
  console.log(chalk.bold.blue(header));
  console.log('-'.repeat(header.length));
  
  // Print rows
  data.forEach(row => {
    const line = columns.map(col => {
      const value = col.format ? col.format(row[col.key]) : row[col.key] || '';
      return String(value).padEnd(widths[col.key]);
    }).join('  ');
    console.log(line);
  });
}

// AI Incident Tracking commands
const aiCmd = program.command('ai').description('AI incident tracking and analytics');

// List incidents
aiCmd
  .command('incidents')
  .alias('list')
  .description('List AI incidents')
  .option('-s, --status <status>', 'Filter by status (OPEN, INVESTIGATING, RESOLVED, FALSE_POSITIVE)')
  .option('-t, --type <type>', 'Filter by event type')
  .option('-v, --severity <severity>', 'Filter by severity (CRITICAL, WARNING, INFO)')
  .option('-l, --limit <number>', 'Limit number of results', '25')
  .option('-o, --offset <number>', 'Offset for pagination', '0')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    console.log(chalk.blue('🤖 Fetching AI incidents...\n'));
    
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.type) params.append('event_type', options.type);
    if (options.severity) params.append('severity', options.severity);
    params.append('limit', options.limit);
    params.append('offset', options.offset);
    
    const result = await makeApiRequest(`/api/ai-incidents?${params.toString()}`);
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    // Handle API response format: { data: { incidents: [...], total: X } }
    const incidents = result.data?.incidents || result.incidents || result.data || [];
    const total = result.data?.total || result.total || incidents.length;
    
    console.log(chalk.green(`📊 Total: ${total} incidents (showing ${incidents.length})\n`));
    
    displayTable(incidents, [
      { key: 'incident_id', label: 'ID', format: v => v.substring(0, 12) },
      { key: 'event_type', label: 'Event Type' },
      { key: 'severity', label: 'Severity', format: v => {
        if (v === 'CRITICAL') return chalk.red(v);
        if (v === 'WARNING') return chalk.yellow(v);
        return chalk.blue(v);
      }},
      { key: 'summary', label: 'Summary', format: v => v.substring(0, 40) },
      { key: 'status', label: 'Status', format: v => {
        if (v === 'RESOLVED') return chalk.green(v);
        if (v === 'OPEN') return chalk.red(v);
        return chalk.yellow(v);
      }},
      { key: 'detected_at', label: 'Detected', format: formatDate },
    ]);
    
    console.log('');
  });

// Show incident detail
aiCmd
  .command('show <incidentId>')
  .description('Show detailed incident information')
  .option('-j, --json', 'Output as JSON')
  .action(async (incidentId, options) => {
    console.log(chalk.blue(`🔍 Fetching incident ${incidentId}...\n`));
    
    const incident = await makeApiRequest(`/api/ai-incidents/${incidentId}`);
    
    if (options.json) {
      console.log(JSON.stringify(incident, null, 2));
      return;
    }
    
    // Display incident details
    console.log(chalk.bold.cyan('📋 INCIDENT DETAILS'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`${chalk.bold('ID:')}              ${incident.incident_id}`);
    console.log(`${chalk.bold('Event Type:')}      ${incident.event_type}`);
    console.log(`${chalk.bold('Severity:')}        ${incident.severity}`);
    console.log(`${chalk.bold('Status:')}          ${incident.status}`);
    console.log(`${chalk.bold('Summary:')}         ${incident.summary}`);
    console.log(`${chalk.bold('Detected At:')}     ${formatDate(incident.detected_at)}`);
    if (incident.resolved_at) {
      console.log(`${chalk.bold('Resolved At:')}     ${formatDate(incident.resolved_at)}`);
      console.log(`${chalk.bold('Resolution Time:')} ${formatDuration(incident.resolution_time_seconds)}`);
    }
    if (incident.user_rating) {
      console.log(`${chalk.bold('User Rating:')}     ${'⭐'.repeat(incident.user_rating)} (${incident.user_rating}/5)`);
    }
    if (incident.user_feedback) {
      console.log(`${chalk.bold('User Feedback:')}   ${incident.user_feedback}`);
    }
    
    // Display recommendations
    if (incident.recommendations && incident.recommendations.length > 0) {
      console.log(chalk.bold.cyan('\n💡 RECOMMENDATIONS'));
      console.log(chalk.gray('─'.repeat(60)));
      
      incident.recommendations.forEach((rec, idx) => {
        console.log(`\n${chalk.bold(`#${rec.recommendation_rank} - ${rec.action_type}`)}`);
        console.log(`  ${chalk.gray('Confidence:')} ${formatPercentage(rec.confidence_score)} ${chalk.gray('|')} ${chalk.gray('Risk:')} ${rec.risk_level}`);
        console.log(`  ${chalk.gray('Reasoning:')} ${rec.reasoning}`);
        if (rec.user_decision) {
          console.log(`  ${chalk.gray('Decision:')} ${rec.user_decision} ${rec.decision_reason ? `- ${rec.decision_reason}` : ''}`);
        }
      });
    }
    
    // Display outcomes
    if (incident.outcomes && incident.outcomes.length > 0) {
      console.log(chalk.bold.cyan('\n✅ OUTCOMES'));
      console.log(chalk.gray('─'.repeat(60)));
      
      incident.outcomes.forEach(outcome => {
        console.log(`\n${chalk.bold(outcome.action_type)} - ${outcome.outcome_status}`);
        console.log(`  ${chalk.gray('Executed:')} ${formatDate(outcome.executed_at)}`);
        if (outcome.improvement_percentage) {
          console.log(`  ${chalk.gray('Improvement:')} ${outcome.improvement_percentage}%`);
        }
        if (outcome.outcome_notes) {
          console.log(`  ${chalk.gray('Notes:')} ${outcome.outcome_notes}`);
        }
      });
    }
    
    console.log('');
  });

// Create incident
aiCmd
  .command('create')
  .description('Create a new incident from AI event')
  .option('-t, --type <type>', 'Event type', 'LATENCY_ANOMALY')
  .option('-s, --severity <severity>', 'Severity level', 'WARNING')
  .option('--summary <summary>', 'Incident summary')
  .option('--metrics <json>', 'Metrics as JSON string')
  .option('--context <json>', 'Context as JSON string')
  .action(async (options) => {
    console.log(chalk.blue('🚀 Creating new incident...\n'));
    
    const event = {
      event_type: options.type,
      severity: options.severity,
      summary: options.summary || `${options.type} detected at ${new Date().toISOString()}`,
      detected_at: new Date().toISOString(),
      metrics: options.metrics ? JSON.parse(options.metrics) : { 
        latency_p95: 2500, 
        error_rate: 0.05 
      },
      context: options.context ? JSON.parse(options.context) : {
        service: 'api-gateway',
        endpoint: '/api/users'
      },
    };
    
    const incident = await makeApiRequest('/api/ai-incidents', 'POST', event);
    
    console.log(chalk.green('✅ Incident created successfully!'));
    console.log(`${chalk.bold('Incident ID:')} ${incident.incident_id}`);
    console.log(`${chalk.bold('Status:')} ${incident.status}`);
    console.log(`${chalk.bold('View details:')} flexgate ai show ${incident.incident_id}\n`);
  });

// Update incident status
aiCmd
  .command('update <incidentId>')
  .description('Update incident status and feedback')
  .option('-s, --status <status>', 'New status (OPEN, INVESTIGATING, RESOLVED, FALSE_POSITIVE)')
  .option('-r, --rating <number>', 'User rating (1-5)', parseInt)
  .option('-f, --feedback <text>', 'User feedback')
  .action(async (incidentId, options) => {
    console.log(chalk.blue(`📝 Updating incident ${incidentId}...\n`));
    
    const updates = {};
    if (options.status) updates.status = options.status;
    if (options.rating) updates.user_rating = options.rating;
    if (options.feedback) updates.user_feedback = options.feedback;
    
    if (Object.keys(updates).length === 0) {
      console.log(chalk.yellow('⚠️  No updates provided'));
      return;
    }
    
    const incident = await makeApiRequest(`/api/ai-incidents/${incidentId}`, 'PATCH', updates);
    
    console.log(chalk.green('✅ Incident updated successfully!'));
    console.log(`${chalk.bold('Status:')} ${incident.status}`);
    if (incident.user_rating) {
      console.log(`${chalk.bold('Rating:')} ${'⭐'.repeat(incident.user_rating)}`);
    }
    console.log('');
  });

// Add recommendations
aiCmd
  .command('recommend <incidentId>')
  .description('Add AI recommendations to an incident')
  .option('-a, --action <type>', 'Action type (RESTART_SERVICE, SCALE_UP, etc.)')
  .option('-r, --reasoning <text>', 'Reasoning for the recommendation')
  .option('-c, --confidence <number>', 'Confidence score (0-1)', parseFloat)
  .option('--risk <level>', 'Risk level (low, medium, high)', 'low')
  .option('--file <path>', 'Load recommendations from JSON file')
  .action(async (incidentId, options) => {
    console.log(chalk.blue(`💡 Adding recommendations to incident ${incidentId}...\n`));
    
    let recommendations = [];
    
    if (options.file) {
      // Load from file
      const data = await fs.readFile(options.file, 'utf-8');
      const parsed = JSON.parse(data);
      recommendations = parsed.recommendations || parsed;
    } else if (options.action) {
      // Single recommendation from CLI
      recommendations = [{
        action_type: options.action,
        reasoning: options.reasoning || `Recommended action: ${options.action}`,
        confidence_score: options.confidence || 0.8,
        risk_level: options.risk,
        estimated_fix_time_minutes: 15,
      }];
    } else {
      console.log(chalk.red('❌ Provide either --action or --file'));
      return;
    }
    
    const result = await makeApiRequest(
      `/api/ai-incidents/${incidentId}/recommendations`,
      'POST',
      { recommendations }
    );
    
    console.log(chalk.green(`✅ Added ${result.length} recommendation(s)`));
    result.forEach(rec => {
      console.log(`  • ${rec.action_type} (confidence: ${formatPercentage(rec.confidence_score)})`);
    });
    console.log('');
  });

// Record decision
aiCmd
  .command('decide <incidentId> <recommendationId>')
  .description('Record user decision on a recommendation')
  .option('-d, --decision <type>', 'Decision (ACCEPTED, REJECTED, MODIFIED, SKIPPED)', 'ACCEPTED')
  .option('-r, --reason <text>', 'Reason for decision')
  .option('-a, --action <type>', 'Actual action taken (if modified)')
  .action(async (incidentId, recommendationId, options) => {
    console.log(chalk.blue(`🎯 Recording decision for recommendation ${recommendationId}...\n`));
    
    const decision = {
      user_decision: options.decision,
      decision_reason: options.reason,
      actual_action_taken: options.action,
      decided_at: new Date().toISOString(),
    };
    
    await makeApiRequest(
      `/api/ai-incidents/${incidentId}/recommendations/${recommendationId}/decision`,
      'POST',
      decision
    );
    
    console.log(chalk.green('✅ Decision recorded successfully!'));
    console.log(`${chalk.bold('Decision:')} ${options.decision}`);
    if (options.reason) {
      console.log(`${chalk.bold('Reason:')} ${options.reason}`);
    }
    console.log('');
  });

// Record outcome
aiCmd
  .command('outcome <incidentId>')
  .description('Record action outcome')
  .option('-a, --action <type>', 'Action type', 'RESTART_SERVICE')
  .option('-s, --status <status>', 'Outcome status (RESOLVED, PARTIAL, FAILED)', 'RESOLVED')
  .option('--before <json>', 'Metrics before (JSON)')
  .option('--after <json>', 'Metrics after (JSON)')
  .option('-i, --improvement <number>', 'Improvement percentage', parseFloat)
  .option('-n, --notes <text>', 'Outcome notes')
  .action(async (incidentId, options) => {
    console.log(chalk.blue(`📊 Recording outcome for incident ${incidentId}...\n`));
    
    const outcome = {
      action_type: options.action,
      outcome_status: options.status,
      metrics_before: options.before ? JSON.parse(options.before) : {},
      metrics_after: options.after ? JSON.parse(options.after) : {},
      improvement_percentage: options.improvement,
      outcome_notes: options.notes,
      executed_at: new Date().toISOString(),
    };
    
    const result = await makeApiRequest(
      `/api/ai-incidents/${incidentId}/outcomes`,
      'POST',
      outcome
    );
    
    console.log(chalk.green('✅ Outcome recorded successfully!'));
    console.log(`${chalk.bold('Action:')} ${result.action_type}`);
    console.log(`${chalk.bold('Status:')} ${result.outcome_status}`);
    if (result.improvement_percentage) {
      console.log(`${chalk.bold('Improvement:')} ${result.improvement_percentage}%`);
    }
    console.log('');
  });

// Analytics command
aiCmd
  .command('analytics')
  .description('View AI incident analytics')
  .option('-d, --days <number>', 'Time range in days', '30')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    console.log(chalk.blue(`📈 Fetching analytics (last ${options.days} days)...\n`));
    
    const summary = await makeApiRequest(`/api/ai-incidents/analytics/summary?days=${options.days}`);
    const actionRates = await makeApiRequest('/api/ai-incidents/analytics/action-success-rates');
    
    if (options.json) {
      console.log(JSON.stringify({ summary, actionRates }, null, 2));
      return;
    }
    
    // Display summary
    console.log(chalk.bold.cyan('📊 INCIDENT SUMMARY'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`${chalk.bold('Total Incidents:')}     ${summary.total_incidents}`);
    console.log(`${chalk.bold('Open:')}                ${summary.open_incidents}`);
    console.log(`${chalk.bold('Resolved:')}            ${summary.resolved_incidents}`);
    console.log(`${chalk.bold('False Positives:')}     ${summary.false_positive_incidents}`);
    console.log(`${chalk.bold('Resolution Rate:')}     ${formatPercentage(summary.resolution_rate)}`);
    if (summary.avg_resolution_time_seconds) {
      console.log(`${chalk.bold('Avg Resolution Time:')} ${formatDuration(summary.avg_resolution_time_seconds)}`);
    }
    
    console.log(chalk.bold.cyan('\n💡 RECOMMENDATION METRICS'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`${chalk.bold('Total Recommendations:')} ${summary.total_recommendations}`);
    console.log(`${chalk.bold('Accepted:')}              ${summary.accepted_recommendations}`);
    console.log(`${chalk.bold('Rejected:')}              ${summary.rejected_recommendations}`);
    console.log(`${chalk.bold('Modified:')}              ${summary.modified_recommendations}`);
    console.log(`${chalk.bold('Acceptance Rate:')}       ${formatPercentage(summary.acceptance_rate)}`);
    
    console.log(chalk.bold.cyan('\n⭐ QUALITY METRICS'));
    console.log(chalk.gray('─'.repeat(60)));
    if (summary.avg_user_rating) {
      console.log(`${chalk.bold('Avg User Rating:')}     ${'⭐'.repeat(Math.round(summary.avg_user_rating))} (${summary.avg_user_rating.toFixed(1)}/5)`);
    }
    if (summary.avg_ai_confidence) {
      console.log(`${chalk.bold('Avg AI Confidence:')}   ${formatPercentage(summary.avg_ai_confidence)}`);
    }
    
    // Display action performance
    if (actionRates.length > 0) {
      console.log(chalk.bold.cyan('\n🎯 ACTION TYPE PERFORMANCE'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log('');
      
      displayTable(actionRates, [
        { key: 'action_type', label: 'Action Type' },
        { key: 'total_recommendations', label: 'Total' },
        { key: 'acceptance_rate', label: 'Accept %', format: v => formatPercentage(v || 0) },
        { key: 'resolution_rate', label: 'Resolve %', format: v => formatPercentage(v || 0) },
        { key: 'avg_confidence', label: 'Confidence', format: v => formatPercentage(v || 0) },
      ]);
    }
    
    // ROI calculation
    console.log(chalk.bold.cyan('\n💰 ROI ESTIMATES'));
    console.log(chalk.gray('─'.repeat(60)));
    const timeSaved = summary.resolved_incidents * 30; // 30min per incident
    const automationLevel = summary.acceptance_rate;
    console.log(`${chalk.bold('Time Saved:')}          ~${Math.round(timeSaved / 60)} hours (vs manual troubleshooting)`);
    console.log(`${chalk.bold('Incidents Prevented:')} ${summary.false_positive_incidents} false positives caught`);
    console.log(`${chalk.bold('Automation Level:')}    ${formatPercentage(automationLevel)}`);
    
    console.log('');
  });

// Export incidents
aiCmd
  .command('export')
  .description('Export incidents to JSON/CSV')
  .option('-f, --format <format>', 'Output format (json, csv)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('-s, --status <status>', 'Filter by status')
  .option('-d, --days <number>', 'Last N days', '30')
  .action(async (options) => {
    console.log(chalk.blue('📦 Exporting incidents...\n'));
    
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    params.append('limit', '10000');
    
    const result = await makeApiRequest(`/api/ai-incidents?${params.toString()}`);
    
    let output;
    let filename = options.output || `incidents_${Date.now()}.${options.format}`;
    
    if (options.format === 'csv') {
      // Convert to CSV
      const headers = ['incident_id', 'event_type', 'severity', 'status', 'summary', 'detected_at', 'resolved_at'];
      const csv = [
        headers.join(','),
        ...result.incidents.map(inc => 
          headers.map(h => JSON.stringify(inc[h] || '')).join(',')
        )
      ].join('\n');
      output = csv;
    } else {
      output = JSON.stringify(result, null, 2);
    }
    
    await fs.writeFile(filename, output);
    console.log(chalk.green(`✅ Exported ${result.incidents.length} incidents to ${filename}`));
    console.log('');
  });

// Watch for new incidents (real-time monitoring)
aiCmd
  .command('watch')
  .description('Watch for new incidents in real-time')
  .option('-i, --interval <seconds>', 'Polling interval', '10')
  .action(async (options) => {
    console.log(chalk.blue('👁️  Watching for new incidents (Ctrl+C to stop)...\n'));
    
    let lastCheck = new Date().toISOString();
    
    const poll = async () => {
      try {
        const params = new URLSearchParams();
        params.append('status', 'OPEN');
        params.append('limit', '10');
        
        const result = await makeApiRequest(`/api/ai-incidents?${params.toString()}`);
        
        const newIncidents = result.incidents.filter(inc => inc.detected_at > lastCheck);
        
        if (newIncidents.length > 0) {
          console.log(chalk.yellow(`\n🔔 ${newIncidents.length} new incident(s) detected!`));
          newIncidents.forEach(inc => {
            console.log(`  ${chalk.red('●')} ${inc.incident_id.substring(0, 12)} - ${inc.event_type} [${inc.severity}]`);
            console.log(`    ${inc.summary}`);
          });
          console.log('');
        }
        
        lastCheck = new Date().toISOString();
      } catch (error) {
        console.error(chalk.red('Error polling:'), error.message);
      }
    };
    
    // Initial poll
    await poll();
    
    // Poll at interval
    const intervalId = setInterval(poll, options.interval * 1000);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      console.log(chalk.yellow('\n👋 Stopped watching'));
      process.exit(0);
    });
  });

// ── doctor helpers ────────────────────────────────────────────────────────────

const ADMIN_PORT = parseInt(process.env.FLEXGATE_ADMIN_PORT || '9090', 10);

/**
 * Try GET /api/setup/detect on the admin server.
 * Returns the parsed report on success, null if the server is not reachable.
 */
async function fetchDetectReport(port = ADMIN_PORT) {
  try {
    const res = await fetch(`http://localhost:${port}/api/setup/detect`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Run a single CLI tool locally and extract its version string.
 * Returns { installed: boolean, version?: string, error?: string }.
 */
async function probeTool(cmd, args, patterns) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    // Some tools write to stderr (nginx -v), so capture both.
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 3000 });
    const raw = (stdout + stderr).toLowerCase();

    for (const { re, group = 1 } of patterns) {
      const m = raw.match(re);
      if (m && m[group]) return { installed: true, version: m[group] };
    }
    return { installed: true }; // ran but no version pattern matched
  } catch (err) {
    const msg = err.code === 'ENOENT' ? 'not found' : String(err.message).split('\n')[0];
    return { installed: false, error: msg };
  }
}

/**
 * Check whether a TCP port on localhost is in use.
 * Returns 'free' | 'in_use' | 'unknown'.
 */
async function probePort(port) {
  const { createConnection } = await import('net');
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    const done = (status) => { sock.destroy(); resolve(status); };

    sock.setTimeout(500);
    sock.on('connect', () => done('in_use'));
    sock.on('timeout', () => done('unknown'));
    sock.on('error', (e) => done(e.code === 'ECONNREFUSED' ? 'free' : 'unknown'));
  });
}

/**
 * Run all probes locally (fallback when the backend isn't running).
 */
async function runLocalProbes() {
  const [nginx, haproxy, docker, podman] = await Promise.all([
    probeTool('nginx',   ['-v'], [{ re: /nginx\/(\S+)/ }, { re: /(\d+\.\d+[\.\d]*)/ }]),
    probeTool('haproxy', ['-v'], [{ re: /haproxy version (\S+)/i }, { re: /(\d+\.\d+[\.\d]*)/ }]),
    probeTool('docker',  ['--version'], [{ re: /docker version ([^,\s]+)/i }, { re: /(\d+\.\d+[\.\d]*)/ }]),
    probeTool('podman',  ['--version'], [{ re: /podman version (\S+)/i }, { re: /(\d+\.\d+[\.\d]*)/ }]),
  ]);

  const portNums = [3000, 5432, 6379];
  const portStatuses = await Promise.all(portNums.map(probePort));
  const ports = {};
  portNums.forEach((p, i) => { ports[String(p)] = { port: p, status: portStatuses[i] }; });

  return { nginx, haproxy, docker, podman, ports, source: 'local' };
}

/**
 * Render a single tool result line.
 */
function printTool(label, result) {
  const tick  = chalk.green('✔');
  const cross = chalk.red('✖');

  if (result.installed) {
    const ver = result.version ? chalk.dim(` v${result.version}`) : '';
    console.log(`  ${tick}  ${chalk.bold(label)} installed${ver}`);
  } else {
    const why = result.error ? chalk.dim(` (${result.error})`) : '';
    console.log(`  ${cross}  ${chalk.bold(label)} not found${why}`);
  }
}

/**
 * Render a single port result line.
 */
function printPort(port, result) {
  const tick  = chalk.green('✔');
  const cross = chalk.yellow('⚠');
  const label = chalk.bold(`Port ${port}`);

  if (result.status === 'free') {
    console.log(`  ${tick}  ${label} is free`);
  } else if (result.status === 'in_use') {
    console.log(`  ${cross}  ${label} is ${chalk.yellow('in use')}`);
  } else {
    console.log(`  ${chalk.dim('?')}  ${label} status unknown`);
  }
}

/**
 * Print the full doctor report to stdout.
 * @param {object} report  - { nginx, haproxy, docker, podman, ports }
 * @param {string} source  - 'backend' | 'local'
 * @param {number} elapsed - ms
 */
function printReport(report, source, elapsed) {
  const sourceLabel = source === 'backend'
    ? chalk.dim('(via FlexGate admin API)')
    : chalk.dim('(local — admin server not running)');

  console.log(chalk.bold.blue('\n  FlexGate Environment Check') + '  ' + sourceLabel);
  console.log(chalk.dim('  ' + '─'.repeat(48)));

  // ── Reverse proxies ──────────────────────────────────────────────────────
  console.log(chalk.dim('\n  Reverse Proxies'));
  printTool('Nginx',   report.nginx);
  printTool('HAProxy', report.haproxy);

  // ── Container runtimes ───────────────────────────────────────────────────
  console.log(chalk.dim('\n  Container Runtimes'));
  printTool('Docker', report.docker);
  printTool('Podman', report.podman);

  // ── Ports ────────────────────────────────────────────────────────────────
  console.log(chalk.dim('\n  Ports'));
  const portEntries = Object.entries(report.ports || {}).sort(
    ([a], [b]) => parseInt(a, 10) - parseInt(b, 10)
  );
  if (portEntries.length === 0) {
    console.log(chalk.dim('  No port data available'));
  } else {
    portEntries.forEach(([portStr, result]) => printPort(portStr, result));
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const tools  = [report.nginx, report.haproxy, report.docker, report.podman];
  const nOk    = tools.filter(t => t.installed).length;
  const portsOk= portEntries.filter(([, r]) => r.status === 'free').length;

  console.log(chalk.dim('\n  ' + '─'.repeat(48)));
  console.log(
    `  ${chalk.bold(nOk)} / ${tools.length} tools found` +
    `  ·  ${chalk.bold(portsOk)} / ${portEntries.length} ports free` +
    `  ·  ${chalk.dim(elapsed + ' ms')}\n`
  );

  // ── Hint when nothing is installed ──────────────────────────────────────
  if (nOk === 0) {
    console.log(
      chalk.yellow('  ⚠  No optional dependencies found.') +
      ' FlexGate can still run in Benchmark mode without them.\n'
    );
  }
}

// ── doctor command ────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Check host environment for FlexGate dependencies')
  .option('--json', 'Output raw JSON report instead of formatted text')
  .option('--local', 'Skip the backend and run checks locally (useful without a running server)')
  .option('--admin-port <port>', 'Admin server port to query (default: 9090)', '9090')
  .action(async (options) => {
    const start = Date.now();

    // Resolve admin port: CLI flag > env var > default 9090
    const adminPort = parseInt(options.adminPort || process.env.FLEXGATE_ADMIN_PORT || '9090', 10);

    let report;
    let source;

    if (options.local) {
      // ── local mode — skip backend ──────────────────────────────────────────
      if (!options.json) process.stdout.write(chalk.dim('  Running local checks…\r'));
      report = await runLocalProbes();
      source = 'local';
    } else {
      // ── try backend first ──────────────────────────────────────────────────
      if (!options.json) process.stdout.write(chalk.dim('  Querying admin server…\r'));
      const backendReport = await fetchDetectReport(adminPort);

      if (backendReport) {
        report  = backendReport;
        source  = 'backend';
      } else {
        // Backend not reachable — fall back to local probes.
        if (!options.json) process.stdout.write(chalk.dim('  Admin server offline — running local checks…\r'));
        report = await runLocalProbes();
        source = 'local';
      }
    }

    const elapsed = Date.now() - start;

    if (options.json) {
      console.log(JSON.stringify({ ...report, source, elapsedMs: elapsed }, null, 2));
      return;
    }

    // Clear the progress line.
    process.stdout.write('\r' + ' '.repeat(50) + '\r');

    printReport(report, source, elapsed);

    // Exit 1 if every tool is missing (makes it useful in CI/scripts).
    const tools = [report.nginx, report.haproxy, report.docker, report.podman];
    if (tools.every(t => !t.installed)) {
      process.exit(1);
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
