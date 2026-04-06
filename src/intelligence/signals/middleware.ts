// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

/**
 * Module 1: Metrics & Signal Engine — Express Middleware
 *
 * Attaches to the proxy and records a RequestEvent for every
 * completed proxied request. Zero impact on the critical path:
 * - All work happens AFTER the response is sent (on 'finish')
 * - Uses pre-computed fingerprint from request headers (set by proxy)
 * - Falls back to hashing method+path if fingerprint is absent
 */

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { getSignalEngine } from './SignalEngine';
import { getAnomalyEngine } from '../anomaly/AnomalyEngine';
import { RequestEvent } from './types';

/**
 * Compute a deterministic fingerprint for a request.
 * Format: SHA-256(METHOD:PATH:SORTED_QUERY:CONTENT_LENGTH)
 * Truncated to 16 hex chars (64-bit) — collision probability is negligible
 * for the repetition detection use case.
 */
function computeFingerprint(req: Request): string {
  const method = req.method.toUpperCase();
  const path = req.path;
  const query = Object.entries(req.query as Record<string, string>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const bodySize = req.headers['content-length'] ?? '0';
  const raw = `${method}:${path}:${query}:${bodySize}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Express middleware factory.
 *
 * Usage:
 *   app.use(signalEngineMiddleware({ upstream: 'payments-service' }))
 *
 * Or use the dynamic upstream resolver:
 *   app.use(signalEngineMiddleware({ resolveUpstream: (req) => req.headers['x-upstream'] }))
 */
export interface SignalMiddlewareOptions {
  /** Static upstream name (use when middleware is mounted per-upstream) */
  upstream?: string;
  /** Dynamic upstream resolver — takes precedence over `upstream` */
  resolveUpstream?: (req: Request) => string;
}

export function signalEngineMiddleware(opts: SignalMiddlewareOptions = {}) {
  const engine = getSignalEngine();
  const anomalyEngine = getAnomalyEngine();

  return function signalCapture(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const startMs = Date.now();

    // Pre-compute fingerprint synchronously (before body may be consumed)
    const fingerprint =
      (req.headers['x-flexgate-fingerprint'] as string | undefined) ??
      computeFingerprint(req);

    res.on('finish', () => {
      try {
        const upstream =
          opts.resolveUpstream?.(req) ??
          opts.upstream ??
          (req.headers['x-upstream-name'] as string | undefined) ??
          'unknown';

        const event: RequestEvent = {
          timestampMs: startMs,
          method: req.method.toUpperCase(),
          path: req.path,
          upstream,
          statusCode: res.statusCode,
          latencyMs: Date.now() - startMs,
          requestBytes: parseInt(req.headers['content-length'] ?? '0', 10),
          responseBytes: parseInt(res.getHeader('content-length') as string ?? '0', 10),
          fingerprint,
        };

        engine.record(event);

        // Feed AnomalyEngine baseline with per-window metrics
        const snap = engine.snapshot(upstream);
        if (snap) {
          anomalyEngine.record('rps', snap.rps);
          anomalyEngine.record('p95LatencyMs', snap.p95LatencyMs);
          anomalyEngine.record('errorRate', snap.errorRate);
        }
      } catch {
        // Signal recording must never throw into the request path
      }
    });

    next();
  };
}
