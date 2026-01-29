#!/bin/bash

# FlexGate Test Automation Repository Setup Script
# This script creates the complete test automation repository structure

set -e

echo "🚀 FlexGate Test Automation Repository Setup"
echo "============================================="

# Configuration
REPO_NAME="flexgate-tests"
REPO_DIR="$HOME/Documents/GitHub/$REPO_NAME"

# Check if directory already exists
if [ -d "$REPO_DIR" ]; then
    echo "❌ Directory $REPO_DIR already exists!"
    echo "Please remove it first or choose a different location."
    exit 1
fi

echo ""
echo "📁 Step 1: Creating repository directory..."
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

echo "✅ Created: $REPO_DIR"

echo ""
echo "🔧 Step 2: Initializing Git repository..."
git init
git branch -M main

echo ""
echo "📦 Step 3: Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "flexgate-tests",
  "version": "1.0.0",
  "description": "Comprehensive E2E test automation for FlexGate Proxy",
  "main": "index.js",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "test:chromium": "playwright test --project=chromium",
    "test:firefox": "playwright test --project=firefox",
    "test:webkit": "playwright test --project=webkit",
    "test:mobile": "playwright test --project=mobile-chrome",
    "test:admin-ui": "playwright test tests/e2e/01-admin-ui",
    "test:routes": "playwright test tests/e2e/02-routes",
    "test:metrics": "playwright test tests/e2e/03-metrics",
    "test:logs": "playwright test tests/e2e/04-logs",
    "test:oauth": "playwright test tests/e2e/05-oauth",
    "test:sso": "playwright test tests/e2e/06-sso",
    "test:webhooks": "playwright test tests/e2e/07-webhooks",
    "test:integration": "playwright test tests/e2e/integration",
    "test:api": "playwright test tests/api",
    "test:performance": "k6 run tests/performance/load-test.js",
    "test:security": "playwright test tests/security",
    "report": "playwright show-report",
    "report:allure": "allure generate ./allure-results --clean -o ./allure-report && allure open ./allure-report",
    "setup": "bash scripts/setup-env.sh",
    "seed": "ts-node scripts/seed-data.ts",
    "cleanup": "ts-node scripts/cleanup.ts",
    "format": "prettier --write .",
    "lint": "eslint . --ext .ts",
    "type-check": "tsc --noEmit"
  },
  "keywords": [
    "testing",
    "e2e",
    "playwright",
    "automation",
    "flexgate"
  ],
  "author": "FlexGate Team",
  "license": "MIT",
  "devDependencies": {},
  "dependencies": {}
}
EOF

echo ""
echo "📦 Step 4: Installing dependencies..."
npm install -D @playwright/test@latest
npm install -D typescript@latest
npm install -D @types/node@latest
npm install -D dotenv@latest
npm install -D axios@latest
npm install -D allure-playwright@latest
npm install -D prettier@latest
npm install -D eslint@latest
npm install -D @typescript-eslint/parser@latest
npm install -D @typescript-eslint/eslint-plugin@latest
npm install -D ts-node@latest

echo ""
echo "🎭 Step 5: Installing Playwright browsers..."
npx playwright install

echo ""
echo "📁 Step 6: Creating directory structure..."

# Create main directories
mkdir -p config
mkdir -p tests/{e2e/{01-admin-ui,02-routes,03-metrics,04-logs,05-oauth,06-sso,07-webhooks,integration},api,performance,security}
mkdir -p fixtures
mkdir -p helpers
mkdir -p pages
mkdir -p reports/{html,json,screenshots}
mkdir -p scripts
mkdir -p docs
mkdir -p .github/workflows

echo "✅ Directory structure created"

echo ""
echo "⚙️  Step 7: Creating configuration files..."

# TypeScript configuration
cat > tsconfig.json << 'EOF'
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
    "types": ["node", "@playwright/test"],
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "tests/**/*",
    "helpers/**/*",
    "pages/**/*",
    "scripts/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "reports"
  ]
}
EOF

