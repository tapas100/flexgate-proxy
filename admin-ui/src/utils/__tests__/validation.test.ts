import {
  validatePath,
  validateUpstream,
  validateMethods,
  validateRateLimit,
  validateCircuitBreakerThreshold,
  validateRouteConfig,
} from '../validation';

describe('Validation Utilities', () => {
  describe('validatePath', () => {
    it('should validate correct paths', () => {
      expect(validatePath('/api/users').valid).toBe(true);
      expect(validatePath('/api/users/*').valid).toBe(true);
      expect(validatePath('/v1/products/123').valid).toBe(true);
    });

    it('should reject empty paths', () => {
      const result = validatePath('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Path is required');
    });

    it('should reject paths not starting with /', () => {
      const result = validatePath('api/users');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Path must start with /');
    });
  });

  describe('validateUpstream', () => {
    it('should validate correct URLs', () => {
      expect(validateUpstream('https://api.example.com').valid).toBe(true);
      expect(validateUpstream('http://localhost:3000').valid).toBe(true);
    });

    it('should reject empty upstream', () => {
      const result = validateUpstream('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Upstream URL is required');
    });

    it('should reject invalid URLs', () => {
      const result = validateUpstream('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });

    it('should reject non-HTTP protocols', () => {
      const result = validateUpstream('ftp://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Upstream must use HTTP or HTTPS protocol');
    });
  });

  describe('validateMethods', () => {
    it('should validate correct methods', () => {
      expect(validateMethods(['GET']).valid).toBe(true);
      expect(validateMethods(['GET', 'POST']).valid).toBe(true);
      expect(validateMethods(['GET', 'POST', 'PUT', 'DELETE']).valid).toBe(true);
    });

    it('should reject empty methods array', () => {
      const result = validateMethods([]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('At least one HTTP method is required');
    });

    it('should reject invalid methods', () => {
      const result = validateMethods(['GET', 'INVALID']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid methods');
    });
  });

  describe('validateRateLimit', () => {
    it('should validate correct rate limits', () => {
      expect(validateRateLimit(100, '60s').valid).toBe(true);
      expect(validateRateLimit(1000, '1m').valid).toBe(true);
      expect(validateRateLimit(5000, '1h').valid).toBe(true);
    });

    it('should reject zero or negative requests', () => {
      const result = validateRateLimit(0, '60s');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Requests must be greater than 0');
    });

    it('should reject too many requests', () => {
      const result = validateRateLimit(10001, '60s');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Requests must be less than 10,000');
    });

    it('should reject invalid window format', () => {
      const result = validateRateLimit(100, '60');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Window must be in format');
    });
  });

  describe('validateCircuitBreakerThreshold', () => {
    it('should validate correct thresholds', () => {
      expect(validateCircuitBreakerThreshold(5).valid).toBe(true);
      expect(validateCircuitBreakerThreshold(10).valid).toBe(true);
      expect(validateCircuitBreakerThreshold(50).valid).toBe(true);
    });

    it('should reject thresholds outside range', () => {
      expect(validateCircuitBreakerThreshold(0).valid).toBe(false);
      expect(validateCircuitBreakerThreshold(101).valid).toBe(false);
    });
  });

  describe('validateRouteConfig', () => {
    it('should validate complete valid config', () => {
      const config = {
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET', 'POST'],
        rateLimit: { requests: 100, window: '60s' },
        circuitBreaker: { enabled: true, threshold: 5 },
      };
      expect(validateRouteConfig(config).valid).toBe(true);
    });

    it('should validate config without optional fields', () => {
      const config = {
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET'],
      };
      expect(validateRouteConfig(config).valid).toBe(true);
    });

    it('should reject config with invalid path', () => {
      const config = {
        path: 'invalid',
        upstream: 'https://api.example.com',
        methods: ['GET'],
      };
      const result = validateRouteConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Path');
    });

    it('should reject config with invalid upstream', () => {
      const config = {
        path: '/api/users',
        upstream: 'not-a-url',
        methods: ['GET'],
      };
      const result = validateRouteConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('URL');
    });
  });
});
