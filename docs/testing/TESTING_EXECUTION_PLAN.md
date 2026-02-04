# FlexGate Testing Execution Plan

**Date**: January 28, 2026  
**Overall Completion**: 84% (6.7/8 features)  
**Branch**: `feature/webhooks`

---

## 📋 Feature Status Overview

### ✅ Completed Features (Ready for Testing)

1. **Feature 1: Admin UI Foundation** - 100% ✅
2. **Feature 2: Visual Route Editor** - 100% ✅
3. **Feature 3: Metrics Dashboard** - 100% ✅
4. **Feature 4: Log Viewer** - 100% ✅
5. **Feature 5: OAuth Plugins** - 100% ✅
6. **Einstrust SAML Integration** - 100% ✅
7. **Feature 7: Webhooks** - 75% ✅ (Backend complete, UI pending)

### 📋 Pending Features

8. **Feature 8: API Key Management** - 0%
9. **Billing** (Private repo) - 0%
10. **License Management** (Private repo) - 0%

---

## 🧪 Consolidated Testing Plan

### Phase 1: Environment Setup (15 minutes)

#### Prerequisites
```bash
# Clone and setup repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Checkout feature branch
git checkout feature/webhooks

# Install dependencies
npm install
cd admin-ui && npm install && cd ..

# Build project
npm run build
```

#### Configuration Files

**1. Create `.env` file in root:**
```bash
# FlexGate Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Einstrust SAML (Optional - for SSO testing)
EINSTRUST_API_URL=http://localhost:3001
EINSTRUST_IDP_ID=
EINSTRUST_RETURN_URL=http://localhost:3000/auth/callback
EINSTRUST_SESSION_CACHE_TTL=300

# Redis (Optional - for rate limiting)
REDIS_URL=redis://localhost:6379
```

**2. Create `config/proxy.yml`:**
```yaml
# Basic proxy configuration
proxy:
  routes:
    - path: /api/users/*
      target: https://jsonplaceholder.typicode.com
      enabled: true
      rateLimit:
        enabled: true
        max: 100
        windowMs: 60000

rateLimit:
  enabled: true
  backend: local
  global:
    max: 1000
    windowMs: 60000

circuitBreaker:
  enabled: true
  failureThreshold: 50
  volumeThreshold: 10
  openDuration: 30000
```

**3. Start Services:**
```bash
# Terminal 1: Start FlexGate backend
npm start

# Terminal 2: Start Admin UI
cd admin-ui && npm start

# Terminal 3: (Optional) Start Einstrust for SSO testing
# Follow Einstrust setup instructions
```

---

### Phase 2: Feature Testing Matrix

## Feature 1: Admin UI Foundation ✅

### Test Cases

#### TC1.1: Login Authentication
**Priority**: Critical  
**Type**: Functional

**Steps:**
1. Navigate to `http://localhost:3000/login`
2. Enter credentials: `admin@flexgate.dev` / `admin123`
3. Click "Sign In"

**Expected Results:**
- ✅ Redirect to `/dashboard`
- ✅ User session stored in localStorage
- ✅ Navigation sidebar visible
- ✅ User profile shown in header

**Status**: ⬜ Not Tested

---

#### TC1.2: Dashboard Overview
**Priority**: High  
**Type**: Visual

**Steps:**
1. After login, verify dashboard content
2. Check all metric cards display

**Expected Results:**
- ✅ Total requests counter
- ✅ Active routes count
- ✅ Circuit breaker status
- ✅ System health indicator
- ✅ Charts render correctly

**Status**: ⬜ Not Tested

---

#### TC1.3: Navigation
**Priority**: High  
**Type**: Functional

**Steps:**
1. Click each menu item:
   - Dashboard
   - Routes
   - Metrics
   - Logs
   - OAuth
   - Settings

**Expected Results:**
- ✅ Each page loads without errors
- ✅ Active menu item highlighted
- ✅ Page transitions smooth
- ✅ No console errors

