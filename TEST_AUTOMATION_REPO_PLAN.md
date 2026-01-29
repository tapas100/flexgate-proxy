# FlexGate Test Automation Repository Setup Plan

## Overview

Create a separate repository dedicated to E2E testing with comprehensive tooling and test case implementation.

## Repository Structure

```
flexgate-tests/
├── README.md
├── package.json
├── .gitignore
├── .env.example
│
├── config/
│   ├── environments.json          # Test environments config
│   ├── test-data.json              # Test data sets
│   └── browser-config.json         # Browser settings
│
├── tests/
│   ├── e2e/                        # End-to-end tests
│   │   ├── 01-admin-ui/
│   │   │   ├── TC1.1-basic-login.spec.ts
│   │   │   ├── TC1.2-invalid-login.spec.ts
│   │   │   ├── TC1.3-sso-login.spec.ts
│   │   │   └── ...
│   │   ├── 02-routes/
│   │   │   ├── TC2.1-create-route.spec.ts
│   │   │   ├── TC2.2-validation-errors.spec.ts
│   │   │   └── ...
│   │   ├── 07-webhooks/
│   │   │   ├── TC7.1-create-webhook.spec.ts
│   │   │   ├── TC7.2-test-delivery.spec.ts
│   │   │   └── ...
│   │   └── integration/
│   │       ├── INT1-complete-proxy-flow.spec.ts
│   │       ├── INT2-sso-protected-routes.spec.ts
│   │       └── INT3-high-load.spec.ts
│   │
│   ├── api/                        # API tests
│   │   ├── auth.api.spec.ts
│   │   ├── routes.api.spec.ts
│   │   ├── webhooks.api.spec.ts
│   │   └── metrics.api.spec.ts
│   │
│   ├── performance/                # Performance tests
│   │   ├── load-test.spec.ts
│   │   ├── stress-test.spec.ts
│   │   └── spike-test.spec.ts
│   │
│   └── security/                   # Security tests
│       ├── sql-injection.spec.ts
│       ├── xss-attack.spec.ts
│       ├── csrf.spec.ts
│       └── auth-bypass.spec.ts
│
├── fixtures/                       # Test data fixtures
│   ├── users.json
│   ├── routes.json
│   ├── webhooks.json
│   └── test-responses.json
│
├── helpers/                        # Test utilities
│   ├── api-client.ts               # API wrapper
│   ├── test-data-generator.ts     # Generate test data
│   ├── webhook-server.ts           # Mock webhook receiver
│   ├── assertions.ts               # Custom assertions
│   └── cleanup.ts                  # Test cleanup utilities
│
├── pages/                          # Page Object Models
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── RoutesPage.ts
│   ├── WebhooksPage.ts
│   ├── MetricsPage.ts
│   └── LogsPage.ts
│
├── reports/                        # Test reports (gitignored)
│   ├── html/
│   ├── json/
│   └── screenshots/
│
├── scripts/                        # Utility scripts
│   ├── setup-env.sh                # Setup test environment
│   ├── seed-data.sh                # Seed test data
│   ├── cleanup.sh                  # Cleanup after tests
│   ├── run-tests.sh                # Run all tests
│   └── generate-report.sh          # Generate reports
│
└── docs/                           # Test documentation
    ├── test-plan.md
    ├── test-strategy.md
    ├── test-data-guide.md
    └── contributing.md
```

---

## Technology Stack

### Test Framework Options

#### Option 1: Playwright (Recommended)
**Pros**:
- Multiple browser support (Chromium, Firefox, WebKit)
- Auto-wait mechanism
- Network interception
- Powerful API
- Great TypeScript support
- Built-in reporter

**Cons**:
- Relatively new
- Smaller community than Selenium

#### Option 2: Cypress
**Pros**:
- Great developer experience
- Time-travel debugging
- Automatic waiting
- Built-in assertions

**Cons**:
- Only Chrome-based browsers
- No native multi-tab support
- Runs inside browser

#### Option 3: Selenium + WebdriverIO
**Pros**:
- Mature ecosystem
- Wide browser support
- Large community

**Cons**:
- More complex setup
- Slower than Playwright
- Manual waits needed

### Recommended Stack

```json
{
  "framework": "Playwright",
  "language": "TypeScript",
  "assertion": "Playwright Test (built-in)",
  "reporting": "Allure + HTML Reporter",
  "ci": "GitHub Actions",
  "api-testing": "Playwright + axios",
  "performance": "k6 or Artillery"
}
```

---

## Implementation Plan

### Phase 1: Repository Setup (2 hours)

1. **Create Repository**
   ```bash
   mkdir flexgate-tests
   cd flexgate-tests
   git init
   npm init -y
   ```

