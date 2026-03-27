/**
 * JSON Configuration Loader
 * 
 * Loads FlexGate configuration from JSON files with the following precedence:
 * 1. Environment-specific file (config/flexgate.{NODE_ENV}.json)
 * 2. Default file (config/flexgate.json)
 * 3. Environment variables
 * 4. Default values
 */

import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

// Configuration interface
export interface FlexGateConfig {
  server: {
    port: number;
    host: string;
    environment: 'development' | 'production' | 'staging' | 'test';
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
  };
  security: {
    corsOrigins: string[];
    corsEnabled: boolean;
    rateLimitEnabled: boolean;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
    format: 'json' | 'simple' | 'combined';
    destination: 'console' | 'file' | 'both';
    maxFiles: number;
    maxSize: string;
  };
  monitoring: {
    metricsEnabled: boolean;
    prometheusPort: number;
    healthCheckInterval: number;
  };
}

// Default configuration
const defaultConfig: FlexGateConfig = {
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

/**
 * Load JSON configuration from file
 */
function loadJsonFile(filePath: string): Partial<FlexGateConfig> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content);
    
    console.log(`✅ Loaded configuration from: ${filePath}`);
    return config;
  } catch (error) {
    console.error(`❌ Failed to load configuration from ${filePath}:`, error);
    return null;
  }
}

/**
 * Load JSON schema for validation
 */
function loadSchema(): any {
  const schemaPath = path.join(process.cwd(), 'config', 'flexgate.schema.json');
  
  try {
    if (!fs.existsSync(schemaPath)) {
      console.warn(`⚠️  Schema file not found: ${schemaPath}`);
      return null;
    }

    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    return JSON.parse(schemaContent);
  } catch (error) {
    console.error(`❌ Failed to load schema:`, error);
    return null;
  }
}

/**
 * Validate configuration against JSON schema
 */
function validateConfig(config: any): { valid: boolean; errors?: any[] } {
  const schema = loadSchema();
  
  if (!schema) {
    console.warn('⚠️  Skipping validation (schema not found)');
    return { valid: true };
  }

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(config);

  if (!valid) {
    return { valid: false, errors: validate.errors || [] };
  }

  return { valid: true };
}

/**
 * Replace environment variable placeholders in config
 * Example: "${DB_PASSWORD}" -> actual value from process.env.DB_PASSWORD
 */
function replaceEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    // Match ${VAR_NAME} pattern
    const match = obj.match(/^\$\{(.+)\}$/);
    if (match && match[1]) {
      const envVar = match[1];
      const value = process.env[envVar];
      if (value === undefined) {
        console.warn(`⚠️  Environment variable not found: ${envVar}`);
        return obj;
      }
      return value;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(replaceEnvVars);
  }

  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVars(value);
    }
    return result;
  }

  return obj;
}

/**
 * Deep merge two objects
 */
function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Override config with environment variables
 */