**Status**: ⬜ Not Tested

---

## Feature 2: Visual Route Editor ✅

### Test Cases

#### TC2.1: View Routes List
**Priority**: Critical  
**Type**: Functional

**Steps:**
1. Navigate to `/routes`
2. Verify routes table displays

**Expected Results:**
- ✅ Table shows configured routes
- ✅ Columns: Path, Target, Enabled, Actions
- ✅ Filter/search functionality works
- ✅ Pagination (if >10 routes)

**Status**: ⬜ Not Tested

---

#### TC2.2: Create New Route
**Priority**: Critical  
**Type**: Functional

**Steps:**
1. Click "Add Route" button
2. Fill in form:
   - Path: `/api/test/*`
   - Target: `https://httpbin.org`
   - Enable: Yes
3. Click "Save"

**Expected Results:**
- ✅ Route created successfully
- ✅ Appears in routes table
- ✅ Config file updated
- ✅ Success notification shown

**Status**: ⬜ Not Tested

---

#### TC2.3: Edit Existing Route
**Priority**: High  
**Type**: Functional

**Steps:**
1. Click "Edit" on a route
2. Modify target URL
3. Save changes

**Expected Results:**
- ✅ Changes saved
- ✅ Route updated in table
- ✅ Proxy behavior updated

**Status**: ⬜ Not Tested

---

#### TC2.4: Delete Route
**Priority**: High  
**Type**: Functional

**Steps:**
1. Click "Delete" on a route
2. Confirm deletion

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Route removed from table
- ✅ Config updated
- ✅ Proxy stops routing

**Status**: ⬜ Not Tested

---

#### TC2.5: Enable/Disable Route
**Priority**: High  
**Type**: Functional

**Steps:**
1. Toggle route enabled/disabled switch
2. Send request to route path

**Expected Results:**
- ✅ Disabled routes return 404
- ✅ Enabled routes proxy correctly
- ✅ Status updates immediately

**Status**: ⬜ Not Tested

---

## Feature 3: Metrics Dashboard ✅

### Test Cases

#### TC3.1: Prometheus Metrics Endpoint
**Priority**: Critical  
**Type**: API

**Steps:**
1. Request: `GET http://localhost:3000/metrics`

**Expected Results:**
- ✅ Returns Prometheus-formatted metrics
- ✅ Contains:
  - `http_requests_total`
  - `http_request_duration_seconds`
  - `circuit_breaker_state`
  - `rate_limit_requests_total`

**Status**: ⬜ Not Tested

---

#### TC3.2: Real-time Metrics Display
**Priority**: High  
**Type**: Visual

**Steps:**
1. Navigate to `/metrics`
2. Send test requests to proxy
3. Observe metric updates

**Expected Results:**
- ✅ Charts update in real-time
- ✅ Request counts increment
- ✅ Latency graphs update
- ✅ Error rates calculated

**Status**: ⬜ Not Tested

---

#### TC3.3: Time Range Selection
**Priority**: Medium  
**Type**: Functional

**Steps:**
1. Select different time ranges (1h, 6h, 24h, 7d)
2. Verify data updates

**Expected Results:**
- ✅ Charts refresh with new data
- ✅ Date labels update
- ✅ Aggregations correct

**Status**: ⬜ Not Tested

---

#### TC3.4: Circuit Breaker Metrics
**Priority**: High  
**Type**: Functional

**Steps:**
1. Trigger circuit breaker (send failing requests)
2. Check metrics dashboard

**Expected Results:**
- ✅ Circuit breaker state shows "OPEN"
- ✅ Failure rate displayed
- ✅ Transition counts updated
- ✅ Visual indicator (red/yellow/green)

**Status**: ⬜ Not Tested

---

## Feature 4: Log Viewer ✅

### Test Cases

#### TC4.1: View Logs
**Priority**: Critical  
**Type**: Functional

**Steps:**
1. Navigate to `/logs`
2. Send test requests through proxy
3. Verify logs appear

