/**
 * Authentication Module
 * Main exports for Einstrust integration
 */

export * from './types';
export * from './einstrust';
export * from './sessionCache';
export * from './middleware';

import { EinstrustConfig } from './types';
import { initializeEinstrust, getEinstrustClient } from './einstrust';
import { initializeSessionCache, getSessionCache } from './sessionCache';
import { logger } from '../logger';

/**
 * Initialize authentication system
 */
export function initializeAuth(config: EinstrustConfig): void {
  logger.info('Initializing authentication system', {
    provider: 'einstrust',
    apiUrl: config.apiUrl,
    tenantId: config.tenantId,
    ssoEnabled: config.sso?.enabled,
    sessionCacheEnabled: config.sessionValidation?.enabled,
  });

  // Initialize Einstrust client
  initializeEinstrust(config);

  // Initialize session cache if enabled
  if (config.sessionValidation?.enabled !== false) {
    const cacheTTL = config.sessionValidation?.cacheTTL || 300;
    initializeSessionCache(cacheTTL);
    logger.info('Session cache enabled', { ttlSeconds: cacheTTL });
  }

  logger.info('Authentication system initialized');
}

/**
 * Get authentication status
 */
export async function getAuthStatus(): Promise<{
  enabled: boolean;
  provider: string;
  einstrustHealthy: boolean;
  cacheStats?: any;
}> {
  try {
    const client = getEinstrustClient();
    const healthy = await client.healthCheck();
    
    const cache = getSessionCache();
    const cacheStats = cache ? cache.getStats() : undefined;

    return {
      enabled: true,
      provider: 'einstrust',
      einstrustHealthy: healthy,
      cacheStats,
    };
  } catch (error) {
    logger.error('Failed to get auth status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      enabled: false,
      provider: 'none',
      einstrustHealthy: false,
    };
  }
}

export default {
  initializeAuth,
  getAuthStatus,
  getEinstrustClient,
  getSessionCache,
};
