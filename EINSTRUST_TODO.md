# FlexGate + Einstrust Integration Checklist

## ✅ Phase 1: Backend Integration (COMPLETE)

- [x] Create authentication type definitions (`src/auth/types.ts`)
- [x] Implement Einstrust API client (`src/auth/einstrust.ts`)
- [x] Implement session cache (`src/auth/sessionCache.ts`)
- [x] Create authentication middleware (`src/auth/middleware.ts`)
- [x] Create main auth module (`src/auth/index.ts`)
- [x] Add auth routes (`routes/auth.ts`)
- [x] Update Admin UI auth service with SSO methods
- [x] Write comprehensive integration documentation
- [x] Write implementation summary

**Total**: 9 files created/modified, ~1,400 LOC

---

## 🔄 Phase 2: Application Integration (TODO)

### Step 1: Update Main Application (app.ts)

```typescript
// Add to app.ts after config loading

import { initializeAuth } from './src/auth';
import authRoutes from './routes/auth';

// Initialize authentication
const einstrustConfig = {
  apiUrl: process.env.EINSTRUST_API_URL || 'http://localhost:3001',
  tenantId: process.env.EINSTRUST_TENANT_ID,
  sessionValidation: {
    enabled: true,
    cacheTTL: parseInt(process.env.EINSTRUST_SESSION_CACHE_TTL || '300'),
  },
  sso: {
    enabled: true,
    idpId: process.env.EINSTRUST_IDP_ID || '',
    returnUrl: process.env.EINSTRUST_RETURN_URL || 'http://localhost:3000/auth/callback',
  },
  fallbackAuth: {
    enabled: process.env.FLEXGATE_FALLBACK_AUTH === 'true',
    methods: ['basic', 'apiKey'],
  },
};

// Only initialize if Einstrust is configured
if (process.env.EINSTRUST_API_URL) {
  try {
    initializeAuth(einstrustConfig);
    logger.info('Einstrust authentication enabled');
  } catch (error) {
    logger.error('Failed to initialize Einstrust', { error });
  }
}

// Mount auth routes
app.use('/api/auth', authRoutes);
```

**Files to modify**: `app.ts`

---

### Step 2: Create Admin UI Components

#### 2.1 Create SSO Callback Component

File: `admin-ui/src/components/SSOCallback.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';

export function SSOCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const samlResponse = searchParams.get('SAMLResponse');
        const relayState = searchParams.get('RelayState');

        if (!samlResponse) {
          throw new Error('No SAML response received');
        }

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
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="error-container">
        <h2>Authentication Failed</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="loading-container">
      <h2>Completing Sign-In...</h2>
      <div className="spinner" />
    </div>
  );
}
```

#### 2.2 Update Login Page

File: `admin-ui/src/pages/LoginPage.tsx` (or wherever login component is)

Add SSO button:

```typescript
const handleSSOLogin = async () => {
  setLoading(true);
  try {
    const { redirectUrl } = await authService.initiateSSOLogin(
      window.location.origin + '/auth/callback'
    );
    
    // Redirect to IdP
    window.location.href = redirectUrl;
  } catch (error) {
    console.error('SSO login failed:', error);
    setError(error instanceof Error ? error.message : 'SSO login failed');
    setLoading(false);
  }
};

// In JSX:
<button 
  onClick={handleSSOLogin} 
  disabled={loading}
  className="sso-button"
>
  {loading ? 'Redirecting...' : 'Login with Enterprise SSO'}
</button>
```

#### 2.3 Update Routing

File: `admin-ui/src/App.tsx` (or routes file)

Add SSO callback route:

```typescript
import { SSOCallback } from './components/SSOCallback';

// In routes:
<Route path="/auth/callback" element={<SSOCallback />} />
```

**Files to create/modify**: 
- `admin-ui/src/components/SSOCallback.tsx` (new)
- `admin-ui/src/pages/LoginPage.tsx` (update)
- `admin-ui/src/App.tsx` (update routing)

---

### Step 3: Environment Configuration

#### 3.1 Backend Environment

File: `.env` or `.env.local`

```bash
# Einstrust Configuration
EINSTRUST_API_URL=http://localhost:3001
EINSTRUST_TENANT_ID=
EINSTRUST_IDP_ID=
EINSTRUST_RETURN_URL=http://localhost:3000/auth/callback

# Session Cache
EINSTRUST_SESSION_CACHE_TTL=300
EINSTRUST_SESSION_CACHE_MAX=1000

# Fallback Auth
FLEXGATE_FALLBACK_AUTH=true
```

#### 3.2 Frontend Environment

File: `admin-ui/.env`

```bash
REACT_APP_API_URL=http://localhost:3000
```

**Files to create**: `.env` (backend), `admin-ui/.env` (frontend)

---

### Step 4: Update package.json

Ensure axios is installed:

```bash
npm install axios
```

---

## 🧪 Phase 3: Testing (TODO)

### Step 1: Start Einstrust

```bash
cd /Users/tamahant/Documents/GitHub/einstrust
npm run dev
```

