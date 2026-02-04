# FlexGate + Einstrust SAML Integration

## Overview

This document outlines how FlexGate proxy integrates with Einstrust for enterprise-grade SAML 2.0 authentication, replacing the basic email/password authentication with secure SSO.

## Architecture

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────┐
│   Admin UI      │─────▶│  FlexGate    │─────▶│  Einstrust  │
│  (React App)    │◀─────│   Proxy      │◀─────│   (SAML)    │
└─────────────────┘      └──────────────┘      └─────────────┘
                                │                      │
                                │                      │
                                ▼                      ▼
                         ┌──────────────┐      ┌─────────────┐
                         │  Backend     │      │  Identity   │
                         │  Services    │      │  Provider   │
                         └──────────────┘      └─────────────┘
```

## Why Einstrust?

1. **Product-Agnostic**: Einstrust is a standalone SAML service, not FlexGate-specific
2. **Enterprise SSO**: Supports Okta, Azure AD, Google Workspace, custom IdPs
3. **Multi-Tenant**: Isolated authentication for different organizations
4. **Security**: Assertion validation, replay prevention, certificate validation
5. **Easy Integration**: Simple REST API, no complex SAML libraries needed

## Integration Points

### 1. Admin UI Authentication Flow

**Before (Basic Auth)**:
```
User → Login Form → FlexGate API → MongoDB → JWT Token
```

**After (SAML SSO)**:
```
User → "Login with SSO" → Einstrust API → IdP (Okta/Azure) → 
       SAML Assertion → Einstrust Validation → JWT Token → FlexGate
```

### 2. API Gateway Authentication

FlexGate can optionally require SAML authentication for proxied requests:

```
Client → FlexGate → Validate Einstrust Session → Backend Service
```

## Implementation Plan

### Phase 1: Admin UI SSO (High Priority)
- ✅ Add "Login with SSO" button to Admin UI
- ✅ Integrate Einstrust SAML endpoints
- ✅ Handle SAML callback and token exchange
- ✅ Maintain session state
- ✅ Fallback to basic auth (optional)

### Phase 2: Gateway-Level Authentication (Medium Priority)
- ✅ Add Einstrust session validation middleware
- ✅ Configure per-route authentication requirements
- ✅ Cache validated sessions for performance
- ✅ Support API keys + SAML tokens

### Phase 3: Advanced Features (Low Priority)
- ⬜ Role-based access control (RBAC) from SAML attributes
- ⬜ Multi-tenant routing based on SAML assertions
- ⬜ Automatic user provisioning from SAML
- ⬜ Session management & logout

## Configuration

### FlexGate Configuration (config/proxy.yml)

```yaml
version: "2.0"
authentication:
  enabled: true
  provider: einstrust
  einstrust:
    apiUrl: https://einstrust.example.com
    # or for development: http://localhost:3001
    tenantId: your-tenant-id # optional for multi-tenant
    sessionValidation:
      enabled: true
      cacheTTL: 300 # 5 minutes
    sso:
      enabled: true
      idpId: your-idp-configuration-id
      returnUrl: https://flexgate.example.com/auth/callback
    fallbackAuth:
      enabled: true # Allow basic auth as fallback
      methods: ["basic", "apiKey"]

