import promClient, { Registry } from 'prom-client';
import { MetricCollectors } from './types';

/**
 * Central metrics registry
 */
export class MetricsRegistry {
  public registry: Registry;
  public collectors: MetricCollectors;

  constructor() {
    this.registry = new Registry();
    
    // Collect default Node.js metrics (CPU, memory, event loop, etc.)
    promClient.collectDefaultMetrics({ 
      register: this.registry,
      prefix: 'flexgate_',
    });

    // Initialize all custom metric collectors
    this.collectors = this.initializeCollectors();
  }

  /**
   * Initialize all metric collectors
   */
  private initializeCollectors(): MetricCollectors {
    return {
      // HTTP Metrics
      httpRequestsTotal: new promClient.Counter({
        name: 'flexgate_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [this.registry],
      }),

      httpRequestDuration: new promClient.Histogram({
        name: 'flexgate_http_request_duration_ms',
        help: 'HTTP request duration in milliseconds',
        labelNames: ['method', 'route', 'status'],
        buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
        registers: [this.registry],
      }),

      httpRequestsInFlight: new promClient.Gauge({
        name: 'flexgate_http_requests_in_flight',
        help: 'Current number of HTTP requests being processed',
        labelNames: ['method', 'route'],
        registers: [this.registry],
      }),

      httpRequestSizeBytes: new promClient.Histogram({
        name: 'flexgate_http_request_size_bytes',
        help: 'HTTP request body size in bytes',
        labelNames: ['method', 'route'],
        buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
        registers: [this.registry],
      }),

      httpResponseSizeBytes: new promClient.Histogram({
        name: 'flexgate_http_response_size_bytes',
        help: 'HTTP response body size in bytes',
        labelNames: ['method', 'route', 'status'],
        buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
        registers: [this.registry],
      }),

      httpRequestsByStatusFamily: new promClient.Counter({
        name: 'flexgate_http_requests_by_status_family_total',
        help: 'Total HTTP requests grouped by status code family',
        labelNames: ['method', 'route', 'status_family'],
        registers: [this.registry],
      }),

      // Circuit Breaker Metrics
      circuitBreakerState: new promClient.Gauge({
        name: 'flexgate_circuit_breaker_state',
        help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
        labelNames: ['upstream', 'route'],
        registers: [this.registry],
      }),

      circuitBreakerTransitionsTotal: new promClient.Counter({
        name: 'flexgate_circuit_breaker_transitions_total',
        help: 'Total circuit breaker state transitions',
        labelNames: ['upstream', 'route', 'from_state', 'to_state'],
        registers: [this.registry],
      }),

      circuitBreakerFailuresTotal: new promClient.Counter({
        name: 'flexgate_circuit_breaker_failures_total',
        help: 'Total circuit breaker failures',
        labelNames: ['upstream', 'route'],
        registers: [this.registry],
      }),

      circuitBreakerSuccessesTotal: new promClient.Counter({
        name: 'flexgate_circuit_breaker_successes_total',
        help: 'Total circuit breaker successes',
        labelNames: ['upstream', 'route'],
        registers: [this.registry],
      }),

      circuitBreakerRejectedTotal: new promClient.Counter({
        name: 'flexgate_circuit_breaker_rejected_total',
        help: 'Total requests rejected by circuit breaker when open',
        labelNames: ['upstream', 'route'],
        registers: [this.registry],
      }),

      circuitBreakerFailureRate: new promClient.Gauge({
        name: 'flexgate_circuit_breaker_failure_rate',
        help: 'Circuit breaker failure rate percentage',
        labelNames: ['upstream', 'route'],
        registers: [this.registry],
      }),

      // Rate Limiter Metrics
      rateLimitRequestsTotal: new promClient.Counter({
        name: 'flexgate_rate_limit_requests_total',
        help: 'Total rate limit checks',
        labelNames: ['route', 'limit_type'],
        registers: [this.registry],
      }),

      rateLimitRequestsAllowed: new promClient.Counter({
        name: 'flexgate_rate_limit_requests_allowed_total',
        help: 'Total requests allowed by rate limiter',
        labelNames: ['route', 'limit_type'],
        registers: [this.registry],
      }),

      rateLimitRequestsRejected: new promClient.Counter({
        name: 'flexgate_rate_limit_requests_rejected_total',
        help: 'Total requests rejected by rate limiter',
        labelNames: ['route', 'limit_type', 'client_id'],
        registers: [this.registry],
      }),

      rateLimitCurrentUsage: new promClient.Gauge({
        name: 'flexgate_rate_limit_current_usage',
        help: 'Current rate limit usage',
        labelNames: ['route', 'limit_type', 'client_id'],
        registers: [this.registry],
      }),

      rateLimitRedisErrorsTotal: new promClient.Counter({
        name: 'flexgate_rate_limit_redis_errors_total',
        help: 'Total Redis errors in rate limiter',
        labelNames: ['error_type'],
        registers: [this.registry],
      }),

      // Upstream Metrics
      upstreamRequestsTotal: new promClient.Counter({
        name: 'flexgate_upstream_requests_total',
        help: 'Total requests to upstream services',
        labelNames: ['upstream', 'upstream_host', 'route', 'status'],
        registers: [this.registry],
      }),

      upstreamRequestDuration: new promClient.Histogram({
        name: 'flexgate_upstream_request_duration_ms',
        help: 'Upstream request duration in milliseconds',
        labelNames: ['upstream', 'upstream_host', 'route'],
        buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
        registers: [this.registry],
      }),

      upstreamErrorsTotal: new promClient.Counter({
        name: 'flexgate_upstream_errors_total',
        help: 'Total upstream errors',
        labelNames: ['upstream', 'upstream_host', 'route', 'error_type'],
        registers: [this.registry],
      }),

      upstreamAvailability: new promClient.Gauge({
        name: 'flexgate_upstream_availability',
        help: 'Upstream availability status (0=down, 1=up)',
        labelNames: ['upstream', 'upstream_host'],
        registers: [this.registry],
      }),

      upstreamTimeoutsTotal: new promClient.Counter({
        name: 'flexgate_upstream_timeouts_total',
        help: 'Total upstream timeout errors',
        labelNames: ['upstream', 'upstream_host', 'route'],
        registers: [this.registry],
      }),

      // Config Metrics
      configReloadTotal: new promClient.Counter({
        name: 'flexgate_config_reload_total',
        help: 'Total configuration reloads',
        labelNames: ['status'],
        registers: [this.registry],
      }),

      configReloadFailuresTotal: new promClient.Counter({
        name: 'flexgate_config_reload_failures_total',
        help: 'Total configuration reload failures',
        labelNames: ['error_type'],
        registers: [this.registry],
      }),

      configLastReloadTimestamp: new promClient.Gauge({
        name: 'flexgate_config_last_reload_timestamp',
        help: 'Timestamp of last successful config reload',
        registers: [this.registry],
      }),

      configVersionInfo: new promClient.Gauge({
        name: 'flexgate_config_version_info',
        help: 'Configuration version information',
        labelNames: ['version', 'config_file'],
        registers: [this.registry],
      }),

      // SLI/SLO Metrics
      sliAvailability: new promClient.Gauge({
        name: 'flexgate_sli_availability_percent',
        help: 'Service availability percentage (SLI)',
        registers: [this.registry],
      }),

      sliLatencyP99: new promClient.Gauge({
        name: 'flexgate_sli_latency_p99_ms',
        help: '99th percentile latency in milliseconds (SLI)',
        registers: [this.registry],
      }),

      sloErrorBudget: new promClient.Gauge({
        name: 'flexgate_slo_error_budget_percent',
        help: 'Remaining error budget percentage (SLO)',
        registers: [this.registry],
      }),
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    try {
      return await this.registry.metrics();
    } catch (error) {
      console.error('[Metrics] Failed to get metrics', error);
      throw error;
    }
  }

  /**
   * Get metrics content type for HTTP responses
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.registry.resetMetrics();
  }

  /**
   * Clear all metrics and collectors
   */
  clear(): void {
    this.registry.clear();
  }
}

// Export singleton instance
export const metricsRegistry = new MetricsRegistry();
export const metrics = metricsRegistry.collectors;
export const registry = metricsRegistry.registry;

export default metricsRegistry;