Einstrust should be running on http://localhost:3001

### Step 2: Configure IdP in Einstrust

```bash
# Using Einstrust's built-in mock IdP (easiest for testing)
cd /Users/tamahant/Documents/GitHub/einstrust
npm run mock-idp
```

Mock IdP will run on http://localhost:7000

### Step 3: Register Mock IdP in Einstrust

```bash
curl -X POST http://localhost:3001/api/admin/idps \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mock IdP",
    "metadataUrl": "http://localhost:7000/metadata",
    "enabled": true
  }'
```

Save the returned `idpId` for next step.

### Step 4: Configure FlexGate

Update `.env`:

```bash
EINSTRUST_API_URL=http://localhost:3001
EINSTRUST_IDP_ID=<idp-id-from-step-3>
EINSTRUST_RETURN_URL=http://localhost:3000/auth/callback
```

### Step 5: Start FlexGate

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
npm run dev
```

FlexGate should be running on http://localhost:3000

### Step 6: Test SSO Flow

1. Open http://localhost:3000/login
2. Click "Login with Enterprise SSO"
3. Should redirect to http://localhost:7000/sso
4. Enter any email (no password needed in mock)
5. Click "Sign In"
6. Should redirect back to FlexGate with session

### Step 7: Verify Session

```bash
# Get token from localStorage or login response
curl -X GET http://localhost:3000/api/auth/session \
  -H "Authorization: Bearer <token>"
```

Should return:
```json
{
  "valid": true,
  "user": { ... },
  "sessionId": "..."
}
```

### Step 8: Test Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

---

## 📦 Phase 4: Production Deployment (TODO)

### Step 1: Configure Production IdP

Options:
- Okta Developer (FREE)
- Azure AD (FREE with Microsoft account)
- Auth0 (FREE tier)
- Google Workspace
- Custom SAML IdP

See `docs/saml-testing-no-docker.md` in Einstrust repo.

### Step 2: Deploy Einstrust

```bash
# Using Docker Compose
cd /Users/tamahant/Documents/GitHub/einstrust
docker-compose up -d
```

### Step 3: Deploy FlexGate

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
docker-compose up -d
```

### Step 4: Configure Production Environment

Update production `.env`:

```bash
EINSTRUST_API_URL=https://einstrust.your-domain.com
EINSTRUST_IDP_ID=<production-idp-id>
EINSTRUST_RETURN_URL=https://flexgate.your-domain.com/auth/callback
EINSTRUST_TENANT_ID=<your-tenant-id>
```

### Step 5: HTTPS Setup

- Configure SSL certificates
- Update IdP redirect URLs
- Update SP metadata URLs

### Step 6: Monitoring

- Check Prometheus metrics
- Monitor session cache hit rate
- Track authentication failures
- Set up alerts

---

## ✅ Completion Checklist

### Backend
- [x] Auth types defined
- [x] Einstrust client implemented
- [x] Session cache implemented
- [x] Middleware implemented
- [x] Auth routes created
- [ ] Initialize auth in app.ts
- [ ] Environment variables configured
- [ ] Dependencies installed

### Frontend
- [x] Auth service updated with SSO methods
- [ ] SSOCallback component created
- [ ] Login page updated with SSO button
- [ ] Routing updated with /auth/callback
- [ ] Environment variables configured

### Testing
- [ ] Einstrust running
- [ ] Mock IdP running
- [ ] IdP configured in Einstrust
- [ ] FlexGate configured
- [ ] End-to-end SSO flow tested
- [ ] Session validation tested
- [ ] Logout tested
- [ ] Cache performance verified

### Documentation
- [x] Integration guide written
- [x] Implementation summary written
- [x] API documentation complete
- [x] Configuration examples provided
- [x] Troubleshooting guide included

### Production
- [ ] Production IdP configured
- [ ] Einstrust deployed
- [ ] FlexGate deployed
- [ ] HTTPS configured
- [ ] Monitoring configured
- [ ] Load testing completed
- [ ] Security audit completed

---

## 📝 Notes

- All backend code is complete and ready
- Frontend needs UI components (LoginPage update, SSOCallback)
- Main app.ts needs auth initialization
- Ready for testing with Einstrust mock IdP
- No breaking changes to existing code
- SSO is opt-in via environment variables

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
npm install axios

# 2. Complete Phase 2 (app.ts integration)
# See Step 1 above

# 3. Create UI components
# See Step 2 above

# 4. Configure environment
# See Step 3 above

# 5. Start services
# Terminal 1: Einstrust
cd /Users/tamahant/Documents/GitHub/einstrust && npm run dev

# Terminal 2: Mock IdP (for testing)
cd /Users/tamahant/Documents/GitHub/einstrust && npm run mock-idp

# Terminal 3: FlexGate
cd /Users/tamahant/Documents/GitHub/flexgate-proxy && npm run dev

# 6. Test SSO flow
# Open http://localhost:3000/login
```

---

**Status**: Backend integration complete! Ready for Phase 2 (app integration) and Phase 3 (testing). 🎉
