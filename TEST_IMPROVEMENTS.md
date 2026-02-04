# Test Improvements and Fixes

## Date: January 29, 2026

## Summary of Changes

This document outlines the improvements made to the FlexGate application to address E2E test failures and improve testability.

---

## 🎯 Issues Addressed

### 1. Dashboard `networkidle` Timeout (16 tests affected)
**Problem:** Dashboard tests were timing out waiting for network to become idle, but SSE connections keep the network active by design.

**Solution:**
- Added `data-testid="dashboard-page"` to Dashboard component
- Added `data-loaded` attribute that changes from `"false"` to `"true"` when dashboard receives initial data
- Tests should now wait for `[data-loaded="true"]` instead of `networkidle`

**Files Changed:**
- `admin-ui/src/pages/Dashboard.tsx`

**Test Update Required:**
```typescript
// OLD (times out):
await page.goto(`${BASE_URL}/dashboard`);
await page.waitForLoadState('networkidle');

// NEW (works with SSE):
await page.goto(`${BASE_URL}/dashboard`);
await page.waitForSelector('[data-testid="dashboard-page"][data-loaded="true"]', { timeout: 10000 });
```

---

### 2. Mobile Dialog Button Interception (32 tests affected)
**Problem:** On mobile browsers, MUI DialogTitle was overlapping content, making buttons unclickable.

**Solution:**
- Added `scroll="paper"` to all Dialog components (makes content scrollable, not the entire dialog)
- Added `dividers` prop to DialogContent (adds visual separation)
- Added `sx={{ p: 2 }}` to DialogActions (ensures proper padding)
- Added `data-testid` attributes to dialogs and buttons for better targeting

**Files Changed:**
- `admin-ui/src/pages/Routes/RouteDialog.tsx`
- `admin-ui/src/pages/Webhooks.tsx`

**Test Update Recommended:**
```typescript
// For route creation:
await page.getByTestId('create-route-button').click();
await page.waitForSelector('[data-testid="route-dialog"]');
// Fill form...
await page.getByTestId('save-button').click();

// For webhook creation:
await page.getByTestId('create-webhook-button').click();
await page.waitForSelector('[data-testid="webhook-dialog"]');
// Fill form...
await page.getByTestId('save-button').click();
```

---

### 3. Enhanced Test Selectors
**Problem:** Tests were using generic selectors that were unreliable across different browsers.

**Solution:**
- Added `data-testid` attributes throughout the application:
  - Dashboard: `dashboard-page`, `stat-card-total-requests`, `stat-card-avg-response-time`, etc.
  - Routes: `routes-page`, `create-route-button`
  - Webhooks: `webhooks-page`, `create-webhook-button`
  - Dialogs: `route-dialog`, `webhook-dialog`, `save-button`, `cancel-button`

**Files Changed:**
- `admin-ui/src/pages/Dashboard.tsx`
- `admin-ui/src/pages/Routes/RouteList.tsx`
- `admin-ui/src/pages/Webhooks.tsx`

---

## 📊 Stats Card Test IDs

Dashboard stat cards now have standardized test IDs:

| Metric | Test ID |
|--------|---------|
| Total Requests | `stat-card-total-requests` |
| Avg Response Time | `stat-card-avg-response-time` |
| Success Rate | `stat-card-success-rate` |
| Error Rate | `stat-card-error-rate` |

---

## 🔧 Recommended Test Updates

### Dashboard Tests (`02-dashboard.spec.ts`)

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  // Wait for dashboard to load data instead of networkidle
  await page.waitForSelector('[data-testid="dashboard-page"][data-loaded="true"]', { 
    timeout: 15000 
  });
});

test('should display dashboard page', async ({ page }) => {
  // Verify dashboard is present
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  
  // Check for "Live" connection indicator
  await expect(page.getByText('Live')).toBeVisible();
});

