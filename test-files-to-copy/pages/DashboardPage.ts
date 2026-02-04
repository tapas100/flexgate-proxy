import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Dashboard Page
 * Handles dashboard interactions and navigation
 */
export class DashboardPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly userInfo: Locator;
  readonly userEmail: Locator;
  readonly logoutButton: Locator;
  readonly dashboardTitle: Locator;
  
  // Sidebar navigation items
  readonly dashboardLink: Locator;
  readonly routesLink: Locator;
  readonly metricsLink: Locator;
  readonly logsLink: Locator;
  readonly oauthLink: Locator;
  readonly ssoLink: Locator;
  readonly webhooksLink: Locator;
  readonly settingsLink: Locator;

  // Dashboard widgets
  readonly totalRoutesWidget: Locator;
  readonly activeRoutesWidget: Locator;
  readonly totalRequestsWidget: Locator;
  readonly errorRateWidget: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.sidebar = page.locator('[data-testid="sidebar"], .sidebar, nav');
    this.userInfo = page.locator('[data-testid="user-info"], .user-info');
    this.userEmail = page.locator('[data-testid="user-email"], .user-email');
    this.logoutButton = page.locator('button:has-text("Logout"), [data-testid="logout-button"]');
    this.dashboardTitle = page.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")');
    
    // Navigation links
    this.dashboardLink = page.locator('a[href="/dashboard"], a:has-text("Dashboard")');
    this.routesLink = page.locator('a[href="/routes"], a:has-text("Routes")');
    this.metricsLink = page.locator('a[href="/metrics"], a:has-text("Metrics")');
    this.logsLink = page.locator('a[href="/logs"], a:has-text("Logs")');
    this.oauthLink = page.locator('a[href="/oauth"], a:has-text("OAuth")');
    this.ssoLink = page.locator('a[href="/sso"], a:has-text("SSO")');
    this.webhooksLink = page.locator('a[href="/webhooks"], a:has-text("Webhooks")');
    this.settingsLink = page.locator('a[href="/settings"], a:has-text("Settings")');
    
    // Dashboard widgets
    this.totalRoutesWidget = page.locator('[data-testid="total-routes"], .widget:has-text("Total Routes")');
    this.activeRoutesWidget = page.locator('[data-testid="active-routes"], .widget:has-text("Active Routes")');
    this.totalRequestsWidget = page.locator('[data-testid="total-requests"], .widget:has-text("Total Requests")');
    this.errorRateWidget = page.locator('[data-testid="error-rate"], .widget:has-text("Error Rate")');
  }

  /**
   * Navigate to dashboard
   */
  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if sidebar is visible
   */
  async isSidebarVisible(): Promise<boolean> {
    return await this.sidebar.isVisible();
  }

  /**
   * Get user email from dashboard
   */
  async getUserEmail(): Promise<string> {
    await this.userEmail.waitFor({ state: 'visible', timeout: 5000 });
    return (await this.userEmail.textContent()) || '';
  }

  /**
   * Logout
   */
  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL('**/login', { timeout: 5000 });
  }

  /**
   * Navigate to specific page via sidebar
   */
  async navigateTo(page: 'routes' | 'metrics' | 'logs' | 'oauth' | 'sso' | 'webhooks' | 'settings') {
    const linkMap = {
      routes: this.routesLink,
      metrics: this.metricsLink,
      logs: this.logsLink,
      oauth: this.oauthLink,
      sso: this.ssoLink,
      webhooks: this.webhooksLink,
      settings: this.settingsLink,
    };
    
    await linkMap[page].click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if navigation link is active
   */
  async isLinkActive(linkName: string): Promise<boolean> {
    const link = this.page.locator(`a:has-text("${linkName}")`);
    const classes = await link.getAttribute('class') || '';
    return classes.includes('active') || classes.includes('selected');
  }

  /**
   * Get widget value
   */
  async getWidgetValue(widget: Locator): Promise<string> {
    await widget.waitFor({ state: 'visible', timeout: 5000 });
    const text = await widget.textContent();
    // Extract number from text like "Total Routes: 42"
    const match = text?.match(/\d+/);
    return match ? match[0] : '0';
  }

  /**
   * Get total routes count
   */
  async getTotalRoutes(): Promise<number> {
    const value = await this.getWidgetValue(this.totalRoutesWidget);
    return parseInt(value, 10);
  }

  /**
   * Get active routes count
   */
  async getActiveRoutes(): Promise<number> {
    const value = await this.getWidgetValue(this.activeRoutesWidget);
    return parseInt(value, 10);
  }

  /**
   * Check if dashboard is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.dashboardTitle.waitFor({ state: 'visible', timeout: 5000 });
      await this.sidebar.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for data to load
   */
  async waitForDataLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Give widgets time to update
  }
}
