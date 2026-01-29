# Frontend-Backend API Audit Report
**Date:** 2026-01-28  
**Purpose:** Identify all missing backend endpoints that frontend expects

## Executive Summary

The admin UI frontend was built with complete service layers expecting full REST APIs, but several backend endpoints are missing or incomplete. This audit maps all expected endpoints against actual implementations.

---

## 🔴 CRITICAL: Missing Backend Endpoints

### 1. Routes Management API (`/api/routes`)
**Status:** ❌ COMPLETELY MISSING  
**Frontend Service:** `admin-ui/src/services/routes.ts`  
**Impact:** HIGH - Core feature, Routes page shows 404 errors

#### Expected Endpoints:
- `GET /api/routes` - List all routes
- `GET /api/routes/:id` - Get single route
- `POST /api/routes` - Create new route
- `PUT /api/routes/:id` - Update route
- `DELETE /api/routes/:id` - Delete route
- `PUT /api/routes/:id` - Toggle route enable/disable
- `POST /api/routes/:id/test` - Test route connectivity

#### Frontend Usage:
- `RouteList.tsx` - Loads routes on mount
- `RouteDialog.tsx` - Create/Edit routes
- Navigation sidebar has "Routes" link

#### Implementation Required:
```typescript
// Need to create: routes/routes.ts
// Mount in app.ts: app.use('/api/routes', routeRoutes);
```

---

### 2. Metrics API (`/api/metrics`)
**Status:** ❌ MISSING (Commented out in frontend)  
**Frontend Service:** `admin-ui/src/services/metrics.ts`  
**Impact:** MEDIUM - Metrics page exists but uses mock data

#### Expected Endpoints:
- `GET /api/metrics?range={timeRange}` - Get metrics data
- `GET /api/metrics/slo` - Get SLO metrics

#### Frontend Usage:
- Lines 95, 143 in `metrics.ts` are commented out
- Currently using mock data generators

#### Notes:
- Frontend service exists but API calls are disabled
- Prometheus metrics exist in backend but no REST API wrapper

---

### 3. Logs API (`/api/logs`)
**Status:** ❌ MISSING (Using mock data)  
**Frontend Service:** `admin-ui/src/services/logs.ts`  
**Impact:** MEDIUM - Logs page shows mock data only

#### Expected Endpoints:
- `GET /api/logs?limit&offset&filter` - Fetch logs with pagination
- `GET /api/logs/:id` - Get single log entry
- `GET /api/logs/stats` - Get log statistics
- `WebSocket /api/logs/stream` - Real-time log streaming

#### Frontend Usage:
- `LogService` class has full implementation
- Currently generates mock logs (line 17)

#### Notes:
- Winston logging exists in backend
- Need REST API to expose logs
- WebSocket support for real-time logs

---

### 4. OAuth Providers API (`/api/oauth`)
**Status:** ❌ MISSING (Using mock data)  
**Frontend Service:** `admin-ui/src/services/oauth.ts`  
**Impact:** LOW - OAuth page exists but non-functional

#### Expected Endpoints:
- `GET /api/oauth/providers` - List OAuth providers
- `GET /api/oauth/providers/:id` - Get provider details
- `POST /api/oauth/providers` - Create OAuth provider
- `PUT /api/oauth/providers/:id` - Update provider
- `DELETE /api/oauth/providers/:id` - Delete provider
- `PUT /api/oauth/providers/:id/toggle` - Enable/disable
- `POST /api/oauth/providers/:id/test` - Test OAuth flow
- `GET /api/oauth/providers/:id/stats` - Get provider stats
- `GET /api/oauth/providers/:id/logs` - Get login logs

#### Frontend Usage:
- `OAuthProviders.tsx` page component
- Full CRUD interface built

---

### 5. Additional Auth Endpoints
**Status:** ⚠️ PARTIALLY MISSING  
**Frontend Service:** `admin-ui/src/services/auth.ts`

#### Missing:
- ❌ `POST /api/auth/register` - User registration
- ❌ `GET /api/auth/validate` - Token validation

#### Existing:
- ✅ `POST /api/auth/login` - Login (just added)
- ✅ `POST /api/auth/saml/initiate` - SSO initiate
- ✅ `POST /api/auth/logout` - Logout
- ✅ `GET /api/auth/session` - Session validation
- ✅ `GET /api/auth/status` - Auth status

---

## ✅ Implemented Backend Endpoints

