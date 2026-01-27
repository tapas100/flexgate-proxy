import { logger } from './logger';
import type { CircuitBreakerState, CircuitBreakerStats } from './types';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  volumeThreshold?: number;
  windowMs?: number;
  openDuration?: number;
  halfOpenRequests?: number;
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
}

class CircuitBreaker {
  private name: string;
  public state: CircuitBreakerState;
  private failureThreshold: number;
  private volumeThreshold: number;
  private windowMs: number;
  public openDuration: number;
  private halfOpenRequests: number;
  private requests: RequestRecord[];
  private halfOpenAttempts: number;
  private openedAt: number | null;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.state = 'CLOSED';
    
    // Configuration
    this.failureThreshold = options.failureThreshold || 50; // %
    this.volumeThreshold = options.volumeThreshold || 10;
    this.windowMs = options.windowMs || 10000;
    this.openDuration = options.openDuration || 30000;
    this.halfOpenRequests = options.halfOpenRequests || 3;
    
    // State
    this.requests = [];
    this.halfOpenAttempts = 0;
    this.openedAt = null;
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      // Check if timeout has elapsed
      if (this.openedAt && Date.now() - this.openedAt >= this.openDuration) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        logger.info('circuit_breaker.half_open', {
          event: 'circuit_breaker.half_open',
          circuitBreaker: this.name
        });
      } else {
        const error: any = new Error('Circuit breaker is OPEN');
        error.circuitBreakerOpen = true;
        throw error;
      }
    }
    
    // Half-open: limit trial requests
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenAttempts >= this.halfOpenRequests) {
        const error: any = new Error('Circuit breaker HALF_OPEN trial limit reached');
        error.circuitBreakerOpen = true;
        throw error;
      }
      this.halfOpenAttempts++;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.recordRequest(true);
    
    if (this.state === 'HALF_OPEN') {
      // Check if we've had enough successful trial requests
      const recentRequests = this.getRecentRequests();
      const successfulTrials = recentRequests.filter(r => r.success).length;
      
      if (successfulTrials >= this.halfOpenRequests) {
        this.state = 'CLOSED';
        this.openedAt = null;
        logger.info('circuit_breaker.closed', {
          event: 'circuit_breaker.closed',
          circuitBreaker: this.name
        });
      }
    }
  }
  
  public onFailure(): void {
    this.recordRequest(false);
    
    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open returns to open
      this.state = 'OPEN';
      this.openedAt = Date.now();
      logger.warn('circuit_breaker.reopened', {
        event: 'circuit_breaker.reopened',
        circuitBreaker: this.name
      });
      return;
    }
    
    if (this.state === 'CLOSED') {
      const recentRequests = this.getRecentRequests();
      
      if (recentRequests.length >= this.volumeThreshold) {
        const failures = recentRequests.filter(r => !r.success).length;
        const failureRate = (failures / recentRequests.length) * 100;
        
        if (failureRate >= this.failureThreshold) {
          this.state = 'OPEN';
          this.openedAt = Date.now();
          logger.error('circuit_breaker.opened', {
            event: 'circuit_breaker.opened',
            circuitBreaker: this.name,
            metadata: {
              failureRate: failureRate.toFixed(2),
              threshold: this.failureThreshold,
              requests: recentRequests.length
            }
          });
        }
      }
    }
  }
  
  private recordRequest(success: boolean): void {
    const now = Date.now();
    this.requests.push({ timestamp: now, success });
    
    // Clean old requests
    this.requests = this.requests.filter(r => now - r.timestamp < this.windowMs);
  }
  
  private getRecentRequests(): RequestRecord[] {
    const now = Date.now();
    return this.requests.filter(r => now - r.timestamp < this.windowMs);
  }
  
  getState(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.getRecentRequests().filter(r => !r.success).length,
      successes: this.getRecentRequests().filter(r => r.success).length,
      lastFailureTime: this.openedAt || undefined,
      nextAttemptTime: this.openedAt && this.state === 'OPEN' 
        ? this.openedAt + this.openDuration 
        : undefined
    };
  }
  
  getFailureRate(): number {
    const recentRequests = this.getRecentRequests();
    if (recentRequests.length === 0) return 0;
    
    const failures = recentRequests.filter(r => !r.success).length;
    return (failures / recentRequests.length) * 100;
  }
  
  reset(): void {
    this.state = 'CLOSED';
    this.requests = [];
    this.halfOpenAttempts = 0;
    this.openedAt = null;
  }
}

export default CircuitBreaker;
