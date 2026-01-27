/**
 * Configuration Schema v1
 * 
 * Defines the structure and validation rules for FlexGate proxy configuration.
 * This schema ensures backward compatibility and provides clear upgrade paths.
 */

const Joi = require('joi');

// Schema version
const SCHEMA_VERSION = '1.0.0';

// Timeout configuration schema
const timeoutSchema = Joi.object({
  request: Joi.number().integer().min(100).max(300000).default(30000),
  connect: Joi.number().integer().min(100).max(60000).default(5000),
  idle: Joi.number().integer().min(1000).max(600000).default(120000)
}).default();

// Circuit breaker configuration schema
const circuitBreakerSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  failureThreshold: Joi.number().integer().min(1).max(100).default(5),
  successThreshold: Joi.number().integer().min(1).max(100).default(2),
  timeout: Joi.number().integer().min(1000).max(300000).default(60000),
  halfOpenRequests: Joi.number().integer().min(1).max(10).default(3)
}).default();

// Rate limit configuration schema
const rateLimitSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  windowMs: Joi.number().integer().min(1000).max(3600000).default(60000),
  max: Joi.number().integer().min(1).max(1000000).default(100),
  message: Joi.string().default('Too many requests, please try again later.')
});

// Upstream configuration schema
const upstreamSchema = Joi.object({
  name: Joi.string().required().pattern(/^[a-zA-Z0-9-_]+$/),
  url: Joi.string().uri().required(),
  timeout: Joi.number().integer().min(100).max(300000),
  healthCheck: Joi.object({
    enabled: Joi.boolean().default(true),
    path: Joi.string().default('/health'),
    interval: Joi.number().integer().min(1000).max(300000).default(30000),
    timeout: Joi.number().integer().min(100).max(60000).default(5000),
    unhealthyThreshold: Joi.number().integer().min(1).max(10).default(3),
    healthyThreshold: Joi.number().integer().min(1).max(10).default(2)
  }).default(),
  circuitBreaker: circuitBreakerSchema,
  metadata: Joi.object().pattern(Joi.string(), Joi.any())
});

// Route configuration schema
const routeSchema = Joi.object({
  path: Joi.string().required().pattern(/^\/[a-zA-Z0-9-_/]*\*?$/),
  upstream: Joi.string().required(),
  methods: Joi.array().items(
    Joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS')
  ).default(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  stripPath: Joi.string().pattern(/^\/[a-zA-Z0-9-_/]*$/),
  timeout: Joi.number().integer().min(100).max(300000),
  rateLimit: rateLimitSchema,
  auth: Joi.object({
    enabled: Joi.boolean().default(false),
    type: Joi.string().valid('apiKey', 'jwt', 'basic').default('apiKey')
  }).default(),
  metadata: Joi.object().pattern(Joi.string(), Joi.any())
});

// Logging configuration schema
const loggingSchema = Joi.object({
  level: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info'),
  format: Joi.string().valid('json', 'text').default('json'),
  sampling: Joi.object({
    enabled: Joi.boolean().default(false),
    successRate: Joi.number().min(0).max(1).default(1.0),
    errorRate: Joi.number().min(0).max(1).default(1.0)
  }).default(),
  redaction: Joi.object({
    enabled: Joi.boolean().default(true),
    fields: Joi.array().items(Joi.string()).default([
      'password', 'token', 'apiKey', 'secret', 'authorization'
    ])
  }).default()
}).default();

// Proxy configuration schema
const proxySchema = Joi.object({
  host: Joi.string().default('0.0.0.0'),
  port: Joi.number().integer().min(1).max(65535).default(3000),
  maxBodySize: Joi.string().pattern(/^\d+[kmg]?b$/i).default('10mb'),
  trustProxy: Joi.boolean().default(false),
  cors: Joi.object({
    enabled: Joi.boolean().default(true),
    origin: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string()),
      Joi.boolean()
    ).default('*'),
    credentials: Joi.boolean().default(false)
  }).default()
}).default();

// Redis configuration schema
const redisSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  host: Joi.string().default('localhost'),
  port: Joi.number().integer().min(1).max(65535).default(6379),
  password: Joi.string().allow(''),
  db: Joi.number().integer().min(0).max(15).default(0),
  keyPrefix: Joi.string().default('flexgate:')
}).default();

// Main configuration schema
const configSchema = Joi.object({
  // Schema version for backward compatibility
  version: Joi.string().valid('1.0.0').default('1.0.0'),
  
  // Basic proxy configuration
  proxy: proxySchema,
  
  // Upstream services
  upstreams: Joi.array().items(upstreamSchema).min(1).required(),
  
  // Routes
  routes: Joi.array().items(routeSchema).min(1).required(),
  
  // Global timeouts
  timeouts: timeoutSchema,
  
  // Logging configuration
  logging: loggingSchema,
  
  // Redis configuration (for rate limiting, caching, etc.)
  redis: redisSchema,
  
  // Metadata (custom fields)
  metadata: Joi.object().pattern(Joi.string(), Joi.any())
});

/**
 * Validate configuration against schema
 * @param {Object} config - Configuration object to validate
 * @returns {Object} { error, value, warnings }
 */
function validateConfig(config) {
  const result = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: false
  });
  
  const warnings = [];
  
  // Check for deprecated fields (for future use)
  // Add warnings for fields that will be deprecated
  
  // Cross-validation: ensure routes reference valid upstreams
  if (result.value && !result.error) {
    const upstreamNames = new Set(result.value.upstreams.map(u => u.name));
    const invalidRoutes = result.value.routes.filter(r => !upstreamNames.has(r.upstream));
    
    if (invalidRoutes.length > 0) {
      return {
        error: new Error(
          `Invalid upstream references in routes: ${invalidRoutes.map(r => `${r.path} -> ${r.upstream}`).join(', ')}`
        ),
        value: null,
        warnings
      };
    }
    
    // Check for duplicate upstream names
    const duplicates = result.value.upstreams
      .map(u => u.name)
      .filter((name, index, arr) => arr.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      return {
        error: new Error(`Duplicate upstream names: ${duplicates.join(', ')}`),
        value: null,
        warnings
      };
    }
    
    // Check for duplicate route paths
    const routeDuplicates = result.value.routes
      .map(r => r.path)
      .filter((path, index, arr) => arr.indexOf(path) !== index);
    
    if (routeDuplicates.length > 0) {
      warnings.push(`Warning: Duplicate route paths detected: ${routeDuplicates.join(', ')}`);
    }
  }
  
  return {
    error: result.error,
    value: result.value,
    warnings
  };
}

/**
 * Get schema version
 * @returns {string} Schema version
 */
function getSchemaVersion() {
  return SCHEMA_VERSION;
}

/**
 * Migrate configuration from older versions
 * @param {Object} config - Configuration to migrate
 * @param {string} fromVersion - Source version
 * @returns {Object} Migrated configuration
 */
function migrateConfig(config, fromVersion) {
  // Currently only v1.0.0 exists
  // Future migrations will be added here
  
  if (!fromVersion || fromVersion === '1.0.0') {
    return config;
  }
  
  throw new Error(`Unsupported config version: ${fromVersion}`);
}

module.exports = {
  validateConfig,
  getSchemaVersion,
  migrateConfig,
  configSchema,
  SCHEMA_VERSION
};
