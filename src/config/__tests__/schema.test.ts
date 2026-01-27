/**
 * Configuration Schema Tests
 * Tests for schema validation, versioning, and migration
 */

import { validateConfig, getSchemaVersion, migrateConfig, SCHEMA_VERSION } from '../schema';
import type { ProxyConfig } from '../../types';

describe('Config Schema', () => {
  describe('Schema Version', () => {
    test('should return current schema version', () => {
      expect(getSchemaVersion()).toBe('1.0.0');
      expect(SCHEMA_VERSION).toBe('1.0.0');
    });
  });

  describe('Valid Configuration', () => {
    test('should validate minimal valid config', () => {
      const config = {
        upstreams: [
          {
            name: 'test-service',
            url: 'https://api.example.com'
          }
        ],
        routes: [
          {
            path: '/api/*',
            upstream: 'test-service'
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.error).toBeNull();
      expect(result.value).toBeDefined();
      expect(result.value!.version).toBe('1.0.0');
    });

    test('should apply defaults to config', () => {
      const config = {
        upstreams: [
          {
            name: 'test-service',
            url: 'https://api.example.com'
          }
        ],
        routes: [
          {
            path: '/api/*',
            upstream: 'test-service'
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.value!.proxy.port).toBe(3000);
      expect(result.value!.proxy.host).toBe('0.0.0.0');
      expect(result.value!.proxy.timeout.request).toBe(30000);
      expect(result.value!.logging.level).toBe('info');
    });

    test('should validate complete config with all options', () => {
      const config = {
        version: '1.0.0',
        proxy: {
          host: '127.0.0.1',
          port: 8080,
          maxBodySize: '5mb',
          trustProxy: true,
          cors: {
            enabled: true,
            origin: 'https://example.com',
            credentials: true
          }
        },
        upstreams: [
          {
            name: 'service1',
            url: 'https://api1.example.com',
            timeout: 10000,
            healthCheck: {
              enabled: true,
              path: '/health',
              interval: 30000,
              timeout: 5000,
              unhealthyThreshold: 3,
              healthyThreshold: 2
            },
            circuitBreaker: {
              enabled: true,
              failureThreshold: 5,
              successThreshold: 2,
              timeout: 60000,
              halfOpenRequests: 3
            }
          }
        ],
        routes: [
          {
            path: '/api/v1/*',
            upstream: 'service1',
            methods: ['GET', 'POST'],
            stripPath: '/api/v1',
            rateLimit: {
              enabled: true,
              max: 100,
              windowMs: 60000,
              message: 'Rate limit exceeded'
            }
          }
        ],
        timeouts: {
          request: 60000,
          connect: 10000,
          idle: 300000
        },
        logging: {
          level: 'debug',
          format: 'json',
          sampling: {
            enabled: true,
            successRate: 0.5,
            errorRate: 1.0
          },
          redaction: {
            enabled: true,
            fields: ['password', 'token']
          }
        },
        redis: {
          enabled: true,
          host: 'redis.example.com',
          port: 6380,
          password: 'secret',
          db: 1,
          keyPrefix: 'myapp:'
        }
      };

      const result = validateConfig(config);
      expect(result.error).toBeNull();
      expect(result.value!.upstreams).toHaveLength(1);
      expect(result.value!.routes).toHaveLength(1);
      expect(result.value!.logging.level).toBe('debug');
    });
  });

  describe('Upstream Validation', () => {
    test('should require upstream name', () => {
      const config = {
        upstreams: [
          {
            url: 'https://api.example.com'
          }
        ],
        routes: []
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('name');
    });

    test('should require upstream url', () => {
      const config = {
        upstreams: [
          {
            name: 'test'
          }
        ],
        routes: []
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('url');
    });

    test('should validate upstream name pattern', () => {
      const config = {
        upstreams: [
          {
            name: 'test service!',
            url: 'https://api.example.com'
          }
        ],
        routes: []
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should accept valid upstream names', () => {
      const validNames = ['service1', 'my-service', 'service_2', 'API-Gateway'];
      
      validNames.forEach(name => {
        const config = {
          upstreams: [{ name, url: 'https://api.example.com' }],
          routes: [{ path: '/test/*', upstream: name }]
        };
        const result = validateConfig(config);
        expect(result.error).toBeNull();
      });
    });

    test('should detect duplicate upstream names', () => {
      const config = {
        upstreams: [
          { name: 'service1', url: 'https://api1.example.com' },
          { name: 'service1', url: 'https://api2.example.com' }
        ],
        routes: [{ path: '/test/*', upstream: 'service1' }]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Duplicate upstream names');
    });
  });

  describe('Route Validation', () => {
    test('should require route path', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [
          {
            upstream: 'test'
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('path');
    });

    test('should require route upstream', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [
          {
            path: '/api/*'
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('upstream');
    });

    test('should validate route path pattern', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [
          {
            path: 'invalid-path',
            upstream: 'test'
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should accept valid route paths', () => {
      const validPaths = ['/api/*', '/v1/users/*', '/health', '/api/v2/*'];
      
      validPaths.forEach(path => {
        const config = {
          upstreams: [{ name: 'test', url: 'https://api.example.com' }],
          routes: [{ path, upstream: 'test' }]
        };
        const result = validateConfig(config);
        expect(result.error).toBeNull();
      });
    });

    test('should validate route methods', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [
          {
            path: '/api/*',
            upstream: 'test',
            methods: ['GET', 'POST', 'INVALID']
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should detect invalid upstream reference', () => {
      const config = {
        upstreams: [{ name: 'service1', url: 'https://api.example.com' }],
        routes: [
          {
            path: '/api/*',
            upstream: 'service2'
          }
        ]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid upstream references');
    });

    test('should warn about duplicate route paths', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [
          { path: '/api/*', upstream: 'test' },
          { path: '/api/*', upstream: 'test' }
        ]
      };

      const result = validateConfig(config);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Duplicate route paths');
    });
  });

  describe('Circuit Breaker Validation', () => {
    test('should validate circuit breaker thresholds', () => {
      const config = {
        upstreams: [{
          name: 'test',
          url: 'https://api.example.com',
          circuitBreaker: {
            failureThreshold: 150
          }
        }],
        routes: [{ path: '/test/*', upstream: 'test' }]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should apply circuit breaker defaults', () => {
      const config = {
        upstreams: [{
          name: 'test',
          url: 'https://api.example.com'
        }],
        routes: [{ path: '/test/*', upstream: 'test' }]
      };

      const result = validateConfig(config);
      expect(result.value!.upstreams[0].circuitBreaker).toBeDefined();
      expect(result.value!.upstreams[0].circuitBreaker.enabled).toBe(true);
      expect(result.value!.upstreams[0].circuitBreaker.failureThreshold).toBe(5);
    });
  });

  describe('Rate Limit Validation', () => {
    test('should validate rate limit configuration', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [{
          path: '/api/*',
          upstream: 'test',
          rateLimit: {
            enabled: true,
            max: 100,
            windowMs: 60000
          }
        }]
      };

      const result = validateConfig(config);
      expect(result.error).toBeNull();
      expect(result.value!.routes[0].rateLimit.max).toBe(100);
    });

    test('should reject negative rate limits', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [{
          path: '/api/*',
          upstream: 'test',
          rateLimit: {
            max: -1
          }
        }]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });
  });

  describe('Logging Validation', () => {
    test('should validate log level', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [{ path: '/test/*', upstream: 'test' }],
        logging: {
          level: 'invalid'
        }
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should accept valid log levels', () => {
      const levels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
      
      levels.forEach(level => {
        const config = {
          upstreams: [{ name: 'test', url: 'https://api.example.com' }],
          routes: [{ path: '/test/*', upstream: 'test' }],
          logging: { level }
        };
        const result = validateConfig(config);
        expect(result.error).toBeNull();
      });
    });

    test('should validate sampling rates', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }],
        routes: [{ path: '/test/*', upstream: 'test' }],
        logging: {
          sampling: {
            successRate: 1.5
          }
        }
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });
  });

  describe('Config Migration', () => {
    test('should not migrate v1.0.0 config', () => {
      const config = { version: '1.0.0', test: 'value' };
      const migrated = migrateConfig(config, '1.0.0');
      expect(migrated).toEqual(config);
    });

    test('should handle missing version as v1.0.0', () => {
      const config = { test: 'value' };
      const migrated = migrateConfig(config, '' as any);
      expect(migrated).toEqual(config);
    });

    test('should throw error for unsupported version', () => {
      const config = { version: '2.0.0' };
      expect(() => migrateConfig(config, '2.0.0')).toThrow('Unsupported config version');
    });
  });

  describe('Edge Cases', () => {
    test('should reject config without upstreams', () => {
      const config = {
        routes: []
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should reject config without routes', () => {
      const config = {
        upstreams: [{ name: 'test', url: 'https://api.example.com' }]
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should reject empty upstreams array', () => {
      const config = {
        upstreams: [],
        routes: []
      };

      const result = validateConfig(config);
      expect(result.error).toBeDefined();
    });

    test('should handle metadata fields', () => {
      const config = {
        upstreams: [{
          name: 'test',
          url: 'https://api.example.com',
          metadata: {
            team: 'platform',
            environment: 'production'
          }
        }],
        routes: [{
          path: '/test/*',
          upstream: 'test',
          metadata: {
            version: 'v1'
          }
        }],
        metadata: {
          project: 'flexgate'
        }
      };

      const result = validateConfig(config);
      expect(result.error).toBeNull();
      expect(result.value!.upstreams[0].metadata.team).toBe('platform');
    });
  });
});