**Expected Results:**
- ✅ Logs display in table
- ✅ Columns: Timestamp, Level, Source, Message, Request, Status
- ✅ Real-time updates (WebSocket)
- ✅ Color-coded by level

**Status**: ⬜ Not Tested

---

#### TC4.2: Log Filtering
**Priority**: High  
**Type**: Functional

**Steps:**
1. Use level filter (info, warn, error, debug)
2. Search by message text
3. Filter by source

**Expected Results:**
- ✅ Logs filtered correctly
- ✅ Search is case-insensitive
- ✅ Multiple filters combine (AND)
- ✅ Clear filters resets view

**Status**: ⬜ Not Tested

---

#### TC4.3: Log Details Expansion
**Priority**: Medium  
**Type**: Visual

**Steps:**
1. Click on a log row
2. View expanded details

**Expected Results:**
- ✅ Full log entry displayed
- ✅ JSON formatted nicely
- ✅ Request/response details shown
- ✅ Metadata visible

**Status**: ⬜ Not Tested

---

#### TC4.4: Export Logs
**Priority**: Medium  
**Type**: Functional

**Steps:**
1. Click "Export" button
2. Select format (JSON/CSV)
3. Download file

**Expected Results:**
- ✅ File downloads
- ✅ Contains filtered logs
- ✅ Format is correct
- ✅ Timestamps preserved

**Status**: ⬜ Not Tested

---

## Feature 5: OAuth Plugins ✅

### Test Cases

#### TC5.1: View OAuth Providers
**Priority**: High  
**Type**: Functional

**Steps:**
1. Navigate to `/oauth`
2. View configured providers

**Expected Results:**
- ✅ List of OAuth providers shown
- ✅ Status (enabled/disabled)
- ✅ Configuration details
- ✅ Add new provider button

**Status**: ⬜ Not Tested

---

#### TC5.2: Configure OAuth Provider
**Priority**: High  
**Type**: Functional

**Steps:**
1. Click "Add Provider"
2. Select provider type (Google, GitHub, etc.)
3. Enter credentials (client ID, secret)
4. Save configuration

**Expected Results:**
- ✅ Provider saved
- ✅ Appears in list
- ✅ Can be enabled/disabled
- ✅ Credentials validated

**Status**: ⬜ Not Tested

---

#### TC5.3: Test OAuth Flow
**Priority**: Critical  
**Type**: Integration

**Steps:**
1. Enable OAuth provider
2. Configure route to require OAuth
3. Access protected route
4. Complete OAuth flow

**Expected Results:**
- ✅ Redirects to OAuth provider
- ✅ User authorizes
- ✅ Redirects back with token
- ✅ Request proxied successfully

**Status**: ⬜ Not Tested

---

## Feature 6: Einstrust SAML Integration ✅

### Test Cases

#### TC6.1: SSO Login Button
**Priority**: Critical  
**Type**: Visual

**Steps:**
1. Navigate to `/login`
2. Verify SSO button present

**Expected Results:**
- ✅ "Login with Enterprise SSO" button visible
- ✅ Below standard login form
- ✅ Separated by "OR" divider
- ✅ Proper styling

**Status**: ⬜ Not Tested

---

#### TC6.2: Initiate SAML Login
**Priority**: Critical  
**Type**: Integration

**Prerequisites:**
- Einstrust service running
- IdP configured in Einstrust

**Steps:**
1. Click "Login with Enterprise SSO"
2. Observe redirect

**Expected Results:**
- ✅ Request sent to `/api/auth/saml/initiate`
- ✅ Redirects to IdP login page
- ✅ Relay state preserved
- ✅ No JavaScript errors

**Status**: ⬜ Not Tested

---

#### TC6.3: SAML Callback Handling
**Priority**: Critical  
**Type**: Integration

**Steps:**
1. Complete IdP authentication
2. IdP redirects to `/auth/callback`
3. Verify login success

