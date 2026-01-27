/**
 * Application Integration Tests
 * Tests for health endpoints, version info, and middleware
 */

import request from 'supertest';
import { Application } from 'express';
import fs from 'fs';

// Mock fs before requiring app
jest.mock('fs');

describe('Application Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    // Mock config file
    const mockConfig = `
version: "1.0.0"
proxy:
  port: 3000
  host: "0.0.0.0"
upstreams:
  - name: test-service
    url: https://httpbin.org
routes:
  - path: /test/*
    upstream: test-service
`;
    (fs.readFileSync as jest.Mock).mockReturnValue(mockConfig);

    // Import app after mocking
    const appModule = await import('../app');
    app = appModule.default;
  });

  describe('Version Endpoint', () => {
    test('GET /version should return version information', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('name', 'flexgate-proxy');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('apiVersion', '1.0.0');
      expect(response.body).toHaveProperty('configVersion', '1.0.0');
      expect(response.body).toHaveProperty('node');
      expect(response.body).toHaveProperty('uptime');
    });

    test('version endpoint should include version headers', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('1.0.0');
      expect(response.headers['x-config-version']).toBe('1.0.0');
    });
  });

  describe('Health Endpoints', () => {
    test('GET /health should return UP status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        status: 'UP',
        version: '1.0.0'
      });
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        status: 'UP',
        version: '1.0.0'
      });
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.checks).toHaveProperty('config');
      expect(response.body.checks).toHaveProperty('upstreams');
    });

    test('GET /health/deep should return detailed health info', async () => {
      const response = await request(app)
        .get('/health/deep')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('circuitBreakers');
      expect(response.body).toHaveProperty('memory');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('percentUsed');
    });

    test('health endpoints should include version headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('1.0.0');
      expect(response.headers['x-config-version']).toBe('1.0.0');
    });

    test('health endpoints should include timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('Metrics Endpoint', () => {
    test('GET /metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
    });

    test('metrics should include default Node.js metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('process_cpu');
      expect(response.text).toContain('nodejs_');
    });

    test('metrics should include custom HTTP metrics', async () => {
      // Make a request to generate metrics
      await request(app).get('/health');

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_ms');
    });
  });

  describe('Middleware', () => {
    test('all requests should include correlation ID header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    test('should accept custom correlation ID from client', async () => {
      const customId = 'test-correlation-123';
      const response = await request(app)
        .get('/health')
        .set('X-Correlation-ID', customId)
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe(customId);
    });

    test('should set version headers on all responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('1.0.0');
      expect(response.headers['x-config-version']).toBe('1.0.0');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('correlationId');
    });

    test('404 responses should include version headers', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.headers['x-api-version']).toBe('1.0.0');
    });

    test('error responses should include correlation ID', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body.correlationId).toBeDefined();
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Request Tracking', () => {
    test('should track requests in metrics', async () => {
      // Make a few requests
      await request(app).get('/health');
      await request(app).get('/version');

      const response = await request(app).get('/metrics');
      
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('method="GET"');
    });

    test('should track request duration', async () => {
      await request(app).get('/health');

      const response = await request(app).get('/metrics');
      
      expect(response.text).toContain('http_request_duration_ms');
    });
  });

  describe('CORS', () => {
    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://example.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
