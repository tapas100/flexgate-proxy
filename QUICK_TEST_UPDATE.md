# Quick Test Update Guide

## 🚀 Immediate Actions Required

### 1. Update Dashboard Tests (CRITICAL - Fixes 16 tests)

**File:** `tests/e2e/02-dashboard.spec.ts`

**Find and replace:**
```typescript
// REMOVE THIS:
test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle'); // ❌ This times out!
  await page.waitForTimeout(1500);
});

// REPLACE WITH THIS:
test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  // Wait for dashboard to load initial data
  await page.waitForSelector('[data-testid="dashboard-page"][data-loaded="true"]', { 
    timeout: 15000 
  });
});
```

### 2. Update Dialog Button Clicks (CRITICAL - Fixes 32 mobile tests)

**Files:** Any test creating routes or webhooks

**Find and replace:**
```typescript
// OLD (fails on mobile):
await page.getByRole('button', { name: /create/i }).click();

// NEW (works on mobile):
const saveButton = page.getByTestId('save-button');
await saveButton.scrollIntoViewIfNeeded(); // Ensures button is visible
await saveButton.click();
```

### 3. Use New Test Selectors

**All tests should use `data-testid` instead of text/role selectors:**

```typescript
// ✅ GOOD - Reliable across browsers and languages
await page.getByTestId('dashboard-page').isVisible();
await page.getByTestId('create-route-button').click();
await page.getByTestId('stat-card-total-requests').isVisible();

// ❌ AVOID - Fragile, breaks with text changes
await page.getByRole('button', { name: 'Create Route' }).click();
await page.getByText('Dashboard').isVisible();
```

---

## 📋 Complete Test Selector Reference

### Dashboard
| Element | Test ID |
|---------|---------|
| Page container | `dashboard-page` |
| Total requests card | `stat-card-total-requests` |
| Avg response time card | `stat-card-avg-response-time` |
| Success rate card | `stat-card-success-rate` |
| Error rate card | `stat-card-error-rate` |

### Routes
| Element | Test ID |
|---------|---------|
| Page container | `routes-page` |
| Create button | `create-route-button` |
| Dialog | `route-dialog` |
| Save button | `save-button` |
| Cancel button | `cancel-button` |

### Webhooks
| Element | Test ID |
|---------|---------|
| Page container | `webhooks-page` |
| Create button | `create-webhook-button` |
| Dialog | `webhook-dialog` |
| Save button | `save-button` |
| Cancel button | `cancel-button` |

---

## 🔧 Common Patterns

### Pattern 1: Create Route
```typescript
test('create route', async ({ page }) => {
  await page.goto(`${BASE_URL}/routes`);
  await page.getByTestId('create-route-button').click();
  await page.waitForSelector('[data-testid="route-dialog"]');
  
  await page.fill('input[label="Path"]', '/api/test');
  await page.fill('input[label="Upstream URL"]', 'https://example.com');
  
  const saveButton = page.getByTestId('save-button');
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  
  await page.waitForSelector('[data-testid="route-dialog"]', { state: 'hidden' });
});
```

### Pattern 2: Verify Dashboard Metrics
```typescript
test('verify dashboard metrics', async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForSelector('[data-testid="dashboard-page"][data-loaded="true"]');
  
  // All cards should be visible
  await expect(page.getByTestId('stat-card-total-requests')).toBeVisible();
  await expect(page.getByTestId('stat-card-avg-response-time')).toBeVisible();
  await expect(page.getByTestId('stat-card-success-rate')).toBeVisible();
  await expect(page.getByTestId('stat-card-error-rate')).toBeVisible();
  
  // Connection indicator should show "Live"
  await expect(page.getByText('Live')).toBeVisible();
});
```

### Pattern 3: Mobile-Safe Form Submission
```typescript
test('submit form on mobile', async ({ page }) => {
  // ... fill form ...
  
  // Ensure button is visible and clickable
  const submitButton = page.getByTestId('save-button');
  await submitButton.scrollIntoViewIfNeeded();
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
});
```

---

## 🐛 Troubleshooting

### Dashboard Tests Still Timeout?
```bash
# 1. Verify server is running
curl http://localhost:3000/health

# 2. Check SSE stream works
curl -N http://localhost:3000/api/stream/metrics

# 3. Generate test data
for i in {1..20}; do curl -s http://localhost:3000/health > /dev/null; done

# 4. Verify data in DB
psql -d flexgate -c "SELECT COUNT(*) FROM requests"
```

### Button Still Unclickable?
```typescript
// Try force click
await page.getByTestId('save-button').click({ force: true });

// Or wait for animations
await page.waitForTimeout(500);
await page.getByTestId('save-button').click();

// Or use position click
const button = page.getByTestId('save-button');
const box = await button.boundingBox();
await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
```

### Tests Flaky?
```typescript
// Add retries to test config
test.describe.configure({ retries: 2 });

// Or use toPass() for assertions
await expect(async () => {
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
}).toPass({ timeout: 10000 });
```

---

## ✅ Verification Checklist

After updating tests, verify:

- [ ] Dashboard tests don't use `waitForLoadState('networkidle')`
- [ ] All dialogs use `scrollIntoViewIfNeeded()` before clicking buttons
- [ ] Tests use `data-testid` selectors instead of text/role
- [ ] Mobile tests wait for elements to be visible before interaction
- [ ] Timeouts are reasonable (10-15s for dashboard, 5s for others)

---

## 📊 Expected Results

After applying these changes:

| Test Category | Before | After | Notes |
|--------------|--------|-------|-------|
| Dashboard tests | 0/16 pass | 14-16/16 pass | 2 may still fail if auth not working |
| Mobile route creation | 5/16 pass | 14-16/16 pass | Button interception fixed |
| Mobile webhook creation | 5/16 pass | 14-16/16 pass | Button interception fixed |
| Navigation tests | 20/36 pass | 30-32/36 pass | Better selectors |

**Total improvement:** ~40-45 additional passing tests

---

## 🎯 Priority Order

1. **HIGHEST:** Update Dashboard tests (16 tests, 5 minutes work)
2. **HIGH:** Add `scrollIntoViewIfNeeded()` to mobile dialog tests (32 tests, 10 minutes)
3. **MEDIUM:** Switch to `data-testid` selectors (all tests, 30 minutes)
4. **LOW:** Add error screenshots for debugging (optional)

---

## 📞 Support

If tests still fail after these updates:
1. Check `TEST_IMPROVEMENTS.md` for detailed explanations
2. Run `npx playwright test --debug` to step through failures
3. Generate HTML report: `npx playwright test --reporter=html`
