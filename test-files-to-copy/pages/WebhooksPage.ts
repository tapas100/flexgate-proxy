import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Webhooks Page
 * Handles webhook management interactions
 */
export class WebhooksPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly webhooksTable: Locator;
  readonly noDataMessage: Locator;

  // Dialog elements
  readonly dialog: Locator;
  readonly urlInput: Locator;
  readonly secretInput: Locator;
  readonly copySecretButton: Locator;
  readonly enabledCheckbox: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Event subscriptions
  readonly eventCheckboxes: Locator;

  // Retry configuration
  readonly maxRetriesInput: Locator;
  readonly initialDelayInput: Locator;
  readonly backoffMultiplierInput: Locator;

  // Delivery log viewer
  readonly deliveryLogExpander: Locator;
  readonly deliveryLogTable: Locator;

  // Statistics
  readonly successRateStat: Locator;
  readonly avgResponseTimeStat: Locator;
  readonly totalDeliveriesStat: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.pageTitle = page.locator('h1:has-text("Webhooks"), h2:has-text("Webhooks")');
    this.createButton = page.locator('button:has-text("Create Webhook"), button:has-text("Add Webhook")');
    this.webhooksTable = page.locator('table, [role="table"]');
    this.noDataMessage = page.locator('text="No webhooks found", text="No data"');
    
    // Dialog
    this.dialog = page.locator('[role="dialog"], .MuiDialog-root');
    this.urlInput = this.dialog.locator('input[name="url"]');
    this.secretInput = this.dialog.locator('input[name="secret"]');
    this.copySecretButton = this.dialog.locator('button[title="Copy Secret"], button:has-text("Copy")');
    this.enabledCheckbox = this.dialog.locator('input[name="enabled"]');
    this.saveButton = this.dialog.locator('button:has-text("Save"), button:has-text("Create")');
    this.cancelButton = this.dialog.locator('button:has-text("Cancel")');
    
    // Event subscriptions
    this.eventCheckboxes = this.dialog.locator('input[type="checkbox"][name^="event"]');
    
    // Retry config
    this.maxRetriesInput = this.dialog.locator('input[name="maxRetries"]');
    this.initialDelayInput = this.dialog.locator('input[name="initialDelay"]');
    this.backoffMultiplierInput = this.dialog.locator('input[name="backoffMultiplier"]');
    
    // Delivery logs
    this.deliveryLogExpander = page.locator('button[aria-label="Expand row"], button:has-text("View Logs")');
    this.deliveryLogTable = page.locator('[data-testid="delivery-log-table"]');
    
    // Statistics
    this.successRateStat = page.locator('[data-testid="success-rate"]');
    this.avgResponseTimeStat = page.locator('[data-testid="avg-response-time"]');
    this.totalDeliveriesStat = page.locator('[data-testid="total-deliveries"]');
  }

  /**
   * Navigate to webhooks page
   */
  async goto() {
    await this.page.goto('/webhooks');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click create webhook button
   */
  async clickCreateWebhook() {
    await this.createButton.click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Fill webhook form
   */
  async fillWebhookForm(data: {
    url: string;
    events?: string[];
    maxRetries?: number;
    initialDelay?: number;
    backoffMultiplier?: number;
    enabled?: boolean;
  }) {
    await this.urlInput.fill(data.url);
    
    // Select events
    if (data.events) {
      for (const event of data.events) {
        const checkbox = this.dialog.locator(`input[type="checkbox"][value="${event}"]`);
        await checkbox.check();
      }
    }
    
    // Retry configuration
    if (data.maxRetries !== undefined) {
      await this.maxRetriesInput.fill(String(data.maxRetries));
    }
    if (data.initialDelay !== undefined) {
      await this.initialDelayInput.fill(String(data.initialDelay));
    }
    if (data.backoffMultiplier !== undefined) {
      await this.backoffMultiplierInput.fill(String(data.backoffMultiplier));
    }
    
    // Enabled checkbox
    if (data.enabled !== undefined) {
      if (data.enabled) {
        await this.enabledCheckbox.check();
      } else {
        await this.enabledCheckbox.uncheck();
      }
    }
  }

  /**
   * Create a new webhook
   */
  async createWebhook(data: {
    url: string;
    events?: string[];
    maxRetries?: number;
    initialDelay?: number;
    backoffMultiplier?: number;
    enabled?: boolean;
  }) {
    await this.clickCreateWebhook();
    await this.fillWebhookForm(data);
    await this.saveButton.click();
    
    // Wait for dialog to close
    await this.dialog.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Get webhook row by URL
   */
  getWebhookRow(url: string): Locator {
    return this.page.locator(`tr:has-text("${url}")`);
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(url: string) {
    const row = this.getWebhookRow(url);
    await row.locator('button[title="Test"], button:has-text("Test")').click();
    await this.page.waitForTimeout(1000); // Wait for delivery
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(url: string) {
    const row = this.getWebhookRow(url);
    await row.locator('button[title="Delete"], button:has-text("Delete")').click();
    
    // Confirm deletion
    const confirmButton = this.page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    await confirmButton.click();
  }

  /**
   * Toggle webhook enable/disable
   */
  async toggleWebhook(url: string) {
    const row = this.getWebhookRow(url);
    await row.locator('input[type="checkbox"]').click();
  }

  /**
   * Expand delivery log viewer
   */
  async viewDeliveryLogs(url: string) {
    const row = this.getWebhookRow(url);
    const expander = row.locator('button[aria-label="Expand row"]');
    await expander.click();
    await this.deliveryLogTable.waitFor({ state: 'visible' });
  }

  /**
   * Get delivery log entries count
   */
  async getDeliveryLogsCount(): Promise<number> {
    const rows = await this.deliveryLogTable.locator('tr').count();
    return rows - 1; // Exclude header row
  }

  /**
   * Get success rate
   */
  async getSuccessRate(): Promise<string> {
    return (await this.successRateStat.textContent()) || '0%';
  }

  /**
   * Get average response time
   */
  async getAvgResponseTime(): Promise<string> {
    return (await this.avgResponseTimeStat.textContent()) || '0ms';
  }

  /**
   * Copy webhook secret
   */
  async copySecret() {
    await this.copySecretButton.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Check if webhook exists
   */
  async webhookExists(url: string): Promise<boolean> {
    try {
      await this.getWebhookRow(url).waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get webhooks count
   */
  async getWebhooksCount(): Promise<number> {
    const rows = await this.webhooksTable.locator('tbody tr').count();
    return rows;
  }

  /**
   * Check if page is loaded
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.pageTitle.waitFor({ state: 'visible', timeout: 5000 });
      await this.createButton.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
