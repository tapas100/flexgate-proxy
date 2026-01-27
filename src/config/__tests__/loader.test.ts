/**
 * Configuration Loader Tests
 * Tests for config loading, validation, and reloading
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../loader';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Config Loader', () => {
  let config: Config;

  beforeEach(() => {
    config = new Config();
    jest.clearAllMocks();
  });

  describe('Loading Configuration', () => {
    test('should load valid YAML config', () => {
      const validYaml = `
version: "1.0.0"
upstreams:
  - name: test-service
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test-service
`;

      mockedFs.readFileSync as any.mockReturnValue(validYaml);

      const result = config.load('test-config.yml');

      expect(result).toBeDefined();
      expect(result.version).toBe('1.0.0');
      expect(result.upstreams).toHaveLength(1);
      expect(result.routes).toHaveLength(1);
    });

    test('should throw error for invalid YAML', () => {
      mockedFs.readFileSync as any.mockReturnValue('invalid: yaml: content:');

      expect(() => config.load('test-config.yml')).toThrow();
    });

    test('should throw error for missing file', () => {
      mockedFs.readFileSync as any.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => config.load('missing.yml')).toThrow();
    });

    test('should validate config after loading', () => {
      const invalidYaml = `
upstreams:
  - name: test
routes:
  - path: /api/*
    upstream: nonexistent
`;

      mockedFs.readFileSync as any.mockReturnValue(invalidYaml);

      expect(() => config.load('test-config.yml')).toThrow();
    });

    test('should apply defaults to loaded config', () => {
      const minimalYaml = `
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(minimalYaml);
      const result = config.load('test-config.yml');

      expect(result.proxy.port).toBe(3000);
      expect(result.timeouts.request).toBe(30000);
    });

    test('should log warnings for config issues', () => {
      const yamlWithDuplicates = `
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(yamlWithDuplicates);
      const warnSpy = jest.spyOn(console, 'warn');

      config.load('test-config.yml');

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('Config Versioning', () => {
    test('should handle config with version field', () => {
      const yamlWithVersion = `
version: "1.0.0"
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(yamlWithVersion);
      const result = config.load('test-config.yml');

      expect(result.version).toBe('1.0.0');
    });

    test('should default to 1.0.0 when version is missing', () => {
      const yamlWithoutVersion = `
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(yamlWithoutVersion);
      const result = config.load('test-config.yml');

      expect(result.version).toBe('1.0.0');
    });

    test('should have schema version property', () => {
      expect(config.schemaVersion).toBe('1.0.0');
    });
  });

  describe('Getting Configuration Values', () => {
    beforeEach(() => {
      const validYaml = `
version: "1.0.0"
proxy:
  port: 8080
  host: "127.0.0.1"
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
logging:
  level: debug
`;

      mockedFs.readFileSync as any.mockReturnValue(validYaml);
      config.load('test-config.yml');
    });

    test('should get top-level config value', () => {
      expect(config.get('version')).toBe('1.0.0');
    });

    test('should get nested config value', () => {
      expect(config.get('proxy.port')).toBe(8080);
      expect(config.get('proxy.host')).toBe('127.0.0.1');
      expect(config.get('logging.level')).toBe('debug');
    });

    test('should return default value for missing key', () => {
      expect(config.get('nonexistent', 'default')).toBe('default');
      expect(config.get('proxy.missing', 42)).toBe(42);
    });

    test('should return null for missing key without default', () => {
      expect(config.get('nonexistent')).toBeNull();
    });

    test('should get array values', () => {
      const upstreams = config.get('upstreams');
      expect(Array.isArray(upstreams)).toBe(true);
      expect(upstreams).toHaveLength(1);
    });

    test('should auto-load config if not loaded', () => {
      const newConfig = new Config();
      const validYaml = `
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;
      mockedFs.readFileSync as any.mockReturnValue(validYaml);

      const result = newConfig.get('upstreams');
      expect(result).toBeDefined();
      expect(newConfig.config).toBeDefined();
    });
  });

  describe('Config Validation', () => {
    test('should validate loaded config', () => {
      const validYaml = `
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(validYaml);
      config.load('test-config.yml');

      expect(() => config.validate()).not.toThrow();
    });

    test('should throw error when validating unloaded config', () => {
      expect(() => config.validate()).toThrow('Config not loaded');
    });

    test('should throw error for invalid config', () => {
      const invalidYaml = `
upstreams:
  - url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(invalidYaml);

      expect(() => config.load('test-config.yml')).toThrow();
    });
  });

  describe('Config Reloading', () => {
    test('should reload config successfully', () => {
      const initialYaml = `
upstreams:
  - name: service1
    url: https://api1.example.com
routes:
  - path: /api/*
    upstream: service1
`;

      const updatedYaml = `
upstreams:
  - name: service2
    url: https://api2.example.com
routes:
  - path: /api/*
    upstream: service2
`;

      mockedFs.readFileSync as any.mockReturnValueOnce(initialYaml);
      config.load('test-config.yml');
      expect(config.get('upstreams.0.name')).toBe('service1');

      mockedFs.readFileSync as any.mockReturnValueOnce(updatedYaml);
      config.reload('test-config.yml');
      expect(config.get('upstreams.0.name')).toBe('service2');
    });

    test('should notify watchers on reload', () => {
      const watcher = jest.fn();
      const initialYaml = `
upstreams:
  - name: service1
    url: https://api1.example.com
routes:
  - path: /api/*
    upstream: service1
`;

      mockedFs.readFileSync as any.mockReturnValue(initialYaml);
      config.load('test-config.yml');
      config.watch(watcher);

      config.reload('test-config.yml');

      expect(watcher).toHaveBeenCalled();
      expect(watcher).toHaveBeenCalledWith(
        expect.objectContaining({ version: '1.0.0' }),
        expect.objectContaining({ version: '1.0.0' })
      );
    });

    test('should handle watcher errors gracefully', () => {
      const errorWatcher = jest.fn(() => {
        throw new Error('Watcher error');
      });
      const validYaml = `
upstreams:
  - name: test
    url: https://api.example.com
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(validYaml);
      config.load('test-config.yml');
      config.watch(errorWatcher);

      // Should not throw, just log error
      expect(() => config.reload('test-config.yml')).not.toThrow();
    });
  });

  describe('Config Watchers', () => {
    test('should add config watcher', () => {
      const watcher = jest.fn();
      config.watch(watcher);

      expect(config.watchers).toContain(watcher);
    });

    test('should support multiple watchers', () => {
      const watcher1 = jest.fn();
      const watcher2 = jest.fn();

      config.watch(watcher1);
      config.watch(watcher2);

      expect(config.watchers).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty YAML file', () => {
      mockedFs.readFileSync as any.mockReturnValue('');

      expect(() => config.load('test-config.yml')).toThrow();
    });

    test('should handle YAML with only comments', () => {
      mockedFs.readFileSync as any.mockReturnValue('# Just a comment');

      expect(() => config.load('test-config.yml')).toThrow();
    });

    test('should handle deeply nested config access', () => {
      const validYaml = `
upstreams:
  - name: test
    url: https://api.example.com
    circuitBreaker:
      enabled: true
      failureThreshold: 5
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(validYaml);
      config.load('test-config.yml');

      expect(config.get('upstreams.0.circuitBreaker.failureThreshold')).toBe(5);
    });

    test('should handle null values in config', () => {
      const yamlWithNull = `
upstreams:
  - name: test
    url: https://api.example.com
    timeout: null
routes:
  - path: /api/*
    upstream: test
`;

      mockedFs.readFileSync as any.mockReturnValue(yamlWithNull);
      const result = config.load('test-config.yml');

      // Joi should apply default for null timeout
      expect(result.upstreams[0].timeout).toBeDefined();
    });
  });
});
