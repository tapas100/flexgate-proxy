/**
 * Unit Tests: auth/middleware
 * Covers extractBearerToken, requireAuth, requireRole,
 * createAuthMiddleware, and optionalAuth using mock
 * Einstrust client and session cache.
 */

jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock einstrust client
const mockValidateSession = jest.fn();
jest.mock('../auth/einstrust', () => ({
  getEinstrustClient: () => ({ validateSession: mockValidateSession }),
}));

// Mock session cache
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('../auth/sessionCache', () => ({
  getSessionCache: () => ({ get: mockCacheGet, set: mockCacheSet }),
}));

import { Request, Response, NextFunction } from 'express';
import {
  validateEinstrustSession,
  requireAuth,
  requireRole,
  createAuthMiddleware,
  optionalAuth,
} from '../auth/middleware';

// ── Helpers ──────────────────────────────────────────────────

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function mockRes(): { status: jest.Mock; json: jest.Mock } & Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const next: NextFunction = jest.fn();

// ── validateEinstrustSession ──────────────────────────────────

describe('validateEinstrustSession()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockReturnValue(null);
  });

  it('sets isAuthenticated=false and calls next when no Authorization header', async () => {
    const req = mockReq();
    await validateEinstrustSession(req, mockRes() as any, next);
    expect(req.isAuthenticated).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('sets isAuthenticated=false for malformed Authorization header', async () => {
    const req = mockReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    await validateEinstrustSession(req, mockRes() as any, next);
    expect(req.isAuthenticated).toBe(false);
  });

  it('authenticates from cache when token is cached', async () => {
    const cachedUser = { id: 'u1', email: 'user@test.com', roles: ['user'] };
    mockCacheGet.mockReturnValue(cachedUser);

    const req = mockReq({ headers: { authorization: 'Bearer cached-token' } });
    await validateEinstrustSession(req, mockRes() as any, next);

    expect(req.isAuthenticated).toBe(true);
    expect(req.user).toEqual(cachedUser);
    expect(mockValidateSession).not.toHaveBeenCalled();
  });

  it('calls einstrust and sets user when session is valid', async () => {
    const user = { id: 'u2', email: 'admin@test.com', roles: ['admin'] };
    mockValidateSession.mockResolvedValue({
      valid: true,
      user,
      session: { sessionId: 'sess-1', expiresAt: new Date(Date.now() + 3600000).toISOString() },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    await validateEinstrustSession(req, mockRes() as any, next);

    expect(req.isAuthenticated).toBe(true);
    expect(req.user).toEqual(user);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it('sets isAuthenticated=false when session is invalid', async () => {
    mockValidateSession.mockResolvedValue({ valid: false });

    const req = mockReq({ headers: { authorization: 'Bearer bad-token' } });
    await validateEinstrustSession(req, mockRes() as any, next);

    expect(req.isAuthenticated).toBe(false);
  });

  it('handles einstrust errors gracefully and calls next', async () => {
    mockValidateSession.mockRejectedValue(new Error('network timeout'));

    const req = mockReq({ headers: { authorization: 'Bearer error-token' } });
    await validateEinstrustSession(req, mockRes() as any, next);

    expect(req.isAuthenticated).toBe(false);
    expect(next).toHaveBeenCalled();
  });
});

// ── requireAuth ────────────────────────────────────────────

describe('requireAuth()', () => {
  it('calls next when user is authenticated', () => {
    const req = mockReq() as any;
    req.isAuthenticated = true;
    req.user = { id: 'u1', roles: [] };

    requireAuth(req, mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', () => {
    const req = mockReq() as any;
    req.isAuthenticated = false;
    const res = mockRes();

    requireAuth(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });
});

// ── requireRole ────────────────────────────────────────────

describe('requireRole()', () => {
  it('calls next when user has required role', () => {
    const req = mockReq() as any;
    req.isAuthenticated = true;
    req.user = { id: 'u1', roles: ['admin'] };

    requireRole('admin')(req, mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user lacks required role', () => {
    const req = mockReq() as any;
    req.isAuthenticated = true;
    req.user = { id: 'u1', roles: ['viewer'] };
    const res = mockRes();

    requireRole('admin')(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('accepts array of roles — passes if user has any', () => {
    const req = mockReq() as any;
    req.isAuthenticated = true;
    req.user = { id: 'u1', roles: ['editor'] };

    requireRole(['admin', 'editor'])(req, mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated at all', () => {
    const req = mockReq() as any;
    req.isAuthenticated = false;
    const res = mockRes();

    requireRole('admin')(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── createAuthMiddleware ────────────────────────────────────

describe('createAuthMiddleware()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next immediately when config is undefined', async () => {
    const mw = createAuthMiddleware(undefined);
    const req = mockReq();
    await mw(req, mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next immediately when config.required is false', async () => {
    const mw = createAuthMiddleware({ required: false });
    await mw(mockReq(), mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when required=true and no token', async () => {
    const mw = createAuthMiddleware({ required: true });
    const res = mockRes();
    mockCacheGet.mockReturnValue(null);
    mockValidateSession.mockResolvedValue({ valid: false });

    await mw(mockReq(), res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('allows anonymous when allowAnonymous=true even without token', async () => {
    const mw = createAuthMiddleware({ required: true, allowAnonymous: true });
    mockCacheGet.mockReturnValue(null);
    mockValidateSession.mockResolvedValue({ valid: false });

    await mw(mockReq(), mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when authenticated but missing required role', async () => {
    const user = { id: 'u1', email: 'u@test.com', roles: ['viewer'] };
    mockCacheGet.mockReturnValue(user);

    const mw = createAuthMiddleware({ required: true, roles: ['admin'] });
    const req = mockReq({ headers: { authorization: 'Bearer tok' } }) as any;
    const res = mockRes();

    await mw(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── optionalAuth ────────────────────────────────────────────

describe('optionalAuth()', () => {
  it('calls next with no token — non-blocking', async () => {
    const req = mockReq();
    await optionalAuth(req, mockRes() as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.isAuthenticated).toBe(false);
  });
});
