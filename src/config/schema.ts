/**
 * Configuration Schema v1
 * 
 * Defines the structure and validation rules for FlexGate proxy configuration.
 * This schema ensures backward compatibility and provides clear upgrade paths.
 */

import Joi from 'joi';
import type { ProxyConfig, ValidationResult } from '../types';

// Schema version
export const SCHEMA_VERSION = '1.0.0';

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
  timeout: Joi.number().integer().min(100).max(300000).allow(null).optional(),
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
  rateLimit: rateLimitSchema,
  timeout: Joi.number().integer().min(100).max(300000),
  metadata: Joi.object().pattern(Joi.string(), Joi.any())
});

// Logging configuration schema
const loggingSchema = Joi.object({
  level: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  format: Joi.string().valid('json', 'text').default('json'),
  sampling: Joi.object({
    enabled: Joi.boolean().default(false),
    successRate: Joi.number().min(0).max(1).default(1.0),
    errorRate: Joi.number().min(0).max(1).default(1.0)
  }).default()
}).default();

// Metrics configuration schema
const metricsSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  port: Joi.number().integer().min(1024).max(65535),
  path: Joi.string().default('/metrics')
}).default();

// Proxy configuration schema
const proxySchema = Joi.object({
  port: Joi.number().integer().min(1024).max(65535).default(3000),
  host: Joi.string().default('0.0.0.0'),
  timeout: timeoutSchema
}).default();

// CORS configuration schema
const corsSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  origin: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).default('*'),
  credentials: Joi.boolean().default(false)
}).default();

// Security configuration schema
const securitySchema = Joi.object({
  cors: corsSchema,
  rateLimiting: rateLimitSchema
}).default();

// Main configuration schema
const configSchema = Joi.object({
  version: Joi.string().default('1.0.0'),
  proxy: proxySchema,
  upstreams: Joi.array().items(upstreamSchema).min(1).required(),
  routes: Joi.array().items(routeSchema).min(1).required(),
  logging: loggingSchema,
  metrics: metricsSchema,
  security: securitySchema,
  metadata: Joi.object().pattern(Joi.string(), Joi.any())
});

/**
 * Validate configuration against schema
 * @param config - Configuration object to validate
 * @returns Validation result with error, value, and warnings
 */
export function validateConfig(config: any): ValidationResult<ProxyConfig> {
  const result = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
    convert: true
  });
  
  const warnings: string[] = [];
  
  // Check for deprecated fields (for future use)
  // Add warnings for fields that will be deprecated
  
  // Cross-validation: ensure routes reference valid upstreams
  if (result.value && !result.error) {
    const upstreamNames = new Set(result.value.upstreams.map((u: any) => u.name));
    const invalidRoutes = result.value.routes.filter((r: any) => !upstreamNames.has(r.upstream));
    
    if (invalidRoutes.length > 0) {
      return {
        error: new Error(
          `Invalid upstream references in routes: ${invalidRoutes.map((r: any) => `${r.path} -> ${r.upstream}`).join(', ')}`
        ),
        value: null,
        warnings
      };
    }
    
    // Check for duplicate upstream names
    const duplicates = result.value.upstreams
      .map((u: any) => u.name)
      .filter((name: string, index: number, arr: string[]) => arr.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      return {
        error: new Error(`Duplicate upstream names: ${duplicates.join(', ')}`),
        value: null,
        warnings
      };
    }
    
    // Check for duplicate route paths
    const routeDuplicates = result.value.routes
      .map((r: any) => r.path)
      .filter((path: string, index: number, arr: string[]) => arr.indexOf(path) !== index);
    
    if (routeDuplicates.length > 0) {
      warnings.push(`Warning: Duplicate route paths detected: ${routeDuplicates.join(', ')}`);
    }
  }
  
  return {
    error: result.error || null,
    value: result.value || null,
    warnings
  };
}

/**
 * Get current schema version
 * @returns Schema version string
 */
export function getSchemaVersion(): string {
  return SCHEMA_VERSION;
}

/**
 * Migrate configuration from old version to current version
 * @param config - Configuration to migrate
 * @param fromVersion - Source version
 * @returns Migrated configuration
 */
export function migrateConfig(config: any, fromVersion: string): any {
  // Version 1.0.0 is the baseline - no migration needed
  if (fromVersion === '1.0.0' || !fromVersion) {
    return config;
  }
  
  // Future migrations will go here
  // Example:
  // if (fromVersion === '0.9.0') {
  //   return migrateFrom_0_9_0_to_1_0_0(config);
  // }
  
  throw new Error(`Unsupported config version: ${fromVersion}. Please upgrade to v${SCHEMA_VERSION}`);
}

// Export schema for testing
export { configSchema };
