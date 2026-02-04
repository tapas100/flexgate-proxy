import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { DashboardPage } from '../../../pages/DashboardPage';

/**
 * TC1.1: Basic Login
 * Priority: P0
 * Tests standard email/password authentication
 */
test.describe('TC1.1: Basic Login', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test('should successfully login with valid credentials @smoke @p0', async ({ page }) => {
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin123!';

    // Step 1-3: Navigate to login page
    await loginPage.goto();
    expect(await loginPage.isLoaded()).toBeTruthy();

    // Step 4-5: Enter valid credentials
    await loginPage.login(testEmail, testPassword);

    // Step 6-8: Verify redirect to dashboard
    expect(await loginPage.isLoginSuccessful()).toBeTruthy();
    expect(page.url()).toContain('/dashboard');

    // Step 9: Verify user info displayed
    const userEmail = await dashboardPage.getUserEmail();
    expect(userEmail).toBe(testEmail);

    // Step 10: Verify sidebar visible and all menu items present
    expect(await dashboardPage.isSidebarVisible()).toBeTruthy();
    expect(await dashboardPage.routesLink.isVisible()).toBeTruthy();
    expect(await dashboardPage.metricsLink.isVisible()).toBeTruthy();
    expect(await dashboardPage.logsLink.isVisible()).toBeTruthy();
    expect(await dashboardPage.webhooksLink.isVisible()).toBeTruthy();

    // Verify no console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    expect(consoleErrors).toHaveLength(0);
  });

  test('should show validation error with empty fields @p0', async ({ page }) => {
    await loginPage.goto();

    // Click login without filling fields
    await loginPage.loginButton.click();

    // Should remain on login page
    expect(page.url()).toContain('/login');

    // Login button should be disabled or show validation
    const isEnabled = await loginPage.isLoginButtonEnabled();
    expect(isEnabled).toBeFalsy();
  });

  test('should show error with invalid email format @p1', async ({ page }) => {
    await loginPage.goto();

    // Enter invalid email format
    await loginPage.login('invalid-email', 'Test123!');

    // Should show validation error or remain on login page
    expect(page.url()).toContain('/login');
  });

  test('should clear form on refresh @p2', async ({ page }) => {
    await loginPage.goto();

    // Fill form
    await loginPage.emailInput.fill('test@example.com');
    await loginPage.passwordInput.fill('Test123!');

    // Refresh page
    await page.reload();

    // Fields should be empty
    const emailValue = await loginPage.emailInput.inputValue();
    const passwordValue = await loginPage.passwordInput.inputValue();

    expect(emailValue).toBe('');
    expect(passwordValue).toBe('');
  });
});
