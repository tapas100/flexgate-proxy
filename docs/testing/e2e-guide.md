# End-to-End Testing Guide

## Overview

This guide provides comprehensive instructions for executing end-to-end (E2E) tests for FlexGate Proxy.

## Test Environment Setup

### Prerequisites

1. **Software Requirements**
   - Node.js 16+ installed
   - npm 7+ installed
   - Git installed
   - Modern web browser (Chrome, Firefox, Safari, or Edge)
   - Terminal/Command line access

2. **FlexGate Installation**
   ```bash
   # Clone repository
   git clone https://github.com/tapas100/flexgate-proxy.git
   cd flexgate-proxy
   
   # Install backend dependencies
   npm install
   
   # Install frontend dependencies
   cd admin-ui
   npm install
   cd ..
   
   # Build project
   npm run build
   ```

3. **Environment Configuration**
   ```bash
   # Create .env file
   cp .env.example .env
   
   # Edit .env with your configuration
   # Required variables:
   # - DATABASE_URL (if using database)
   # - JWT_SECRET
   # - EINSTRUST_API_URL (for SSO testing)
   ```

### Starting the Application

```bash
# Terminal 1: Start backend server
npm start
# Server runs on http://localhost:3000

# Terminal 2: Start admin UI (in separate terminal)
cd admin-ui
npm start
# UI runs on http://localhost:3001
```

### Test Data Preparation

1. **Create Test User**
   ```bash
   # Using API or database directly
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "Test123!",
       "role": "admin"
     }'
   ```

2. **Seed Test Routes**
   ```bash
   # Create sample routes for testing
   curl -X POST http://localhost:3000/api/routes \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "path": "/api/test",
       "target": "http://httpbin.org",
       "enabled": true
     }'
   ```

3. **Set Up Webhook Test Endpoint**
   - Visit https://webhook.site
   - Copy your unique URL
   - Use for webhook testing

---

## Test Execution Strategy

### Test Priority Levels

| Priority | Description | Examples |
|----------|-------------|----------|
| P0 - Critical | Core functionality, blocking issues | Login, route creation |
| P1 - High | Major features | Webhook delivery, metrics |
| P2 - Medium | Secondary features | Log filtering, OAuth config |
| P3 - Low | Nice-to-have | UI polish, edge cases |

### Test Execution Order

#### Day 1: Core Features (P0)
1. Admin UI - Login (TC1.1, TC1.2)
2. Admin UI - Navigation (TC1.5)
3. Routes - Create/Edit/Delete (TC2.1, TC2.3, TC2.4)
4. Webhooks - Create/Test (TC7.1, TC7.2)

#### Day 2: Major Features (P1)
1. Routes - Advanced config (TC2.9, TC2.10)
2. Webhooks - Retry logic (TC7.4, TC7.5)
3. Webhooks - Event filtering (TC7.6, TC7.14)
4. Metrics dashboard
5. Log viewer

#### Day 3: Integration (P1)
1. SSO login flow (TC1.3)
2. Protected routes (TC1.4)
3. End-to-end proxy flow
4. Webhook delivery chain

#### Day 4: Performance & Edge Cases (P2)
1. Load testing
2. Concurrent requests
3. Error handling
4. Boundary conditions

#### Day 5: Polish & Documentation (P3)
1. UI responsiveness
2. Accessibility
3. Browser compatibility
4. Documentation accuracy

---

## Test Execution Process

### Before Each Test Session

```markdown
## Pre-Test Checklist
- [ ] Application running (backend + frontend)
- [ ] Test data prepared
- [ ] Browser cache cleared
- [ ] Previous test artifacts cleaned up
- [ ] Test environment verified
- [ ] Test case document open
- [ ] Screen recording started (optional)
```

### During Test Execution

1. **Follow Test Case Steps Exactly**
   - Don't skip steps
   - Don't modify order
   - Document any deviations

2. **Record Results**
   - Use test tracker template
   - Take screenshots for failures
   - Note actual vs expected results
   - Record timestamps

3. **Log Issues Immediately**
   - Create bug report while fresh
   - Include reproduction steps
   - Attach screenshots/logs
   - Assign severity

### After Each Test Session

```markdown
## Post-Test Checklist
- [ ] All results documented
- [ ] Screenshots saved
- [ ] Bugs logged in tracker
- [ ] Test environment cleaned
- [ ] Logs collected
- [ ] Summary updated
```

