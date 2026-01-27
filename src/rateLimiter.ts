import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';
import config from './config/loader';
import { logger } from './logger';
import type { Request, Response, NextFunction } from 'express';
import type { RateLimiterOptions } from './types';

class RateLimiter {
  private redisClient: RedisClientType | null;
  private rateLimitConfig: any;

  constructor() {
    this.redisClient = null;
    this.rateLimitConfig = config.get('rateLimit', { enabled: false });
  }
  
  async initialize(): Promise<void> {
    if (!this.rateLimitConfig.enabled) {
      logger.info('Rate limiting disabled');
      return;
    }
    
    // Initialize Redis if configured
    if (this.rateLimitConfig.backend === 'redis') {
      try {
        const redisUrl = process.env.REDIS_URL || this.rateLimitConfig.redis?.url;
        if (redisUrl) {
          this.redisClient = createClient({ url: redisUrl }) as RedisClientType;
          await this.redisClient.connect();
          logger.info('✅ Redis connected for rate limiting');
        }
      } catch (error: any) {
        logger.warn('⚠️  Redis connection failed, falling back to local rate limiting', { 
          error: error.message 
        });
        this.rateLimitConfig.backend = 'local';
      }
    }
  }
  
  createLimiter(options: Partial<RateLimiterOptions> = {}) {
    if (!this.rateLimitConfig.enabled) {
      return (_req: Request, _res: Response, next: NextFunction) => next();
    }
    
    const globalConfig = this.rateLimitConfig.global || {};
    const limiterOptions: any = {
      windowMs: options.windowMs || globalConfig.windowMs || 60000,
      max: options.max || globalConfig.max || 100,
      message: options.message || {
        error: 'Rate limit exceeded',
        retryAfter: '{{retryAfter}}'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        logger.warn('rate_limit.exceeded', {
          correlationId: req.correlationId,
          event: 'rate_limit.exceeded',
          http: {
            method: req.method,
            path: req.path,
            clientIp: req.ip
          },
          metadata: {
            route: req.route?.path,
            limit: options.max
          }
        });
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(Number(res.getHeader('Retry-After')))
        });
      }
    };
    
    // Use Redis store if available
    if (this.redisClient && this.rateLimitConfig.backend === 'redis') {
      limiterOptions.store = new RedisStore({
        // @ts-ignore - RedisStore typing issue
        client: this.redisClient,
        prefix: 'ratelimit:'
      });
    }
    
    return rateLimit(limiterOptions);
  }
  
  getRouteLimit(route: string): any {
    const routeLimits = this.rateLimitConfig.perRoute || [];
    const routeLimit = routeLimits.find((rl: any) => {
      if (rl.path === route) return true;
      if (rl.path.endsWith('/*')) {
        const prefix = rl.path.slice(0, -2);
        return route.startsWith(prefix);
      }
      return false;
    });
    
    return routeLimit;
  }
  
  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

export default new RateLimiter();
