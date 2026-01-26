const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');
const config = require('./config/loader');
const { logger } = require('./logger');

class RateLimiter {
  constructor() {
    this.redisClient = null;
    this.rateLimitConfig = config.get('rateLimit', { enabled: false });
  }
  
  async initialize() {
    if (!this.rateLimitConfig.enabled) {
      logger.info('Rate limiting disabled');
      return;
    }
    
    // Initialize Redis if configured
    if (this.rateLimitConfig.backend === 'redis') {
      try {
        const redisUrl = process.env.REDIS_URL || this.rateLimitConfig.redis?.url;
        if (redisUrl) {
          this.redisClient = createClient({ url: redisUrl });
          await this.redisClient.connect();
          logger.info('✅ Redis connected for rate limiting');
        }
      } catch (error) {
        logger.warn('⚠️  Redis connection failed, falling back to local rate limiting', { error: error.message });
        this.rateLimitConfig.backend = 'local';
      }
    }
  }
  
  createLimiter(options = {}) {
    if (!this.rateLimitConfig.enabled) {
      return (req, res, next) => next();
    }
    
    const globalConfig = this.rateLimitConfig.global || {};
    const limiterOptions = {
      windowMs: options.windowMs || globalConfig.windowMs || 60000,
      max: options.max || globalConfig.max || 100,
      message: options.message || {
        error: 'Rate limit exceeded',
        retryAfter: '{{retryAfter}}'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
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
          retryAfter: Math.ceil(res.getHeader('Retry-After'))
        });
      }
    };
    
    // Use Redis store if available
    if (this.redisClient && this.rateLimitConfig.backend === 'redis') {
      limiterOptions.store = new RedisStore({
        client: this.redisClient,
        prefix: 'ratelimit:'
      });
    }
    
    return rateLimit(limiterOptions);
  }
  
  getRouteLimit(route) {
    const routeLimits = this.rateLimitConfig.perRoute || [];
    const routeLimit = routeLimits.find(rl => {
      if (rl.path === route) return true;
      if (rl.path.endsWith('/*')) {
        const prefix = rl.path.slice(0, -2);
        return route.startsWith(prefix);
      }
      return false;
    });
    
    return routeLimit;
  }
  
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

module.exports = new RateLimiter();
