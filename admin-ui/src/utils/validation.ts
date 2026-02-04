/**
 * Validation utilities for route configuration
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate route path
 * Must start with / and contain valid URL characters
 */
export function validatePath(path: string): ValidationResult {
  if (!path || path.trim() === '') {
    return { valid: false, error: 'Path is required' };
  }

  if (!path.startsWith('/')) {
    return { valid: false, error: 'Path must start with /' };
  }

  // Check for valid URL path characters
  const validPathRegex = /^\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%*]*$/;
  if (!validPathRegex.test(path)) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate upstream URL
 * Must be a valid HTTP/HTTPS URL
 */
export function validateUpstream(upstream: string): ValidationResult {
  if (!upstream || upstream.trim() === '') {
    return { valid: false, error: 'Upstream URL is required' };
  }

  try {
    const url = new URL(upstream);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Upstream must use HTTP or HTTPS protocol' };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate HTTP methods
 * At least one method must be selected
 */
export function validateMethods(methods: string[]): ValidationResult {
  if (!methods || methods.length === 0) {
    return { valid: false, error: 'At least one HTTP method is required' };
  }

  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  const invalidMethods = methods.filter(m => !validMethods.includes(m.toUpperCase()));

  if (invalidMethods.length > 0) {
    return { valid: false, error: `Invalid methods: ${invalidMethods.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Validate rate limit configuration
 */
export function validateRateLimit(requests: number, window: string): ValidationResult {
  if (requests <= 0) {
    return { valid: false, error: 'Requests must be greater than 0' };
  }

  if (requests > 10000) {
    return { valid: false, error: 'Requests must be less than 10,000' };
  }

  // Validate window format (e.g., "60s", "1m", "1h")
  const windowRegex = /^(\d+)(s|m|h)$/;
  if (!windowRegex.test(window)) {
    return { valid: false, error: 'Window must be in format: 60s, 1m, or 1h' };
  }

  return { valid: true };
}

/**
 * Validate circuit breaker threshold
 */
export function validateCircuitBreakerThreshold(threshold: number): ValidationResult {
  if (threshold < 1 || threshold > 100) {
    return { valid: false, error: 'Threshold must be between 1 and 100' };
  }

  return { valid: true };
}

/**
 * Validate entire route configuration
 */
export function validateRouteConfig(config: {
  path: string;
  upstream: string;
  methods: string[];
  rateLimit?: { requests: number; window: string };
  circuitBreaker?: { enabled: boolean; threshold: number };
}): ValidationResult {
  // Validate path
  const pathResult = validatePath(config.path);
  if (!pathResult.valid) return pathResult;

  // Validate upstream
  const upstreamResult = validateUpstream(config.upstream);
  if (!upstreamResult.valid) return upstreamResult;

  // Validate methods
  const methodsResult = validateMethods(config.methods);
  if (!methodsResult.valid) return methodsResult;

  // Validate rate limit if provided
  if (config.rateLimit) {
    const rateLimitResult = validateRateLimit(
      config.rateLimit.requests,
      config.rateLimit.window
    );
    if (!rateLimitResult.valid) return rateLimitResult;
  }

  // Validate circuit breaker if enabled
  if (config.circuitBreaker?.enabled) {
    const cbResult = validateCircuitBreakerThreshold(config.circuitBreaker.threshold);
    if (!cbResult.valid) return cbResult;
  }

  return { valid: true };
}