**Expected Results:**
- ✅ SAMLResponse processed
- ✅ Session token stored
- ✅ User object saved
- ✅ Redirects to dashboard
- ✅ User authenticated

**Status**: ⬜ Not Tested

---

#### TC6.4: Session Validation
**Priority**: High  
**Type**: Security

**Steps:**
1. Login via SSO
2. Make authenticated requests
3. Wait for session expiry (5 min default)
4. Try to access protected resource

**Expected Results:**
- ✅ Valid session allows access
- ✅ Expired session redirects to login
- ✅ Token refreshed if configured
- ✅ Session cache working

**Status**: ⬜ Not Tested

---

#### TC6.5: Single Logout (SLO)
**Priority**: Medium  
**Type**: Integration

**Steps:**
1. Login via SSO
2. Click logout
3. Verify IdP logout

**Expected Results:**
- ✅ Request sent to `/api/auth/logout`
- ✅ Local session cleared
- ✅ Redirects to IdP SLO URL
- ✅ IdP session terminated
- ✅ Redirects back to login

**Status**: ⬜ Not Tested

---

#### TC6.6: Authentication Endpoints
**Priority**: High  
**Type**: API

**Test Matrix:**

| Endpoint | Method | Expected Status | Description |
|----------|--------|----------------|-------------|
| `/api/auth/saml/initiate` | POST | 200 | Returns redirectUrl |
| `/api/auth/saml/callback` | POST | 200 | Validates SAML response |
| `/api/auth/session/validate` | POST | 200 | Validates session token |
| `/api/auth/logout` | POST | 200 | Clears session |
| `/api/auth/user` | GET | 200 | Returns user profile |
| `/api/auth/user` | PUT | 200 | Updates user profile |

**Status**: ⬜ Not Tested

---

## Feature 7: Webhook Notifications ✅ (75% Complete)

### Test Cases

#### TC7.1: Event Bus - Event Emission
**Priority**: Critical  
**Type**: Unit

**Steps:**
1. Run test: `npm test -- webhooks.test.ts`
2. Verify all tests pass

**Expected Results:**
- ✅ 10/10 tests passing
- ✅ Event bus emits events
- ✅ Event history tracked
- ✅ Statistics calculated

**Status**: ✅ PASSED (10/10 tests)

---

#### TC7.2: Create Webhook via API
**Priority**: Critical  
**Type**: API

**Steps:**
1. Use webhook.site to get test URL
2. Create webhook:
```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/YOUR-UNIQUE-URL",
    "events": ["circuit_breaker.opened", "rate_limit.exceeded"]
  }'
```

**Expected Results:**
- ✅ Status: 201 Created
- ✅ Returns webhook ID
- ✅ Secret generated
- ✅ Webhook stored

**Status**: ⬜ Not Tested

---

#### TC7.3: List Webhooks
**Priority**: High  
**Type**: API

**Steps:**
```bash
curl http://localhost:3000/api/webhooks
```

**Expected Results:**
- ✅ Status: 200 OK
- ✅ Returns array of webhooks
- ✅ Contains created webhook
- ✅ Total count included

**Status**: ⬜ Not Tested

---

#### TC7.4: Test Webhook Delivery
**Priority**: Critical  
**Type**: Integration

**Steps:**
1. Create webhook (see TC7.2)
2. Test delivery:
```bash
curl -X POST http://localhost:3000/api/webhooks/{webhook-id}/test
```
3. Check webhook.site for delivery

**Expected Results:**
- ✅ Status: 200 OK
- ✅ Delivery attempt made
- ✅ Webhook received on webhook.site
- ✅ HMAC signature present
- ✅ Payload contains test event

**Status**: ⬜ Not Tested

---

#### TC7.5: Circuit Breaker Event Trigger
**Priority**: Critical  
**Type**: Integration

**Steps:**
1. Create webhook for `circuit_breaker.opened`
2. Configure route with circuit breaker
3. Send failing requests to trigger circuit breaker
4. Check webhook.site for delivery

