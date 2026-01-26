const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const promClient = require('prom-client');

// Internal modules
const config = require('./src/config/loader');
const { logger, requestLogger } = require('./src/logger');
const rateLimiter = require('./src/rateLimiter');
const CircuitBreaker = require('./src/circuitBreaker');

// Load configuration
config.load();

const app = express();

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
const circuitBreakers = new Map();
const upstreams = config.get('upstreams', []);
upstreams.forEach(upstream => {
  if (upstream.circuitBreaker?.enabled !== false) {
    const cb = new CircuitBreaker(upstream.name, upstream.circuitBreaker || {});
    circuitBreakers.set(upstream.name, cb);
    logger.info(`Circuit breaker initialized for upstream: ${upstream.name}`);
  }
});

// Basic middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: config.get('proxy.maxBodySize', '10mb') }));
app.use(express.urlencoded({ extended: false, limit: config.get('proxy.maxBodySize', '10mb') }));
app.use(cookieParser());
app.use(cors());

// Request logging with correlation IDs
app.use(requestLogger);

// Metrics middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path;
    
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route,
      status: res.statusCode
    }, duration);
  });
  
  next();
});

// Initialize rate limiter
rateLimiter.initialize().catch(err => {
  logger.error('Failed to initialize rate limiter', { error: err.message });
});

// Health endpoints
app.get('/health/live', (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

app.get('/health/ready', async (req, res) => {
  const checks = {
    config: 'UP',
    upstreams: 'UP'
  };
  
  // Check circuit breakers
  let allUpstreamsHealthy = true;
  circuitBreakers.forEach((cb, name) => {
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

app.get('/health/deep', (req, res) => {
  const upstreamStates = {};
  circuitBreakers.forEach((cb, name) => {
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
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Setup proxy routes
const routes = config.get('routes', []);
routes.forEach(route => {
  const upstream = upstreams.find(u => u.name === route.upstream);
  if (!upstream) {
    logger.error(`Route ${route.path} references unknown upstream: ${route.upstream}`);
    return;
  }
  
  // Apply rate limiting if configured
  const routeLimit = rateLimiter.getRouteLimit(route.path);
  if (routeLimit || route.rateLimit) {
    const limitConfig = route.rateLimit || routeLimit;
    app.use(route.path, rateLimiter.createLimiter(limitConfig));
  }
  
  // Create proxy middleware
  const proxyOptions = {
    target: upstream.url,
    changeOrigin: true,
    pathRewrite: route.stripPath ? {
      [`^${route.stripPath}`]: ''
    } : undefined,
    timeout: route.timeout || upstream.timeout || config.get('timeouts.request', 30000),
    
    onProxyReq: (proxyReq, req, res) => {
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
    
    onProxyRes: (proxyRes, req, res) => {
      logger.debug('proxy.response', {
        correlationId: req.correlationId,
        upstream: upstream.name,
        statusCode: proxyRes.statusCode
      });
    },
    
    onError: (err, req, res) => {
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
    app.use(route.path, async (req, res, next) => {
      try {
        await cb.execute(async () => {
          return new Promise((resolve, reject) => {
            const proxy = createProxyMiddleware(proxyOptions);
            proxy(req, res, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        });
      } catch (error) {
        if (error.circuitBreakerOpen) {
          logger.warn('circuit_breaker.request_rejected', {
            correlationId: req.correlationId,
            upstream: upstream.name,
            circuitState: cb.state
          });
          
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Circuit breaker is open',
            correlationId: req.correlationId,
            retryAfter: Math.ceil(cb.openDuration / 1000)
          });
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
app.use(function(req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function(err, req, res, next) {
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
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  // Close rate limiter
  await rateLimiter.close();
  
  logger.info('Server shut down complete');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