### Authentication API (`/api/auth`)
**File:** `routes/auth.ts`  
**Mounted:** ✅ `app.use('/api/auth', authRoutes)`

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/api/auth/login` | ✅ | Just added for testing |
| POST | `/api/auth/saml/initiate` | ✅ | SAML SSO |
| POST | `/api/auth/saml/callback` | ✅ | SAML callback |
| GET | `/api/auth/session` | ✅ | Session validation |
| POST | `/api/auth/logout` | ✅ | Logout |
| GET | `/api/auth/status` | ✅ | System status |
| GET | `/api/auth/metadata/:tenantId?` | ✅ | SAML metadata |
| GET | `/api/auth/cache/stats` | ✅ | Cache statistics |
| POST | `/api/auth/cache/clear` | ✅ | Clear cache |

---

### Webhooks API (`/api/webhooks`)
**File:** `routes/webhooks.ts`  
**Mounted:** ✅ `app.use('/api/webhooks', webhookRoutes)`  
**Status:** ✅ COMPLETE (Feature 7)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/api/webhooks` | ✅ | List webhooks |
| GET | `/api/webhooks/:id` | ✅ | Get webhook |
| POST | `/api/webhooks` | ✅ | Create webhook |
| PUT | `/api/webhooks/:id` | ✅ | Update webhook |
| DELETE | `/api/webhooks/:id` | ✅ | Delete webhook |
| POST | `/api/webhooks/:id/test` | ✅ | Test webhook |
| GET | `/api/webhooks/:id/logs` | ✅ | Webhook delivery logs |
| GET | `/api/webhooks/stats/all` | ✅ | Webhook statistics |

---

## 📊 Feature Completion Matrix

| Feature | Frontend | Backend | Status |
|---------|----------|---------|--------|
| Authentication (SAML) | ✅ | ✅ | Complete |
| Authentication (Basic) | ✅ | ⚠️ | Login only |
| Routes Management | ✅ | ❌ | **MISSING** |
| Metrics Dashboard | ✅ | ⚠️ | Mock data |
| Logs Viewer | ✅ | ⚠️ | Mock data |
| OAuth Providers | ✅ | ❌ | **MISSING** |
| Webhooks | ✅ | ✅ | Complete |
| Settings | ✅ | ❌ | **MISSING** |

---

## 🚨 Root Cause Analysis

### Why This Happened:

1. **No API Contract Definition**
   - Frontend and backend developed separately
   - No OpenAPI/Swagger specification
   - No shared TypeScript types between frontend/backend

2. **Feature Documentation Incomplete**
   - FEATURE_2_SPEC.md exists but backend not implemented
   - UI was built ahead of backend APIs
   - Mock data made testing possible but hid the gaps

3. **No Integration Testing**
   - Tests use mocked services
   - No E2E tests verifying actual API calls
   - No CI/CD validating frontend-backend contracts

4. **Incremental Feature Development**
   - Some features complete (Webhooks)
   - Others incomplete (Routes, OAuth)
   - No tracking of API implementation status

---

## 🛡️ Prevention Protocol: API Development Standards

### 1. API-First Development

#### Before Writing Code:
```yaml
# Create: docs/api-contract.yaml (OpenAPI 3.0)
openapi: 3.0.0
info:
  title: FlexGate API
  version: 1.0.0
paths:
  /api/routes:
    get:
      summary: List all routes
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Route'
```

#### Checklist:
- [ ] OpenAPI spec created FIRST
- [ ] Frontend types generated from spec
- [ ] Backend validates against spec
- [ ] Contract tests verify both sides

---

### 2. Shared Type Definitions

```typescript
// Create: packages/shared-types/src/index.ts
export interface Route {
  id: string;
  path: string;
  upstream: string;
  methods: string[];
  enabled: boolean;
  // ... shared between frontend & backend
}
```

#### Implementation:
```bash
# Project structure
flexgate-proxy/
├── packages/
│   └── shared-types/      # Shared TypeScript types
│       ├── package.json
│       └── src/
│           ├── routes.ts
│           ├── auth.ts
│           └── index.ts
├── admin-ui/              # Uses @flexgate/types
└── src/                   # Uses @flexgate/types
```

---

### 3. API Implementation Tracker

```markdown
# API_IMPLEMENTATION_STATUS.md

## Routes API (/api/routes)
- [ ] GET /api/routes - List routes
  - [ ] Backend endpoint created
  - [ ] Frontend service created
  - [ ] Integration test passing
  - [ ] E2E test passing
- [ ] POST /api/routes - Create route
  - [ ] Backend endpoint created
  - [ ] Frontend service created
  - [ ] Integration test passing
  - [ ] E2E test passing
```