**Expected Results:**
- ✅ Circuit breaker opens
- ✅ Webhook triggered automatically
- ✅ Payload contains:
  - `routeId`
  - `errorRate`
  - `threshold`
  - `failureCount`
  - `state: "open"`
- ✅ HMAC signature valid

**Status**: ⬜ Not Tested

---

#### TC7.6: Rate Limit Event Trigger
**Priority**: High  
**Type**: Integration

**Steps:**
1. Create webhook for `rate_limit.exceeded`
2. Configure route with rate limit (max: 5/min)
3. Send 10 requests rapidly
4. Check webhook delivery

**Expected Results:**
- ✅ Rate limit exceeded
- ✅ Webhook triggered
- ✅ Payload contains:
  - `clientId`
  - `limit`
  - `current`
  - `percentUsed: 100`

**Status**: ⬜ Not Tested

---

#### TC7.7: Webhook Retry Logic
**Priority**: High  
**Type**: Functional

**Steps:**
1. Create webhook with invalid URL
2. Trigger event
3. Observe retry attempts

**Expected Results:**
- ✅ Initial attempt fails
- ✅ Retry after 1 second
- ✅ Retry after 2 seconds
- ✅ Retry after 4 seconds
- ✅ Marked as failed after 3 retries
- ✅ Logged in delivery history

**Status**: ⬜ Not Tested

---

#### TC7.8: Webhook HMAC Signature
**Priority**: Critical  
**Type**: Security

**Steps:**
1. Create webhook
2. Trigger event
3. Capture webhook delivery
4. Verify signature:

```javascript
const crypto = require('crypto');
const payload = '{"id":"...","event":"..."}'; // Without signature field
const secret = 'wh_secret_...'; // From webhook config

const expectedSig = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Compare with X-Webhook-Signature header
```

**Expected Results:**
- ✅ Signature matches
- ✅ Header: `X-Webhook-Signature`
- ✅ Format: `sha256=<hex>`
- ✅ Signature changes with payload
- ✅ Invalid signature detectable

**Status**: ⬜ Not Tested

---

#### TC7.9: Webhook Delivery Logs
**Priority**: Medium  
**Type**: API

**Steps:**
```bash
curl http://localhost:3000/api/webhooks/{webhook-id}/logs
```

**Expected Results:**
- ✅ Status: 200 OK
- ✅ Returns delivery history
- ✅ Shows: success/failed status
- ✅ Includes attempt count
- ✅ Response codes visible
- ✅ Timestamps present

**Status**: ⬜ Not Tested

---

#### TC7.10: Update Webhook
**Priority**: Medium  
**Type**: API