---

## Test Case Format

### Standard Template

```markdown
### TC[Feature].[Number]: [Test Name]

**Priority**: P0/P1/P2/P3
**Type**: Functional/Integration/Performance/Security
**Precondition**: [Prerequisites before test]

**Test Steps**:
1. [Step 1]
2. [Step 2]
3. [Step 3]
...

**Expected Result**: [What should happen]

**Test Data**:
- Input A: value
- Input B: value

**Notes**: [Any special considerations]
```

### Example: Complete Test Case

```markdown
### TC1.1: Basic Login

**Priority**: P0
**Type**: Functional
**Precondition**: 
- User exists with email: test@example.com, password: Test123!
- Application running on http://localhost:3001

**Test Steps**:
1. Open browser
2. Navigate to http://localhost:3001
3. Verify redirect to /login
4. Enter email: test@example.com
5. Enter password: Test123!
6. Click "Login" button
7. Wait for redirect
8. Verify URL is /dashboard
9. Verify header shows user email
10. Verify sidebar is visible

**Expected Result**: 
- Successful login
- Redirect to dashboard
- User info displayed
- No console errors

**Test Data**:
- Email: test@example.com
- Password: Test123!

**Notes**: 
- Token should be stored in localStorage
- Session should persist on refresh
```

---

## Automated vs Manual Testing

### When to Use Automated Tests

✅ **Use for**:
- Regression testing
- API endpoint validation
- Smoke tests
- Performance tests
- Load tests

```bash
# Run automated test suite
./test-execution.sh all

# Run specific feature tests
./test-execution.sh webhooks
./test-execution.sh routes
```

### When to Use Manual Tests

✅ **Use for**:
- UI/UX validation
- Visual regression
- Exploratory testing
- First-time feature testing
- Complex user flows

---

## Test Data Management

### Test User Accounts

```javascript
// Development test users
const testUsers = [
  {
    email: 'admin@test.com',
    password: 'Admin123!',
    role: 'admin'
  },
  {
    email: 'user@test.com',
    password: 'User123!',
    role: 'user'
  }
];
```

### Test Routes

```javascript
// Sample test routes
const testRoutes = [
  {
    path: '/api/test-success',
    target: 'http://httpbin.org/status/200',
    enabled: true
  },
  {
    path: '/api/test-failure',
    target: 'http://httpbin.org/status/500',
    enabled: true
  },
  {
    path: '/api/test-slow',
    target: 'http://httpbin.org/delay/3',
    enabled: true
  }
];
```

### Test Webhooks

```javascript
// Webhook test endpoints
const testWebhooks = [
  {
    url: 'https://webhook.site/your-unique-url',
    events: ['circuit_breaker.opened'],
    enabled: true
  }
];
```

---

## Test Result Documentation

### Test Execution Tracker

```markdown
## Test Execution Summary

**Date**: 2026-01-28
**Tester**: John Doe
**Build**: v1.7.0
**Environment**: Development

### Results

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| TC1.1 | Basic Login | ✅ PASS | - |
| TC1.2 | Invalid Login | ✅ PASS | - |
| TC1.3 | SSO Login | ❌ FAIL | BUG-001 |
| TC2.1 | Create Route | ✅ PASS | - |
| TC7.1 | Create Webhook | ✅ PASS | - |

### Summary
- **Total**: 47 tests
- **Passed**: 45 tests (96%)
- **Failed**: 2 tests (4%)
- **Blocked**: 0 tests
- **Not Run**: 0 tests

### Bugs Found
- BUG-001: SSO redirect fails with invalid IdP response
- BUG-002: Webhook retry count incorrect in logs

### Sign-off
Status: ✅ Ready for deployment (pending bug fixes)
```

---

## Bug Reporting Template

```markdown
## Bug Report: BUG-XXX

**Title**: [Short description]

**Severity**: Critical/High/Medium/Low

**Environment**:
- OS: macOS 14.1
- Browser: Chrome 120
- Build: v1.7.0

**Steps to Reproduce**:
1. Navigate to /webhooks
2. Click "Create Webhook"
3. Enter invalid URL
4. Click "Save"

**Expected Result**:
Validation error message displayed

**Actual Result**:
Application crashes with console error

**Screenshots**:
[Attach screenshot]

**Console Logs**:
```
Error: Cannot read property 'url' of undefined
  at WebhookForm.tsx:145