2. **Install Dependencies**
   ```bash
   # Playwright
   npm install -D @playwright/test
   npx playwright install
   
   # TypeScript
   npm install -D typescript @types/node
   
   # Utilities
   npm install -D dotenv axios
   
   # Reporting
   npm install -D allure-playwright
   ```

3. **TypeScript Configuration**
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "outDir": "./dist",
       "rootDir": "./",
       "types": ["node", "@playwright/test"]
     },
     "include": ["tests/**/*", "helpers/**/*", "pages/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

4. **Playwright Configuration**
   ```typescript
   // playwright.config.ts
   import { defineConfig, devices } from '@playwright/test';
   
   export default defineConfig({
     testDir: './tests',
     fullyParallel: true,
     forbidOnly: !!process.env.CI,
     retries: process.env.CI ? 2 : 0,
     workers: process.env.CI ? 1 : undefined,
     reporter: [
       ['html'],
       ['list'],
       ['allure-playwright']
     ],
     use: {
       baseURL: process.env.BASE_URL || 'http://localhost:3001',
       trace: 'on-first-retry',
       screenshot: 'only-on-failure',
       video: 'retain-on-failure',
     },
     projects: [
       {
         name: 'chromium',
         use: { ...devices['Desktop Chrome'] },
       },
       {
         name: 'firefox',
         use: { ...devices['Desktop Firefox'] },
       },
       {
         name: 'webkit',
         use: { ...devices['Desktop Safari'] },
       },
       {
         name: 'mobile-chrome',
         use: { ...devices['Pixel 5'] },
       },
     ],
     webServer: {
       command: 'npm run start:test',
       url: 'http://localhost:3001',
       reuseExistingServer: !process.env.CI,
     },
   });
   ```

### Phase 2: Page Object Models (4 hours)

Example: `pages/LoginPage.ts`
```typescript
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly ssoButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.ssoButton = page.locator('button:has-text("Login with Enterprise SSO")');
    this.errorMessage = page.locator('.error-message');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginWithSSO() {
    await this.ssoButton.click();
  }

  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  async isLoginSuccessful(): Promise<boolean> {
    await this.page.waitForURL('/dashboard');
    return this.page.url().includes('/dashboard');
  }
}
```

### Phase 3: Test Implementation (16 hours)

Example: `tests/e2e/01-admin-ui/TC1.1-basic-login.spec.ts`
```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { DashboardPage } from '../../../pages/DashboardPage';

test.describe('TC1.1: Basic Login', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Step 1-3: Navigate to login (done in beforeEach)
    
    // Step 4-5: Enter credentials
    await loginPage.login('test@example.com', 'Test123!');
    
    // Step 6-8: Verify redirect to dashboard
    expect(await loginPage.isLoginSuccessful()).toBeTruthy();
    expect(page.url()).toContain('/dashboard');
    
    // Step 9: Verify user info displayed
    const userEmail = await dashboardPage.getUserEmail();
    expect(userEmail).toBe('test@example.com');
    
    // Step 10: Verify sidebar visible
    const isSidebarVisible = await dashboardPage.isSidebarVisible();
    expect(isSidebarVisible).toBeTruthy();
    
    // Verify no console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    expect(consoleErrors).toHaveLength(0);
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await loginPage.login('wrong@example.com', 'WrongPass');
    
    const errorMessage = await loginPage.getErrorMessage();
    expect(errorMessage).toContain('Invalid credentials');
    
    // Should remain on login page
    expect(page.url()).toContain('/login');
  });
});
```

### Phase 4: Helpers & Utilities (4 hours)

Example: `helpers/api-client.ts`
```typescript
import axios, { AxiosInstance } from 'axios';

export class ApiClient {
  private client: AxiosInstance;
  private token?: string;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  setToken(token: string) {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/api/auth/login', {
      email,
      password,
    });
    this.setToken(response.data.token);
    return response.data;
  }

  async createRoute(routeData: any) {
    return await this.client.post('/api/routes', routeData);
  }

  async createWebhook(webhookData: any) {
    return await this.client.post('/api/webhooks', webhookData);
  }

  async getRoutes() {
    return await this.client.get('/api/routes');
  }

  async deleteRoute(id: string) {
    return await this.client.delete(`/api/routes/${id}`);
  }

  // Add more API methods...
}
```

Example: `helpers/webhook-server.ts`
```typescript
import express, { Express, Request, Response } from 'express';
import crypto from 'crypto';

export class WebhookServer {
  private app: Express;
  private server: any;
  private receivedPayloads: any[] = [];
  private port: number;

  constructor(port: number = 4000) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.post('/webhook', (req: Request, res: Response) => {
      const signature = req.headers['x-webhook-signature'] as string;
      const payload = req.body;
      
      this.receivedPayloads.push({
        payload,
        signature,
        timestamp: new Date().toISOString(),
      });
      
      res.json({ received: true });
    });

    this.app.get('/webhook/received', (req: Request, res: Response) => {
      res.json(this.receivedPayloads);
    });

    this.app.delete('/webhook/clear', (req: Request, res: Response) => {
      this.receivedPayloads = [];
      res.json({ cleared: true });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Webhook server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
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

  getReceivedPayloads() {
    return this.receivedPayloads;
  }

  clearPayloads() {
    this.receivedPayloads = [];
  }

  verifySignature(payload: any, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');
    return signature === expectedSignature;
  }
}
```

### Phase 5: CI/CD Integration (2 hours)

Example: `.github/workflows/tests.yml`
```yaml
name: E2E Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps ${{ matrix.browser }}
      
      - name: Run tests
        run: npm test -- --project=${{ matrix.browser }}
        env:
          BASE_URL: ${{ secrets.TEST_BASE_URL }}
          API_URL: ${{ secrets.TEST_API_URL }}
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.browser }}
          path: |
            playwright-report/
            test-results/
      
      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: screenshots-${{ matrix.browser }}
          path: test-results/**/screenshots/
```

### Phase 6: Reporting & Documentation (2 hours)

Example: `scripts/generate-report.sh`
```bash
#!/bin/bash

# Generate Playwright HTML report
npx playwright show-report

# Generate Allure report
allure generate ./allure-results --clean -o ./allure-report
allure open ./allure-report

# Generate custom summary
node scripts/test-summary.js
```

---

## Test Data Management

### Example: `fixtures/users.json`
```json
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
  "invalid": {
    "email": "invalid@test.com",
    "password": "Wrong123!"
  }
}
```

### Example: `fixtures/routes.json`
```json
{
  "testSuccessRoute": {
    "path": "/api/test-success",
    "target": "http://httpbin.org/status/200",
    "enabled": true,
    "timeout": 5000
  },
  "testFailureRoute": {
    "path": "/api/test-failure",
    "target": "http://httpbin.org/status/500",
    "enabled": true,
    "timeout": 5000
  }
}
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "test:chromium": "playwright test --project=chromium",
    "test:firefox": "playwright test --project=firefox",
    "test:webkit": "playwright test --project=webkit",
    "test:admin-ui": "playwright test tests/e2e/01-admin-ui",
    "test:routes": "playwright test tests/e2e/02-routes",
    "test:webhooks": "playwright test tests/e2e/07-webhooks",
    "test:api": "playwright test tests/api",
    "test:integration": "playwright test tests/e2e/integration",
    "test:performance": "k6 run tests/performance/load-test.js",
    "report": "playwright show-report",
    "report:allure": "allure generate ./allure-results --clean && allure open",
    "setup": "bash scripts/setup-env.sh",
    "seed": "bash scripts/seed-data.sh",
    "cleanup": "bash scripts/cleanup.sh"
  }
}
```

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Setup | 2 hours | Repository ready, dependencies installed |
| Phase 2: Page Objects | 4 hours | All page models created |
| Phase 3: Tests | 16 hours | All 47 test cases implemented |
| Phase 4: Helpers | 4 hours | API client, webhook server, utilities |
| Phase 5: CI/CD | 2 hours | GitHub Actions configured |
| Phase 6: Reporting | 2 hours | Reports and documentation |
| **Total** | **30 hours** | **Complete test automation** |

---

## Next Steps

1. **Create `flexgate-tests` repository**
   ```bash
   # On GitHub
   - Create new repository: flexgate-tests
   - Initialize with README
   - Clone locally
   ```

2. **Set up base structure** (Phase 1)
   - Install Playwright
   - Configure TypeScript
   - Set up environments

3. **Implement page objects** (Phase 2)
   - LoginPage, DashboardPage, RoutesPage, etc.

4. **Write test cases** (Phase 3)
   - Start with P0 tests
   - Then P1, P2, P3

5. **Add utilities** (Phase 4)
   - API client
   - Webhook mock server
   - Test data generators

6. **Configure CI/CD** (Phase 5)
   - GitHub Actions
   - Automated test runs

7. **Set up reporting** (Phase 6)
   - HTML reports
   - Allure reports
   - Custom dashboards

---

## Benefits of Separate Repository

✅ **Clean separation of concerns**
- Test code separate from application code
- Independent versioning
- Different deployment pipelines

✅ **Better collaboration**
- QA team can work independently
- Easier code reviews
- Clear ownership

✅ **Flexibility**
- Can test multiple environments
- Can test different versions
- Can run on schedule

✅ **Scalability**
- Add more tests without bloating main repo
- Separate CI/CD pipelines
- Independent scaling

---

## Recommended Repository Name

`flexgate-tests` or `flexgate-test-automation`

---

**Ready to create the test automation repository?** This will give you:
- ✅ Professional test framework
- ✅ Page Object Model architecture
- ✅ Comprehensive test coverage
- ✅ CI/CD integration
- ✅ Rich reporting
- ✅ Easy maintenance
