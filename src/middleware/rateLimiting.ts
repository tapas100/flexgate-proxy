/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and brute-force attacks
 */

import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter for authentication endpoints
 * Strict limits to prevent brute-force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too Many Requests',
    message: 'Too many login attempts. Please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false, // Count failed requests
  keyGenerator: (req: Request) => {
    // Use IP address as key
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many login attempts from this IP. Please try again later.',
      retryAfter: '15 minutes'
    });
  },
});

/**
 * Rate limiter for admin API endpoints
 * Moderate limits to prevent abuse while allowing legitimate use
 */
export const adminApiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please slow down your requests.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req: Request) => {
    // Use IP address for external requests
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request) => {
    // Skip rate limiting for internal requests (proxy traffic)
    const isInternal = 
      req.ip === '127.0.0.1' || 
      req.ip === '::1' || 
      req.ip === 'localhost' ||
      req.headers['x-internal-request'] === 'true';
    
    return isInternal;
  },
});

/**
 * Rate limiter for DELETE operations
 * Very strict limits to prevent destructive actions
 */
export const deleteOperationRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 deletions per 5 minutes
  message: {
    error: 'Too Many Requests',
    message: 'Too many delete operations. Please wait before trying again.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request) => {
    // Skip for internal requests
    return req.headers['x-internal-request'] === 'true';
  },
});

/**
 * Rate limiter for webhook creation
 * Prevents webhook spam/injection attacks
 */
export const webhookCreationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 webhooks per hour
  message: {
    error: 'Too Many Requests',
    message: 'Too many webhooks created. Please wait before creating more.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request) => {
    return req.headers['x-internal-request'] === 'true';
  },
});

/**
 * Rate limiter for route management
 * Prevents route hijacking attacks
 */
export const routeManagementRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 route operations per hour
  message: {
    error: 'Too Many Requests',
    message: 'Too many route operations. Please wait before modifying routes.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request) => {
    return req.headers['x-internal-request'] === 'true';
  },
});

/**
 * Global API rate limiter
 * General protection for all API endpoints
 */
export const globalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded for API requests.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request) => {
    // Skip for internal proxy traffic
    const isInternal = 
      req.ip === '127.0.0.1' || 
      req.ip === '::1' ||
      req.headers['x-internal-request'] === 'true';
    
    // Also skip for proxy routes (non-/api paths)
    const isProxyRoute = !req.path.startsWith('/api');
    
    return isInternal || isProxyRoute;
  },
});
