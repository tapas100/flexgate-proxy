import { createLogger, format, transports } from 'winston';
import * as os from 'os';
import config from './config/loader';
import type { Request, Response, NextFunction } from 'express';

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
const shouldSample = (level: string, statusCode?: number): boolean => {
  if (!logConfig.sampling?.enabled) return true;
  
  // Always log errors
  if (level === 'error' || (statusCode && statusCode >= 500)) {
    return Math.random() < logConfig.sampling.errorRate;
  }
  
  // Sample success logs
  if (statusCode && statusCode >= 200 && statusCode < 300) {
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
    hostname: os.hostname()
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
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
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
      clientIp: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent')
    }
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
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
          clientIp: req.ip || req.socket.remoteAddress
        },
        duration,
        metadata: {
          route: req.route?.path,
          upstream: (req as any).upstream
        }
      });
    }
    
    return res.send(data);
  };
  
  next();
};

export {
  logger,
  requestLogger
};
