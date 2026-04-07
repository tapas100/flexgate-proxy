/**
 * src/services/intelligenceClient.ts
 *
 * HTTP proxy that forwards /intelligence/* and /admin/* to the
 * @flexgate/intelligence microservice (default: http://localhost:4000).
 *
 * When Express mounts middleware at "/intelligence", it strips that prefix
 * from req.url before passing it on. We use two separate proxy instances
 * with explicit pathRewrite regex maps to restore the correct prefix:
 *
 *   app.use('/intelligence', intelligenceProxyMiddleware)  →  4000/intelligence/*
 *   app.use('/admin',        adminProxyMiddleware)         →  4000/admin/*
 */

import http from 'http';
import { Response } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { logger } from '../logger';

const INTELLIGENCE_URL = process.env.INTELLIGENCE_URL || 'http://localhost:4000';
const ADMIN_API_KEY    = process.env.ADMIN_API_KEY    || '';

function makeProxy(mountPrefix: string) {
  return createProxyMiddleware({
    target: INTELLIGENCE_URL,
    changeOrigin: true,
    // Express strips the mount prefix — restore it before forwarding.
    // e.g. mounted at /intelligence: /status  →  /intelligence/status
    //      mounted at /admin:        /status  →  /admin/status
    pathRewrite: { '^/': `/${mountPrefix}/` },
    on: {
      proxyReq: (proxyReq: http.ClientRequest, req: http.IncomingMessage) => {
        if (ADMIN_API_KEY) {
          proxyReq.setHeader('Authorization', `Bearer ${ADMIN_API_KEY}`);
        }
        logger.debug(`→ Intelligence proxy [/${mountPrefix}]`, {
          method: req.method,
          path: req.url,
          target: INTELLIGENCE_URL,
        });
        fixRequestBody(proxyReq, req);
      },
      error: (_err: Error, _req: http.IncomingMessage, res: http.ServerResponse | import('net').Socket) => {
        logger.error('Intelligence service unreachable', {
          target: INTELLIGENCE_URL,
          message: _err.message,
        });
        const expressRes = res as unknown as Response;
        if (typeof expressRes.status === 'function') {
          expressRes.status(502).json({
            error: 'Intelligence service unavailable',
            message: `Could not reach @flexgate/intelligence at ${INTELLIGENCE_URL}. Is it running?`,
          });
        }
      },
    },
  });
}

export const intelligenceProxyMiddleware = makeProxy('intelligence');
export const adminProxyMiddleware        = makeProxy('admin');