```

**Reproducibility**: Always/Sometimes/Rare

**Workaround**: None known

**Related Test Case**: TC7.13
```

---

## Performance Testing

### Load Test Scenarios

#### Scenario 1: Normal Load
```bash
# 100 requests, 10 concurrent
ab -n 100 -c 10 http://localhost:3000/api/routes
```

#### Scenario 2: High Load
```bash
# 1000 requests, 50 concurrent
ab -n 1000 -c 50 http://localhost:3000/api/routes
```

#### Scenario 3: Stress Test
```bash
# 10000 requests, 100 concurrent
ab -n 10000 -c 100 http://localhost:3000/api/routes
```

### Performance Benchmarks

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| Response Time (p95) | < 50ms | < 100ms | > 100ms |
| Throughput | > 10k req/min | > 5k req/min | < 5k req/min |
| Error Rate | < 0.1% | < 1% | > 1% |
| Memory Usage | < 500MB | < 1GB | > 1GB |

---

## Security Testing

### Security Test Cases

#### SEC-01: SQL Injection
```
Test input: ' OR '1'='1
Expected: Input sanitized, no SQL injection
```

#### SEC-02: XSS Attack
```
Test input: <script>alert('XSS')</script>
Expected: HTML escaped, no script execution
```

#### SEC-03: CSRF Protection
```
Test: Submit form without CSRF token
Expected: Request rejected with 403
```

#### SEC-04: Authentication Bypass
```
Test: Access protected route without token
Expected: Redirect to login
```

---

## Browser Compatibility Testing

### Supported Browsers

| Browser | Min Version | Test Priority |
|---------|-------------|---------------|
| Chrome | 90+ | P0 |
| Firefox | 88+ | P1 |
| Safari | 14+ | P1 |
| Edge | 90+ | P2 |

### Cross-Browser Test Matrix

```markdown
| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Login | ✅ | ✅ | ✅ | ✅ |
| Routes | ✅ | ✅ | ❌ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Metrics | ✅ | ✅ | ✅ | ⚠️ |
```

---

## Accessibility Testing

### WCAG 2.1 Compliance

#### Level A (Must Have)
- [ ] Keyboard navigation
- [ ] Alt text for images
- [ ] Form labels
- [ ] Color contrast (4.5:1)

#### Level AA (Should Have)
- [ ] Skip navigation links
- [ ] Resizable text
- [ ] Multiple ways to navigate
- [ ] Focus indicators

### Screen Reader Testing
- Test with VoiceOver (macOS)
- Test with NVDA (Windows)
- Test with JAWS (Windows)

---

## Test Tools

### Recommended Tools

1. **API Testing**: Postman, Insomnia, curl
2. **Load Testing**: Apache Bench (ab), Artillery, k6
3. **Browser Testing**: Selenium, Playwright, Cypress
4. **Security Testing**: OWASP ZAP, Burp Suite
5. **Accessibility**: axe DevTools, WAVE, Lighthouse

---

## Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check if ports are in use
lsof -i :3000
lsof -i :3001

# Kill processes if needed
kill -9 <PID>

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Tests Failing Unexpectedly
1. Clear browser cache
2. Restart application
3. Check test data exists
4. Verify environment variables
5. Check network connectivity

#### Webhook Tests Not Working
1. Verify webhook.site is accessible
2. Check webhook URL is correct
3. Verify events are being triggered
4. Check delivery logs
5. Verify HMAC signature

---

## Best Practices

### DO ✅
- Clear browser cache before testing
- Use fresh test data for each run
- Document all failures with screenshots
- Test on clean environment
- Follow test case steps exactly
- Report bugs immediately
- Update test cases when features change

### DON'T ❌
- Skip test steps
- Modify test order
- Test on dirty environment
- Ignore intermittent failures
- Leave bugs unreported
- Test without preparation
- Mix manual and automated runs

---

## Related Documentation

- [Testing Execution Plan](../../TESTING_EXECUTION_PLAN.md) - 47 detailed test cases
- [Testing Quick Start](../../TESTING_QUICK_START.md) - Quick reference
- [Feature Documentation](../features/) - Feature-specific tests
- [test-execution.sh](../../test-execution.sh) - Automated test script

---

**Last Updated**: January 28, 2026  
**Version**: 1.0  
**Status**: Active
