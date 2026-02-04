/**
 * Metrics Middleware
 * Logs all proxy requests to database for metrics and analytics
 */

import { Request, Response, NextFunction } from 'express';
import database from '../database';
import { logger } from '../logger';

interface MetricsRequest extends Request {
  correlationId?: string;
  upstream?: string;
}

/**
 * Middleware to log requests to database for metrics
 */
export const metricsMiddleware = (req: MetricsRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  const logRequest = async () => {
    try {
      // Ensure DB connection exists (safe to call multiple times)
      if (!database.isReady()) {
        await database.initialize();
      }

      const responseTime = Date.now() - startTime;
      const pool = database.getPool();
      
      await pool.query(`
        INSERT INTO requests (
          timestamp,
          method,
          path,
          status_code,
          response_time_ms,
          upstream,
          client_ip,
          user_agent,
          correlation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        new Date(),
        req.method,
        req.path,
        res.statusCode,
        responseTime,
        req.upstream || null,
        req.ip || req.socket.remoteAddress || null,
        req.get('user-agent') || null,
        req.correlationId || null
      ]);
    } catch (error) {
      // Don't fail the request if metrics logging fails
      logger.error('Failed to log request to database:', error);
    }
  };

  // Log once the response is finished.
  // This captures ALL responses (including proxied streaming bodies) without
  // needing to override res.send/res.json.
  res.on('finish', () => {
    // Fire-and-forget (never block the response)
    void logRequest();
  });
  
  next();
};
