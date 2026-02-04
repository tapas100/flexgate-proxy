import createError from 'http-errors';
import express, { Request, Response, NextFunction, Application } from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';

// Internal modules
import config from './src/config/loader';
import { logger, requestLogger } from './src/logger';
import { eventBus, EventType } from './src/events';
import rateLimiter from './src/rateLimiter';
import CircuitBreaker from './src/circuitBreaker';
import HealthCheckMonitor from './src/healthcheck/monitor';
import { getSchemaVersion } from './src/config/schema';
import { ProxyRoute, Upstream, RateLimitConfig } from './src/types';
import metricsRegistry, { metrics } from './src/metrics';
import { initializeAuth } from './src/auth';
import authRoutes from './routes/auth';
import webhookRoutes from './routes/webhooks';
import routeRoutes from './routes/routes';
import metricsRoutes from './routes/metrics';
import logsRoutes from './routes/logs';
import streamRoutes from './src/routes/stream';
import database from './src/database/index';
import { jetStreamService } from './src/services/jetstream';
import { MetricsPublisher } from './src/services/metricsPublisher';
import { metricsMiddleware } from './src/middleware/metrics';
import { WebhookManager } from './src/webhooks/WebhookManager';
import webhooksRepository from './src/database/repositories/webhooksRepository';
import { WebhookDeliveriesRepository } from './src/database/repositories/webhookDeliveriesRepository';

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

