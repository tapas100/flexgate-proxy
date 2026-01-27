const { createLogger, format, transports } = require('winston');
const config = require('./config/loader');

const logConfig = config.get('logging', {
  level: 'info',
  format: 'json',
  sampling: {
    enabled: false,
    successRate: 1.0,
    errorRate: 1.0
  }
});

// Sampling logic
let requestCounter = 0;
const shouldSample = (level, statusCode) => {
  if (!logConfig.sampling?.enabled) return true;
  
  // Always log errors
  if (level === 'error' || statusCode >= 500) {
    return Math.random() < logConfig.sampling.errorRate;
  }
  
  // Sample success logs
  if (statusCode >= 200 && statusCode < 300) {
    return Math.random() < logConfig.sampling.successRate;
  }
  
  // Log warnings and client errors
  return true;
};

// Custom format for structured logging
const structuredFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  format.errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: logConfig.level,
  format: structuredFormat,
  defaultMeta: { 
    service: 'proxy-server',
    pid: process.pid,
    hostname: require('os').hostname()
  },
  transports: [
    new transports.Console({
      format: logConfig.format === 'json' 
        ? structuredFormat 
        : format.combine(format.colorize(), format.simple())
    }),
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    }),
    new transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Request logger middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Log request start
  logger.info('request.started', {
    correlationId,
    event: 'request.started',
    http: {
      method: req.method,
      path: req.path,
      query: req.query,
      clientIp: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    }
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;
    const duration = Date.now() - startTime;
    
    // Sample based on status code
    if (shouldSample('info', res.statusCode)) {
      logger.info('request.completed', {
        correlationId,
        event: 'request.completed',
        http: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          clientIp: req.ip || req.connection.remoteAddress
        },
        duration,
        metadata: {
          route: req.route?.path,
          upstream: req.upstream
        }
      });
    }
    
    return res.send(data);
  };
  
  next();
};

module.exports = {
  logger,
  requestLogger
};
