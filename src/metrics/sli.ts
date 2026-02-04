/**
 * SLI/SLO Calculator
 * Calculates Service Level Indicators and tracks Error Budget
 */

import { metrics } from './index';
import { SLIConfig } from './types';

/**
 * Default SLI/SLO configuration
 */
const DEFAULT_SLI_CONFIG: SLIConfig = {
  availabilityTarget: 99.9,  // 99.9% uptime
  latencyP99Target: 500,     // 500ms p99 latency
  errorBudgetWindow: 30      // 30 days
};

/**
 * SLI Calculator class
 */
export class SLICalculator {
  private config: SLIConfig;
  private totalRequests: number = 0;
  private successfulRequests: number = 0;

  constructor(config: Partial<SLIConfig> = {}) {
    this.config = { ...DEFAULT_SLI_CONFIG, ...config };
  }

  /**
   * Calculate current availability percentage
   */
  calculateAvailability(totalRequests: number, failedRequests: number): number {
    if (totalRequests === 0) return 100;
    const successRate = ((totalRequests - failedRequests) / totalRequests) * 100;
    return Math.min(100, Math.max(0, successRate));
  }

  /**
   * Calculate remaining error budget percentage
   * Error budget = (1 - SLO) * total requests
   * Remaining = error budget - actual errors
   */
  calculateErrorBudget(totalRequests: number, failedRequests: number): number {
    if (totalRequests === 0) return 100;
    
    const allowedFailures = totalRequests * (1 - this.config.availabilityTarget / 100);
    const remainingBudget = allowedFailures - failedRequests;
    const budgetPercentage = (remainingBudget / allowedFailures) * 100;
    
    return Math.min(100, Math.max(0, budgetPercentage));
  }

  /**
   * Update SLI metrics based on current state
   * Should be called periodically (e.g., every 60 seconds)
   */
  async updateMetrics(requestStats: {
    total: number;
    failed: number;
    p99Latency?: number;
  }): Promise<void> {
    // Calculate availability
    const availability = this.calculateAvailability(
      requestStats.total,
      requestStats.failed
    );
    
    // Update availability metric
    metrics.sliAvailability.set(availability);
    
    // Update latency metric if available
    if (requestStats.p99Latency !== undefined) {
      metrics.sliLatencyP99.set(requestStats.p99Latency);
    }
    
    // Calculate error budget
    const errorBudget = this.calculateErrorBudget(
      requestStats.total,
      requestStats.failed
    );
    
    // Update error budget metric
    metrics.sloErrorBudget.set(errorBudget);
  }

  /**
   * Check if SLO is being met
   */
  isSLOMet(availability: number, p99Latency?: number): boolean {
    const availabilityMet = availability >= this.config.availabilityTarget;
    const latencyMet = p99Latency === undefined || p99Latency <= this.config.latencyP99Target;
    
    return availabilityMet && latencyMet;
  }

  /**
   * Get SLO status
   */
  getSLOStatus(): {
    availability: { target: number; met: boolean };
    latency: { target: number; met: boolean };
    errorBudget: { remaining: number; healthy: boolean };
  } {
    const availability = this.calculateAvailability(
      this.totalRequests,
      this.totalRequests - this.successfulRequests
    );
    
    const errorBudget = this.calculateErrorBudget(
      this.totalRequests,
      this.totalRequests - this.successfulRequests
    );
    
    return {
      availability: {
        target: this.config.availabilityTarget,
        met: availability >= this.config.availabilityTarget
      },
      latency: {
        target: this.config.latencyP99Target,
        met: true // Would need to track p99 over time
      },
      errorBudget: {
        remaining: errorBudget,
        healthy: errorBudget > 10 // Less than 10% error budget remaining is unhealthy
      }
    };
  }
}

/**
 * Global SLI calculator instance
 */
export const sliCalculator = new SLICalculator();

/**
 * Start periodic SLI updates
 * @param intervalMs - Update interval in milliseconds (default: 60000 = 1 minute)
 */
export function startSLIUpdates(intervalMs: number = 60000): NodeJS.Timeout {
  return setInterval(async () => {
    // In a real implementation, we would query Prometheus for actual request counts
    // For now, this is a placeholder that can be extended
    await sliCalculator.updateMetrics({
      total: 0,
      failed: 0,
      p99Latency: 0
    });
  }, intervalMs);
}

export default sliCalculator;
