/**
 * Authentication Routes for FlexGate
 * Handles SAML SSO integration with Einstrust
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../src/logger';
import { getEinstrustClient } from '../src/auth/einstrust';
import { getSessionCache } from '../src/auth/sessionCache';
import { requireAuth, validateEinstrustSession } from '../src/auth/middleware';
import { getAuthStatus } from '../src/auth';

const router: Router = express.Router();

/**
 * GET /api/auth/status
 * Get authentication system status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getAuthStatus();
    res.json(status);
  } catch (error) {
    logger.error('Failed to get auth status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve authentication status',
    });
  }
});

/**
 * POST /api/auth/saml/initiate
 * Initiate SAML SSO login flow
 */
router.post('/saml/initiate', async (req: Request, res: Response) => {
  try {
    const { returnUrl, idpId, tenantId } = req.body;

    if (!returnUrl) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'returnUrl is required',
      });
      return;
    }

    const client = getEinstrustClient();
    const result = await client.initiateSSOLogin({
      returnUrl,
      idpId,
      tenantId,
    });

    logger.info('SSO login initiated', {
      returnUrl,
      idpId,
      tenantId,
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to initiate SSO', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to initiate SSO',
    });
  }
});

/**
 * POST /api/auth/saml/callback
 * Handle SAML callback from IdP
 */
router.post('/saml/callback', async (req: Request, res: Response) => {
  try {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'SAMLResponse is required',
      });
      return;
    }

    const client = getEinstrustClient();
    const result = await client.handleSSOCallback({
      SAMLResponse,
      RelayState,
    });

    logger.info('SAML callback processed', {
      userId: result.user.id,
      sessionId: result.sessionId,
    });

    // Cache the session
    const cache = getSessionCache();
    cache.set(
      result.token,
      result.user,
      result.sessionId,
      new Date(result.expiresAt)
    );

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    logger.error('Failed to process SAML callback', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'SAML callback processing failed',
    });
  }
});

/**
 * GET /api/auth/session
 * Validate current session
 */
router.get('/session', validateEinstrustSession, (req: Request, res: Response) => {
  if (!req.isAuthenticated || !req.user) {
    res.status(401).json({
      valid: false,
      message: 'No valid session',
    });
    return;
  }

  res.json({
    valid: true,
    user: req.user,
    sessionId: req.sessionId,
  });
});

/**
 * POST /api/auth/logout
 * Logout and optionally initiate SAML SLO
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'No token provided',
      });
      return;
    }

    const client = getEinstrustClient();
    const result = await client.logout(token, {
      sessionId: req.sessionId,
    });

    // Remove from cache
    const cache = getSessionCache();
    cache.delete(token);

    logger.info('User logged out', {
      userId: req.user?.id,
      sessionId: req.sessionId,
    });

    res.json({
      success: result.success,
      sloUrl: result.sloUrl,
    });
  } catch (error) {
    logger.error('Logout failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Logout failed',
    });
  }
});

/**
 * GET /api/auth/metadata
 * Get SAML SP metadata (for IdP configuration)
 */
router.get('/metadata/:tenantId?', async (req: Request, res: Response) => {
  try {
    const tenantId = typeof req.params.tenantId === 'string' ? req.params.tenantId : undefined;
    
    const client = getEinstrustClient();
    const metadata = await client.getSPMetadata(tenantId);

    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error) {
    logger.error('Failed to get SP metadata', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve SP metadata',
    });
  }
});

/**
 * GET /api/auth/cache/stats
 * Get session cache statistics (admin only)
 */
router.get('/cache/stats', requireAuth, (req: Request, res: Response) => {
  try {
    // Check if user is admin
    const userRoles = req.user?.roles || [];
    if (!userRoles.includes('admin')) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
      });
      return;
    }

    const cache = getSessionCache();
    const stats = cache.getStats();

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get cache stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve cache statistics',
    });
  }
});

/**
 * POST /api/auth/cache/clear
 * Clear session cache (admin only)
 */
router.post('/cache/clear', requireAuth, (req: Request, res: Response) => {
  try {
    // Check if user is admin
    const userRoles = req.user?.roles || [];
    if (!userRoles.includes('admin')) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
      });
      return;
    }

    const cache = getSessionCache();
    cache.clear();

    logger.info('Session cache cleared', {
      userId: req.user?.id,
    });

    res.json({
      success: true,
      message: 'Session cache cleared',
    });
  } catch (error) {
    logger.error('Failed to clear cache', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to clear session cache',
    });
  }
});

export default router;
