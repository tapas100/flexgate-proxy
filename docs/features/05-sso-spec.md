# Feature 5: OAuth Plugins Specification

## Overview
Implement OAuth 2.0 authentication plugins for popular providers (Google, GitHub, Microsoft, etc.) with a visual plugin manager in the Admin UI.

## Objective
Enable administrators to configure and manage OAuth 2.0 authentication providers through a user-friendly interface, supporting multiple OAuth providers simultaneously.

## User Stories

1. **As an administrator**, I want to add OAuth providers so that users can authenticate with third-party services
2. **As an administrator**, I want to configure OAuth client credentials securely
3. **As an administrator**, I want to test OAuth configurations before enabling them
4. **As an administrator**, I want to enable/disable OAuth providers
5. **As a user**, I want to sign in with Google/GitHub/Microsoft
6. **As an administrator**, I want to see OAuth provider statistics and logs

## Features

### 1. OAuth Provider Manager (Admin UI)
**Priority**: P0 (Critical)

#### Provider List View
- Display all configured OAuth providers
- Show provider status (enabled/disabled/error)
- Show connection statistics (total logins, last login, error rate)
- Quick enable/disable toggle
- Add new provider button
- Delete provider with confirmation

#### Provider Configuration Dialog
- Provider type selector (Google, GitHub, Microsoft, Generic OAuth2)
- Client ID and Client Secret inputs (with show/hide)
- Redirect URI display (auto-generated)
- Scope configuration
- Authorization/Token endpoints (for generic OAuth2)
- User info endpoint (for generic OAuth2)
- Test connection button
- Save and enable/disable options

#### Provider Details Page
- Full configuration view
- Connection statistics and charts
- Recent login activity
- Error logs
- User mapping configuration
- Advanced settings (timeout, retry logic, token refresh)

### 2. Backend OAuth Service
**Priority**: P0 (Critical)

#### OAuth Flow Implementation
- Authorization code flow support
- Token exchange
- Token refresh logic
- State parameter for CSRF protection
- PKCE support (optional)

#### Provider-Specific Adapters
- Google OAuth adapter
- GitHub OAuth adapter
- Microsoft OAuth adapter
- Generic OAuth2 adapter

#### User Mapping
- Map OAuth user info to internal user model
- Email verification
- Role assignment based on OAuth groups/claims
- User profile synchronization

### 3. Security Features
**Priority**: P0 (Critical)

#### Credential Storage
- Encrypted client secrets in database
- Environment variable support for credentials
- Secrets rotation support

#### Session Management
- OAuth token storage
- Token refresh handling
- Session timeout configuration
- Logout flow

## Technical Requirements

### Frontend (Admin UI)

#### New Components
```
src/components/OAuth/
├── OAuthProviderList.tsx       - List of configured providers
├── OAuthProviderCard.tsx       - Provider card with stats
├── OAuthProviderDialog.tsx     - Add/edit provider dialog
├── OAuthProviderDetails.tsx    - Detailed provider view
├── OAuthTestConnection.tsx     - Test connection component
└── OAuthUserMapping.tsx        - User mapping configuration
```

#### New Types
```typescript
interface OAuthProvider {
  id: string;
  name: string;
  type: 'google' | 'github' | 'microsoft' | 'generic';
  enabled: boolean;
  clientId: string;
  clientSecret?: string; // Never sent to frontend
  redirectUri: string;
  scopes: string[];
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  createdAt: number;
  updatedAt: number;
  stats?: OAuthProviderStats;
}

interface OAuthProviderStats {
  totalLogins: number;
  lastLogin: number | null;
  errorRate: number;
  avgResponseTime: number;
}

interface OAuthProviderConfig {
  type: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
}

interface OAuthUserMapping {
  emailField: string;
  nameField: string;
  pictureField?: string;
  roleMapping?: Record<string, string>;
}
```

#### New Services
```typescript
class OAuthService {
  async fetchProviders(): Promise<ApiResponse<OAuthProvider[]>>;
  async fetchProviderById(id: string): Promise<ApiResponse<OAuthProvider>>;
  async createProvider(config: OAuthProviderConfig): Promise<ApiResponse<OAuthProvider>>;
  async updateProvider(id: string, config: Partial<OAuthProviderConfig>): Promise<ApiResponse<OAuthProvider>>;
  async deleteProvider(id: string): Promise<ApiResponse<void>>;
  async toggleProvider(id: string, enabled: boolean): Promise<ApiResponse<void>>;
  async testConnection(config: OAuthProviderConfig): Promise<ApiResponse<{ success: boolean; error?: string }>>;
  async fetchProviderStats(id: string): Promise<ApiResponse<OAuthProviderStats>>;
}
```

### Backend (Proxy)

#### New Routes
```
POST   /admin/oauth/providers           - Create OAuth provider
GET    /admin/oauth/providers           - List OAuth providers
GET    /admin/oauth/providers/:id       - Get provider details
PUT    /admin/oauth/providers/:id       - Update provider
DELETE /admin/oauth/providers/:id       - Delete provider
POST   /admin/oauth/providers/:id/test  - Test provider connection
GET    /admin/oauth/providers/:id/stats - Get provider statistics

GET    /auth/oauth/:provider            - Start OAuth flow
GET    /auth/oauth/:provider/callback   - OAuth callback endpoint
POST   /auth/oauth/logout               - OAuth logout
```

#### Database Schema
```sql
CREATE TABLE oauth_providers (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  client_id VARCHAR(255) NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  redirect_uri VARCHAR(500),
  scopes TEXT[], -- Array of scopes
  authorization_endpoint VARCHAR(500),
  token_endpoint VARCHAR(500),
  user_info_endpoint VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE oauth_sessions (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES oauth_providers(id),
  user_id UUID,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE oauth_login_logs (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES oauth_providers(id),
  user_id UUID,
  success BOOLEAN,
  error_message TEXT,
  response_time INTEGER, -- milliseconds
  created_at TIMESTAMP DEFAULT NOW()
);
```

