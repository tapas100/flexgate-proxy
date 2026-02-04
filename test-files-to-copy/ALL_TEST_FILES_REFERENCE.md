# All Test Files - Complete Reference

This document contains all the code for the 47 test cases and supporting files.
Copy the relevant sections to the flexgate-tests repository.

## Summary of What's Being Created

### Page Objects (9 files)
✅ LoginPage.ts - Created
✅ DashboardPage.ts - Created
✅ RoutesPage.ts - Created  
✅ WebhooksPage.ts - Created
⬇️ Remaining page objects below

### Test Cases (47 files)
- Feature 1: Admin UI (8 tests)
- Feature 2: Routes (10 tests)
- Feature 7: Webhooks (15 tests)
- Plus: Helpers, Fixtures, CI/CD, Scripts

---

## Additional Page Objects

### pages/MetricsPage.ts

\`\`\`typescript
import { Page, Locator } from '@playwright/test';

export class MetricsPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly timeRangeSelector: Locator;
  readonly refreshButton: Locator;
  readonly exportButton: Locator;
  
  // Charts
  readonly requestsChart: Locator;
  readonly responseTimeChart: Locator;
  readonly errorRateChart: Locator;
  readonly routePerformanceChart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1:has-text("Metrics")');
    this.timeRangeSelector = page.locator('select[name="timeRange"], [data-testid="time-range"]');
    this.refreshButton = page.locator('button:has-text("Refresh")');
    this.exportButton = page.locator('button:has-text("Export")');
    
    this.requestsChart = page.locator('[data-testid="requests-chart"]');
    this.responseTimeChart = page.locator('[data-testid="response-time-chart"]');
    this.errorRateChart = page.locator('[data-testid="error-rate-chart"]');
    this.routePerformanceChart = page.locator('[data-testid="route-performance-chart"]');
  }

  async goto() {
    await this.page.goto('/metrics');
    await this.page.waitForLoadState('networkidle');
  }

  async selectTimeRange(range: '1h' | '6h' | '24h' | '7d' | '30d') {
    await this.timeRangeSelector.selectOption(range);
    await this.page.waitForLoadState('networkidle');
  }

  async refresh() {
    await this.refreshButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async export(format: 'csv' | 'json') {
    await this.exportButton.click();
    const download = await this.page.waitForEvent('download');
    return download;
  }

  async isChartVisible(chart: Locator): Promise<boolean> {
    return await chart.isVisible();
  }
}
\`\`\`

### pages/LogsPage.ts

\`\`\`typescript
import { Page, Locator } from '@playwright/test';

export class LogsPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly logsTable: Locator;
  readonly searchInput: Locator;
  readonly levelFilter: Locator;
  readonly routeFilter: Locator;
  readonly clearFiltersButton: Locator;
  readonly autoRefreshToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1:has-text("Logs")');
    this.logsTable = page.locator('[data-testid="logs-table"], table');
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.levelFilter = page.locator('select[name="level"]');
    this.routeFilter = page.locator('select[name="route"]');
    this.clearFiltersButton = page.locator('button:has-text("Clear Filters")');
    this.autoRefreshToggle = page.locator('input[name="autoRefresh"]');
  }

  async goto() {
    await this.page.goto('/logs');
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500);
  }

  async filterByLevel(level: 'info' | 'warn' | 'error') {
    await this.levelFilter.selectOption(level);
    await this.page.waitForLoadState('networkidle');
  }

  async filterByRoute(route: string) {
    await this.routeFilter.selectOption(route);
    await this.page.waitForLoadState('networkidle');
  }

  async enableAutoRefresh() {
    await this.autoRefreshToggle.check();
  }

  async getLogsCount(): Promise<number> {
    const rows = await this.logsTable.locator('tbody tr').count();
    return rows;
  }
}
\`\`\`

### pages/OAuthPage.ts

\`\`\`typescript
import { Page, Locator } from '@playwright/test';

export class OAuthPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly providersTable: Locator;
  readonly dialog: Locator;
  readonly providerNameInput: Locator;
  readonly clientIdInput: Locator;
  readonly clientSecretInput: Locator;
  readonly authUrlInput: Locator;
  readonly tokenUrlInput: Locator;
  readonly scopeInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1:has-text("OAuth")');
    this.createButton = page.locator('button:has-text("Add Provider")');
    this.providersTable = page.locator('table');
    
    this.dialog = page.locator('[role="dialog"]');
    this.providerNameInput = this.dialog.locator('input[name="name"]');
    this.clientIdInput = this.dialog.locator('input[name="clientId"]');
    this.clientSecretInput = this.dialog.locator('input[name="clientSecret"]');
    this.authUrlInput = this.dialog.locator('input[name="authUrl"]');
    this.tokenUrlInput = this.dialog.locator('input[name="tokenUrl"]');
    this.scopeInput = this.dialog.locator('input[name="scope"]');
    this.saveButton = this.dialog.locator('button:has-text("Save")');
  }

  async goto() {
    await this.page.goto('/oauth');
    await this.page.waitForLoadState('networkidle');
  }

  async createProvider(data: {
    name: string;
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    scope: string;
  }) {
    await this.createButton.click();
    await this.providerNameInput.fill(data.name);
    await this.clientIdInput.fill(data.clientId);
    await this.clientSecretInput.fill(data.clientSecret);
    await this.authUrlInput.fill(data.authUrl);
    await this.tokenUrlInput.fill(data.tokenUrl);
    await this.scopeInput.fill(data.scope);
    await this.saveButton.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  getProviderRow(name: string): Locator {
    return this.page.locator(\`tr:has-text("\${name}")\`);
  }

  async providerExists(name: string): Promise<boolean> {
    try {
      await this.getProviderRow(name).waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}
\`\`\`

### pages/SSOPage.ts

\`\`\`typescript
import { Page, Locator } from '@playwright/test';

export class SSOPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly enabledToggle: Locator;
  readonly entityIdInput: Locator;
  readonly idpUrlInput: Locator;
  readonly certificateInput: Locator;
  readonly saveButton: Locator;
  readonly testButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1:has-text("SSO")');
    this.enabledToggle = page.locator('input[name="enabled"]');
    this.entityIdInput = page.locator('input[name="entityId"]');
    this.idpUrlInput = page.locator('input[name="idpUrl"]');
    this.certificateInput = page.locator('textarea[name="certificate"]');
    this.saveButton = page.locator('button:has-text("Save")');
    this.testButton = page.locator('button:has-text("Test SSO")');
  }

  async goto() {
    await this.page.goto('/sso');
    await this.page.waitForLoadState('networkidle');
  }

  async configure(data: {
    entityId: string;
    idpUrl: string;
    certificate: string;
  }) {
    await this.enabledToggle.check();
    await this.entityIdInput.fill(data.entityId);
    await this.idpUrlInput.fill(data.idpUrl);
    await this.certificateInput.fill(data.certificate);
    await this.saveButton.click();
  }

  async testSSO() {
    await this.testButton.click();
  }

  async isEnabled(): Promise<boolean> {
    return await this.enabledToggle.isChecked();
  }
}
\`\`\`

### pages/SettingsPage.ts

\`\`\`typescript
import { Page, Locator } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1:has-text("Settings")');
    this.saveButton = page.locator('button:has-text("Save")');
  }

  async goto() {
    await this.page.goto('/settings');
    await this.page.waitForLoadState('networkidle');
  }
}
\`\`\`

---

## Helper Files

### helpers/ApiClient.ts

\`\`\`typescript
import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface Route {
  id?: string;
  path: string;
  target: string;
  enabled: boolean;
  timeout?: number;
}

export interface Webhook {
  id?: string;
  url: string;
  events: string[];
  secret?: string;
  enabled: boolean;
  retryConfig?: {
    maxRetries: number;
    initialDelay: number;
    backoffMultiplier: number;
  };
}

export class ApiClient {
  private client: AxiosInstance;
  private token?: string;

  constructor(baseURL: string = process.env.API_URL || 'http://localhost:3000') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  setToken(token: string) {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = \`Bearer \${token}\`;
  }

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const response = await this.client.post('/api/auth/login', { email, password });
    this.setToken(response.data.token);
    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/api/auth/logout');
    delete this.client.defaults.headers.common['Authorization'];
    this.token = undefined;
  }

  // Routes
  async createRoute(route: Route): Promise<Route> {
    const response = await this.client.post('/api/routes', route);
    return response.data;
  }

  async getRoutes(): Promise<Route[]> {
    const response = await this.client.get('/api/routes');
    return response.data;
  }

  async getRoute(id: string): Promise<Route> {
    const response = await this.client.get(\`/api/routes/\${id}\`);
    return response.data;
  }

  async updateRoute(id: string, route: Partial<Route>): Promise<Route> {
    const response = await this.client.put(\`/api/routes/\${id}\`, route);
    return response.data;
  }

  async deleteRoute(id: string): Promise<void> {
    await this.client.delete(\`/api/routes/\${id}\`);
  }

  // Webhooks
  async createWebhook(webhook: Webhook): Promise<Webhook> {
    const response = await this.client.post('/api/webhooks', webhook);
    return response.data;
  }

  async getWebhooks(): Promise<Webhook[]> {
    const response = await this.client.get('/api/webhooks');
    return response.data;
  }

  async getWebhook(id: string): Promise<Webhook> {
    const response = await this.client.get(\`/api/webhooks/\${id}\`);
    return response.data;
  }

  async updateWebhook(id: string, webhook: Partial<Webhook>): Promise<Webhook> {
    const response = await this.client.put(\`/api/webhooks/\${id}\`, webhook);
    return response.data;
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.client.delete(\`/api/webhooks/\${id}\`);
  }

  async testWebhook(id: string): Promise<{ success: boolean; statusCode?: number }> {
    const response = await this.client.post(\`/api/webhooks/\${id}/test\`);
    return response.data;
  }

  // Metrics
  async getMetrics(timeRange?: string): Promise<any> {
    const response = await this.client.get('/api/metrics', {
      params: { timeRange },
    });
    return response.data;
  }

  // Logs
  async getLogs(filters?: { level?: string; route?: string; search?: string }): Promise<any[]> {
    const response = await this.client.get('/api/logs', {
      params: filters,
    });
    return response.data;
  }
}
\`\`\`

### helpers/WebhookServer.ts

\`\`\`typescript
import express, { Express, Request, Response } from 'express';
import crypto from 'crypto';

export interface ReceivedWebhook {
  payload: any;
  signature: string;
  timestamp: string;
  headers: Record<string, string>;
}

export class WebhookServer {
  private app: Express;
  private server: any;
  private receivedWebhooks: ReceivedWebhook[] = [];
  private port: number;

  constructor(port: number = parseInt(process.env.WEBHOOK_SERVER_PORT || '4000')) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    // Receive webhook
    this.app.post('/webhook', (req: Request, res: Response) => {
      const signature = req.headers['x-webhook-signature'] as string;
      const payload = req.body;
      
      this.receivedWebhooks.push({
        payload,
        signature,
        timestamp: new Date().toISOString(),
        headers: req.headers as Record<string, string>,
      });
      
      res.status(200).json({ received: true });
    });

    // Get received webhooks
    this.app.get('/webhook/received', (req: Request, res: Response) => {
      res.json(this.receivedWebhooks);
    });

    // Clear received webhooks
    this.app.delete('/webhook/clear', (req: Request, res: Response) => {
      this.receivedWebhooks = [];
      res.json({ cleared: true });
    });

    // Simulate webhook failure
    this.app.post('/webhook/fail', (req: Request, res: Response) => {
      res.status(500).json({ error: 'Simulated failure' });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(\`Webhook server listening on port \${this.port}\`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getReceivedWebhooks(): ReceivedWebhook[] {
    return this.receivedWebhooks;
  }

  clearWebhooks() {
    this.receivedWebhooks = [];
  }

  verifySignature(payload: any, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');
    return signature === expectedSignature;
  }

  getUrl(): string {
    return \`http://localhost:\${this.port}/webhook\`;
  }
}
\`\`\`

### helpers/TestDataGenerator.ts

\`\`\`typescript
import { faker } from '@faker-js/faker';

export class TestDataGenerator {
  static generateRoute() {
    return {
      path: \`/api/\${faker.word.noun()}\`,
      target: faker.internet.url(),
      enabled: true,
      timeout: 5000,
    };
  }

  static generateWebhook() {
    return {
      url: faker.internet.url() + '/webhook',
      events: ['route.created', 'route.updated'],
      enabled: true,
      retryConfig: {
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
      },
    };
  }

  static generateUser() {
    return {
      email: faker.internet.email(),
      password: 'Test123!',
      name: faker.person.fullName(),
    };
  }

  static generateUniqueId(): string {
    return faker.string.uuid();
  }

  static generateEmail(): string {
    return faker.internet.email();
  }

  static generateUrl(): string {
    return faker.internet.url();
  }
}
\`\`\`

---

## Fixtures

### fixtures/users.json

\`\`\`json
{
  "admin": {
    "email": "admin@test.com",
    "password": "Admin123!",
    "role": "admin"
  },
  "user": {
    "email": "user@test.com",
    "password": "User123!",
    "role": "user"
  },
  "testUser1": {
    "email": "test1@example.com",
    "password": "Test123!",
    "role": "user"
  },
  "testUser2": {
    "email": "test2@example.com",
    "password": "Test123!",
    "role": "user"
  }
}
\`\`\`

### fixtures/routes.json

\`\`\`json
{
  "testRoute1": {
    "path": "/api/test-success",
    "target": "http://httpbin.org/status/200",
    "enabled": true,
    "timeout": 5000
  },
  "testRoute2": {
    "path": "/api/test-delay",
    "target": "http://httpbin.org/delay/2",
    "enabled": true,
    "timeout": 10000
  },
  "testRoute3": {
    "path": "/api/test-json",
    "target": "http://httpbin.org/json",
    "enabled": true,
    "timeout": 5000
  }
}
\`\`\`

### fixtures/webhooks.json

\`\`\`json
{
  "testWebhook1": {
    "url": "http://localhost:4000/webhook",
    "events": ["route.created", "route.updated", "route.deleted"],
    "enabled": true,
    "retryConfig": {
      "maxRetries": 3,
      "initialDelay": 1000,
      "backoffMultiplier": 2
    }
  },
  "testWebhook2": {
    "url": "http://localhost:4000/webhook/fail",
    "events": ["route.created"],
    "enabled": true,
    "retryConfig": {
      "maxRetries": 2,
      "initialDelay": 500,
      "backoffMultiplier": 1.5
    }
  }
}
\`\`\`

---

## Continue in next message due to length...

This is the complete reference. I'll continue with the test cases in the next section.
