/**
 * Troubleshooting & Settings - Comprehensive API Tests using Playwright
 * 
 * This test suite covers:
 * 1. Troubleshooting API endpoints
 * 2. Settings API endpoints  
 * 3. End-to-end API workflows
 * 
 * Prerequisites:
 * - FlexGate API running on http://localhost:3000
 * 
 * Run with: npx playwright test troubleshooting-settings-e2e
 */

import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

// ============================================================================
// TROUBLESHOOTING API TESTS
// ============================================================================

test.describe('Troubleshooting API Tests', () => {
  
  test('POST /api/troubleshooting/health-check - should execute successfully', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/troubleshooting/health-check`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('output');
    expect(Array.isArray(data.output)).toBeTruthy();

    console.log('✅ Health check executed');
  });

  test('POST /api/troubleshooting/check-requirements - should verify system', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/troubleshooting/check-requirements`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('systemChecks');

    console.log('✅ Requirements checked');
  });

  test('POST /api/troubleshooting/auto-recover - should execute recovery', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/troubleshooting/auto-recover`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('output');

    console.log('✅ Auto-recovery executed');
  });

  test('GET /api/troubleshooting/logs - should retrieve logs', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/troubleshooting/logs`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('logs');
    expect(Array.isArray(data.logs)).toBeTruthy();

    console.log(`✅ Retrieved ${data.logs?.length || 0} logs`);
  });

  test('GET /api/troubleshooting/system-info - should get system info', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/troubleshooting/system-info`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('success');

    console.log('✅ System info retrieved');
  });
});

// ============================================================================
// SETTINGS API TESTS
// ============================================================================

test.describe('Settings API Tests', () => {
  
  test('GET /api/settings - should retrieve current settings', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/settings`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('settings');
    expect(data.settings).toHaveProperty('server');
    expect(data.settings).toHaveProperty('admin');

    console.log('✅ Settings retrieved');
  });

  test('GET /api/settings - should sanitize sensitive data', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/settings`);
    const data = await response.json();

    // Passwords and secrets should not be present
    expect(data.settings.database?.password).toBeUndefined();
    expect(data.settings.security?.jwt?.secret).toBeUndefined();

    console.log('✅ Sensitive data sanitized');
  });

  test('PUT /api/settings - should update settings successfully', async ({ request }) => {
    // First get current settings
    const getResponse = await request.get(`${API_BASE_URL}/api/settings`);
    const currentSettings = (await getResponse.json()).settings;

    const updatedSettings = {
      ...currentSettings,
      admin: {
        ...currentSettings.admin,
        autoRefresh: 60000,
      },
    };

    const response = await request.put(`${API_BASE_URL}/api/settings`, {
      data: updatedSettings,
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.success).toBe(true);

    console.log('✅ Settings updated');
  });

  test('PUT /api/settings - should reject invalid settings', async ({ request }) => {
    const invalidSettings = {
      server: {
        port: 999999, // Invalid port
      },
    };

    const response = await request.put(`${API_BASE_URL}/api/settings`, {
      data: invalidSettings,
    });
    
    expect(response.status()).toBe(400);

    console.log('✅ Invalid settings rejected');
  });

  test('POST /api/settings/validate - should validate settings', async ({ request }) => {
    const getResponse = await request.get(`${API_BASE_URL}/api/settings`);
    const currentSettings = (await getResponse.json()).settings;

    const response = await request.post(`${API_BASE_URL}/api/settings/validate`, {
      data: currentSettings,
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.valid).toBe(true);

    console.log('✅ Settings validated');
  });

  test('POST /api/settings/test/database - should test database connection', async ({ request }) => {
    const dbConfig = {
      host: 'localhost',
      port: 5432,
      database: 'flexgate',
      user: 'flexgate',
    };

    const response = await request.post(`${API_BASE_URL}/api/settings/test/database`, {
      data: dbConfig,
    });
    
    expect(response.status()).toBeLessThan(500);
    const data = await response.json();
    expect(data).toHaveProperty('service', 'database');

    console.log('✅ Database connection tested');
  });

  test('POST /api/settings/test/redis - should test Redis connection', async ({ request }) => {
    const redisConfig = {
      host: 'localhost',
      port: 6379,
    };

    const response = await request.post(`${API_BASE_URL}/api/settings/test/redis`, {
      data: redisConfig,
    });
    
    expect(response.status()).toBeLessThan(500);
    const data = await response.json();
    expect(data).toHaveProperty('service', 'redis');

    console.log('✅ Redis connection tested');
  });
});

// ============================================================================
// END-TO-END WORKFLOW TESTS
// ============================================================================

test.describe('End-to-End Workflows', () => {
  
  test('E2E: Complete troubleshooting workflow', async ({ request }) => {
    // Step 1: Check requirements
    const req = await request.post(`${API_BASE_URL}/api/troubleshooting/check-requirements`);
    expect(req.ok()).toBeTruthy();

    // Step 2: Run health check
    const health = await request.post(`${API_BASE_URL}/api/troubleshooting/health-check`);
    expect(health.ok()).toBeTruthy();

    // Step 3: Retrieve logs
    const logs = await request.get(`${API_BASE_URL}/api/troubleshooting/logs`);
    expect(logs.ok()).toBeTruthy();

    console.log('✅ Complete troubleshooting workflow successful');
  });

  test('E2E: Settings update workflow', async ({ request }) => {
    // Step 1: Get settings
    const get1 = await request.get(`${API_BASE_URL}/api/settings`);
    const current = (await get1.json()).settings;

    // Step 2: Validate
    const validate = await request.post(`${API_BASE_URL}/api/settings/validate`, { data: current });
    expect(validate.ok()).toBeTruthy();

    // Step 3: Update
    const updated = { ...current, admin: { ...current.admin, autoRefresh: 45000 } };
    const put = await request.put(`${API_BASE_URL}/api/settings`, { data: updated });
    expect(put.ok()).toBeTruthy();

    // Step 4: Verify
    const get2 = await request.get(`${API_BASE_URL}/api/settings`);
    const verified = (await get2.json()).settings;
    expect(verified.admin.autoRefresh).toBe(45000);

    console.log('✅ Complete settings workflow successful');
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

test.describe('Error Handling', () => {
  
  test('should handle invalid endpoints gracefully', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/invalid-endpoint`);
    expect(response.status()).toBeGreaterThanOrEqual(404);

    console.log('✅ Invalid endpoint handled');
  });

  test('should handle malformed requests', async ({ request }) => {
    const response = await request.put(`${API_BASE_URL}/api/settings`, {
      data: 'not-valid-json',
    });
    
    expect(response.status()).toBeGreaterThanOrEqual(400);

    console.log('✅ Malformed request handled');
  });
});
