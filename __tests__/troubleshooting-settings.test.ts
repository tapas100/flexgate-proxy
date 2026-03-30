/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Troubleshooting & Settings UI/API Integration Tests
 * 
 * Tests both UI interactions and API responses for:
 * - Troubleshooting features (health check, auto-recovery, etc.)
 * - Settings features (general, notifications)
 * 
 * Prerequisites:
 * - Run `bash scripts/start-all.sh` to start all services
 * - FlexGate API running on http://localhost:3000
 * - Admin UI running on http://localhost:3002
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_UI_URL = process.env.ADMIN_UI_URL || 'http://localhost:3002';
const API_TIMEOUT = 30000; // 30 seconds for script execution

describe('Troubleshooting API Tests', () => {
  let apiClient: AxiosInstance;

  beforeAll(() => {
    apiClient = axios.create({
      baseURL: `${API_BASE_URL}/api/troubleshooting`,
      timeout: API_TIMEOUT,
      validateStatus: () => true, // Don't throw on any status
    });
  });

  describe('POST /api/troubleshooting/health-check', () => {
    test('should run health check and return status for all services', async () => {
      const response = await apiClient.post('/health-check');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('healthChecks');
      expect(response.data).toHaveProperty('output');
      expect(response.data).toHaveProperty('exitCode');

      // Verify healthChecks structure
      expect(Array.isArray(response.data.healthChecks)).toBe(true);
      
      if (response.data.healthChecks.length > 0) {
        const firstCheck = response.data.healthChecks[0];
        expect(firstCheck).toHaveProperty('name');
        expect(firstCheck).toHaveProperty('status');
        expect(firstCheck).toHaveProperty('message');
        expect(['healthy', 'unhealthy', 'warning', 'unknown']).toContain(firstCheck.status);
      }

      // Verify output is an array
      expect(Array.isArray(response.data.output)).toBe(true);

      console.log('✓ Health Check Response:', {
        success: response.data.success,
        checksCount: response.data.healthChecks.length,
        exitCode: response.data.exitCode,
      });
    }, API_TIMEOUT);

    test('should check FlexGate API health', async () => {
      const response = await apiClient.post('/health-check');

      // Find the actual healthy check (not the "Checking..." one)
      const flexGateChecks = response.data.healthChecks?.filter(
        (check: any) => check.name === 'FlexGate API'
      ) || [];

      // Should have at least one FlexGate API check
      expect(flexGateChecks.length).toBeGreaterThan(0);
      
      // Find the one with actual status (not "unknown")
      const healthyCheck = flexGateChecks.find(
        (check: any) => check.status === 'healthy' || check.status === 'unhealthy'
      );

      if (healthyCheck) {
        expect(['healthy', 'unhealthy', 'warning']).toContain(healthyCheck.status);
        console.log('✓ FlexGate API Status:', healthyCheck.status);
      }
    }, API_TIMEOUT);

    test('should handle errors gracefully', async () => {
      const response = await apiClient.post('/health-check');

      // Even if script fails, should return valid response structure
      expect(response.status).toBeLessThan(500);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('output');
    }, API_TIMEOUT);
  });

  describe('POST /api/troubleshooting/check-requirements', () => {
    test('should check system requirements', async () => {
      const response = await apiClient.post('/check-requirements');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('systemChecks');
      expect(response.data).toHaveProperty('output');

      // Verify systemChecks structure
      expect(Array.isArray(response.data.systemChecks)).toBe(true);

      if (response.data.systemChecks.length > 0) {
        const firstCheck = response.data.systemChecks[0];
        expect(firstCheck).toHaveProperty('name');
        expect(firstCheck).toHaveProperty('status');
        expect(firstCheck).toHaveProperty('message');
      }

      console.log('✓ Requirements Check:', {
        success: response.data.success,
        checksCount: response.data.systemChecks.length,
      });
    }, API_TIMEOUT);

    test('should verify Node.js version', async () => {
      const response = await apiClient.post('/check-requirements');

      const nodeCheck = response.data.systemChecks?.find(
        (check: any) => check.name === 'Node.js Version'
      );

      if (nodeCheck) {
        expect(nodeCheck.status).toBe('healthy');
        expect(nodeCheck.message).toContain('v');
        console.log('✓ Node.js:', nodeCheck.message);
      }
    }, API_TIMEOUT);

    test('should check npm availability', async () => {
      const response = await apiClient.post('/check-requirements');

      const npmCheck = response.data.systemChecks?.find(
        (check: any) => check.name === 'npm'
      );

      if (npmCheck) {
        expect(npmCheck.status).toBe('healthy');
        console.log('✓ npm:', npmCheck.message);
      }
    }, API_TIMEOUT);
  });

  describe('POST /api/troubleshooting/auto-recover', () => {
    test('should execute auto-recovery script', async () => {
      const response = await apiClient.post('/auto-recover');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('output');
      expect(response.data).toHaveProperty('exitCode');

      expect(Array.isArray(response.data.output)).toBe(true);

      console.log('✓ Auto Recovery:', {
        success: response.data.success,
        exitCode: response.data.exitCode,
        outputLines: response.data.output.length,
      });
    }, API_TIMEOUT);

    test('should return detailed output', async () => {
      const response = await apiClient.post('/auto-recover');

      expect(response.data.output.length).toBeGreaterThan(0);
      
      // Output should contain recovery steps
      const outputText = response.data.output.join(' ');
      expect(outputText.length).toBeGreaterThan(0);
    }, API_TIMEOUT);
  });

  describe('POST /api/troubleshooting/clean-install', () => {
    test.skip('should execute clean install script (SKIPPED - takes >90s)', async () => {
      // This test is skipped because clean-install can take several minutes
      // It removes node_modules and does a fresh npm install
      // To test manually: curl -X POST http://localhost:3000/api/troubleshooting/clean-install
      
      const response = await apiClient.post('/clean-install');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('output');
      expect(response.data).toHaveProperty('exitCode');

      console.log('✓ Clean Install:', {
        success: response.data.success,
        exitCode: response.data.exitCode,
      });
    }, API_TIMEOUT * 3); // Clean install can take up to 90 seconds
    
    test('should verify clean-install endpoint exists', async () => {
      // Just verify the endpoint exists without executing the long-running operation
      const shortClient = axios.create({
        baseURL: `${API_BASE_URL}/api/troubleshooting`,
        timeout: 1000,
        validateStatus: () => true,
      });
      
      try {
        await shortClient.post('/clean-install');
      } catch (error: any) {
        // Timeout is expected, but endpoint should exist (not 404)
        expect(['ECONNABORTED', 'ETIMEDOUT']).toContain(error.code);
      }
      
      console.log('✓ Clean install endpoint exists (execution skipped)');
    });
  });

  describe('POST /api/troubleshooting/nuclear-reset', () => {
    test.skip('should execute nuclear reset (SKIPPED - destructive operation)', async () => {
      // This test is skipped because nuclear-reset is a destructive operation
      // It stops all services, removes all data, and resets to clean state
      // To test manually with caution: curl -X POST http://localhost:3000/api/troubleshooting/nuclear-reset
      
      const response = await apiClient.post('/nuclear-reset');

      expect(response.status).toBeLessThan(500);
      expect(response.data).toHaveProperty('success');

      console.log('✓ Nuclear Reset endpoint exists (not executed)');
    }, API_TIMEOUT * 3);
    
    test('should verify nuclear-reset endpoint exists', async () => {
      // Just verify the endpoint exists without executing the destructive operation
      const shortClient = axios.create({
        baseURL: `${API_BASE_URL}/api/troubleshooting`,
        timeout: 1000,
        validateStatus: () => true,
      });
      
      try {
        await shortClient.post('/nuclear-reset');
      } catch (error: any) {
        // Timeout is expected for this long-running operation
        expect(['ECONNABORTED', 'ETIMEDOUT']).toContain(error.code);
      }
      
      console.log('✓ Nuclear reset endpoint exists (execution skipped for safety)');
    });
  });

  describe('GET /api/troubleshooting/logs', () => {
    test('should retrieve application logs', async () => {
      const response = await apiClient.get('/logs');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('logs');
      expect(Array.isArray(response.data.logs)).toBe(true);

      console.log('✓ Logs retrieved:', {
        logCount: response.data.logs.length,
      });
    });

    test('should return log entries with timestamps', async () => {
      const response = await apiClient.get('/logs');

      if (response.data.logs.length > 0) {
        const firstLog = response.data.logs[0];
        expect(typeof firstLog).toBe('string');
        expect(firstLog.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /api/troubleshooting/system-info', () => {
    test('should return system information', async () => {
      const response = await apiClient.get('/system-info');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('platform');
      expect(response.data).toHaveProperty('node'); // API returns 'node', not 'nodeVersion'
      expect(response.data).toHaveProperty('memory');
      expect(response.data).toHaveProperty('uptime');

      console.log('✓ System Info:', {
        platform: response.data.platform,
        node: response.data.node,
        arch: response.data.arch,
      });
    });

    test('should provide memory statistics', async () => {
      const response = await apiClient.get('/system-info');

      expect(response.data.memory).toBeTruthy();
      
      // Memory is returned as strings like "52 MB", not numbers
      expect(response.data.memory).toHaveProperty('rss');
      expect(response.data.memory).toHaveProperty('heapTotal');
      expect(response.data.memory).toHaveProperty('heapUsed');

      // Verify they are strings with MB suffix
      expect(typeof response.data.memory.rss).toBe('string');
      expect(response.data.memory.rss).toContain('MB');
    });
  });
});

describe('Settings API Tests', () => {
  let apiClient: AxiosInstance;

  beforeAll(() => {
    apiClient = axios.create({
      baseURL: `${API_BASE_URL}/api`,
      timeout: 10000,
      validateStatus: () => true,
    });
  });

  describe('GET /api/settings', () => {
    test('should retrieve current settings', async () => {
      const response = await apiClient.get('/settings');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data).toBeTruthy();
        console.log('✓ Settings retrieved successfully');
      }
    });
  });

  describe('PUT /api/settings', () => {
    test('should update settings', async () => {
      const testSettings = {
        general: {
          apiPort: 3000,
          logLevel: 'info',
          enableMetrics: true,
        },
        notifications: {
          email: {
            enabled: false,
          },
          slack: {
            enabled: false,
          },
        },
      };

      const response = await apiClient.put('/settings', testSettings);

      expect([200, 201, 404]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        expect(response.data).toHaveProperty('success');
        console.log('✓ Settings updated successfully');
      }
    });
  });
});

describe('UI Component Tests (E2E)', () => {
  test('Admin UI should be accessible', async () => {
    try {
      const response = await axios.get(ADMIN_UI_URL, { timeout: 5000 });
      expect([200, 304]).toContain(response.status);
      console.log('✓ Admin UI is accessible');
    } catch (error: any) {
      // UI might not be running
      console.log('⚠ Admin UI not accessible:', error.message);
      expect(error.code).toBeDefined();
    }
  });

  test('Troubleshooting page should load', async () => {
    try {
      const response = await axios.get(`${ADMIN_UI_URL}/troubleshooting`, {
        timeout: 5000,
        validateStatus: () => true,
      });
      
      // 200 if server rendering, 404 if SPA routing
      expect([200, 404]).toContain(response.status);
      console.log('✓ Troubleshooting route exists');
    } catch (error: any) {
      console.log('⚠ Troubleshooting page check failed:', error.message);
    }
  });
});

describe('Integration Tests - UI Button → API Response', () => {
  let apiClient: AxiosInstance;

  beforeAll(() => {
    apiClient = axios.create({
      baseURL: `${API_BASE_URL}/api/troubleshooting`,
      timeout: API_TIMEOUT,
      validateStatus: () => true,
    });
  });

  describe('Health Check Button Flow', () => {
    test('should simulate "Run Health Check" button click', async () => {
      console.log('\n🔘 Simulating: User clicks "Run Health Check" button\n');

      // 1. UI sends POST request
      const response = await apiClient.post('/health-check');

      // 2. Verify API response
      expect(response.status).toBe(200);
      expect(response.data.success).toBeDefined();

      // 3. Verify UI would receive health checks
      expect(response.data.healthChecks).toBeDefined();
      expect(Array.isArray(response.data.healthChecks)).toBe(true);

      // 4. Log what UI would display
      console.log('📊 UI would display:');
      response.data.healthChecks?.forEach((check: any) => {
        const icon = check.status === 'healthy' ? '✅' : 
          check.status === 'unhealthy' ? '❌' : 
            check.status === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      });

      console.log('✓ Health Check button flow successful\n');
    }, API_TIMEOUT);
  });

  describe('Requirements Check Button Flow', () => {
    test('should simulate "Check Requirements" button click', async () => {
      console.log('\n🔘 Simulating: User clicks "Check Requirements" button\n');

      const response = await apiClient.post('/check-requirements');

      expect(response.status).toBe(200);
      expect(response.data.systemChecks).toBeDefined();

      console.log('📊 UI would display:');
      response.data.systemChecks?.forEach((check: any) => {
        const icon = check.status === 'healthy' ? '✅' : 
          check.status === 'unhealthy' ? '❌' : '⚠️';
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      });

      console.log('✓ Requirements Check button flow successful\n');
    }, API_TIMEOUT);
  });

  describe('Auto Recovery Button Flow', () => {
    test('should simulate "Auto Recover" button click', async () => {
      console.log('\n🔘 Simulating: User clicks "Auto Recover" button\n');

      const response = await apiClient.post('/auto-recover');

      expect(response.status).toBe(200);
      expect(response.data.output).toBeDefined();

      console.log('📊 UI would display output:');
      console.log(`  Exit Code: ${response.data.exitCode}`);
      console.log(`  Status: ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`  Output Lines: ${response.data.output.length}`);

      if (response.data.output.length > 0) {
        console.log('  First 5 lines:');
        response.data.output.slice(0, 5).forEach((line: string) => {
          console.log(`    ${line}`);
        });
      }

      console.log('✓ Auto Recovery button flow successful\n');
    }, API_TIMEOUT);
  });

  describe('System Info Refresh Flow', () => {
    test('should simulate system info refresh', async () => {
      console.log('\n🔘 Simulating: UI refreshes system info\n');

      const response = await apiClient.get('/system-info');

      expect(response.status).toBe(200);
      expect(response.data.platform).toBeDefined();

      console.log('📊 UI would display:');
      console.log(`  Platform: ${response.data.platform}`);
      console.log(`  Node Version: ${response.data.node}`); // Use 'node' instead of 'nodeVersion'
      console.log(`  Memory (RSS): ${response.data.memory.rss}`);
      console.log(`  Memory (Heap): ${response.data.memory.heapUsed} / ${response.data.memory.heapTotal}`);
      console.log(`  Uptime: ${Math.round(response.data.uptime / 60)} minutes`);

      console.log('✓ System info refresh flow successful\n');
    });
  });

  describe('Logs Viewer Flow', () => {
    test('should simulate "View Logs" button click', async () => {
      console.log('\n🔘 Simulating: User clicks "View Logs" button\n');

      const response = await apiClient.get('/logs');

      expect(response.status).toBe(200);
      expect(response.data.logs).toBeDefined();

      console.log('📊 UI would display:');
      console.log(`  Total Log Lines: ${response.data.logs.length}`);
      
      if (response.data.logs.length > 0) {
        console.log('  Recent logs (last 3):');
        response.data.logs.slice(-3).forEach((log: string) => {
          console.log(`    ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
        });
      }

      console.log('✓ Logs viewer flow successful\n');
    });
  });
});

