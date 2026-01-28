/**
 * Session Cache for Einstrust
 * Caches validated sessions to reduce API calls to Einstrust
 */

import { logger } from '../logger';
import { CachedSession, EinstrustUser } from './types';

export class SessionCache {
  private cache: Map<string, CachedSession>;
  private maxSize: number;
  private ttlSeconds: number;
  private cleanupInterval: NodeJS.Timeout | null;

  // Metrics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(ttlSeconds: number = 300, maxSize: number = 1000) {
    this.cache = new Map();
    this.ttlSeconds = ttlSeconds;
    this.maxSize = maxSize;
    this.cleanupInterval = null;

    // Start cleanup interval (every minute)
    this.startCleanup();

    logger.info('Session cache initialized', {
      ttlSeconds,
      maxSize,
    });
  }

  /**
   * Get cached session
   */
  get(token: string): EinstrustUser | null {
    const cached = this.cache.get(token);

    if (!cached) {
      this.misses++;
      logger.debug('Session cache miss', { token: this.maskToken(token) });
      return null;
    }

    // Check if expired
    if (cached.expiresAt < Date.now()) {
      this.cache.delete(token);
      this.evictions++;
      this.misses++;
      logger.debug('Session cache expired', {
        token: this.maskToken(token),
        userId: cached.userId,
      });
      return null;
    }

    this.hits++;
    logger.debug('Session cache hit', {
      token: this.maskToken(token),
      userId: cached.userId,
      age: Math.floor((Date.now() - cached.lastValidated) / 1000),
    });

    return cached.user;
  }

  /**
   * Set cached session
   */
  set(token: string, user: EinstrustUser, sessionId: string, expiresAt: Date): void {
    // Enforce max size (simple LRU: remove oldest)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.evictions++;
        logger.debug('Session cache eviction (max size)', {
          token: this.maskToken(firstKey),
        });
      }
    }

    const cached: CachedSession = {
      userId: user.id,
      user,
      sessionId,
      expiresAt: Math.min(
        expiresAt.getTime(),
        Date.now() + this.ttlSeconds * 1000
      ),
      lastValidated: Date.now(),
    };

    this.cache.set(token, cached);

    logger.debug('Session cached', {
      token: this.maskToken(token),
      userId: user.id,
      expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000),
    });
  }

  /**
   * Delete cached session
   */
  delete(token: string): void {
    const deleted = this.cache.delete(token);
    if (deleted) {
      logger.debug('Session cache deleted', {
        token: this.maskToken(token),
      });
    }
  }

  /**
   * Clear all cached sessions
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Session cache cleared', { sessionsRemoved: size });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: hitRate.toFixed(2) + '%',
      ttlSeconds: this.ttlSeconds,
    };
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute

    // Ensure cleanup runs even if process exits
    process.on('beforeExit', () => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    });
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [token, cached] of this.cache.entries()) {
      if (cached.expiresAt < now) {
        this.cache.delete(token);
        removed++;
        this.evictions++;
      }
    }

    if (removed > 0) {
      logger.debug('Session cache cleanup', {
        removed,
        remaining: this.cache.size,
      });
    }
  }

  /**
   * Mask token for logging (show first/last 4 chars)
   */
  private maskToken(token: string): string {
    if (token.length <= 8) {
      return '***';
    }
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    logger.info('Session cache destroyed');
  }
}

// Singleton instance
let sessionCache: SessionCache | null = null;

/**
 * Initialize session cache
 */
export function initializeSessionCache(ttlSeconds?: number, maxSize?: number): SessionCache {
  if (!sessionCache) {
    sessionCache = new SessionCache(ttlSeconds, maxSize);
  }
  return sessionCache;
}

/**
 * Get session cache instance
 */
export function getSessionCache(): SessionCache {
  if (!sessionCache) {
    // Initialize with defaults if not already done
    sessionCache = new SessionCache();
  }
  return sessionCache;
}

export default SessionCache;
