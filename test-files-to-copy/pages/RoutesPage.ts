import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Routes Page
 * Handles route management interactions
 */
export class RoutesPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly routesTable: Locator;
  readonly noDataMessage: Locator;
  readonly paginationControls: Locator;

  // Dialog elements
  readonly dialog: Locator;
  readonly dialogTitle: Locator;
  readonly pathInput: Locator;
  readonly targetInput: Locator;
  readonly timeoutInput: Locator;
  readonly enabledCheckbox: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly deleteConfirmButton: Locator;

  // Validation errors
  readonly pathError: Locator;
  readonly targetError: Locator;
  readonly timeoutError: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.pageTitle = page.locator('h1:has-text("Routes"), h2:has-text("Routes")');
    this.createButton = page.locator('button:has-text("Create Route"), button:has-text("Add Route")');
    this.searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
    this.routesTable = page.locator('table, [role="table"]');
    this.noDataMessage = page.locator('text="No routes found", text="No data"');
    this.paginationControls = page.locator('[role="navigation"], .pagination');
    
    // Dialog
    this.dialog = page.locator('[role="dialog"], .MuiDialog-root');
    this.dialogTitle = this.dialog.locator('h2, [data-testid="dialog-title"]');
    this.pathInput = this.dialog.locator('input[name="path"]');
    this.targetInput = this.dialog.locator('input[name="target"]');
    this.timeoutInput = this.dialog.locator('input[name="timeout"]');
    this.enabledCheckbox = this.dialog.locator('input[name="enabled"], input[type="checkbox"]');
    this.saveButton = this.dialog.locator('button:has-text("Save"), button:has-text("Create")');
    this.cancelButton = this.dialog.locator('button:has-text("Cancel")');
    this.deleteConfirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    
    // Validation
    this.pathError = this.dialog.locator('[data-testid="path-error"], .error:near(input[name="path"])');
    this.targetError = this.dialog.locator('[data-testid="target-error"], .error:near(input[name="target"])');
    this.timeoutError = this.dialog.locator('[data-testid="timeout-error"], .error:near(input[name="timeout"])');
  }

  /**
   * Navigate to routes page
   */
  async goto() {
    await this.page.goto('/routes');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click create route button
   */
  async clickCreateRoute() {
    await this.createButton.click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Fill route form
   */
  async fillRouteForm(data: {
    path: string;
    target: string;
    timeout?: number;
    enabled?: boolean;
  }) {
    await this.pathInput.fill(data.path);
    await this.targetInput.fill(data.target);
    
    if (data.timeout !== undefined) {
      await this.timeoutInput.fill(String(data.timeout));
    }
    
    if (data.enabled !== undefined) {
      if (data.enabled) {
        await this.enabledCheckbox.check();
      } else {
        await this.enabledCheckbox.uncheck();
      }
    }
  }

  /**
   * Create a new route
   */
  async createRoute(data: {
    path: string;
    target: string;
    timeout?: number;
    enabled?: boolean;
  }) {
    await this.clickCreateRoute();
    await this.fillRouteForm(data);
    await this.saveButton.click();
    
    // Wait for dialog to close
    await this.dialog.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Get route row by path
   */
  getRouteRow(path: string): Locator {
    return this.page.locator(`tr:has-text("${path}")`);
  }

  /**
   * Click edit button for route
   */
  async editRoute(path: string) {
    const row = this.getRouteRow(path);
    await row.locator('button[title="Edit"], button:has-text("Edit")').click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Click delete button for route
   */
  async deleteRoute(path: string) {
    const row = this.getRouteRow(path);
    await row.locator('button[title="Delete"], button:has-text("Delete")').click();
    
    // Wait for confirmation dialog
    await this.page.waitForTimeout(500);
    await this.deleteConfirmButton.click();
  }

  /**
   * Toggle route enable/disable
   */
  async toggleRoute(path: string) {
    const row = this.getRouteRow(path);
    await row.locator('button[title="Toggle"], input[type="checkbox"]').click();
  }

  /**
   * Search for routes
   */
  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }

  /**
   * Check if route exists in table
   */
  async routeExists(path: string): Promise<boolean> {
    try {
      await this.getRouteRow(path).waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get total routes count from table
   */
  async getRoutesCount(): Promise<number> {
    const rows = await this.routesTable.locator('tbody tr').count();
    return rows;
  }

  /**
   * Get validation error for field
   */
  async getValidationError(field: 'path' | 'target' | 'timeout'): Promise<string> {
    const errorMap = {
      path: this.pathError,
      target: this.targetError,
      timeout: this.timeoutError,
    };
    
    const error = errorMap[field];
    try {
      await error.waitFor({ state: 'visible', timeout: 2000 });
      return (await error.textContent()) || '';
    } catch {
      return '';
    }
  }

  /**
   * Check if save button is disabled
   */
  async isSaveButtonDisabled(): Promise<boolean> {
    return await this.saveButton.isDisabled();
  }

  /**
   * Go to next page
   */
  async nextPage() {
    const nextButton = this.paginationControls.locator('button[aria-label="Next page"], button:has-text("Next")');
    await nextButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Go to previous page
   */
  async previousPage() {
    const prevButton = this.paginationControls.locator('button[aria-label="Previous page"], button:has-text("Previous")');
    await prevButton.click();
    await this.page.waitForLoadState('networkidle');
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
