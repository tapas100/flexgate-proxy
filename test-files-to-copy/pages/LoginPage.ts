import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Login Page
 * Handles all login-related interactions
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly ssoButton: Locator;
  readonly errorMessage: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly forgotPasswordLink: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    // Form elements
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.ssoButton = page.locator('button:has-text("Login with Enterprise SSO")');
    this.rememberMeCheckbox = page.locator('input[type="checkbox"][name="rememberMe"]');
    this.forgotPasswordLink = page.locator('a:has-text("Forgot Password")');
    
    // Feedback elements
    this.errorMessage = page.locator('.error-message, .MuiAlert-message');
    this.pageTitle = page.locator('h1, h2');
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Perform login with email and password
   */
  async login(email: string, password: string, rememberMe: boolean = false) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    
    if (rememberMe) {
      await this.rememberMeCheckbox.check();
    }
    
    await this.loginButton.click();
  }

  /**
   * Click SSO login button
   */
  async loginWithSSO() {
    await this.ssoButton.click();
  }

  /**
   * Get error message text
   */
  async getErrorMessage(): Promise<string> {
    await this.errorMessage.waitFor({ state: 'visible', timeout: 5000 });
    return (await this.errorMessage.textContent()) || '';
  }

  /**
   * Check if error message is visible
   */
  async hasError(): Promise<boolean> {
    try {
      await this.errorMessage.waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if login was successful (redirected to dashboard)
   */
  async isLoginSuccessful(): Promise<boolean> {
    try {
      await this.page.waitForURL('**/dashboard', { timeout: 5000 });
      return this.page.url().includes('/dashboard');
    } catch {
      return false;
    }
  }

  /**
   * Check if login button is enabled
   */
  async isLoginButtonEnabled(): Promise<boolean> {
    return await this.loginButton.isEnabled();
  }

  /**
   * Check if SSO button is visible
   */
  async isSSOButtonVisible(): Promise<boolean> {
    return await this.ssoButton.isVisible();
  }

  /**
   * Clear form fields
   */
  async clearForm() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return (await this.pageTitle.textContent()) || '';
  }

  /**
   * Check if page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.emailInput.waitFor({ state: 'visible', timeout: 5000 });
      await this.passwordInput.waitFor({ state: 'visible', timeout: 5000 });
      await this.loginButton.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
