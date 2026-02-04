import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { DashboardPage } from '../../../pages/DashboardPage';
import { WebhooksPage } from '../../../pages/WebhooksPage';
import { WebhookServer } from '../../../helpers/WebhookServer';
import { ApiClient } from '../../../helpers/ApiClient';

/**
 * TC7.1: Create Webhook
 * Priority: P0
 * Tests webhook creation workflow
 */
test.describe('TC7.1: Create Webhook', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let webhooksPage: WebhooksPage;
  let webhookServer: WebhookServer;
  let apiClient: ApiClient;

  test.beforeAll(async () => {
    // Start webhook mock server
    webhookServer = new WebhookServer();
    await webhookServer.start();
  });

  test.afterAll(async () => {
    // Stop webhook mock server
    await webhookServer.stop();
  });

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    webhooksPage = new WebhooksPage(page);
    apiClient = new ApiClient();

    // Clear previous webhooks
    webhookServer.clearWebhooks();

    // Login
    await loginPage.goto();
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin123!';
    await loginPage.login(testEmail, testPassword);
    expect(await loginPage.isLoginSuccessful()).toBeTruthy();

    // Navigate to webhooks page
    await dashboardPage.navigateTo('webhooks');
    expect(await webhooksPage.isLoaded()).toBeTruthy();
  });

  test.afterEach(async () => {
    // Cleanup: Delete all test webhooks
    const webhooks = await apiClient.getWebhooks();
    for (const webhook of webhooks) {
      if (webhook.url?.includes('localhost:4000')) {
        await apiClient.deleteWebhook(webhook.id!);
      }
    }
  });

  test('should create webhook with all options @smoke @p0', async ({ page }) => {
    const webhookUrl = webhookServer.getUrl();
    const webhookData = {
      url: webhookUrl,
      events: ['route.created', 'route.updated', 'route.deleted'],
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2,
      enabled: true,
    };

    // Step 1: Click "Create Webhook"
    await webhooksPage.clickCreateWebhook();

    // Step 2-3: Fill URL
    await webhooksPage.urlInput.fill(webhookData.url);

    // Step 4: Select events
    for (const event of webhookData.events) {
      const checkbox = webhooksPage.dialog.locator(`input[value="${event}"]`);
      await checkbox.check();
    }

    // Step 5-7: Configure retry settings
    await webhooksPage.maxRetriesInput.fill(String(webhookData.maxRetries));
    await webhooksPage.initialDelayInput.fill(String(webhookData.initialDelay));
    await webhooksPage.backoffMultiplierInput.fill(String(webhookData.backoffMultiplier));

    // Step 8: Enable webhook
    await webhooksPage.enabledCheckbox.check();

    // Step 9: Copy secret (optional)
    const secret = await webhooksPage.secretInput.inputValue();
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(20);

    // Step 10: Click "Save"
    await webhooksPage.saveButton.click();

    // Step 11: Verify dialog closed
    await webhooksPage.dialog.waitFor({ state: 'hidden', timeout: 5000 });

    // Step 12: Verify webhook appears in table
    expect(await webhooksPage.webhookExists(webhookUrl)).toBeTruthy();

    // Step 13: Verify webhook configuration via API
    const webhooks = await apiClient.getWebhooks();
    const createdWebhook = webhooks.find(w => w.url === webhookUrl);
    
    expect(createdWebhook).toBeTruthy();
    expect(createdWebhook?.events).toEqual(expect.arrayContaining(webhookData.events));
    expect(createdWebhook?.retryConfig?.maxRetries).toBe(3);
    expect(createdWebhook?.enabled).toBe(true);
  });

  test('should create webhook with minimal options @p1', async ({ page }) => {
    const webhookUrl = webhookServer.getUrl() + '/minimal';
    
    const webhookData = {
      url: webhookUrl,
      events: ['route.created'],
      enabled: true,
    };

    await webhooksPage.createWebhook(webhookData);

    // Verify webhook was created
    expect(await webhooksPage.webhookExists(webhookUrl)).toBeTruthy();
  });

  test('should generate unique secret for each webhook @p1', async ({ page }) => {
    // Create first webhook
    await webhooksPage.clickCreateWebhook();
    const secret1 = await webhooksPage.secretInput.inputValue();
    await webhooksPage.cancelButton.click();

    // Create second webhook
    await webhooksPage.clickCreateWebhook();
    const secret2 = await webhooksPage.secretInput.inputValue();
    await webhooksPage.cancelButton.click();

    // Secrets should be different
    expect(secret1).not.toBe(secret2);
    expect(secret1.length).toBeGreaterThan(20);
    expect(secret2.length).toBeGreaterThan(20);
  });

  test('should allow selecting multiple events @p1', async ({ page }) => {
    const webhookUrl = webhookServer.getUrl() + '/multi-events';
    
    await webhooksPage.clickCreateWebhook();
    await webhooksPage.urlInput.fill(webhookUrl);

    // Select multiple events
    const events = ['route.created', 'route.updated', 'route.deleted', 'webhook.failed'];
    for (const event of events) {
      const checkbox = webhooksPage.dialog.locator(`input[value="${event}"]`);
      await checkbox.check();
    }

    await webhooksPage.saveButton.click();
    await webhooksPage.dialog.waitFor({ state: 'hidden' });

    // Verify via API
    const webhooks = await apiClient.getWebhooks();
    const webhook = webhooks.find(w => w.url === webhookUrl);
    expect(webhook?.events).toHaveLength(4);
  });

  test('should show validation error for invalid URL @p1', async ({ page }) => {
    await webhooksPage.clickCreateWebhook();

    // Enter invalid URL
    await webhooksPage.urlInput.fill('not-a-url');

    // Try to save
    await webhooksPage.saveButton.click();

    // Should show validation error
    await page.waitForTimeout(500);
    expect(await webhooksPage.dialog.isVisible()).toBeTruthy();
  });

  test('should require HTTPS URL in production mode @p2', async ({ page }) => {
    // Skip if not in production mode
    if (process.env.NODE_ENV !== 'production') {
      test.skip();
    }

    await webhooksPage.clickCreateWebhook();

    // Enter HTTP URL (not HTTPS)
    await webhooksPage.urlInput.fill('http://example.com/webhook');

    // Should show validation error
    const validationError = await page.locator('text=/https required/i');
    await validationError.waitFor({ state: 'visible', timeout: 2000 });
  });
});
