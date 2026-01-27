import createError from 'http-errors';
import express, { Request, Response, NextFunction, Application } from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
import promClient from 'prom-client';

// Internal modules
import config from './src/config/loader';
import { logger, requestLogger } from './src/logger';
import rateLimiter from './src/rateLimiter';
import CircuitBreaker from './src/circuitBreaker';
import { getSchemaVersion } from './src/config/schema';
import { ProxyRoute, Upstream, RateLimitConfig } from './src/types';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      upstream?: string;
    }
  }
}

// Load configuration
config.load();

const app: Application = express();

// API version
const API_VERSION = '1.0.0';
const CONFIG_VERSION = getSchemaVersion();

// Add version headers to all responses
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-API-Version', API_VERSION);
  res.setHeader('X-Config-Version', CONFIG_VERSION);
  next();
});

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});

// Circuit breakers for upstreams
const circuitBreakers = new Map<string, CircuitBreaker>();
const upstreams = config.get<Upstream[]>('upstreams', []);
upstreams.forEach((upstream: Upstream) => {
  if (upstream.circuitBreaker?.enabled !== false) {
    const cb = new CircuitBreaker(upstream.name, upstream.circuitBreaker || {});
    circuitBreakers.set(upstream.name, cb);
    logger.info(`Circuit breaker initialized for upstream: ${upstream.name}`);
  }
});

// Basic middleware
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
app.use(express.json({ limit: config.get<string>('proxy.maxBodySize', '10mb') }));
app.use(express.urlencoded({ extended: false, limit: config.get<string>('proxy.maxBodySize', '10mb') }));
app.use(cookieParser());
app.use(cors());

// Request logging with correlation IDs
app.use(requestLogger);

// Metrics middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path;
    
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: res.statusCode.toString()
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route,
      status: res.statusCode.toString()
    }, duration);
  });
  
  next();
});

// Initialize rate limiter
rateLimiter.initialize().catch((err: Error) => {
  logger.error('Failed to initialize rate limiter', { error: err.message });
});

// Version info endpoint
app.get('/version', (_req: Request, res: Response) => {
  const pkg = require('./package.json');
  res.json({
    name: pkg.name,
    version: pkg.version,
    apiVersion: API_VERSION,
    configVersion: CONFIG_VERSION,
    node: process.version,
    uptime: process.uptime()
  });
});

// Health endpoints
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    version: API_VERSION
  });
});

app.get('/health/live', (_req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    version: API_VERSION
  });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    config: 'UP',
    upstreams: 'UP'
  };
  
  // Check circuit breakers
  let allUpstreamsHealthy = true;
  circuitBreakers.forEach((cb: CircuitBreaker, _name: string) => {
    if (cb.state === 'OPEN') {
      allUpstreamsHealthy = false;
      checks.upstreams = 'DEGRADED';
    }
  });
  
  const overallStatus = allUpstreamsHealthy ? 'UP' : 'DEGRADED';
  
  res.status(overallStatus === 'UP' ? 200 : 503).json({
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString()
  });
});

app.get('/health/deep', (_req: Request, res: Response) => {
  const upstreamStates: Record<string, any> = {};
  circuitBreakers.forEach((cb: CircuitBreaker, name: string) => {
    upstreamStates[name] = cb.getState();
  });
  
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'UP',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    circuitBreakers: upstreamStates,
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      percentUsed: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2)
    }
  });
});

// Metrics endpoint
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Setup proxy routes
const routes = config.get<ProxyRoute[]>('routes', []);
routes.forEach((route: ProxyRoute) => {
  const upstream = upstreams.find((u: Upstream) => u.name === route.upstream);
  if (!upstream) {
    logger.error(`Route ${route.path} references unknown upstream: ${route.upstream}`);
    return;
  }
  
  // Apply rate limiting if configured
  const routeLimit = rateLimiter.getRouteLimit(route.path);
  if (routeLimit || route.rateLimit) {
    const limitConfig = route.rateLimit || routeLimit;
    app.use(route.path, rateLimiter.createLimiter(limitConfig as RateLimitConfig));
  }
  
  // Create proxy middleware
  const proxyOptions: ProxyOptions = {
    target: upstream.url,
    changeOrigin: true,
    pathRewrite: route.stripPath ? {
      [`^${route.stripPath}`]: ''
    } : undefined,
    timeout: route.timeout || upstream.timeout || config.get<number>('timeouts.request', 30000),
    
    onProxyReq: (proxyReq: any, req: any, _res: any) => {
      // Add correlation ID
      if (req.correlationId) {
        proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      }
      
      // Store upstream name for logging
      req.upstream = upstream.name;
      
      logger.debug('proxy.request', {
        correlationId: req.correlationId,
        upstream: upstream.name,
        targetUrl: `${upstream.url}${proxyReq.path}`
      });
    },
    
    onProxyRes: (proxyRes: any, req: any, _res: any) => {
      logger.debug('proxy.response', {
        correlationId: req.correlationId,
        upstream: upstream.name,
        statusCode: proxyRes.statusCode
      });
    },
    
    onError: (err: Error, req: any, res: any) => {
      logger.error('proxy.error', {
        correlationId: req.correlationId,
        upstream: upstream.name,
        error: err.message
      });
      
      // Record circuit breaker failure
      const cb = circuitBreakers.get(upstream.name);
      if (cb) {
        cb.onFailure();
      }
      
      res.status(502).json({
        error: 'Bad Gateway',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Upstream error',
        correlationId: req.correlationId
      });
    }
  };
  
  // Wrap proxy in circuit breaker
  const cb = circuitBreakers.get(upstream.name);
  if (cb) {
    app.use(route.path, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await cb.execute(async () => {
          return new Promise<void>((resolve, reject) => {
            const proxy = createProxyMiddleware(proxyOptions);
            proxy(req as any, res as any, (err?: any) => {
              if (err) reject(err);
              else resolve();
            });
          });
        });
      } catch (error: any) {
        if (error.circuitBreakerOpen) {
          logger.warn('circuit_breaker.request_rejected', {
            correlationId: req.correlationId,
            upstream: upstream.name,
            circuitState: cb.state
          });
          
          res.status(503).json({
            error: 'Service Unavailable',
            message: 'Circuit breaker is open',
            correlationId: req.correlationId,
            retryAfter: Math.ceil(cb.openDuration / 1000)
          });
          return;
        }
        next(error);
      }
    });
  } else {
    app.use(route.path, createProxyMiddleware(proxyOptions));
  }
  
  logger.info(`Route configured: ${route.path} -> ${upstream.name} (${upstream.url})`);
});

// Catch 404 and forward to error handler
app.use(function(_req: Request, _res: Response, next: NextFunction) {
  next(createError(404));
});

// Error handler
app.use(function(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error('request.error', {
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack
  });
  
  res.status(err.status || 500).json({
    error: err.status === 404 ? 'Not Found' : 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    correlationId: req.correlationId
  });
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  // Close rate limiter
  await rateLimiter.close();
  
  logger.info('Server shut down complete');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;
