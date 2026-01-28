/**
 * Authentication Middleware for FlexGate
 * Validates Einstrust sessions on incoming requests
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { getEinstrustClient } from './einstrust';
import { getSessionCache } from './sessionCache';
import { EinstrustUser, RouteAuthConfig } from './types';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: EinstrustUser;
      sessionId?: string;
      isAuthenticated?: boolean;
    }
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] || null;
}

/**
 * Middleware: Validate Einstrust session
 */
export async function validateEinstrustSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      logger.debug('No bearer token found in request');
      req.isAuthenticated = false;
      return next();
    }

    // Check cache first
    const cache = getSessionCache();
    const cachedUser = cache.get(token);

    if (cachedUser) {
      req.user = cachedUser;
      req.isAuthenticated = true;
      logger.debug('User authenticated from cache', {
        userId: cachedUser.id,
        email: cachedUser.email,
      });
      return next();
    }

    // Validate with Einstrust
    const client = getEinstrustClient();
    const validation = await client.validateSession(token);

    if (validation.valid && validation.user && validation.session) {
      req.user = validation.user;
      req.sessionId = validation.session.sessionId;
      req.isAuthenticated = true;

      // Cache the session
      cache.set(
        token,
        validation.user,
        validation.session.sessionId,
        new Date(validation.expiresAt || validation.session.expiresAt)
      );

      logger.info('User authenticated', {
        userId: validation.user.id,
        email: validation.user.email,
        sessionId: validation.session.sessionId,
      });

      return next();
    }

    // Invalid session
    logger.debug('Session validation failed');
    req.isAuthenticated = false;
    return next();
  } catch (error) {
    logger.error('Session validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    req.isAuthenticated = false;
    return next();
  }
}

/**
 * Middleware: Require authentication
 * Must be used after validateEinstrustSession
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.isAuthenticated || !req.user) {
    logger.warn('Unauthorized access attempt', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid authentication required',
    });
    return;
  }

  next();
}

/**
 * Middleware: Require specific role(s)
 */
export function requireRole(roles: string | string[]) {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated || !req.user) {
      logger.warn('Unauthorized access attempt (no auth)', {
        path: req.path,
        requiredRoles,
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn('Forbidden access attempt (insufficient role)', {
        path: req.path,
        userId: req.user.id,
        userRoles,
        requiredRoles,
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: requiredRoles,
        actual: userRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory: Create route-specific auth middleware
 */
export function createAuthMiddleware(config?: RouteAuthConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // No auth required
    if (!config || !config.required) {
      return next();
    }

    // Validate session
    await validateEinstrustSession(req, res, () => {
      // Check if authenticated
      if (!req.isAuthenticated || !req.user) {
        // Allow anonymous if configured
        if (config.allowAnonymous) {
          return next();
        }

        logger.warn('Authentication required', {
          path: req.path,
          provider: config.provider,
        });

        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          provider: config.provider,
        });
        return;
      }

      // Check roles if specified
      if (config.roles && config.roles.length > 0) {
        const userRoles = req.user.roles || [];
        const hasRole = config.roles.some(role => userRoles.includes(role));

        if (!hasRole) {
          logger.warn('Insufficient permissions', {
            path: req.path,
            userId: req.user.id,
            requiredRoles: config.roles,
            userRoles,
          });

          res.status(403).json({
            error: 'Forbidden',
            message: 'Insufficient permissions',
            required: config.roles,
          });
          return;
        }
      }

      // Authenticated and authorized
      next();
    });
  };
}

/**
 * Middleware: Optional authentication
 * Validates session if present, but doesn't require it
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await validateEinstrustSession(req, res, next);
}

export default {
  validateEinstrustSession,
  requireAuth,
  requireRole,
  createAuthMiddleware,
  optionalAuth,
};