// Initialize Einstrust authentication (optional, based on environment variables)
if (process.env.EINSTRUST_API_URL) {
  try {
    const einstrustConfig = {
      apiUrl: process.env.EINSTRUST_API_URL,
      tenantId: process.env.EINSTRUST_TENANT_ID,
      sessionValidation: {
        enabled: true,
        cacheTTL: parseInt(process.env.EINSTRUST_SESSION_CACHE_TTL || '300'),
      },
      sso: {
        enabled: true,
        idpId: process.env.EINSTRUST_IDP_ID || '',
        returnUrl: process.env.EINSTRUST_RETURN_URL || 'http://localhost:3000/auth/callback',
      },
      fallbackAuth: {
        enabled: process.env.FLEXGATE_FALLBACK_AUTH === 'true',
        methods: ['basic' as const, 'apiKey' as const],
      },
    };

    initializeAuth(einstrustConfig);
    logger.info('Einstrust authentication enabled', {
      apiUrl: einstrustConfig.apiUrl,
      ssoEnabled: einstrustConfig.sso.enabled,
    });
  } catch (error) {
    logger.error('Failed to initialize Einstrust authentication', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

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

// Metrics are initialized in the metrics module
// No need to manually create collectors here

// Circuit breakers for upstreams
const circuitBreakers = new Map<string, CircuitBreaker>();
const upstreams = config.get<Upstream[]>('upstreams', []) || [];
upstreams.forEach((upstream: Upstream) => {
  if (upstream.circuitBreaker?.enabled !== false) {
    const cb = new CircuitBreaker(upstream.name, upstream.circuitBreaker || {});
    circuitBreakers.set(upstream.name, cb);
    logger.info(`Circuit breaker initialized for upstream: ${upstream.name}`);
  }
});

// Health check monitoring
const healthCheckMonitor = new HealthCheckMonitor(upstreams);
healthCheckMonitor.start();

// Basic middleware
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
app.use(express.json({ limit: config.get<string>('proxy.maxBodySize', '10mb') || '10mb' }));
app.use(express.urlencoded({ extended: false, limit: config.get<string>('proxy.maxBodySize', '10mb') || '10mb' }));
app.use(cookieParser());
app.use(cors());

// Mount authentication routes
app.use('/api/auth', authRoutes);

// Mount routes management API
app.use('/api/routes', routeRoutes);

// Mount webhook routes
app.use('/api/webhooks', webhookRoutes);

// Mount metrics API
app.use('/api/metrics', metricsRoutes);

// Mount logs API
app.use('/api/logs', logsRoutes);

// Mount stream API (SSE for real-time metrics)
app.use('/api/stream', streamRoutes);

// Request logging with correlation IDs
app.use(requestLogger);

// Database metrics logging
app.use(metricsMiddleware);

// Metrics middleware - track all HTTP requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const route = req.route?.path || req.path;
  
  // Increment in-flight requests
  metrics.httpRequestsInFlight.inc({ method: req.method, route });
  
  // Track request size if available
  const contentLength = req.get('content-length');
  if (contentLength) {
    metrics.httpRequestSizeBytes.observe(
      { method: req.method, route },
      parseInt(contentLength, 10)
    );
  }
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode.toString();
    const statusFamily = `${Math.floor(res.statusCode / 100)}xx` as '2xx' | '3xx' | '4xx' | '5xx';
    
    // Decrement in-flight requests
    metrics.httpRequestsInFlight.dec({ method: req.method, route });
    
    // Record total requests
    metrics.httpRequestsTotal.inc({
      method: req.method,
      route,
      status: statusCode
    });
    
    // Record requests by status family
    metrics.httpRequestsByStatusFamily.inc({
      method: req.method,
      route,
      status_family: statusFamily
    });
    
    // Record request duration
    metrics.httpRequestDuration.observe({
      method: req.method,
      route,
      status: statusCode
    }, duration);
    
    // Record response size if available
    const responseLength = res.get('content-length');
    if (responseLength) {
      metrics.httpResponseSizeBytes.observe(
        { method: req.method, route, status: statusCode },
        parseInt(responseLength, 10)
      );
    }
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

// Prometheus metrics endpoint (moved to avoid conflict with admin UI /metrics page)
app.get('/prometheus-metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsRegistry.getContentType());
    res.end(await metricsRegistry.getMetrics());
  } catch (error) {
    logger.error('Failed to collect metrics', { error });
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

// Function to setup a proxy route
function setupProxyRoute(route: ProxyRoute) {
  // For database routes, upstream is a URL string; for config routes, it's a name reference
  let upstream: Upstream | undefined;
  let upstreamUrl: string;
  let upstreamName: string;
  
  if (route.upstream.startsWith('http://') || route.upstream.startsWith('https://')) {
    // Database route - upstream is a URL
    upstreamUrl = route.upstream;
    upstreamName = new URL(route.upstream).host;
    upstream = {
      name: upstreamName,
      url: upstreamUrl,
    } as Upstream;
  } else {
    // Config route - upstream is a name reference
    upstream = upstreams.find((u: Upstream) => u.name === route.upstream);
    if (!upstream) {
      logger.error(`Route ${route.path} references unknown upstream: ${route.upstream}`);
      return;
    }
    upstreamUrl = upstream.url;
    upstreamName = upstream.name;
  }
  
  if (!upstream) {
    logger.error(`Route ${route.path} has invalid upstream configuration`);
    return;
  }
  
  // Handle wildcard routes - convert /path/* to /path and strip the base path
  let expressPath = route.path;
  let pathRewrite: { [key: string]: string } | undefined;
  
  if (route.path.endsWith('/*')) {
    expressPath = route.path.slice(0, -2); // Remove /*
    pathRewrite = {
      [`^${expressPath}`]: '' // Strip the base path
    };
  } else if (route.stripPath) {
    pathRewrite = {
      [`^${route.stripPath}`]: ''
    };
  }
  
  // Apply rate limiting if configured
  const routeLimit = rateLimiter.getRouteLimit(route.path);
  if (routeLimit || route.rateLimit) {
    const limitConfig = route.rateLimit || routeLimit;
    app.use(expressPath, rateLimiter.createLimiter(limitConfig as RateLimitConfig));
  }
  
  // Create proxy middleware
  const proxyOptions: ProxyOptions = {
    target: upstreamUrl,
    changeOrigin: true,
    pathRewrite,
    timeout: route.timeout || upstream.timeout || config.get<number>('timeouts.request', 30000) || 30000,
    
    onProxyReq: (proxyReq: any, req: any, _res: any) => {
      // Add correlation ID
      if (req.correlationId) {
        proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      }
      
      // Store upstream name and start time for metrics
      req.upstream = upstreamName;
      req.upstreamStartTime = Date.now();
      
      // Record upstream request metric
      metrics.upstreamRequestsTotal.inc({
        upstream: upstreamName,
        upstream_host: new URL(upstreamUrl).host,
        route: route.path,
        status: 'pending'
      });
      
      // Emit proxy request started event
      eventBus.emitEvent(EventType.PROXY_REQUEST_STARTED, {
        timestamp: new Date().toISOString(),
        source: 'proxy-middleware',
        routeId: route.path,
        routePath: route.path,
        method: req.method,
        path: req.path,
        target: upstreamUrl,
        correlationId: req.correlationId,
      } as any);
      
      logger.debug('proxy.request', {
        correlationId: req.correlationId,
        upstream: upstreamName,
        targetUrl: `${upstreamUrl}${proxyReq.path}`
      });
    },
    
    onProxyRes: (proxyRes: any, req: any, _res: any) => {
      const duration = Date.now() - (req.upstreamStartTime || Date.now());
      
      // Record upstream metrics
      metrics.upstreamRequestsTotal.inc({
        upstream: upstreamName,
        upstream_host: new URL(upstreamUrl).host,
        route: route.path,
        status: proxyRes.statusCode.toString()
      });
      
      metrics.upstreamRequestDuration.observe({
        upstream: upstreamName,
        upstream_host: new URL(upstreamUrl).host,
        route: route.path
      }, duration);
      
      // Mark upstream as available
      metrics.upstreamAvailability.set({
        upstream: upstreamName,
        upstream_host: new URL(upstreamUrl).host
      }, 1);
      
      // Emit proxy request completed event
      eventBus.emitEvent(EventType.PROXY_REQUEST_COMPLETED, {
        timestamp: new Date().toISOString(),
        source: 'proxy-middleware',
        routeId: route.path,
        routePath: route.path,
        method: req.method,
        statusCode: proxyRes.statusCode,
        duration,
        target: upstreamUrl,
        correlationId: req.correlationId,
      } as any);
      
      logger.debug('proxy.response', {
        correlationId: req.correlationId,
        upstream: upstreamName,
        statusCode: proxyRes.statusCode,
        duration
      });
    },
    
    onError: (err: Error, req: any, res: any) => {
      const duration = Date.now() - (req.upstreamStartTime || Date.now());
      const errorType = err.message.includes('timeout') ? 'timeout' : 
                       err.message.includes('ECONNREFUSED') ? 'connection_refused' :
                       err.message.includes('ENOTFOUND') ? 'dns_error' : 'unknown';
      
      // Record upstream error metrics
      metrics.upstreamErrorsTotal.inc({
        upstream: upstreamName,
        upstream_host: new URL(upstreamUrl).host,
        route: route.path,
        error_type: errorType
      });
      
      // Record timeout metric if applicable
      if (errorType === 'timeout') {
        metrics.upstreamTimeoutsTotal.inc({
          upstream: upstreamName,
          upstream_host: new URL(upstreamUrl).host,
          route: route.path
        });
      }
      
      // Mark upstream as potentially unavailable
      metrics.upstreamAvailability.set({
        upstream: upstreamName,
        upstream_host: new URL(upstreamUrl).host
      }, 0);
      
      // Emit proxy request failed event
      eventBus.emitEvent(EventType.PROXY_REQUEST_FAILED, {
        timestamp: new Date().toISOString(),
        source: 'proxy-middleware',
        routeId: route.path,
        routePath: route.path,
        method: req.method,
        error: err.message,
        errorType,
        duration,
        target: upstreamUrl,
        correlationId: req.correlationId,
      } as any);
      
      logger.error('proxy.error', {
        correlationId: req.correlationId,
        upstream: upstreamName,
        error: err.message,
        errorType,
        duration
      });
      
      // Record circuit breaker failure
      const cb = circuitBreakers.get(upstreamName);
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
  const cb = circuitBreakers.get(upstreamName);
  if (cb) {
    app.use(expressPath, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
            upstream: upstreamName,
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
    app.use(expressPath, createProxyMiddleware(proxyOptions));
  }
  
  logger.info(`Route configured: ${route.path} -> ${upstreamName} (${upstreamUrl})`);
}

// Load and setup routes from both config file and database
async function loadAndSetupRoutes() {
  // Load routes from config file
  const configRoutes = config.get<ProxyRoute[]>('routes', []) || [];
  logger.info(`Loading ${configRoutes.length} routes from config file`);
  configRoutes.forEach(setupProxyRoute);
  
  // Load routes from database
  try {
    const result = await database.query('SELECT * FROM routes WHERE enabled = true ORDER BY created_at DESC');
    const dbRoutes = result.rows.map((row: any) => ({
      id: row.route_id,
      path: row.path,
      upstream: row.upstream, // This is a URL for database routes
      methods: row.methods || ['GET'],
      enabled: row.enabled !== false,
      stripPath: row.strip_path,
      rateLimit: row.rate_limit_enabled ? {
        enabled: row.rate_limit_enabled,
        max: row.rate_limit_max || 100,
        windowMs: row.rate_limit_window_ms || 60000,
        message: row.rate_limit_message,
      } : undefined,
      timeout: row.timeout,
    } as ProxyRoute));
    
    // Filter out routes that conflict with API endpoints
    // These are reserved paths that should not be proxied
    const reservedPaths = [
      '/api/auth',
      '/api/routes',
      '/api/webhooks',
      '/api/metrics',
      '/api/logs',
      '/api/stream',
      '/health',
      '/prometheus-metrics',
      '/version'
    ];
    
    const proxyRoutes = dbRoutes.filter(route => {
      const isReserved = reservedPaths.some(reserved => 
        route.path === reserved || route.path.startsWith(`${reserved}/`)
      );
      
      if (isReserved) {
        logger.warn(`Skipping database route ${route.path} - conflicts with reserved API path`);
        return false;
      }
      
      return true;
    });
    
    logger.info(`Loading ${proxyRoutes.length} routes from database (${dbRoutes.length - proxyRoutes.length} skipped as reserved)`);
    proxyRoutes.forEach(setupProxyRoute);
  } catch (error) {
    logger.warn('Failed to load routes from database - continuing with config routes only', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Initialize routes after database is ready
database.initialize()
  .then(() => loadAndSetupRoutes())
  .then(() => {
    // Register admin UI static files AFTER dynamic routes are loaded
    // This ensures proxy routes take precedence
    const adminUIPath = path.join(__dirname, '..', 'admin-ui', 'build');
    app.use(express.static(adminUIPath));

    // Handle client-side routing - send all non-proxy requests to index.html
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Skip API routes, health endpoints, and proxy routes
      if (req.path.startsWith('/api/') || 
          req.path.startsWith('/health') || 
          req.path.startsWith('/prometheus-metrics') ||
          req.path.startsWith('/httpbin/') ||
          req.path.startsWith('/external/') ||
          req.path.startsWith('/test-api/')) {
        return next();
      }
      
      res.sendFile(path.join(adminUIPath, 'index.html'));
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

    logger.info('✅ All routes configured and server ready');
  })
  .catch((err: Error) => {
    logger.warn('Database initialization failed - loading config routes only', { error: err.message });
    // Still setup config routes if database fails
    const routes = config.get<ProxyRoute[]>('routes', []) || [];
    routes.forEach(setupProxyRoute);
    
    // Still register admin UI even if database fails
    const adminUIPath = path.join(__dirname, '..', 'admin-ui', 'build');
    app.use(express.static(adminUIPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(adminUIPath, 'index.html'));
    });
  });

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  // Stop metrics publisher
  if ((global as any).metricsPublisher) {
    (global as any).metricsPublisher.stop();
  }
  
  // Close JetStream connection
  await jetStreamService.close();
  
  // Close rate limiter
  await rateLimiter.close();
  
  // Close database connections
  await database.close();
  
  logger.info('Server shut down complete');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Initialize JetStream and metrics publisher
(async () => {
  try {
    // Connect to NATS JetStream
    const natsServers = process.env.NATS_SERVERS?.split(',') || ['nats://localhost:4222'];
    await jetStreamService.connect(natsServers);
    
    // Create consumers
    await jetStreamService.createConsumer('METRICS', 'metrics-consumer');
    
    // Start metrics publisher
    const pool = database.getPool();
    const metricsPublisher = new MetricsPublisher(pool);
    metricsPublisher.start();
    
    // Store globally for graceful shutdown
    (global as any).metricsPublisher = metricsPublisher;
    
    logger.info('✅ JetStream real-time metrics initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize JetStream:', error);
    logger.warn('⚠️  Continuing without real-time streaming');
  }
  
  // Initialize Webhook Manager
  try {
    const pool = database.getPool();
    const deliveriesRepo = new WebhookDeliveriesRepository(pool);
    const webhookManager = new WebhookManager(deliveriesRepo);
    
    // Load webhooks from database
    const webhooks = await webhooksRepository.findAll();
    logger.info(`Loading ${webhooks.length} webhooks from database`);
    
    for (const webhook of webhooks) {
      if (webhook.enabled) {
        webhookManager.registerWebhook({
          id: webhook.webhook_id,
          url: webhook.url,
          events: webhook.events as any[],
          enabled: webhook.enabled,
          secret: webhook.secret || '',
          retryConfig: {
            maxRetries: webhook.retry_count || 3,
            backoffMultiplier: 2,
            initialDelay: webhook.retry_delay || 1000,
          },
          headers: webhook.headers || {},
          timeout: webhook.timeout || 5000,
        });
        logger.info(`Registered webhook: ${webhook.name} (${webhook.webhook_id})`);
      }
    }
    
    // Store globally for graceful shutdown
    (global as any).webhookManager = webhookManager;
    
    logger.info('✅ Webhook Manager initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize Webhook Manager:', error);
    logger.warn('⚠️  Continuing without webhooks');
  }
})();

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;
