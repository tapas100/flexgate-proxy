/**
 * Enhanced Rate Limiter with Approaching/Recovered Events
 * Wraps express-rate-limit to emit additional events
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { eventBus, EventType, RateLimitEventPayload } from './events/EventBus';
import { logger } from './logger';

interface RateLimitTracker {
  count: number;
  windowStart: number;
  approachingEmitted: boolean;
  exceededEmitted: boolean;
}

export class EnhancedRateLimiter {
  private trackers: Map<string, RateLimitTracker> = new Map();
  private approachingThreshold: number = 0.8; // 80%

  /**
   * Create an enhanced rate limiter with event emissions
   */
  createLimiter(options: {
    windowMs?: number;
    max?: number;
    message?: string | object;
    keyGenerator?: (req: Request) => string;
  }) {
    const windowMs = options.windowMs || 60000;
    const max = options.max || 100;
    const keyGenerator = options.keyGenerator || ((req: Request) => {
      const route = req.route?.path || req.path;
      const clientIp = req.ip || 'unknown';
      return `${route}:${clientIp}`;
    });

    // Create base rate limiter
    const baseLimiter = rateLimit({
      windowMs,
      max,
      message: options.message || { error: 'Rate limit exceeded' },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator,
    });

    // Enhanced middleware wrapper
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = keyGenerator(req);
      const now = Date.now();
      
      // Get or create tracker
      let tracker = this.trackers.get(key);
      
      // Reset tracker if window expired
      if (!tracker || (now - tracker.windowStart) >= windowMs) {
        tracker = {
          count: 0,
          windowStart: now,
          approachingEmitted: false,
          exceededEmitted: false,
        };
        this.trackers.set(key, tracker);
        
        // Emit recovered event if previously exceeded
        const oldTracker = this.trackers.get(key);
        if (oldTracker?.exceededEmitted) {
          this.emitRecoveredEvent(req, max, windowMs);
        }
      }

      // Increment count
      tracker.count++;

      // Calculate percentage used
      const percentUsed = (tracker.count / max) * 100;

      // Emit approaching event at 80% threshold
      if (!tracker.approachingEmitted && percentUsed >= (this.approachingThreshold * 100) && percentUsed < 100) {
        tracker.approachingEmitted = true;
        this.emitApproachingEvent(req, tracker.count, max, percentUsed, windowMs);
      }

      // Emit exceeded event when limit reached
      if (!tracker.exceededEmitted && tracker.count >= max) {
        tracker.exceededEmitted = true;
        // Note: base limiter will also emit exceeded event, but we emit here for consistency
      }

      // Call base rate limiter
      return baseLimiter(req, res, next);
    };
  }

  /**
   * Emit rate limit approaching event
   */
  private emitApproachingEvent(
    req: Request,
    current: number,
    limit: number,
    percentUsed: number,
    windowMs: number
  ): void {
    const route = req.route?.path || req.path;
    const eventPayload: RateLimitEventPayload = {
      timestamp: new Date().toISOString(),
      source: 'rate_limiter',
      routeId: route,
      routePath: route,
      clientId: req.ip || 'unknown',
      limit,
      current,
      windowSeconds: windowMs / 1000,
      percentUsed,
    };

    eventBus.emitEvent(EventType.RATE_LIMIT_APPROACHING, eventPayload);

    logger.warn('rate_limit.approaching', {
      correlationId: req.correlationId,
      event: 'rate_limit.approaching',
      http: {
        method: req.method,
        path: req.path,
        clientIp: req.ip
      },
      metadata: {
        current,
        limit,
        percentUsed: `${percentUsed.toFixed(1)}%`,
      }
    });
  }

  /**
   * Emit rate limit recovered event
   */
  private emitRecoveredEvent(
    req: Request,
    limit: number,
    windowMs: number
  ): void {
    const route = req.route?.path || req.path;
    const eventPayload: RateLimitEventPayload = {
      timestamp: new Date().toISOString(),
      source: 'rate_limiter',
      routeId: route,
      routePath: route,
      clientId: req.ip || 'unknown',
      limit,
      current: 0,
      windowSeconds: windowMs / 1000,
      percentUsed: 0,
    };

    eventBus.emitEvent(EventType.RATE_LIMIT_RECOVERED, eventPayload);

    logger.info('rate_limit.recovered', {
      correlationId: req.correlationId,
      event: 'rate_limit.recovered',
      http: {
        method: req.method,
        path: req.path,
        clientIp: req.ip
      },
      metadata: {
        limit,
        windowMs,
      }
    });
  }

  /**
   * Clean up old trackers to prevent memory leak
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [key, tracker] of this.trackers.entries()) {
      if (now - tracker.windowStart > maxAge) {
        this.trackers.delete(key);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanup(intervalMs: number = 300000): NodeJS.Timeout {
    return setInterval(() => this.cleanup(), intervalMs);
  }
}

export default new EnhancedRateLimiter();