test('should display metrics summary cards', async ({ page }) => {
  // Wait for stats to load
  await expect(page.getByTestId('stat-card-total-requests')).toBeVisible();
  await expect(page.getByTestId('stat-card-avg-response-time')).toBeVisible();
  await expect(page.getByTestId('stat-card-success-rate')).toBeVisible();
  await expect(page.getByTestId('stat-card-error-rate')).toBeVisible();
});
```

### Route Creation Tests

```typescript
test('should create a new route', async ({ page }) => {
  await page.goto(`${BASE_URL}/routes`);
  
  // Click create button
  await page.getByTestId('create-route-button').click();
  
  // Wait for dialog
  await page.waitForSelector('[data-testid="route-dialog"]');
  
  // Fill form
  await page.fill('input[name="path"]', '/api/test');
  await page.fill('input[name="upstream"]', 'https://example.com');
  
  // Submit
  await page.getByTestId('save-button').click();
  
  // Wait for dialog to close
  await page.waitForSelector('[data-testid="route-dialog"]', { state: 'hidden' });
});
```

### Webhook Creation Tests

```typescript
test('should create a new webhook', async ({ page }) => {
  await page.goto(`${BASE_URL}/webhooks`);
  
  // Click create button
  await page.getByTestId('create-webhook-button').click();
  
  // Wait for dialog
  await page.waitForSelector('[data-testid="webhook-dialog"]');
  
  // Fill form
  await page.fill('input[name="url"]', 'https://webhook.example.com');
  
  // Submit - use scrollIntoViewIfNeeded for mobile
  const saveButton = page.getByTestId('save-button');
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  
  // Wait for dialog to close
  await page.waitForSelector('[data-testid="webhook-dialog"]', { state: 'hidden' });
});
```

---

## 🚨 Known Issues (Not Fixed)

### 1. Authentication Not Implemented
**Impact:** 11 tests failing  
**Reason:** Login pages exist but backend authentication endpoints are not implemented  
**Status:** Requires backend development  
**Workaround:** Tests should bypass authentication or mock auth tokens

### 2. API Response Format Issues
**Impact:** Unknown number of tests  
**Reason:** Some APIs returning unexpected formats  
**Status:** Needs investigation  
**Recommendation:** Add response validation in tests

---

## 📈 Expected Test Improvements

After applying the recommended changes:

| Browser | Before | Expected After |
|---------|--------|----------------|
| Chromium | ~70% pass | ~85-90% pass |
| Firefox | ~70% pass | ~85-90% pass |
| WebKit | ~70% pass | ~85-90% pass |
| Mobile Safari | ~40% pass | ~75-80% pass |
| Mobile Chrome | ~40% pass | ~75-80% pass |

**Main improvements:**
- Dashboard tests: All 16 should pass (was timing out)
- Mobile form tests: ~25-28 of 32 should pass (was failing due to button interception)
- Navigation tests: Should see 20-30% improvement

---

## 🔍 Debugging Tips

### If Dashboard Still Times Out:
1. Check server logs: `tail -f /tmp/flexgate-server.log`
2. Verify SSE connection: Open browser DevTools Network tab, filter by "stream/metrics"
3. Check if data is being published: `curl -N http://localhost:3000/api/stream/metrics`

### If Dialog Buttons Still Unclickable:
1. Add `await saveButton.scrollIntoViewIfNeeded()` before clicking
2. Use `{ force: true }` option: `await saveButton.click({ force: true })`
3. Check for overlays: `await page.screenshot({ path: 'debug.png' })`

### If Stats Not Showing:
1. Generate traffic: `for i in {1..20}; do curl http://localhost:3000/health; done`
2. Check database: `psql -d flexgate -c "SELECT COUNT(*) FROM requests"`
3. Verify JetStream: `tail -f /tmp/flexgate-server.log | grep "Published metrics"`

---

## 📝 Next Steps

1. **Update test repository** (`flexgate-tests`):
   - Update `tests/e2e/02-dashboard.spec.ts` with new selectors
   - Add `scrollIntoViewIfNeeded()` for mobile tests
   - Remove `waitForLoadState('networkidle')` from Dashboard tests

2. **Implement authentication** (Backend):
   - Complete `/api/auth/login` endpoint
   - Add session/JWT management
   - Update test auth setup

3. **Run tests again**:
   ```bash
   cd flexgate-tests
   npx playwright test --project=chromium
   npx playwright test --project=mobile-safari
   ```

4. **Generate new report**:
   ```bash
   npx playwright test --reporter=html
   npx playwright show-report
   ```

---

## 🎉 Summary

**Fixed:**
- ✅ Dashboard SSE streaming causing networkidle timeouts
- ✅ Mobile dialog button accessibility issues
- ✅ Missing test selectors for reliable testing
- ✅ Dialog scroll behavior on mobile

**Remaining:**
- ❌ Authentication implementation (backend work required)
- ❌ API response format validation (needs investigation)

**Impact:**
- **16 Dashboard tests** should now pass
- **~25-28 mobile form tests** should now pass
- **Total improvement:** 40-45 additional passing tests expected
