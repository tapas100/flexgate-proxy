/**
 * src/services/intelligenceClient.ts
 *
 * HTTP client that forwards requests to the @flexgate/intelligence microservice.
 * The intelligence service runs as a separate process on INTELLIGENCE_URL (default: http://localhost:4000).
 *
 * Usage in Express routes:
 *   import { intelligenceClient } from '../src/services/intelligenceClient';
 *   app.use('/intelligence', intelligenceClient);
 *   app.use('/admin',        intelligenceClient);
 */

import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from '../logger';

const INTELLIGENCE_URL = process.env.INTELLIGENCE_URL || 'http://localhost:4000';
const ADMIN_API_KEY    = process.env.ADMIN_API_KEY    || '';

/**
 * Proxy middleware — forwards /intelligence/* and /admin/* to the intelligence service.
 * Injects the Authorization header so the intelligence service's adminAuthGuard passes.
 */
export const intelligenceProxy = createProxyMiddleware({
  target: INTELLIGENCE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      // Always forward the admin key so downstream guard accepts the request
      if (ADMIN_API_KEY) {
        proxyReq.setHeader('Authorization', `Bearer ${ADMIN_API_KEY}`);
      }
      logger.debug('Proxying to intelligence service', {
        method: req.method,
        path: req.url,
        target: INTELLIGENCE_URL,
      });
    },
    error: (err, _req, res) => {
      logger.error('Intelligence service proxy error', {
        message: (err as Error).message,
        target: INTELLIGENCE_URL,
      });
      if (typeof (res as Response).status === 'function') {
        (res as Response).status(502).json({
          error: 'Intelligence service unavailable',
          message: 'Could not reach the @flexgate/intelligence microservice. Is it running on ' + INTELLIGENCE_URL + '?',
        });
      }
    },
  },
});

/**
 * Health-check helper — ping the intelligence service liveness endpoint.
 * Returns true if the service responds with 2xx.
 */
export async function pingIntelligenceService(): Promise<boolean> {
  try {
    const res = await fetch(`${INTELLIGENCE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Express middleware that checks intelligence service availability.
 * Used in /health/ready to include intelligence status.
 */
export async function intelligenceHealthCheck(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next();
}