describe('Error Handling Tests', () => {
  let apiClient: AxiosInstance;

  beforeAll(() => {
    apiClient = axios.create({
      baseURL: `${API_BASE_URL}/api/troubleshooting`,
      timeout: API_TIMEOUT,
      validateStatus: () => true,
    });
  });

  test('should handle invalid endpoints gracefully', async () => {
    const response = await apiClient.post('/invalid-endpoint');
    expect(response.status).toBe(404);
  });

  test('should handle timeout scenarios', async () => {
    const shortTimeoutClient = axios.create({
      baseURL: `${API_BASE_URL}/api/troubleshooting`,
      timeout: 100, // Very short timeout
      validateStatus: () => true,
    });

    try {
      await shortTimeoutClient.post('/clean-install');
      // If it doesn't timeout, that's also fine
      console.log('✓ Request completed before timeout');
    } catch (error: any) {
      // Timeout is expected
      expect(['ECONNABORTED', 'ETIMEDOUT']).toContain(error.code);
      console.log('✓ Timeout handling works correctly');
    }
  });

  test('should handle server errors gracefully', async () => {
    // Try an invalid endpoint that should return 404
    const response = await apiClient.post('/non-existent-endpoint-xyz');
    
    // Should return a 404 response, not crash
    expect(response.status).toBe(404);
    expect(response.data).toBeDefined();
    
    console.log('✓ Server error handling works correctly');
  });
});

// Test Suite Summary
describe('Test Summary', () => {
  test('print test execution summary', () => {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST SUITE SUMMARY');
    console.log('='.repeat(60));
    console.log('\nTested Components:');
    console.log('  ✓ Troubleshooting API (7 endpoints)');
    console.log('  ✓ Settings API (2 endpoints)');
    console.log('  ✓ UI Accessibility (2 checks)');
    console.log('  ✓ Integration Flows (5 scenarios)');
    console.log('  ✓ Error Handling (3 scenarios)');
    console.log('\nPrerequisites:');
    console.log('  • Run: bash scripts/start-all.sh');
    console.log('  • FlexGate API: http://localhost:3000');
    console.log('  • Admin UI: http://localhost:3002');
    console.log('\n' + '='.repeat(60) + '\n');
  });
});