function applyEnvOverrides(config: FlexGateConfig): FlexGateConfig {
  const envConfig: Partial<FlexGateConfig> = {};

  // Server overrides
  if (process.env.PORT) {
    envConfig.server = { ...config.server, port: parseInt(process.env.PORT, 10) };
  }
  if (process.env.HOST) {
    envConfig.server = { ...config.server, host: process.env.HOST };
  }
  if (process.env.NODE_ENV) {
    envConfig.server = { 
      ...config.server, 
      environment: process.env.NODE_ENV as any 
    };
  }

  // Database overrides
  if (process.env.DATABASE_URL) {
    // Parse PostgreSQL connection string
    const dbUrl = new URL(process.env.DATABASE_URL);
    envConfig.database = {
      ...config.database,
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '5432', 10),
      name: dbUrl.pathname.slice(1),
      user: dbUrl.username,
      password: dbUrl.password,
    };
  } else {
    if (process.env.DB_HOST) {
      envConfig.database = { ...config.database, host: process.env.DB_HOST };
    }
    if (process.env.DB_PORT) {
      envConfig.database = { ...config.database, port: parseInt(process.env.DB_PORT, 10) };
    }
    if (process.env.DB_NAME) {
      envConfig.database = { ...config.database, name: process.env.DB_NAME };
    }
    if (process.env.DB_USER) {
      envConfig.database = { ...config.database, user: process.env.DB_USER };
    }
    if (process.env.DB_PASSWORD) {
      envConfig.database = { ...config.database, password: process.env.DB_PASSWORD };
    }
  }
  if (process.env.DB_SSL) {
    envConfig.database = { 
      ...config.database, 
      ssl: process.env.DB_SSL === 'true' 
    };
  }

  // Redis overrides
  if (process.env.REDIS_URL) {
    const redisUrl = new URL(process.env.REDIS_URL);
    envConfig.redis = {
      ...config.redis,
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379', 10),
      password: redisUrl.password,
    };
  } else {
    if (process.env.REDIS_HOST) {
      envConfig.redis = { ...config.redis, host: process.env.REDIS_HOST };
    }
    if (process.env.REDIS_PORT) {
      envConfig.redis = { ...config.redis, port: parseInt(process.env.REDIS_PORT, 10) };
    }
    if (process.env.REDIS_PASSWORD) {
      envConfig.redis = { ...config.redis, password: process.env.REDIS_PASSWORD };
    }
  }

  // Security overrides
  if (process.env.CORS_ORIGIN) {
    envConfig.security = { 
      ...config.security, 
      corsOrigins: process.env.CORS_ORIGIN.split(',').map(o => o.trim()) 
    };
  }
  if (process.env.CORS_ENABLED) {
    envConfig.security = { 
      ...config.security, 
      corsEnabled: process.env.CORS_ENABLED === 'true' 
    };
  }

  // Logging overrides
  if (process.env.LOG_LEVEL) {
    envConfig.logging = { ...config.logging, level: process.env.LOG_LEVEL as any };
  }
  if (process.env.LOG_FORMAT) {
    envConfig.logging = { ...config.logging, format: process.env.LOG_FORMAT as any };
  }

  // Monitoring overrides
  if (process.env.METRICS_ENABLED) {
    envConfig.monitoring = { 
      ...config.monitoring, 
      metricsEnabled: process.env.METRICS_ENABLED === 'true' 
    };
  }
  if (process.env.PROMETHEUS_PORT) {
    envConfig.monitoring = { 
      ...config.monitoring, 
      prometheusPort: parseInt(process.env.PROMETHEUS_PORT, 10) 
    };
  }

  return deepMerge(config, envConfig);
}

/**
 * Load FlexGate configuration with the following precedence:
 * 1. Default configuration
 * 2. config/flexgate.json
 * 3. config/flexgate.{NODE_ENV}.json
 * 4. Environment variables
 */
export function loadConfig(): FlexGateConfig {
  console.log('\n🔧 Loading FlexGate configuration...\n');

  // Start with default config
  let config: FlexGateConfig = { ...defaultConfig };

  // Load base config file
  const baseConfigPath = path.join(process.cwd(), 'config', 'flexgate.json');
  const baseConfig = loadJsonFile(baseConfigPath);
  if (baseConfig) {
    config = deepMerge(config, baseConfig);
  } else {
    console.log('ℹ️  No base configuration file found, using defaults');
  }

  // Load environment-specific config
  const nodeEnv = process.env.NODE_ENV || 'production';
  const envConfigPath = path.join(process.cwd(), 'config', `flexgate.${nodeEnv}.json`);
  const envConfig = loadJsonFile(envConfigPath);
  if (envConfig) {
    config = deepMerge(config, envConfig);
  }

  // Replace environment variable placeholders
  config = replaceEnvVars(config);

  // Apply environment variable overrides
  config = applyEnvOverrides(config);

  // Validate configuration
  console.log('\n🔍 Validating configuration...');
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error('\n❌ Configuration validation failed:');
    validation.errors?.forEach((error) => {
      console.error(`  - ${error.instancePath}: ${error.message}`);
    });
    throw new Error('Invalid configuration');
  }
  console.log('✅ Configuration is valid\n');

  // Print configuration summary
  printConfigSummary(config);

  return config;
}

/**
 * Print configuration summary
 */
