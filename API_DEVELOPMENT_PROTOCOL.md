# API Development Protocol
**Effective Date:** 2026-01-28  
**Status:** MANDATORY for all new features  
**Purpose:** Prevent frontend-backend API mismatches

---

## 🎯 Core Principle

> **"No Frontend UI without Backend API, No Backend API without OpenAPI Spec"**

---

## 📋 Phase-Gate Checklist

### Phase 0: Planning ✅
**Exit Criteria:** API contract approved

- [ ] Feature specification written
- [ ] API endpoints designed and documented
- [ ] OpenAPI specification created
- [ ] Data models defined (shared types)
- [ ] Review completed and approved
- [ ] Create tracking ticket in API_IMPLEMENTATION_STATUS.md

**Artifacts:**
- `docs/features/FEATURE_X_SPEC.md`
- `docs/api/openapi.yaml` (updated)
- `packages/shared-types/src/feature-x.ts`

---

### Phase 1: Backend Implementation ✅
**Exit Criteria:** All endpoints working and tested

- [ ] Route file created (`routes/feature-x.ts`)
- [ ] All endpoints implemented per OpenAPI spec
- [ ] Request validation added (using Joi/Zod)
- [ ] Response format matches spec exactly
- [ ] Error handling standardized
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests pass
- [ ] Mounted in `app.ts`
- [ ] Postman collection updated

**Artifacts:**
- `routes/feature-x.ts`
- `routes/__tests__/feature-x.test.ts`
- `postman/collections/feature-x.json`

**Validation:**
```bash
npm run test:backend
npm run validate:openapi
curl http://localhost:3000/api/feature-x  # Must work
```

---

### Phase 2: Frontend Implementation ✅
**Exit Criteria:** UI connected to real APIs

- [ ] Service layer created (`services/feature-x.ts`)
- [ ] Uses shared types from `@flexgate/types`
- [ ] API calls match OpenAPI spec
- [ ] Error handling implemented
- [ ] Loading states handled
- [ ] Service tests written (mocked)
- [ ] Page components created
- [ ] Component tests written
- [ ] No hardcoded mock data in production code

**Artifacts:**
- `admin-ui/src/services/feature-x.ts`
- `admin-ui/src/services/__tests__/feature-x.test.ts`
- `admin-ui/src/pages/FeatureX/`
- `admin-ui/src/pages/FeatureX/__tests__/`

**Validation:**
```bash
npm run test:frontend
npm run lint
# Check: No mock data in service layer
grep -r "generateMock" admin-ui/src/services/  # Should be empty
```

---

### Phase 3: Integration Testing ✅
**Exit Criteria:** Frontend + Backend working together

- [ ] E2E tests written (Playwright)
- [ ] Contract tests pass (Pact)
- [ ] Manual testing completed
- [ ] Error scenarios tested
- [ ] Performance acceptable (<2s load time)
- [ ] No console errors in browser
- [ ] No 404/500 errors in network tab

**Artifacts:**
- `tests/e2e/feature-x.spec.ts`
- `tests/contract/feature-x.contract.test.ts`

**Validation:**
```bash
npm run test:e2e
npm run test:contract
npm run test:integration
```

---

### Phase 4: Documentation ✅
**Exit Criteria:** Everything documented

- [ ] API documentation complete
- [ ] Code comments added
- [ ] README updated
- [ ] CHANGELOG.md entry added
- [ ] API_IMPLEMENTATION_STATUS.md updated
- [ ] Migration guide (if breaking changes)

**Artifacts:**
- `docs/api/feature-x.md`
- `CHANGELOG.md`
- `API_IMPLEMENTATION_STATUS.md`

---

### Phase 5: Deployment ✅
**Exit Criteria:** Feature live in production

- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] Database migrations run (if any)
- [ ] Environment variables configured
- [ ] Monitoring alerts configured
- [ ] Rollback plan ready
- [ ] Smoke tests pass in production

---

