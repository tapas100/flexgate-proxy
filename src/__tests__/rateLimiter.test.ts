/**
 * Unit Tests: RateLimiter
 * Covers disabled mode passthrough, limiter factory options,
 * and getRouteLimit matching.
 *
 * Because RateLimiter is a singleton exported at module-load time,
 * jest.isolateModules() gives each test group a fresh instance
 * with its own config mock.
 */

import type { Request, Response, NextFunction } from 'express';

function loadWithConfig(rateLimitConfig: object) {
  let instance: any;
  jest.isolateModules(() => {
    jest.doMock('../config/loader', () => ({
      __esModule: true,
      default: { get: () => rateLimitConfig },
    }));
    jest.doMock('../logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    jest.doMock('../metrics', () => ({
      metrics: {
        rateLimitRedisErrorsTotal: { inc: jest.fn() },
        rateLimitRequestsRejected: { inc: jest.fn() },
        rateLimitRequestsTotal: { inc: jest.fn() },
      },
    }));
    jest.doMock('../events/EventBus', () => ({
      eventBus: { emitEvent: jest.fn() },
      EventType: { RATE_LIMIT_EXCEEDED: 'rate_limit.exceeded' },
    }));
    jest.doMock('redis', () => ({
      createClient: jest.fn(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn(),
      })),
    }));
    jest.doMock('express-rate-limit', () =>
      jest.fn((opts: any) => {
        const mw: any = (_req: any, _res: any, next: any) => next();
        mw._opts = opts;
        return mw;
      })
    );
    jest.doMock('rate-limit-redis', () => jest.fn(() => ({})));
    instance = require('../rateLimiter').default;
  });
  return instance;
}

// ── disabled mode ─────────────────────────────────────────────

describe('RateLimiter — disabled mode', () => {
  it('returns passthrough middleware when disabled', () => {
    const limiter = loadWithConfig({ enabled: false });
    const mw = limiter.createLimiter();
    const next = jest.fn() as NextFunction;
    mw({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── enabled mode ──────────────────────────────────────────────

describe('RateLimiter — enabled mode', () => {
  const base = {
    enabled: true,
    backend: 'local',
    global: { windowMs: 60000, max: 100 },
    perRoute: [],
  };

  it('passes windowMs and max to express-rate-limit', () => {
    const mw = loadWithConfig(base).createLimiter({ windowMs: 5000, max: 10 }) as any;
    expect(mw._opts.windowMs).toBe(5000);
    expect(mw._opts.max).toBe(10);
  });

  it('falls back to global config when no options passed', () => {
    const mw = loadWithConfig({ ...base, global: { windowMs: 30000, max: 200 } }).createLimiter() as any;
    expect(mw._opts.max).toBe(200);
    expect(mw._opts.windowMs).toBe(30000);
  });

  it('handler returns 429 with retryAfter body', () => {
    const limiter = loadWithConfig(base);
    const mw = limiter.createLimiter({ windowMs: 60000, max: 5 }) as any;
    const req: any = {
      path: '/api/test', route: { path: '/api/test' },
      ip: '127.0.0.1', method: 'GET', correlationId: 'x',
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      getHeader: jest.fn().mockReturnValue('60'),
    };
    mw._opts.handler(req, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Rate limit exceeded' })
    );
  });
});

// ── getRouteLimit ─────────────────────────────────────────────

describe('RateLimiter — getRouteLimit()', () => {
  const cfg = {
    enabled: true,
    backend: 'local',
    global: { windowMs: 60000, max: 100 },
    perRoute: [
      { path: '/api/users',    max: 50, windowMs: 30000 },
      { path: '/api/orders/*', max: 20, windowMs: 60000 },
    ],
  };

  it('matches an exact path', () => {
    const rule = loadWithConfig(cfg).getRouteLimit('/api/users');
    expect(rule).toBeDefined();
    expect(rule.max).toBe(50);
  });

  it('matches a wildcard prefix', () => {
    const rule = loadWithConfig(cfg).getRouteLimit('/api/orders/123');
    expect(rule).toBeDefined();
    expect(rule.max).toBe(20);
  });

  it('returns undefined for unregistered route', () => {
    expect(loadWithConfig(cfg).getRouteLimit('/api/unknown')).toBeUndefined();
  });
});
