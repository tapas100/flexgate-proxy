import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * Label definitions for HTTP metrics
 */
export interface HttpLabels {
  method: string;
  route: string;
  status: string;
  status_code_family?: '2xx' | '3xx' | '4xx' | '5xx';
}

/**
 * Label definitions for Circuit Breaker metrics
 */
export interface CircuitBreakerLabels {
  upstream: string;
  route: string;
}

/**
 * Circuit Breaker state enum for metrics
 */
export enum CircuitBreakerMetricState {
  CLOSED = 0,
  HALF_OPEN = 1,
  OPEN = 2,
}

/**
 * Label definitions for Rate Limiter metrics
 */
export interface RateLimiterLabels {
  route: string;
  client_id?: string;
  limit_type: 'route' | 'global' | 'client';
}

/**
 * Label definitions for Upstream metrics
 */
export interface UpstreamLabels {
  upstream: string;
  upstream_host: string;
  route: string;
}

/**
 * Label definitions for Config metrics
 */
export interface ConfigLabels {
  config_version?: string;
  config_file?: string;
}

/**
 * Metric collectors interface
 */
export interface MetricCollectors {
  // HTTP Metrics
  httpRequestsTotal: Counter<string>;
  httpRequestDuration: Histogram<string>;
  httpRequestsInFlight: Gauge<string>;
  httpRequestSizeBytes: Histogram<string>;
  httpResponseSizeBytes: Histogram<string>;
  httpRequestsByStatusFamily: Counter<string>;

  // Circuit Breaker Metrics
  circuitBreakerState: Gauge<string>;
  circuitBreakerTransitionsTotal: Counter<string>;
  circuitBreakerFailuresTotal: Counter<string>;
  circuitBreakerSuccessesTotal: Counter<string>;
  circuitBreakerRejectedTotal: Counter<string>;
  circuitBreakerFailureRate: Gauge<string>;

  // Rate Limiter Metrics
  rateLimitRequestsTotal: Counter<string>;
  rateLimitRequestsAllowed: Counter<string>;
  rateLimitRequestsRejected: Counter<string>;
  rateLimitCurrentUsage: Gauge<string>;
  rateLimitRedisErrorsTotal: Counter<string>;

  // Upstream Metrics
  upstreamRequestsTotal: Counter<string>;
  upstreamRequestDuration: Histogram<string>;
  upstreamErrorsTotal: Counter<string>;
  upstreamAvailability: Gauge<string>;
  upstreamTimeoutsTotal: Counter<string>;

  // Config Metrics
  configReloadTotal: Counter<string>;
  configReloadFailuresTotal: Counter<string>;
  configLastReloadTimestamp: Gauge<string>;
  configVersionInfo: Gauge<string>;

  // SLI/SLO Metrics
  sliAvailability: Gauge<string>;
  sliLatencyP99: Gauge<string>;
  sloErrorBudget: Gauge<string>;
}

/**
 * Metric recording options
 */
export interface RecordMetricOptions {
  labels?: Record<string, string | number>;
  value?: number;
  timestamp?: Date;
}

/**
 * SLI configuration
 */
export interface SLIConfig {
  availabilityTarget: number; // e.g., 99.9
  latencyP99Target: number; // e.g., 500ms
  errorBudgetWindow: number; // e.g., 30 days
}
