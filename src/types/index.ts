/**
 * FlexGate Proxy Type Definitions
 * Core types for configuration, health checks, and validation
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface ProxyConfig {
  version: string;
  proxy?: ProxySettings;
  upstreams: Upstream[];
  routes: Route[];
  logging?: LoggingConfig;
  metrics?: MetricsConfig;
  security?: SecurityConfig;
}

export interface ProxySettings {
  port?: number;
  host?: string;
  timeout?: TimeoutConfig;
}

export interface TimeoutConfig {
  request?: number;
  connect?: number;
  idle?: number;
}

export interface Upstream {
  name: string;
  url: string;
  timeout?: number;
  healthCheck?: HealthCheckConfig;
  circuitBreaker?: CircuitBreakerConfig;
  metadata?: Record<string, any>;
}

export interface HealthCheckConfig {
  enabled?: boolean;
  path?: string;
  interval?: number;
  timeout?: number;
  unhealthyThreshold?: number;
  healthyThreshold?: number;
}

export interface CircuitBreakerConfig {
  enabled?: boolean;
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  halfOpenRequests?: number;
}

export interface Route {
  path: string;
  upstream: string;
  methods?: HttpMethod[];
  rateLimit?: RateLimitConfig;
  timeout?: number;
  stripPath?: string;
  metadata?: Record<string, any>;
}

// Type alias for proxy routes
export type ProxyRoute = Route;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface RateLimitConfig {
  enabled?: boolean;
  windowMs?: number;
  max?: number;
  message?: string;
}

export interface LoggingConfig {
  level?: LogLevel;
  format?: 'json' | 'text';
  sampling?: SamplingConfig;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export interface SamplingConfig {
  enabled?: boolean;
  successRate?: number;
  errorRate?: number;
}

export interface MetricsConfig {
  enabled?: boolean;
  port?: number;
  path?: string;
}

export interface SecurityConfig {
  cors?: CorsConfig;
  rateLimiting?: RateLimitConfig;
}

export interface CorsConfig {
  enabled?: boolean;
  origin?: string | string[];
  credentials?: boolean;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult<T = any> {
  error: Error | null;
  value: T | null;
  warnings: string[];
}

export interface ConfigValidationOptions {
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  convert?: boolean;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  version?: string;
  uptime?: number;
}

export interface LivenessStatus {
  status: 'UP' | 'DOWN';
  timestamp: string;
}

export interface ReadinessStatus {
  status: 'READY' | 'NOT_READY';
  timestamp: string;
  checks?: {
    config: boolean;
    dependencies: boolean;
  };
}

export interface DeepHealthStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  version: string;
  uptime: number;
  system: SystemHealth;
  upstreams: UpstreamHealth[];
  dependencies: DependencyHealth;
}

export interface SystemHealth {
  memory: {
    total: number;
    free: number;
    used: number;
    percentage: number;
  };
  cpu: {
    cores: number;
    usage: number;
  };
  process: {
    uptime: number;
    pid: number;
    version: string;
  };
}

export interface UpstreamHealth {
  name: string;
  url: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  responseTime?: number;
  lastCheck?: string;
  circuitBreakerState?: CircuitBreakerState;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface DependencyHealth {
  redis?: {
    status: 'UP' | 'DOWN';
    responseTime?: number;
  };
  database?: {
    status: 'UP' | 'DOWN';
    responseTime?: number;
  };
}

// ============================================================================
// Versioning Types
// ============================================================================

export interface VersionInfo {
  api: string;
  config: string;
  schema: string;
  node: string;
  timestamp: string;
}

// ============================================================================
// Config Loader Types
// ============================================================================

export interface ConfigLoader {
  config: ProxyConfig | null;
  watchers: ConfigWatcher[];
  schemaVersion: string;
  load(configPath?: string): ProxyConfig;
  reload(configPath?: string): boolean;
  get<T = any>(path: string, defaultValue?: T): T | null;
  watch(callback: ConfigWatcher): void;
}

export type ConfigWatcher = (newConfig: ProxyConfig, oldConfig: ProxyConfig) => void;

// ============================================================================
// Logger Types
// ============================================================================

export interface LogContext {
  correlationId?: string;
  event?: string;
  http?: HttpLogContext;
  metadata?: Record<string, any>;
  error?: ErrorLogContext;
}

export interface HttpLogContext {
  method?: string;
  path?: string;
  query?: Record<string, any>;
  statusCode?: number;
  clientIp?: string;
}

export interface ErrorLogContext {
  message: string;
  stack?: string;
  code?: string;
}

// ============================================================================
// Express Extensions
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

// ============================================================================
// Rate Limiter Types
// ============================================================================

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface MetricLabels {
  method?: string;
  route?: string;
  status?: string;
  upstream?: string;
}

export interface PrometheusMetrics {
  httpRequestsTotal: any; // Counter
  httpRequestDuration: any; // Histogram
  upstreamHealth: any; // Gauge
  circuitBreakerState: any; // Gauge
}