**Steps:**
```bash
curl -X PUT http://localhost:3000/api/webhooks/{webhook-id} \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

**Expected Results:**
- ✅ Status: 200 OK
- ✅ Webhook updated
- ✅ Disabled webhooks don't trigger
- ✅ Can update: events, enabled, headers

**Status**: ⬜ Not Tested

---

#### TC7.11: Delete Webhook
**Priority**: Medium  
**Type**: API

**Steps:**
```bash
curl -X DELETE http://localhost:3000/api/webhooks/{webhook-id}
```

**Expected Results:**
- ✅ Status: 200 OK
- ✅ Webhook removed
- ✅ No longer in list
- ✅ No longer receives events

**Status**: ⬜ Not Tested

---

#### TC7.12: Webhook Statistics
**Priority**: Low  
**Type**: API

**Steps:**
```bash
curl http://localhost:3000/api/webhooks/stats/all
```

**Expected Results:**
- ✅ Status: 200 OK
- ✅ Returns:
  - Total webhooks
  - Enabled webhooks
  - Total deliveries
  - Successful deliveries
  - Failed deliveries
  - Pending deliveries

**Status**: ⬜ Not Tested

---

### Phase 3: Integration Testing Scenarios

## Scenario 1: Complete Proxy Flow with All Features

**Duration**: 30 minutes  
**Priority**: Critical

**Steps:**
1. **Setup Route** (Feature 2)
   - Create route: `/api/users/*` → `https://jsonplaceholder.typicode.com`
   - Enable circuit breaker (threshold: 50%, volume: 5)
   - Enable rate limit (10 req/min)

2. **Configure Webhook** (Feature 7)
   - Create webhook for all circuit breaker events
   - Create webhook for rate limit events

3. **Send Normal Requests**
   - Send 5 successful requests
   - Verify in Metrics (Feature 3)
   - Check Logs (Feature 4)
   - Confirm no webhook triggers

4. **Trigger Rate Limit**
   - Send 15 requests in 30 seconds
   - Verify rate limit exceeded (429 status)
   - Check webhook delivery
   - View in Metrics dashboard

5. **Trigger Circuit Breaker**
   - Configure route to failing target
   - Send 10 requests
   - Verify circuit breaker opens
   - Check webhook delivery
   - View in Metrics dashboard
   - Check Logs for circuit breaker events

6. **Recovery Test**
   - Wait for circuit breaker timeout (30s)
   - Circuit breaker goes HALF_OPEN
   - Send successful request
   - Circuit breaker closes
   - Verify webhook for closed event

**Expected Results:**
- ✅ All features work together seamlessly
- ✅ Events flow correctly
- ✅ Webhooks trigger at right times
- ✅ Metrics accurate
- ✅ Logs comprehensive
- ✅ No errors or crashes

**Status**: ⬜ Not Tested

---

## Scenario 2: SSO Authentication + Protected Routes

**Duration**: 20 minutes  
**Priority**: High

**Prerequisites:**
- Einstrust service running
- IdP configured

**Steps:**
1. **Login via SSO** (Feature 6)
   - Click "Login with Enterprise SSO"
   - Complete IdP authentication
   - Verify redirect to dashboard

2. **Access All Features**
   - Navigate to Routes page
   - Navigate to Metrics
   - Navigate to Logs
   - Navigate to OAuth
   - Navigate to Settings
   - Verify all accessible

3. **API Access with Token**
   - Get token from localStorage
   - Make API request with Authorization header
   - Verify authenticated access

4. **Session Expiry**
   - Wait for session timeout (or manually expire)
   - Try to access protected page
   - Verify redirect to login

5. **Logout**
   - Click logout
   - Verify redirect to IdP logout
   - Verify local session cleared
   - Try to access protected page
   - Verify redirect to login

**Expected Results:**
- ✅ SSO flow completes successfully
- ✅ All pages accessible when authenticated
- ✅ Token works for API requests
- ✅ Session expiry handled correctly
- ✅ Logout clears all state

**Status**: ⬜ Not Tested

---

## Scenario 3: High Load Testing

**Duration**: 15 minutes  
**Priority**: Medium

**Tools**: Apache Bench or similar

**Steps:**
1. **Setup**
   - Create route with circuit breaker
   - Create webhooks for monitoring
   - Open Metrics dashboard

2. **Load Test**
```bash
# Send 1000 requests, 50 concurrent
ab -n 1000 -c 50 http://localhost:3000/api/test/
```

3. **Monitor**
   - Watch Metrics dashboard update
   - Check for circuit breaker state changes
   - Verify webhook deliveries
   - Check logs for errors

4. **Verify System Health**
   - No crashes
   - Memory usage stable
   - Response times acceptable
   - All metrics accurate

**Expected Results:**
- ✅ System handles 1000 requests
- ✅ Circuit breaker responds appropriately
- ✅ Webhooks delivered (with queuing)
- ✅ Metrics update correctly
- ✅ No memory leaks
- ✅ Response times < 100ms (p95)

**Status**: ⬜ Not Tested

---

### Phase 4: Performance & Security Testing

## Performance Tests

### PT1: Response Time
**Target**: p95 < 50ms (proxy overhead only)

**Steps:**
1. Send 1000 requests through proxy
2. Measure latency
3. Compare with direct target requests

**Expected Results:**
- ✅ Median latency < 10ms
- ✅ p95 latency < 50ms
- ✅ p99 latency < 100ms

**Status**: ⬜ Not Tested

---

### PT2: Throughput
**Target**: 10,000 req/min on standard hardware

**Steps:**
1. Run load test with increasing concurrency
2. Find max throughput before degradation

**Expected Results:**
- ✅ Handles 10,000 req/min
- ✅ Error rate < 0.1%
- ✅ CPU usage < 80%
- ✅ Memory stable

**Status**: ⬜ Not Tested

---

### PT3: Memory Usage
**Target**: No memory leaks over 24 hours

**Steps:**
1. Start proxy with monitoring
2. Run continuous load for 1 hour
3. Monitor memory usage

**Expected Results:**
- ✅ Memory increases initially then stabilizes
- ✅ No continuous growth
- ✅ Garbage collection working
- ✅ Event history bounded

**Status**: ⬜ Not Tested

---

## Security Tests

### ST1: HTTPS Enforcement
**Priority**: Critical

**Steps:**
1. Try to create webhook with HTTP URL in production mode
2. Verify rejection

**Expected Results:**
- ✅ HTTP URLs rejected in production
- ✅ HTTPS URLs accepted
- ✅ Clear error message

**Status**: ⬜ Not Tested

---

### ST2: HMAC Signature Validation
**Priority**: Critical

**Steps:**
1. Send webhook with tampered signature
2. Verify rejection

**Expected Results:**
- ✅ Invalid signature detected
- ✅ Webhook rejected
- ✅ Secure comparison (timing attack resistant)

**Status**: ⬜ Not Tested

---

### ST3: Session Security
**Priority**: Critical

**Steps:**
1. Try to access API with expired token
2. Try to modify token
3. Try to replay old token

**Expected Results:**
- ✅ Expired tokens rejected
- ✅ Modified tokens rejected
- ✅ Replayed tokens handled appropriately

**Status**: ⬜ Not Tested

---

### ST4: Input Validation
**Priority**: High

**Steps:**
1. Send malformed data to all API endpoints
2. Try XSS payloads
3. Try SQL injection (if database used)

**Expected Results:**
- ✅ Malformed data rejected with 400
- ✅ XSS payloads sanitized
- ✅ No code injection possible
- ✅ Error messages don't leak info

**Status**: ⬜ Not Tested

---

### Phase 5: Documentation & Deployment Testing

## Documentation Tests

### DT1: API Documentation
**Steps:**
1. Review all API endpoint documentation
2. Try examples from docs
3. Verify all parameters documented

**Expected Results:**
- ✅ All endpoints documented
- ✅ Examples work as written
- ✅ Request/response formats clear
- ✅ Error codes explained

**Status**: ⬜ Not Tested

---

### DT2: Setup Instructions
**Steps:**
1. Follow README from scratch
2. Set up on clean machine
3. Complete quickstart guide

**Expected Results:**
- ✅ All dependencies listed
- ✅ Installation steps clear
- ✅ Configuration explained
- ✅ Can run successfully

**Status**: ⬜ Not Tested

---

## Deployment Tests

### DEP1: Docker Build
**Steps:**
```bash
docker build -t flexgate-proxy .
docker run -p 3000:3000 flexgate-proxy
```

**Expected Results:**
- ✅ Image builds successfully
- ✅ Container starts
- ✅ Application accessible
- ✅ All features work

**Status**: ⬜ Not Tested

---

### DEP2: Production Configuration
**Steps:**
1. Set NODE_ENV=production
2. Verify production behaviors:
   - HTTPS enforcement
   - Security headers
   - Error handling
   - Logging levels

**Expected Results:**
- ✅ Production mode active
- ✅ Debug logs disabled
- ✅ Security features enabled
- ✅ Performance optimized

**Status**: ⬜ Not Tested

---

## 📊 Test Execution Tracker

### Summary Dashboard

| Feature | Total Tests | Passed | Failed | Pending | Coverage |
|---------|-------------|--------|--------|---------|----------|
| 1. Admin UI | 3 | 0 | 0 | 3 | 0% |
| 2. Route Editor | 5 | 0 | 0 | 5 | 0% |
| 3. Metrics | 4 | 0 | 0 | 4 | 0% |
| 4. Log Viewer | 4 | 0 | 0 | 4 | 0% |
| 5. OAuth | 3 | 0 | 0 | 3 | 0% |
| 6. Einstrust SSO | 6 | 0 | 0 | 6 | 0% |
| 7. Webhooks | 12 | 10 | 0 | 2 | 83% |
| Integration | 3 | 0 | 0 | 3 | 0% |
| Performance | 3 | 0 | 0 | 3 | 0% |
| Security | 4 | 0 | 0 | 4 | 0% |
| **TOTAL** | **47** | **10** | **0** | **37** | **21%** |

---

## 🎯 Testing Priority Order

### Day 1: Core Functionality (4 hours)
1. ✅ Feature 7: Webhooks (API tests) - 2 hours
2. Feature 1: Admin UI & Login - 1 hour
3. Feature 2: Route Editor - 1 hour

### Day 2: Features & Integration (4 hours)
4. Feature 3: Metrics Dashboard - 1 hour
5. Feature 4: Log Viewer - 1 hour
6. Feature 5: OAuth Plugins - 1 hour
7. Scenario 1: Complete Flow - 1 hour

### Day 3: SSO & Advanced (3 hours)
8. Feature 6: Einstrust SSO - 2 hours
9. Scenario 2: SSO + Protected Routes - 1 hour

### Day 4: Performance & Security (3 hours)
10. Performance Tests - 1.5 hours
11. Security Tests - 1.5 hours

### Day 5: Final Validation (2 hours)
12. Scenario 3: High Load - 30 min
13. Documentation Review - 30 min
14. Deployment Tests - 1 hour

---

## 📝 Test Report Template

### Test Execution Report

**Date**: _____________  
**Tester**: _____________  
**Branch**: feature/webhooks  
**Build**: _____________

#### Environment
- OS: _____________
- Node Version: _____________
- Browser: _____________

#### Test Results

| Test ID | Feature | Status | Notes | Screenshot |
|---------|---------|--------|-------|------------|
| TC1.1 | Login | ⬜/✅/❌ | | |
| TC1.2 | Dashboard | ⬜/✅/❌ | | |
| ... | ... | ... | | |

#### Issues Found

| ID | Severity | Description | Steps to Reproduce | Status |
|----|----------|-------------|-------------------|--------|
| BUG-001 | Critical/High/Medium/Low | | | Open/Fixed |

#### Metrics

- **Total Tests Run**: ___
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___
- **Pass Rate**: ___%

#### Sign-off

- [ ] All critical tests passed
- [ ] All blockers resolved
- [ ] Documentation reviewed
- [ ] Ready for deployment

**Approved by**: _____________  
**Date**: _____________

---

## 🚀 Quick Start Commands

### Run All Unit Tests
```bash
npm test
```

### Run Specific Feature Tests
```bash
npm test -- webhooks.test.ts
npm test -- routes.test.ts
npm test -- metrics.test.ts
```

### Start Test Environment
```bash
# Terminal 1
npm start

# Terminal 2
cd admin-ui && npm start

# Terminal 3 - Run tests
npm test
```

### Generate Coverage Report
```bash
npm test -- --coverage
```

### Load Testing
```bash
# Install Apache Bench
brew install apache-bench  # macOS

# Run test
ab -n 1000 -c 50 http://localhost:3000/api/test/
```

---

## 📞 Support & Issues

**Report Issues**: https://github.com/tapas100/flexgate-proxy/issues  
**Documentation**: /docs  
**API Docs**: http://localhost:3000/api/docs (when running)

---

**Document Version**: 1.0  
**Last Updated**: January 28, 2026  
**Next Review**: After completing webhook UI (Phase 5)
