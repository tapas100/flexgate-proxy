import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { DashboardPage } from '../../../pages/DashboardPage';
import { RoutesPage } from '../../../pages/RoutesPage';
import { ApiClient } from '../../../helpers/ApiClient';

/**
 * TC2.1: Create Route
 * Priority: P0
 * Tests route creation workflow
 */
test.describe('TC2.1: Create Route', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let routesPage: RoutesPage;
  let apiClient: ApiClient;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    routesPage = new RoutesPage(page);
    apiClient = new ApiClient();

    // Login first
    await loginPage.goto();
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin123!';
    await loginPage.login(testEmail, testPassword);
    expect(await loginPage.isLoginSuccessful()).toBeTruthy();

    // Navigate to routes page
    await dashboardPage.navigateTo('routes');
    expect(await routesPage.isLoaded()).toBeTruthy();
  });

  test.afterEach(async () => {
    // Cleanup: Delete all test routes
    const routes = await apiClient.getRoutes();
    for (const route of routes) {
      if (route.path?.startsWith('/api/test-')) {
        await apiClient.deleteRoute(route.id!);
      }
    }
  });

  test('should create route with valid data @smoke @p0', async ({ page }) => {
    const routeData = {
      path: '/api/test-route-' + Date.now(),
      target: 'http://httpbin.org/status/200',
      timeout: 5000,
      enabled: true,
    };

    // Step 1: Click "Create Route" button
    await routesPage.clickCreateRoute();

    // Step 2-5: Fill form
    await routesPage.fillRouteForm(routeData);

    // Step 6: Click "Save"
    await routesPage.saveButton.click();

    // Step 7: Verify dialog closed
    await routesPage.dialog.waitFor({ state: 'hidden', timeout: 5000 });

    // Step 8: Verify route appears in table
    expect(await routesPage.routeExists(routeData.path)).toBeTruthy();

    // Step 9: Verify route data is correct
    const row = routesPage.getRouteRow(routeData.path);
    expect(await row.locator('td').nth(1).textContent()).toBe(routeData.target);

    // Step 10: Verify route is enabled
    const isEnabled = await row.locator('input[type="checkbox"]').isChecked();
    expect(isEnabled).toBe(true);
  });

  test('should create route with minimal required fields @p1', async ({ page }) => {
    const routeData = {
      path: '/api/test-minimal-' + Date.now(),
      target: 'http://httpbin.org/get',
    };

    await routesPage.createRoute(routeData);

    // Verify route was created
    expect(await routesPage.routeExists(routeData.path)).toBeTruthy();
  });

  test('should create route with custom timeout @p1', async ({ page }) => {
    const routeData = {
      path: '/api/test-timeout-' + Date.now(),
      target: 'http://httpbin.org/delay/3',
      timeout: 10000,
      enabled: true,
    };

    await routesPage.createRoute(routeData);

    // Verify route was created
    expect(await routesPage.routeExists(routeData.path)).toBeTruthy();

    // Verify via API that timeout was set correctly
    const routes = await apiClient.getRoutes();
    const createdRoute = routes.find(r => r.path === routeData.path);
    expect(createdRoute?.timeout).toBe(10000);
  });

  test('should close dialog when clicking Cancel @p2', async ({ page }) => {
    // Open create dialog
    await routesPage.clickCreateRoute();
    expect(await routesPage.dialog.isVisible()).toBeTruthy();

    // Click cancel
    await routesPage.cancelButton.click();

    // Verify dialog closed
    await routesPage.dialog.waitFor({ state: 'hidden' });
  });

  test('should reset form after successful creation @p2', async ({ page }) => {
    const routeData = {
      path: '/api/test-reset-' + Date.now(),
      target: 'http://httpbin.org/post',
      timeout: 3000,
      enabled: true,
    };

    // Create first route
    await routesPage.createRoute(routeData);

    // Open dialog again
    await routesPage.clickCreateRoute();

    // Verify form is empty
    const pathValue = await routesPage.pathInput.inputValue();
    const targetValue = await routesPage.targetInput.inputValue();

    expect(pathValue).toBe('');
    expect(targetValue).toBe('');
  });
});