routes:
  - path: /api/*
    upstream: backend-service
    auth:
      required: true
      provider: einstrust # Use Einstrust for this route
      allowAnonymous: false
  
  - path: /public/*
    upstream: public-service
    auth:
      required: false # Public route, no auth needed
```

### Environment Variables

```bash
# Einstrust Configuration
EINSTRUST_API_URL=https://einstrust.example.com
EINSTRUST_TENANT_ID=your-tenant-id
EINSTRUST_IDP_ID=your-idp-id
EINSTRUST_RETURN_URL=https://flexgate.example.com/auth/callback

# Optional: Session caching
EINSTRUST_SESSION_CACHE_TTL=300
EINSTRUST_SESSION_CACHE_MAX=1000

# Optional: Fallback authentication
FLEXGATE_FALLBACK_AUTH=true
```

## API Endpoints

### Admin UI Authentication

#### 1. Initiate SSO Login
```http
POST /api/auth/saml/initiate
Content-Type: application/json

{
  "returnUrl": "https://admin.flexgate.example.com/dashboard"
}

Response:
{
  "redirectUrl": "https://idp.example.com/sso?SAMLRequest=..."
}
```

#### 2. Handle SAML Callback
```http
POST /api/auth/saml/callback
Content-Type: application/x-www-form-urlencoded

SAMLResponse=<base64-encoded-saml-assertion>
RelayState=<return-url>

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin"
  },
  "sessionId": "session-456",
  "expiresAt": "2026-01-28T12:00:00Z"
}
```

#### 3. Validate Session
```http
GET /api/auth/session
Authorization: Bearer <jwt-token>

Response:
{
  "valid": true,
  "user": { ... },
  "expiresAt": "2026-01-28T12:00:00Z"
}
```

#### 4. Logout (with SAML SLO)
```http
POST /api/auth/logout
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "sloUrl": "https://idp.example.com/slo?SAMLRequest=..." # optional
}
```

### Gateway-Level Authentication

FlexGate validates Einstrust sessions for proxied requests:

```http
GET /api/protected-resource
Authorization: Bearer <einstrust-jwt-token>

FlexGate validates token with Einstrust, then proxies to backend
```

## Code Structure

```
flexgate-proxy/
├── src/
│   ├── auth/                          # Authentication module
│   │   ├── index.ts                   # Main auth exports
│   │   ├── einstrust.ts              # Einstrust integration
│   │   ├── sessionCache.ts           # Session caching
│   │   ├── middleware.ts             # Auth middleware
│   │   └── types.ts                  # Auth types
│   ├── routes/
│   │   └── auth.ts                   # SAML auth routes
│   └── types/
│       └── index.ts                  # Add Einstrust types
├── admin-ui/
│   ├── src/
│   │   ├── services/
│   │   │   └── auth.ts              # Updated auth service
│   │   ├── components/
│   │   │   ├── LoginPage.tsx        # Add SSO button
│   │   │   └── SSOCallback.tsx      # SAML callback handler
│   │   └── hooks/
│   │       └── useAuth.ts           # Updated auth hook
└── config/
    └── proxy.yml                     # Add auth config
```

## Security Considerations

1. **Token Validation**: Always validate Einstrust JWT tokens on each request
2. **Session Caching**: Cache valid sessions to reduce Einstrust API calls
3. **HTTPS Only**: Always use HTTPS for SAML flows
4. **CSRF Protection**: Use RelayState for CSRF prevention
5. **Token Expiry**: Respect token expiration times
6. **Secure Storage**: Store tokens in httpOnly cookies (not localStorage)
7. **Audit Logging**: Log all authentication events

## Performance Optimization

### Session Caching Strategy

```typescript
interface CachedSession {
  userId: string;
  user: User;
  expiresAt: number;
  lastValidated: number;
}

// Cache valid sessions for 5 minutes
const sessionCache = new Map<string, CachedSession>();

async function validateSession(token: string): Promise<User | null> {
  const cached = sessionCache.get(token);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  
  // Validate with Einstrust
  const session = await einstrust.validateSession(token);
  
  if (session.valid) {
    sessionCache.set(token, {
      userId: session.user.id,
      user: session.user,
      expiresAt: new Date(session.expiresAt).getTime(),
      lastValidated: Date.now()
    });
    return session.user;
  }
  
  return null;
}
```

## Testing

### Unit Tests
- ✅ Einstrust client (API calls)
- ✅ Session cache (TTL, invalidation)
- ✅ Auth middleware (validation, errors)

### Integration Tests
- ✅ SSO login flow (initiate → callback → token)
- ✅ Session validation
- ✅ Logout with SLO
- ✅ Gateway authentication

### E2E Tests
- ✅ Complete SSO flow with mock IdP
- ✅ Admin UI login
- ✅ Proxied request authentication

## Migration Plan

### Step 1: Add Einstrust Integration (Non-Breaking)
- Add Einstrust client library
- Add auth middleware (disabled by default)
- Add SAML routes
- No impact on existing users

### Step 2: Update Admin UI (Optional SSO)
- Add "Login with SSO" button
- Keep existing login form
- Users can choose authentication method

### Step 3: Enable Gateway Authentication (Opt-In)
- Enable per-route authentication
- Start with non-critical routes
- Monitor performance impact

### Step 4: Full SSO Migration (Optional)
- Make SSO the default authentication
- Deprecate basic auth (optional)
- Migrate all users to SSO

## Example: Admin UI Integration

### Updated Login Page

```typescript
// admin-ui/src/components/LoginPage.tsx
import { useState } from 'react';
import { authService } from '../services/auth';

export function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleSSOLogin = async () => {
    setLoading(true);
    try {
      // Initiate SAML SSO flow
      const { redirectUrl } = await authService.initiateSSOLogin(
        window.location.origin + '/auth/callback'
      );
      
      // Redirect to IdP
      window.location.href = redirectUrl;
    } catch (error) {
      console.error('SSO login failed:', error);
      setLoading(false);
    }
  };

  const handleBasicLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      await authService.login({ email, password });
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <h1>FlexGate Admin</h1>
      
      {/* SSO Login (Primary) */}
      <button 
        onClick={handleSSOLogin} 
        disabled={loading}
        className="btn-primary btn-large"
      >
        {loading ? 'Redirecting...' : 'Login with Enterprise SSO'}
      </button>
      
      <div className="divider">OR</div>
      
      {/* Basic Login (Fallback) */}
      <form onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        handleBasicLogin(
          formData.get('email') as string,
          formData.get('password') as string
        );
      }}>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit" disabled={loading}>
          Login with Email
        </button>
      </form>
    </div>
  );
}
```

### SAML Callback Handler

```typescript
// admin-ui/src/components/SSOCallback.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';