## 🚫 Definition of BLOCKED

A feature is **BLOCKED** and cannot proceed if:

1. ❌ OpenAPI spec doesn't exist for the endpoint
2. ❌ Backend endpoint returns 404
3. ❌ Response format doesn't match spec
4. ❌ No integration tests exist
5. ❌ Frontend uses hardcoded mock data
6. ❌ API_IMPLEMENTATION_STATUS.md not updated

**Action:** Stop development, fix blocking issue first.

---

## 📐 API Design Standards

### 1. Endpoint Naming

```
✅ GOOD:
GET    /api/routes           # List all
GET    /api/routes/:id       # Get one
POST   /api/routes           # Create
PUT    /api/routes/:id       # Update (full)
PATCH  /api/routes/:id       # Update (partial)
DELETE /api/routes/:id       # Delete
POST   /api/routes/:id/test  # Action

❌ BAD:
GET    /api/getRoutes
POST   /api/createRoute
GET    /api/route/:id
DELETE /api/removeRoute/:id
```

### 2. Response Format

All responses MUST use this format:

```typescript
// Success
{
  "success": true,
  "data": <T>  // The actual data
}

// Error
{
  "success": false,
  "error": "Human readable message",
  "code": "ERROR_CODE",  // Machine readable
  "details": {}          // Optional debug info
}

// Paginated
{
  "success": true,
  "data": <T[]>,
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### 3. HTTP Status Codes

```typescript
200 OK          // Success (GET, PUT, PATCH)
201 Created     // Success (POST)
204 No Content  // Success (DELETE)
400 Bad Request // Validation error
401 Unauthorized// Not authenticated
403 Forbidden   // Authenticated but not authorized
404 Not Found   // Resource doesn't exist
409 Conflict    // Resource already exists
422 Unprocessable Entity // Business logic error
500 Internal Server Error // Server error
503 Service Unavailable // Downstream error
```

### 4. Request Validation

```typescript
// Use Zod or Joi
import { z } from 'zod';

const CreateRouteSchema = z.object({
  path: z.string().min(1).regex(/^\//),
  upstream: z.string().min(1),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])),
  enabled: z.boolean().optional().default(true),
});

router.post('/', validate(CreateRouteSchema), async (req, res) => {
  // req.body is now typed and validated
});
```

---

## 🔧 Shared Types System

### Setup

```bash
# Create shared types package
mkdir -p packages/shared-types
cd packages/shared-types
npm init -y

# Install dependencies
npm install --save-dev typescript