# Playwright configuration
cat > playwright.config.ts << 'EOF'
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  reporter: [
    ['html', { outputFolder: 'reports/html' }],
    ['list'],
    ['json', { outputFile: 'reports/json/results.json' }],
    ['allure-playwright', { outputFolder: 'allure-results' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
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
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: process.env.CI ? undefined : {
    command: 'echo "Start FlexGate application manually"',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
  },
});
EOF

# Environment configuration
cat > .env.example << 'EOF'
# FlexGate Test Environment Configuration

# Application URLs
BASE_URL=http://localhost:3001
API_URL=http://localhost:3000

# Test User Credentials
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Admin123!

TEST_USER_EMAIL=user@test.com
TEST_USER_PASSWORD=User123!

# SSO Configuration (if applicable)
SSO_IDP_URL=https://sso.example.com
SSO_ENTITY_ID=flexgate-proxy

# Webhook Test Server
WEBHOOK_SERVER_PORT=4000
WEBHOOK_SERVER_URL=http://localhost:4000

# API Configuration
API_TIMEOUT=5000

# Test Data
TEST_ROUTE_TARGET=http://httpbin.org

# CI/CD
CI=false

# Reporting
ALLURE_RESULTS_DIR=./allure-results
ALLURE_REPORT_DIR=./allure-report
EOF

cat > .env << 'EOF'
# Copy from .env.example and customize
BASE_URL=http://localhost:3001
API_URL=http://localhost:3000
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Admin123!
TEST_USER_EMAIL=user@test.com
TEST_USER_PASSWORD=User123!
WEBHOOK_SERVER_PORT=4000
EOF

# ESLint configuration
cat > .eslintrc.json << 'EOF'
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module"
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
EOF

# Prettier configuration
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
EOF

# Gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json

# Environment
.env

# Test Results
test-results/
playwright-report/
reports/
allure-results/
allure-report/

# Build
dist/
*.js
*.js.map

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Coverage
coverage/
.nyc_output/

# Misc
*.tmp
*.temp
EOF

echo "✅ Configuration files created"

echo ""
echo "📄 Step 8: Creating README.md..."

cat > README.md << 'EOF'
# FlexGate Test Automation

Comprehensive E2E test automation suite for FlexGate Proxy using Playwright and TypeScript.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- FlexGate Proxy application running

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/flexgate-tests.git
cd flexgate-tests

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Configure environment
cp .env.example .env
# Edit .env with your test environment settings
```

### Running Tests

```bash
# Run all tests
npm test

# Run with UI mode (interactive)
npm run test:ui

# Run specific feature tests
npm run test:admin-ui
npm run test:routes
npm run test:webhooks

# Run in specific browser
npm run test:chromium
npm run test:firefox
npm run test:webkit

# Run in headed mode (see browser)
npm run test:headed

# Debug tests
npm run test:debug
```

### View Reports

```bash
# HTML report
npm run report

# Allure report
npm run report:allure
```

## 📁 Project Structure

```
flexgate-tests/
├── tests/                      # Test files
│   ├── e2e/                   # End-to-end tests
│   │   ├── 01-admin-ui/       # Feature 1 tests
│   │   ├── 02-routes/         # Feature 2 tests
│   │   ├── 07-webhooks/       # Feature 7 tests
│   │   └── integration/       # Integration scenarios
│   ├── api/                   # API tests
│   ├── performance/           # Performance tests
│   └── security/              # Security tests
├── pages/                     # Page Object Models
├── helpers/                   # Test utilities
├── fixtures/                  # Test data
├── config/                    # Configuration files
├── scripts/                   # Setup/utility scripts
└── reports/                   # Test reports
```

## 📊 Test Coverage

- **Total Test Cases**: 47
- **E2E Tests**: 41
- **API Tests**: 15+
- **Performance Tests**: 3
- **Security Tests**: 4

## 🧪 Test Categories

### E2E Tests by Feature

1. **Admin UI** (8 tests) - Login, SSO, Navigation
2. **Routes** (10 tests) - CRUD, Validation, Search
3. **Metrics** (6 tests) - Dashboard, Filters, Export
4. **Logs** (5 tests) - Viewer, Search, Real-time
5. **OAuth** (4 tests) - Provider CRUD, Testing
6. **SSO** (6 tests) - Configuration, Authentication
7. **Webhooks** (15 tests) - CRUD, Delivery, Retry

### Integration Tests (6 tests)

- Complete proxy flow
- SSO + Protected routes
- High-load scenarios

## 🛠️ Development

### Adding New Tests

1. Create test file in appropriate directory
2. Import page objects and helpers
3. Write test using Playwright Test API
4. Run and verify

Example:
```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';

test('should login successfully', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('test@example.com', 'Test123!');
  expect(await loginPage.isLoginSuccessful()).toBeTruthy();
});
```

### Page Object Pattern

Create reusable page objects in `pages/`:

```typescript
export class LoginPage {
  constructor(private page: Page) {}
  
  async goto() {
    await this.page.goto('/login');
  }
  
  async login(email: string, password: string) {
    await this.page.fill('[name="email"]', email);
    await this.page.fill('[name="password"]', password);
    await this.page.click('button[type="submit"]');
  }
}
```

## 🔄 CI/CD

Tests run automatically on:
- Pull requests
- Pushes to main/develop
- Daily schedule (nightly tests)

See `.github/workflows/tests.yml` for configuration.

## 📈 Reporting

- **HTML Report**: Interactive report with screenshots/videos
- **Allure Report**: Detailed test execution report
- **JSON Report**: Programmatic test results

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Add tests
4. Run tests locally
5. Submit pull request

## 📚 Documentation

- [Test Plan](docs/test-plan.md)
- [Test Strategy](docs/test-strategy.md)
- [Page Objects Guide](docs/page-objects.md)
- [Best Practices](docs/best-practices.md)

## 📝 License

MIT
EOF

echo "✅ README.md created"

echo ""
echo "📝 Step 9: Creating initial commit..."

git add .
git commit -m "Initial commit: Test automation framework setup

- Playwright + TypeScript configuration
- Directory structure
- Package.json with all scripts
- Configuration files (tsconfig, playwright.config, eslint, prettier)
- Environment configuration
- Gitignore
- README.md

Ready for test implementation."

echo ""
echo "✅ Repository initialized with Git"

echo ""
echo "============================================="
echo "✅ Setup Complete!"
echo "============================================="
echo ""
echo "📁 Repository created at: $REPO_DIR"
echo ""
echo "Next steps:"
echo "1. Create GitHub repository 'flexgate-tests'"
echo "2. Add remote and push:"
echo "   cd $REPO_DIR"
echo "   git remote add origin https://github.com/YOUR_USERNAME/flexgate-tests.git"
echo "   git push -u origin main"
echo ""
echo "3. Open in VS Code:"
echo "   code $REPO_DIR"
echo ""
echo "4. Start implementing tests!"
echo ""
echo "Happy Testing! 🚀"
EOF

chmod +x "$REPO_DIR/setup-test-repo.sh"