export function SSOCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get SAML response from URL
        const params = new URLSearchParams(window.location.search);
        const samlResponse = params.get('SAMLResponse');
        const relayState = params.get('RelayState');

        if (!samlResponse) {
          throw new Error('No SAML response received');
        }

        // Process SAML callback
        await authService.handleSSOCallback(samlResponse, relayState);
        
        // Redirect to return URL or dashboard
        const returnUrl = relayState || '/dashboard';
        navigate(returnUrl);
      } catch (err) {
        console.error('SAML callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="error-page">
        <h2>Authentication Failed</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="loading-page">
      <h2>Completing Sign-In...</h2>
      <div className="spinner" />
    </div>
  );
}
```

## Deployment

### Development Setup

```bash
# 1. Start Einstrust (separate service)
cd /Users/tamahant/Documents/GitHub/einstrust
npm run dev

# 2. Start FlexGate with Einstrust integration
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
export EINSTRUST_API_URL=http://localhost:3001
export EINSTRUST_IDP_ID=your-idp-id
npm run dev

# 3. Configure IdP in Einstrust
curl -X POST http://localhost:3001/api/admin/idps \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Corporate IdP",
    "metadataUrl": "https://idp.example.com/metadata"
  }'
```

### Production Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  einstrust:
    image: einstrust:latest
    ports:
      - "3001:3001"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/einstrust
      - JWT_SECRET=${EINSTRUST_JWT_SECRET}
      - NODE_ENV=production
    depends_on:
      - mongo

  flexgate:
    image: flexgate-proxy:latest
    ports:
      - "3000:3000"
    environment:
      - EINSTRUST_API_URL=http://einstrust:3001
      - EINSTRUST_TENANT_ID=${TENANT_ID}
      - EINSTRUST_IDP_ID=${IDP_ID}
      - NODE_ENV=production
    depends_on:
      - einstrust

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

## Monitoring & Metrics

Track Einstrust integration health:

```typescript
// Prometheus metrics
einstrust_api_calls_total{endpoint, status}
einstrust_api_duration_seconds{endpoint}
einstrust_session_validations_total{result}
einstrust_session_cache_hits_total
einstrust_session_cache_misses_total
```

## Troubleshooting

### Common Issues

1. **"Invalid SAML Response"**
   - Check clock synchronization
   - Verify certificate is not expired
   - Check Einstrust logs

2. **"Session validation failed"**
   - Verify Einstrust API URL is correct
   - Check network connectivity
   - Verify JWT token is not expired

3. **"Redirect loop"**
   - Check returnUrl configuration
   - Verify callback URL is whitelisted in IdP

4. **Performance issues**
   - Enable session caching
   - Increase cache TTL
   - Monitor Einstrust API latency

## Next Steps

1. ✅ Review this integration plan
2. ✅ Implement Einstrust client library
3. ✅ Add auth middleware to FlexGate
4. ✅ Update Admin UI with SSO login
5. ✅ Test with Einstrust mock IdP
6. ✅ Deploy to staging
7. ✅ Production rollout

## References

- **Einstrust Repo**: https://github.com/tapas100/einstrust
- **Einstrust PR #12**: https://github.com/tapas100/einstrust/pull/12
- **SAML 2.0 Spec**: http://docs.oasis-open.org/security/saml/
- **FlexGate Docs**: /docs/architecture.md