## UI/UX Design

### Provider List View
```
┌─────────────────────────────────────────────────────┐
│ OAuth Providers                    [+ Add Provider] │
├─────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────┐   │
│ │ 🔵 Google                        [⚙️] [✓]     │   │
│ │ client-id: ***************abc                 │   │
│ │ 1.2K logins │ Last: 2 hours ago │ 99.8% uptime│   │
│ └───────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────┐   │
│ │ 🐙 GitHub                        [⚙️] [✓]     │   │
│ │ client-id: ***************xyz                 │   │
│ │ 850 logins │ Last: 5 mins ago │ 99.5% uptime │   │
│ └───────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────┐   │
│ │ 🟦 Microsoft                     [⚙️] [○]     │   │
│ │ client-id: ***************def                 │   │
│ │ Disabled                                      │   │
│ └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Provider Configuration Dialog
```
┌─────────────────────────────────────────────────────┐
│ Add OAuth Provider                            [✕]  │
├─────────────────────────────────────────────────────┤
│ Provider Type:  [Google ▼]                          │
│                                                     │
│ Display Name:   [Google SSO]                        │
│                                                     │
│ Client ID:      [your-client-id]                    │
│                                                     │
│ Client Secret:  [••••••••••••••]  [Show]           │
│                                                     │
│ Redirect URI:   https://api.example.com/auth/...    │
│                 (auto-generated)                    │
│                                                     │
│ Scopes:         openid, email, profile              │
│                                                     │
│ ┌─────────────────────────────────────────────┐     │
│ │ Advanced Settings                           │     │
│ │ Authorization Endpoint: (auto-filled)       │     │
│ │ Token Endpoint: (auto-filled)               │     │
│ │ User Info Endpoint: (auto-filled)           │     │
│ └─────────────────────────────────────────────┘     │
│                                                     │
│           [Test Connection]  [Cancel]  [Save]      │
└─────────────────────────────────────────────────────┘
```

## Testing Requirements

### Unit Tests (15 tests minimum)
1. **OAuthProviderService Tests** (8 tests)
   - fetchProviders() returns list of providers
   - createProvider() creates new provider
   - updateProvider() updates existing provider
   - deleteProvider() removes provider
   - toggleProvider() enables/disables provider
   - testConnection() validates credentials
   - fetchProviderStats() returns statistics
   - Error handling for failed requests

2. **OAuthProviderList Component Tests** (3 tests)
   - Renders provider list correctly
   - Enable/disable toggle works
   - Add provider button opens dialog

3. **OAuthProviderDialog Component Tests** (4 tests)
   - Form validation works
   - Test connection button triggers validation
   - Save button creates/updates provider
   - Client secret show/hide toggle works

### Integration Tests (5 tests minimum)
1. OAuth Providers page loads and displays providers
2. Add new provider flow completes successfully
3. Edit provider updates configuration
4. Delete provider removes from list
5. Test connection validates credentials

### End-to-End Tests (3 tests minimum)
1. Complete OAuth login flow (mock OAuth provider)
2. OAuth provider configuration persistence
3. OAuth error handling (invalid credentials, network errors)

## Security Considerations

1. **Client Secret Protection**
   - Never send client secrets to frontend
   - Encrypt client secrets in database
   - Support environment variable override

2. **CSRF Protection**
   - Use state parameter in OAuth flow
   - Validate state on callback

3. **Token Security**
   - Store tokens encrypted
   - Implement token rotation
   - Set appropriate token expiration

4. **Input Validation**
   - Validate all OAuth configuration inputs
   - Sanitize redirect URIs
   - Validate callback URLs

## Performance Considerations

1. **Caching**
   - Cache OAuth provider configurations
   - Cache public keys for token verification

2. **Rate Limiting**
   - Rate limit OAuth endpoints
   - Implement exponential backoff for token refresh

3. **Connection Pooling**
   - Reuse HTTP connections for OAuth requests

## Dependencies

### Frontend
```json
{
  "dependencies": {
    "@mui/icons-material": "^5.15.0",
    "@mui/material": "^5.15.0",
    "react": "^18.2.0",
    "axios": "^1.6.0"
  }
}
```

### Backend
```json
{
  "dependencies": {
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "passport-github2": "^0.1.12",
    "passport-microsoft": "^1.0.0",
    "jsonwebtoken": "^9.0.2"
  }
}
```

## Acceptance Criteria

- [ ] Admin can add OAuth providers (Google, GitHub, Microsoft)
- [ ] Admin can configure client credentials securely
- [ ] Admin can test OAuth configuration before enabling
- [ ] Admin can enable/disable OAuth providers
- [ ] Admin can view OAuth provider statistics
- [ ] Users can sign in with configured OAuth providers
- [ ] OAuth tokens are securely stored and encrypted
- [ ] OAuth sessions are properly managed
- [ ] All tests pass (unit, integration, E2E)
- [ ] Documentation is complete

## Estimated Time
- Frontend: 6-8 hours
- Backend: 8-10 hours
- Testing: 4-6 hours
- **Total**: 18-24 hours

## Related Features
- Feature 6: SAML Integration (similar authentication pattern)
- Feature 2: Visual Route Editor (use OAuth for protected routes)

---

*Created*: January 28, 2026
*Status*: Specification Ready
*Priority*: P0 (Critical for Enterprise)
*Branch*: `feature/oauth-plugins` (to be created)
