/**
 * Health Check Monitor
 * Periodically polls upstream health check endpoints and emits events
 */

import { logger } from '../logger';
import { eventBus, EventType } from '../events/EventBus';
import { Upstream } from '../types';

interface HealthCheckState {
  upstream: string;
  url: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  isHealthy: boolean;
  lastCheck?: Date;
  lastError?: string;
}

export class HealthCheckMonitor {
  private states: Map<string, HealthCheckState>;
  private timers: Map<string, NodeJS.Timeout>;
  private upstreams: Upstream[];

  constructor(upstreams: Upstream[]) {
    this.states = new Map();
    this.timers = new Map();
    this.upstreams = upstreams;
  }

  /**
   * Start health check monitoring for all upstreams
   */
  start(): void {
    for (const upstream of this.upstreams) {
      if (upstream.healthCheck?.enabled) {
        this.startMonitoring(upstream);
      }
    }
    logger.info('Health check monitoring started', {
      upstreams: this.upstreams.filter(u => u.healthCheck?.enabled).map(u => u.name)
    });
  }

  /**
   * Start monitoring a specific upstream
   */
  private startMonitoring(upstream: Upstream): void {
    const { name, url, healthCheck } = upstream;
    
    if (!healthCheck?.enabled) return;

    // Initialize state
    this.states.set(name, {
      upstream: name,
      url,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      isHealthy: true, // Assume healthy initially
    });

    // Start periodic health checks
    const interval = healthCheck.interval || 30000;
    const timer = setInterval(() => {
      this.checkHealth(upstream);
    }, interval);

    this.timers.set(name, timer);

    // Run initial check immediately
    this.checkHealth(upstream);

    logger.info('Health check monitoring started for upstream', {
      upstream: name,
      interval: `${interval}ms`,
      path: healthCheck.path || '/health',
    });
  }

  /**
   * Perform health check for an upstream
   */
  private async checkHealth(upstream: Upstream): Promise<void> {
    const { name, url, healthCheck } = upstream;
    const state = this.states.get(name);
    
    if (!state || !healthCheck) return;

    const healthCheckUrl = `${url}${healthCheck.path || '/health'}`;
    const timeout = healthCheck.timeout || 5000;
    const unhealthyThreshold = healthCheck.unhealthyThreshold || 3;
    const healthyThreshold = healthCheck.healthyThreshold || 2;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Health check passed
        state.consecutiveSuccesses++;
        state.consecutiveFailures = 0;
        state.lastCheck = new Date();
        state.lastError = undefined;

        // Check if we should emit recovery event
        if (!state.isHealthy && state.consecutiveSuccesses >= healthyThreshold) {
          state.isHealthy = true;
          this.emitRecoveryEvent(state);
        }

        logger.debug('Health check passed', {
          upstream: name,
          consecutiveSuccesses: state.consecutiveSuccesses,
          statusCode: response.status,
        });
      } else {
        // Health check failed (non-2xx response)
        this.handleFailure(state, unhealthyThreshold, `HTTP ${response.status}`);
      }
    } catch (error: any) {
      // Health check failed (timeout, connection error, etc.)
      const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
      this.handleFailure(state, unhealthyThreshold, errorMsg);
    }
  }

  /**
   * Handle health check failure
   */
  private handleFailure(state: HealthCheckState, unhealthyThreshold: number, errorMsg: string): void {
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0;
    state.lastCheck = new Date();
    state.lastError = errorMsg;

    // Check if we should emit failure event
    if (state.isHealthy && state.consecutiveFailures >= unhealthyThreshold) {
      state.isHealthy = false;
      this.emitFailureEvent(state);
    }

    logger.warn('Health check failed', {
      upstream: state.upstream,
      consecutiveFailures: state.consecutiveFailures,
      error: errorMsg,
    });
  }

  /**
   * Emit health check failed event
   */
  private emitFailureEvent(state: HealthCheckState): void {
    eventBus.emitEvent(EventType.HEALTH_CHECK_FAILED, {
      timestamp: new Date().toISOString(),
      source: 'health_monitor',
      upstream: state.upstream,
      upstreamUrl: state.url,
      consecutiveFailures: state.consecutiveFailures,
      lastError: state.lastError,
      lastCheck: state.lastCheck?.toISOString(),
    } as any);

    logger.error('Upstream health check failed', {
      upstream: state.upstream,
      consecutiveFailures: state.consecutiveFailures,
      error: state.lastError,
    });
  }

  /**
   * Emit health check recovered event
   */
  private emitRecoveryEvent(state: HealthCheckState): void {
    eventBus.emitEvent(EventType.HEALTH_CHECK_RECOVERED, {
      timestamp: new Date().toISOString(),
      source: 'health_monitor',
      upstream: state.upstream,
      upstreamUrl: state.url,
      consecutiveSuccesses: state.consecutiveSuccesses,
      lastCheck: state.lastCheck?.toISOString(),
    } as any);

    logger.info('Upstream health check recovered', {
      upstream: state.upstream,
      consecutiveSuccesses: state.consecutiveSuccesses,
    });
  }

  /**
   * Stop health check monitoring
   */
  stop(): void {
    for (const [name, timer] of this.timers.entries()) {
      clearInterval(timer);
      logger.info('Health check monitoring stopped', { upstream: name });
    }
    this.timers.clear();
    this.states.clear();
  }

  /**
   * Get current health status for all upstreams
   */
  getStatus(): Map<string, HealthCheckState> {
    return new Map(this.states);
  }
}

export default HealthCheckMonitor;