---

### 4. Contract Testing

```typescript
// tests/contract/routes.contract.test.ts
import { Pact } from '@pact-foundation/pact';

describe('Routes API Contract', () => {
  const provider = new Pact({
    consumer: 'admin-ui',
    provider: 'flexgate-api',
  });

  it('should list all routes', async () => {
    await provider
      .given('routes exist')
      .uponReceiving('a request for all routes')
      .withRequest({
        method: 'GET',
        path: '/api/routes',
      })
      .willRespondWith({
        status: 200,
        body: Matchers.eachLike({
          id: Matchers.string(),
          path: Matchers.string(),
        }),
      });
  });
});
```

---

### 5. Development Workflow

#### Phase 1: Design
1. Create feature specification
2. Design API contract (OpenAPI)
3. Generate TypeScript types
4. Review with team

#### Phase 2: Backend
1. Implement endpoints
2. Add unit tests
3. Validate against OpenAPI spec
4. Document in API tracker

#### Phase 3: Frontend
1. Use generated types
2. Implement service layer
3. Create UI components
4. Add component tests

#### Phase 4: Integration
1. Run contract tests
2. Run E2E tests
3. Update API tracker
4. Mark feature complete

---

### 6. Pre-Commit Checklist

```bash
# .github/workflows/api-validation.yml
name: API Contract Validation

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Validate OpenAPI Spec
        run: npm run validate:openapi
      
      - name: Generate Types
        run: npm run generate:types
      
      - name: Run Contract Tests
        run: npm run test:contract
      
      - name: Check API Tracker
        run: npm run check:api-status
```

---

### 7. Documentation Requirements

Every feature MUST have:

1. **Feature Spec** (`FEATURE_X_SPEC.md`)
   - User stories
   - **API endpoints table** ← CRITICAL
   - Data models
   - UI mockups

2. **API Documentation** (`docs/api/routes.md`)
   - Endpoint descriptions
   - Request/response examples
   - Error codes
   - Rate limits

3. **Implementation Status** (`API_IMPLEMENTATION_STATUS.md`)
   - Track each endpoint
   - Link to tests
   - Deployment status

---

## 🎯 Immediate Action Items

### Priority 1: Complete Core Features
1. ✅ Implement `/api/routes` endpoints (Routes management)
2. ⚠️ Implement `/api/logs` endpoints (Logs API)
3. ⚠️ Implement `/api/metrics` wrapper (Metrics API)

### Priority 2: Setup Prevention Systems
1. Create OpenAPI specification
2. Setup shared types package
3. Add contract testing framework
4. Create API implementation tracker

### Priority 3: Documentation
1. Document all existing APIs
2. Create API development guide
3. Update feature specs with API details

---

## 📝 Recommended Implementation Order

### Week 1: Routes API (Critical)
**File:** `routes/routes.ts`
- All CRUD operations
- Route testing endpoint
- Mount in app.ts
- Add integration tests

### Week 2: Logs API (Important)
**File:** `routes/logs.ts`
- Log fetching with filters
- Real-time streaming (WebSocket)
- Log statistics
- Mount in app.ts

### Week 3: Metrics API (Important)
**File:** `routes/metrics.ts`
- Wrap Prometheus metrics
- Time-range queries
- SLO calculations
- Mount in app.ts

### Week 4: OAuth API (Medium)
**File:** `routes/oauth.ts`
- OAuth provider management
- Provider statistics
- Login logs
- Mount in app.ts

### Week 5: Prevention Systems
- OpenAPI spec
- Contract tests
- Shared types
- CI/CD validation

---

## 🔧 Quick Fix for Testing

To unblock E2E testing immediately:

```typescript
// Temporary mock endpoints in app.ts
app.get('/api/routes', (req, res) => {
  res.json({ success: true, data: [] });
});

app.get('/api/logs', (req, res) => {
  res.json({ success: true, data: { logs: [], total: 0 } });
});

// Mark with TODO for proper implementation
```

---

## 📚 References

- Feature Specs: `/docs/features/`
- API Docs: `/docs/api/` (to be created)
- OpenAPI Spec: `/docs/openapi.yaml` (to be created)
- Implementation Status: `/API_IMPLEMENTATION_STATUS.md` (to be created)

---

**Next Steps:**
1. Review this audit with team
2. Prioritize missing endpoints
3. Implement Routes API first (blocking tests)
4. Setup prevention protocols
5. Update all documentation
