/**
 * CRA custom proxy configuration.
 *
 * The simple "proxy" field in package.json uses http-proxy-middleware under
 * the hood but with default buffering that breaks Server-Sent Events (SSE).
 * This file replaces it so we can:
 *
 *  1. Route all /api/* requests to the Go admin API on port 9090.
 *  2. Disable response buffering for SSE streams (/api/stream/* and
 *     /api/setup/run/stream) so EventSource connections are not held in
 *     pending state by the dev-server proxy.
 *
 * Docs: https://create-react-app.dev/docs/proxying-api-requests-in-development/
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

const TARGET = process.env.REACT_APP_API_URL || 'http://localhost:9090';

module.exports = function (app) {
  // ── SSE streams — must NOT buffer the response ────────────────────────────
  // http-proxy-middleware v2 exposes `selfHandleResponse`; when false the
  // proxy pipes bytes straight through without collecting them first.
  app.use(
    ['/api/stream', '/api/setup/run/stream', '/api/setup/install'],
    createProxyMiddleware({
      target: TARGET,
      changeOrigin: true,
      // Do NOT buffer — stream bytes as they arrive.
      selfHandleResponse: false,
      on: {
        proxyReq: (proxyReq) => {
          // Tell the upstream to keep the connection open.
          proxyReq.setHeader('Connection', 'keep-alive');
        },
        error: (err, req, res) => {
          console.error('[proxy:stream] error', err.message);
          if (!res.headersSent) {
            res.writeHead(502);
          }
          res.end();
        },
      },
    }),
  );

  // ── All other /api/* requests ─────────────────────────────────────────────
  app.use(
    '/api',
    createProxyMiddleware({
      target: TARGET,
      changeOrigin: true,
      on: {
        error: (err, req, res) => {
          console.error('[proxy:api] error', err.message);
          if (!res.headersSent) {
            res.writeHead(502);
          }
          res.end();
        },
      },
    }),
  );
};
