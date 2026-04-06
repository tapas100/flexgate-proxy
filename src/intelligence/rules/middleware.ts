// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

/**
 * Module 3: Rule Engine — Express Middleware
 *
 * Intercepts every proxied request and runs the rule evaluation chain against
 * the current WindowSnapshot for that (method, path, upstream) combination.
 *
 * Action semantics:
 *   block    → respond immediately with the configured status/message; no next()
 *   throttle → enforce per-rule RPS cap using an in-memory token bucket;
 *              excess requests respond with 429; conforming requests call next()
 *   alert    → log + emit EventBus event; always calls next()
 *   redirect → set x-flexgate-redirect-upstream header and call next()
 *              (the proxy layer is expected to honour this header)
 *
 * The middleware is designed to be zero-overhead on the happy path:
 *   - Evaluation is synchronous and O(rules)
 *   - No async I/O in the critical path
 *   - Token bucket state is per-rule-id, not per-request
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../logger';
import { eventBus, EventType } from '../../events/EventBus';
import { getRuleEngine } from './RuleEngine';
import { getSignalEngine } from '../signals/SignalEngine';
import { getAnomalyEngine } from '../anomaly/AnomalyEngine';
import { computeStressScore } from './math';
import type { EvaluationInput, MetricKey, ThrottleAction } from './types';

// ── Token Bucket (throttle) ───────────────────────────────────────────────────

interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
  /** Configured max tokens = rps (1-second window) */
  capacity: number;
}

const buckets = new Map<string, TokenBucket>();

/**
 * Consume one token from the bucket for the given ruleId.
 * Returns true if the token was granted (request may proceed),
 * false if the bucket is empty (request should be rejected).
 */
function consumeToken(ruleId: string, action: ThrottleAction): boolean {
  const nowMs = Date.now();
  let bucket = buckets.get(ruleId);

  if (!bucket) {
    bucket = {
      tokens: action.rps,
      capacity: action.rps,
      lastRefillMs: nowMs,
    };
    buckets.set(ruleId, bucket);
  }

  // Refill tokens based on elapsed time (fractional tokens, capped at capacity)
  const elapsedSec = (nowMs - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSec * bucket.capacity);
  bucket.lastRefillMs = nowMs;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

// ── Middleware Factory ────────────────────────────────────────────────────────

export interface RuleMiddlewareOptions {
  /** Static upstream name (mount per-upstream) */
  upstream?: string;
  /** Dynamic upstream resolver — takes precedence over `upstream` */
  resolveUpstream?: (req: Request) => string;
}

export function ruleEngineMiddleware(opts: RuleMiddlewareOptions = {}) {
  const engine = getRuleEngine();
  const signalEngine = getSignalEngine();
  const anomalyEngine = getAnomalyEngine();

  return function ruleCheck(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const upstream =
        opts.resolveUpstream?.(req) ??
        opts.upstream ??
        (req.headers['x-upstream-name'] as string | undefined) ??
        'unknown';

      const key = `${req.method.toUpperCase()}:${req.path}:${upstream}`;
      const snap = signalEngine.snapshot(key);

      // Build EvaluationInput from snapshot (or zeros if no data yet)
      const metrics: Partial<Record<MetricKey, number>> = snap
        ? (() => {
            const rpsSignal = anomalyEngine.analyze('rps', snap.rps, []);
            const p95Signal = anomalyEngine.analyze('p95LatencyMs', snap.p95LatencyMs, []);
            return {
              rps: snap.rps,
              errorRate: snap.errorRate,
              clientErrorRate: snap.clientErrorRate,
              meanLatencyMs: snap.meanLatencyMs,
              p50LatencyMs: snap.p50LatencyMs,
              p95LatencyMs: snap.p95LatencyMs,
              p99LatencyMs: snap.p99LatencyMs,
              maxLatencyMs: snap.maxLatencyMs,
              requestCount: snap.requestCount,
              avgRequestBytes: snap.avgRequestBytes,
              avgResponseBytes: snap.avgResponseBytes,
              stressScore: computeStressScore(
                snap.errorRate,
                rpsSignal.zScore.zScore,
                p95Signal.zScore.zScore,
              ),
            };
          })()
        : {};

      const input: EvaluationInput = {
        metrics,
        upstream,
        path: req.path,
        evaluatedAtMs: Date.now(),
      };

      const result = engine.evaluate(input);

      if (!result.triggered || !result.decidingAction) {
        return next();
      }

      const action = result.decidingAction;

      switch (action.type) {
        case 'block':
          res.status(action.statusCode).json({ error: action.message });
          return;

        case 'throttle': {
          // Find the rule that produced this throttle action (first match)
          const matchedRule = result.matches.find(
            (m) => m.action.type === 'throttle',
          );
          const bucketKey = matchedRule?.ruleId ?? 'global';
          if (!consumeToken(bucketKey, action)) {
            const msg = action.message ?? 'Rate limit exceeded — throttle rule active';
            res.status(429).json({ error: msg, retryAfter: 1 });
            return;
          }
          return next();
        }

        case 'alert': {
          const logFn =
            action.severity === 'critical'
              ? logger.error.bind(logger)
              : action.severity === 'warning'
              ? logger.warn.bind(logger)
              : logger.info.bind(logger);

          logFn(`[RuleEngine] Alert (${action.severity}): ${action.message}`, {
            upstream,
            path: req.path,
            ruleSetVersion: result.ruleSetVersion,
          });

          try {
            eventBus.emit(EventType.RATE_LIMIT_WARNING, {
              timestamp: new Date().toISOString(),
              source: 'rule_engine',
              severity: action.severity,
              message: action.message,
              upstream,
              path: req.path,
            });
          } catch {
            // Event emission must never crash middleware
          }

          return next();
        }

        case 'redirect':
          req.headers['x-flexgate-redirect-upstream'] = action.upstream;
          return next();
      }
    } catch {
      // Rule evaluation errors must never disrupt request processing
      return next();
    }
  };
}