# Create tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true
  }
}
```

### Usage

```typescript
// packages/shared-types/src/routes.ts
export interface Route {
  id: string;
  path: string;
  upstream: string;
  methods: HttpMethod[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Backend (routes/routes.ts)
import { Route } from '@flexgate/types';

router.get('/', async (req: Request, res: Response) => {
  const routes: Route[] = await getRoutes();
  res.json({ success: true, data: routes });
});

// Frontend (services/routes.ts)
import { Route } from '@flexgate/types';

async getRoutes(): Promise<ApiResponse<Route[]>> {
  return apiService.get<Route[]>('/api/routes');
}
```

---

## 📊 API Implementation Tracker

Create `API_IMPLEMENTATION_STATUS.md`:

```markdown
# API Implementation Status

Last Updated: 2026-01-28

## Legend
- ✅ Complete & Tested
- 🚧 In Progress
- ❌ Not Started
- ⚠️ Blocked

---

## Routes API (`/api/routes`)

| Endpoint | Method | Backend | Frontend | Tests | Status |
|----------|--------|---------|----------|-------|--------|
| List routes | GET /api/routes | ❌ | ✅ | ❌ | ⚠️ BLOCKED |
| Get route | GET /api/routes/:id | ❌ | ✅ | ❌ | ⚠️ BLOCKED |
| Create route | POST /api/routes | ❌ | ✅ | ❌ | ⚠️ BLOCKED |
| Update route | PUT /api/routes/:id | ❌ | ✅ | ❌ | ⚠️ BLOCKED |
| Delete route | DELETE /api/routes/:id | ❌ | ✅ | ❌ | ⚠️ BLOCKED |
| Test route | POST /api/routes/:id/test | ❌ | ✅ | ❌ | ⚠️ BLOCKED |

**Blocking Reason:** Backend endpoints don't exist
**Assigned To:** (Developer name)
**Target Date:** (Date)
**Priority:** P0 - Critical

---

## Authentication API (`/api/auth`)

| Endpoint | Method | Backend | Frontend | Tests | Status |
|----------|--------|---------|----------|-------|--------|
| Login | POST /api/auth/login | ✅ | ✅ | ✅ | ✅ Complete |
| SAML SSO | POST /api/auth/saml/initiate | ✅ | ✅ | ✅ | ✅ Complete |
| Logout | POST /api/auth/logout | ✅ | ✅ | ✅ | ✅ Complete |
| Register | POST /api/auth/register | ❌ | ✅ | ❌ | 🚧 In Progress |

---

## Update Process

1. Create ticket for each missing endpoint
2. Update status when work starts (❌ → 🚧)
3. Update when backend complete (🚧 → Testing)
4. Update when all tests pass (Testing → ✅)
5. Review weekly in team meeting
```

---

## 🧪 Contract Testing

### Setup Pact

```bash
npm install --save-dev @pact-foundation/pact
```

### Write Contract Tests

```typescript
// tests/contract/routes.contract.test.ts
import { Pact } from '@pact-foundation/pact';
import { routeService } from '../admin-ui/src/services/routes';

describe('Routes API Contract', () => {
  const provider = new Pact({
    consumer: 'admin-ui',
    provider: 'flexgate-api',
    port: 8080,
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());
  afterEach(() => provider.verify());

  describe('GET /api/routes', () => {
    it('should return array of routes', async () => {
      await provider.addInteraction({
        state: 'routes exist',
        uponReceiving: 'a request for all routes',
        withRequest: {
          method: 'GET',
          path: '/api/routes',
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            success: true,
            data: eachLike({
              id: string(),
              path: string(),
              upstream: string(),
              methods: eachLike(string()),
              enabled: boolean(),
            }),
          },
        },
      });

      const result = await routeService.getRoutes();
      expect(result.success).toBe(true);
    });
  });
});
```

### Run Contract Tests

```bash
# Generate contract from consumer
npm run test:contract:consumer

# Verify provider honors contract
npm run test:contract:provider
```

---

## 📝 OpenAPI Specification

### Template

```yaml
# docs/api/openapi.yaml
openapi: 3.0.0
info:
  title: FlexGate API
  version: 1.0.0
  description: API for FlexGate Proxy management

servers:
  - url: http://localhost:3000
    description: Development server

paths:
  /api/routes:
    get:
      summary: List all routes
      tags: [Routes]
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Route'
    
    post:
      summary: Create a new route
      tags: [Routes]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateRouteRequest'
      responses:
        '201':
          description: Route created
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/Route'

components:
  schemas:
    Route:
      type: object
      required:
        - id
        - path
        - upstream
        - methods
      properties:
        id:
          type: string
          example: "route-123"
        path:
          type: string
          example: "/api/users"
        upstream:
          type: string
          example: "users-service"
        methods:
          type: array
          items:
            type: string
            enum: [GET, POST, PUT, DELETE, PATCH]
        enabled:
          type: boolean
          default: true
        createdAt:
          type: integer
          format: int64
        updatedAt:
          type: integer
          format: int64
    
    CreateRouteRequest:
      type: object
      required:
        - path
        - upstream
        - methods
      properties:
        path:
          type: string
        upstream:
          type: string
        methods:
          type: array
          items:
            type: string
        enabled:
          type: boolean
```

### Validation

```bash
# Install validator
npm install -g @stoplight/spectral-cli

# Validate spec
spectral lint docs/api/openapi.yaml

# Generate docs
npm install -g @redocly/cli
redocly build-docs docs/api/openapi.yaml -o docs/api/index.html
```

---

## 🔍 Code Review Checklist

### For Backend PRs

- [ ] OpenAPI spec updated?
- [ ] Endpoint matches spec exactly?
- [ ] Using shared types?
- [ ] Request validation added?
- [ ] Error handling standardized?
- [ ] Tests cover all scenarios?
- [ ] API_IMPLEMENTATION_STATUS.md updated?
- [ ] No breaking changes without migration guide?

### For Frontend PRs

- [ ] Service layer uses correct endpoint?
- [ ] Using shared types?
- [ ] Error states handled?
- [ ] Loading states shown?
- [ ] No hardcoded mock data?
- [ ] Tests use proper mocks?
- [ ] API_IMPLEMENTATION_STATUS.md updated?

---

## 🚀 Quick Start for New Features

### 1. Use Feature Template

```bash
# Copy template
cp docs/templates/FEATURE_TEMPLATE.md docs/features/FEATURE_X_SPEC.md

# Fill out sections:
# - User stories
# - API endpoints table
# - Data models
# - UI mockups
```

### 2. Design API First

```bash
# Update OpenAPI spec
vim docs/api/openapi.yaml

# Validate
spectral lint docs/api/openapi.yaml

# Generate types
npm run generate:types
```

### 3. Create Shared Types

```typescript
// packages/shared-types/src/feature-x.ts
export interface FeatureX {
  id: string;
  name: string;
  // ...
}
```

### 4. Implement Backend

```typescript
// routes/feature-x.ts
import { Router } from 'express';
import { FeatureX } from '@flexgate/types';

const router = Router();

router.get('/', async (req, res) => {
  const data: FeatureX[] = await getFeatureX();
  res.json({ success: true, data });
});

export default router;
```

### 5. Mount Route

```typescript
// app.ts
import featureXRoutes from './routes/feature-x';
app.use('/api/feature-x', featureXRoutes);
```

### 6. Test Backend

```bash
curl http://localhost:3000/api/feature-x
# Should return: {"success": true, "data": [...]}
```

### 7. Implement Frontend

```typescript
// admin-ui/src/services/feature-x.ts
import { FeatureX } from '@flexgate/types';
import { apiService } from './api';

export const featureXService = {
  async getAll(): Promise<ApiResponse<FeatureX[]>> {
    return apiService.get<FeatureX[]>('/api/feature-x');
  },
};
```

### 8. Add E2E Test

```typescript
// tests/e2e/feature-x.spec.ts
test('should load feature X', async ({ page }) => {
  await page.goto('/feature-x');
  await expect(page.locator('table')).toBeVisible();
  // Verify no 404 errors
});
```

### 9. Update Tracker

```markdown
# API_IMPLEMENTATION_STATUS.md
## Feature X API
| Endpoint | Status |
|----------|--------|
| GET /api/feature-x | ✅ Complete |
```

---

## 📚 Required Reading

Before starting any feature:

1. This protocol (API_DEVELOPMENT_PROTOCOL.md)
2. OpenAPI specification (docs/api/openapi.yaml)
3. Shared types package (packages/shared-types/)
4. API implementation status (API_IMPLEMENTATION_STATUS.md)

---

## ⚡ Emergency Procedure

If you discover a missing endpoint in production:

1. **Immediate**: Create mock endpoint returning empty data
2. **24h**: File critical bug ticket
3. **48h**: Implement real endpoint
4. **72h**: Deploy fix
5. **Post-mortem**: Update this protocol

---

## 📞 Support

Questions about this protocol?
- Ask in #api-development Slack channel
- Review with tech lead before starting
- Update protocol if you find gaps

---

**Remember:** API contracts are binding agreements between frontend and backend. Treat them as seriously as public APIs.
