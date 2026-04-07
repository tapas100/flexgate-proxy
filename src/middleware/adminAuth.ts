import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Admin API key authentication middleware.
 *
 * Supports two header formats:
 *   - X-Admin-Api-Key: <key>
 *   - Authorization: Bearer <key>
 *
 * Behaviour:
 *   - If ADMIN_API_KEY is not set and env is production/staging → 503 (misconfigured)
 *   - If ADMIN_API_KEY is not set and env is development → allow with warning (open mode)
 *   - If ADMIN_API_KEY is set → require valid key, else 401
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_API_KEY) {
    if (NODE_ENV === 'production' || NODE_ENV === 'staging') {
      logger.error('ADMIN_API_KEY is not set in production/staging — blocking admin access');
      res.status(503).json({
        error: 'Admin API disabled',
        message: 'ADMIN_API_KEY must be configured before deploying to staging/production.',
      });
      return;
    }
    // Development open mode — warn once per process
    logger.warn('⚠️  ADMIN_API_KEY is not set — admin routes are open in development mode.');
    next();
    return;
  }

  const apiKeyHeader = req.headers['x-admin-api-key'] as string | undefined;
  const authHeader = req.headers['authorization'];
  const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const providedKey = apiKeyHeader || bearerKey;

  if (!providedKey || providedKey !== ADMIN_API_KEY) {
    logger.warn('Unauthorized admin API access attempt', {
      ip: req.ip,
      path: req.path,
      hasKey: !!providedKey,
    });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing Admin API key. Use X-Admin-Api-Key or Authorization: Bearer headers.',
    });
    return;
  }

  next();
}