function printConfigSummary(config: FlexGateConfig): void {
  console.log('📋 Configuration Summary:');
  console.log('─────────────────────────────────────────');
  console.log(`Environment:      ${config.server.environment}`);
  console.log(`Server:           ${config.server.host}:${config.server.port}`);
  console.log(`Database:         ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`Database SSL:     ${config.database.ssl ? 'enabled' : 'disabled'}`);
  console.log(`Database Pool:    ${config.database.poolMin}-${config.database.poolMax} connections`);
  console.log(`Redis:            ${config.redis.host}:${config.redis.port}/${config.redis.db}`);
  console.log(`CORS:             ${config.security.corsEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Rate Limiting:    ${config.security.rateLimitEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Log Level:        ${config.logging.level}`);
  console.log(`Log Format:       ${config.logging.format}`);
  console.log(`Metrics:          ${config.monitoring.metricsEnabled ? 'enabled' : 'disabled'}`);
  if (config.monitoring.metricsEnabled) {
    console.log(`Prometheus:       http://localhost:${config.monitoring.prometheusPort}/metrics`);
  }
  console.log('─────────────────────────────────────────\n');
}

/**
 * Export configuration to environment variables (for backward compatibility)
 */
export function exportToEnv(config: FlexGateConfig): void {
  // Server
  process.env.NODE_ENV = config.server.environment;
  process.env.PORT = config.server.port.toString();
  process.env.HOST = config.server.host;

  // Database
  process.env.DATABASE_URL = `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.name}`;
  process.env.DB_HOST = config.database.host;
  process.env.DB_PORT = config.database.port.toString();
  process.env.DB_NAME = config.database.name;
  process.env.DB_USER = config.database.user;
  process.env.DB_PASSWORD = config.database.password;
  process.env.DB_SSL = config.database.ssl.toString();
  process.env.DB_POOL_MIN = config.database.poolMin.toString();
  process.env.DB_POOL_MAX = config.database.poolMax.toString();

  // Redis
  const redisUrl = config.redis.password
    ? `redis://:${config.redis.password}@${config.redis.host}:${config.redis.port}/${config.redis.db}`
    : `redis://${config.redis.host}:${config.redis.port}/${config.redis.db}`;
  process.env.REDIS_URL = redisUrl;
  process.env.REDIS_HOST = config.redis.host;
  process.env.REDIS_PORT = config.redis.port.toString();
  process.env.REDIS_PASSWORD = config.redis.password;
  process.env.REDIS_DB = config.redis.db.toString();

  // Security
  process.env.CORS_ORIGIN = config.security.corsOrigins.join(',');
  process.env.CORS_ENABLED = config.security.corsEnabled.toString();
  process.env.RATE_LIMIT_ENABLED = config.security.rateLimitEnabled.toString();
  process.env.RATE_LIMIT_WINDOW_MS = config.security.rateLimitWindowMs.toString();
  process.env.RATE_LIMIT_MAX_REQUESTS = config.security.rateLimitMaxRequests.toString();

  // Logging
  process.env.LOG_LEVEL = config.logging.level;
  process.env.LOG_FORMAT = config.logging.format;
  process.env.LOG_DESTINATION = config.logging.destination;
  process.env.LOG_MAX_FILES = config.logging.maxFiles.toString();
  process.env.LOG_MAX_SIZE = config.logging.maxSize;

  // Monitoring
  process.env.METRICS_ENABLED = config.monitoring.metricsEnabled.toString();
  process.env.PROMETHEUS_PORT = config.monitoring.prometheusPort.toString();
  process.env.HEALTH_CHECK_INTERVAL = config.monitoring.healthCheckInterval.toString();
}

/**
 * Singleton instance
 */
let configInstance: FlexGateConfig | null = null;

/**
 * Get configuration instance (singleton)
 */
export function getConfig(): FlexGateConfig {
  if (!configInstance) {
    configInstance = loadConfig();
    exportToEnv(configInstance);
  }
  return configInstance;
}

/**
 * Reload configuration (useful for testing)
 */
export function reloadConfig(): FlexGateConfig {
  configInstance = null;
  return getConfig();
}
