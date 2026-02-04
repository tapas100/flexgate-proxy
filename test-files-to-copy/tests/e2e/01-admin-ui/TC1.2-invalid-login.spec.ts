import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';

/**
 * TC1.2: Invalid Login
 * Priority: P0
 * Tests error handling for invalid credentials
 */
test.describe('TC1.2: Invalid Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should show error with wrong email @smoke @p0', async ({ page }) => {
    // Enter wrong email
    await loginPage.login('wrong@example.com', 'Test123!');

    // Should show error message
    expect(await loginPage.hasError()).toBeTruthy();
    const errorMessage = await loginPage.getErrorMessage();
    expect(errorMessage.toLowerCase()).toContain('invalid');

    // Should remain on login page
    expect(page.url()).toContain('/login');
  });

  test('should show error with wrong password @p0', async ({ page }) => {
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';

    // Enter correct email but wrong password
    await loginPage.login(testEmail, 'WrongPassword123!');

    // Should show error message
    expect(await loginPage.hasError()).toBeTruthy();
    const errorMessage = await loginPage.getErrorMessage();
    expect(errorMessage.toLowerCase()).toContain('invalid');

    // Should remain on login page
    expect(page.url()).toContain('/login');
  });

  test('should show error with both wrong credentials @p0', async ({ page }) => {
    // Enter completely wrong credentials
    await loginPage.login('nonexistent@example.com', 'WrongPassword!');

    // Should show error message
    expect(await loginPage.hasError()).toBeTruthy();

    // Should remain on login page
    expect(page.url()).toContain('/login');
  });

  test('should clear previous error on new login attempt @p1', async ({ page }) => {
    // First failed attempt
    await loginPage.login('wrong@example.com', 'Wrong123!');
    expect(await loginPage.hasError()).toBeTruthy();

    // Clear form
    await loginPage.clearForm();

    // Try with valid credentials
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin123!';
    await loginPage.login(testEmail, testPassword);

    // Should not show error
    expect(await loginPage.hasError()).toBeFalsy();

    // Should redirect to dashboard
    expect(await loginPage.isLoginSuccessful()).toBeTruthy();
  });

  test('should handle SQL injection attempt safely @p1 @security', async ({ page }) => {
    // Attempt SQL injection in email field
    await loginPage.login("admin'--", "password");

    // Should show error, not execute SQL
    expect(await loginPage.hasError()).toBeTruthy();

    // Should remain on login page
    expect(page.url()).toContain('/login');
  });

  test('should handle XSS attempt safely @p1 @security', async ({ page }) => {
    // Attempt XSS in email field
    await loginPage.login('<script>alert("xss")</script>', 'Test123!');

    // Should show error, not execute script
    expect(await loginPage.hasError()).toBeTruthy();

    // Check that script didn't execute
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
      alerts.push(dialog.message());
      dialog.dismiss();
    });

    await page.waitForTimeout(1000);
    expect(alerts).toHaveLength(0);
  });

  test('should handle multiple failed login attempts @p1', async ({ page }) => {
    // Attempt multiple failed logins
    for (let i = 0; i < 5; i++) {
      await loginPage.clearForm();
      await loginPage.login('wrong@example.com', 'Wrong123!');
      expect(await loginPage.hasError()).toBeTruthy();
      await page.waitForTimeout(100);
    }

    // Should still show error (not locked out in test environment)
    expect(await loginPage.hasError()).toBeTruthy();
  });
});
