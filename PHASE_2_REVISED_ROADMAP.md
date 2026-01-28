# Phase 2 Revised Roadmap - FlexGate Proxy

**Updated:** January 28, 2026  
**Status:** In Progress (5/8 features complete → pivoting to high-value features)  
**Strategy:** Focus on core proxy features, delegate SSO to Einstrust

---

## 🎯 Strategic Pivot

### Key Decision: SSO Separation
After completing Feature 5 (OAuth Plugins), we've decided to **separate enterprise SSO** into a dedicated service called **Einstrust**. This allows:

- ✅ **FlexGate:** Focus on API gateway features (routing, metrics, rate limiting)
- ✅ **Einstrust:** Dedicated SSO service (SAML, LDAP, advanced auth) using Keycloak/Authentik
- ✅ **Better separation of concerns:** Each service does one thing well
- ✅ **Faster development:** Build practical features instead of complex auth

---

## 📊 Progress Summary

### Completed Features (5/8 = 62.5%)

1. ✅ **Feature 1: Admin UI Foundation** (COMPLETE)
   - React + Material-UI setup
   - Authentication flow
   - Protected routes
   - Layout components
   - 14 tests passing

2. ✅ **Feature 2: Visual Route Editor** (COMPLETE)
   - Route CRUD operations
   - Visual route cards
   - Rate limiting configuration
   - Circuit breaker settings
   - 23 tests passing

3. ✅ **Feature 3: Metrics Dashboard** (COMPLETE)
   - Real-time metrics display
   - Request rate charts
   - Latency percentiles (p50, p95, p99)
   - Error rate tracking
   - SLO gauges
   - Circuit breaker status
   - 91 tests passing

4. ✅ **Feature 4: Log Viewer** (COMPLETE)
   - Advanced log filtering
   - Real-time log streaming
   - Search with regex support
   - Log level/source filtering
   - Time range selection
   - Export to JSON/CSV
   - 26 tests passing

5. ✅ **Feature 5: OAuth Plugins** (COMPLETE)
   - OAuth 2.0 provider management
   - Support for Google, GitHub, Microsoft, Generic OAuth2
   - Visual plugin manager
   - Connection testing
   - Provider statistics
   - 38 tests passing

**Total Tests So Far:** 191 passing

---

## 🚀 Revised Features (3 New High-Value Features)

### ~~Feature 6: SAML Integration~~ → **MOVED to Einstrust**
**Status:** Delegated to separate Einstrust SSO service  
**Reason:** Better separation of concerns, leverage Keycloak/Authentik

### **Feature 6 (NEW): Webhook Notifications** 📢
**Priority:** High  
**Estimated Time:** 10-14 hours  
**Status:** 📋 Planned

#### Overview
Event-driven webhook system to notify external services of important proxy events.

#### Key Features
- Configure webhook endpoints
- Event triggers:
  - Circuit breaker state changes (open/close)
  - High error rates (threshold exceeded)
  - Rate limit violations
  - Route health changes
  - Certificate expiry warnings
  - System alerts
- Webhook payload customization
- Retry logic with exponential backoff
- Webhook history and logs
- Test webhook delivery
- Support for multiple webhooks per event
- Signature verification (HMAC)

#### Use Cases
- ✅ Alert Slack when circuit breakers trip
- ✅ Notify PagerDuty on high error rates
- ✅ Send events to analytics platforms
- ✅ Trigger custom automation workflows
- ✅ Integration with monitoring tools

#### Components
- WebhookService (manage webhooks)
- WebhookList component
- WebhookDialog (add/edit webhooks)
- Event selector (choose triggers)
- Test webhook delivery
- Webhook logs viewer

#### Test Plan
- Service tests: 12 tests
- Component tests: 16 tests
- Integration tests: 6 tests
- **Total: 34 tests**

---

### **Feature 7 (NEW): API Key Management** 🔑
**Priority:** High  
**Estimated Time:** 12-16 hours  
**Status:** 📋 Planned

#### Overview
Comprehensive API key management system for authenticating API requests to FlexGate.

#### Key Features
- Generate API keys
- Key naming and descriptions
- Scopes/permissions per key
- Expiration dates
- Rate limits per key
- Usage statistics
- Key rotation
- Revoke keys
- Activity logs
- IP whitelist/blacklist per key
- Masked key display (show prefix only)

#### Use Cases
- ✅ Secure API access without OAuth
- ✅ Machine-to-machine authentication
- ✅ Developer access tokens
- ✅ Third-party integrations
- ✅ Service-to-service communication

#### Components
- APIKeyService
- APIKeyList component
- APIKeyDialog (create/edit)
- APIKeyCard (display with masked key)
- Usage statistics display
- Activity log viewer

#### Test Plan
- Service tests: 14 tests
- Component tests: 18 tests
- Integration tests: 6 tests
- **Total: 38 tests**

---

### **Feature 8 (NEW): Request Replay & Testing** 🧪
**Priority:** Medium-High  
**Estimated Time:** 14-18 hours  
**Status:** 📋 Planned

#### Overview
Developer-friendly request replay and testing toolkit for debugging and validating proxy behavior.

#### Key Features
- Capture real requests from logs
- Replay requests through proxy
- Modify request parameters (headers, body, query params)
- Compare original vs replayed responses
- Save request templates
- Bulk request testing
- Load testing (simple)
- Response validation
- Diff viewer (original vs replayed)
- Share request templates

#### Use Cases
- ✅ Debug production issues locally
- ✅ Test rate limiting behavior
- ✅ Validate circuit breaker logic
- ✅ Regression testing
- ✅ Load testing routes
- ✅ API exploration

#### Components
- RequestReplayService
- RequestCapture component
- RequestEditor (modify request)
- ResponseComparison (diff viewer)
- RequestTemplate manager
- Bulk testing interface

#### Test Plan
- Service tests: 16 tests
- Component tests: 20 tests
- Integration tests: 8 tests
- **Total: 44 tests**

---

## 🔗 Einstrust SSO Integration (Future)

### Placeholder in FlexGate Admin UI
Create simple "Enterprise SSO" page that:
- Shows Einstrust logo/branding
- "Configure enterprise SSO via Einstrust" message
- Link to Einstrust repository (when available)
- Setup instructions
- Docker Compose integration example

**Time:** 2-3 hours  
**Status:** After Feature 6-8 complete

### Einstrust Service (Separate Repository)
To be built in `einstrust` repository:
- SAML 2.0 integration (Okta, Azure AD, OneLogin, etc.)
- LDAP/Active Directory
- Advanced OAuth/OIDC flows
- Multi-factor authentication
- User federation
- Built on Keycloak or Authentik
- REST API for FlexGate integration

---

## 📅 Updated Timeline

### Completed (January 2026)
- ✅ Feature 1: Admin UI Foundation
- ✅ Feature 2: Visual Route Editor
- ✅ Feature 3: Metrics Dashboard
- ✅ Feature 4: Log Viewer
- ✅ Feature 5: OAuth Plugins

### Upcoming (February 2026)
- 🎯 Feature 6: Webhook Notifications (10-14h)
- 🎯 Feature 7: API Key Management (12-16h)
- 🎯 Feature 8: Request Replay & Testing (14-18h)

### Future (March 2026+)
- 🔮 Einstrust SSO Integration
- 🔮 Advanced Analytics
- 🔮 Multi-tenancy
- 🔮 GraphQL Support
- 🔮 WebSocket Proxying

---

## 💡 Why This Change?

### Old Plan (Features 6-8):
```
❌ Feature 6: SAML Integration    (20-28h)
   - Complex auth implementation
   - Security maintenance burden
   - Limited to SAML only
   
❌ Feature 7: Stripe Billing      (20-24h)
   - Ongoing payment processing costs
   - Complex subscription management
   - Vendor lock-in
   
❌ Feature 8: License Management  (18-22h)
   - Complex enforcement logic
   - DRM concerns
   
Total: 58-74 hours
```

### New Plan (Features 6-8):
```
✅ Feature 6: Webhooks             (10-14h)
   - High value for all users
   - Simple HTTP calls
   - Enables integrations
   
✅ Feature 7: API Keys             (12-16h)
   - Essential for API gateway
   - Secure M2M auth
   - Developer-friendly
   
✅ Feature 8: Request Replay       (14-18h)
   - Great debugging tool
   - Developer experience
   - Unique feature
   
Total: 36-48 hours (40% faster!)
```

**Benefits:**
- ✅ **Faster delivery:** 20-26 hours saved
- ✅ **Higher value:** Features used by all customers
- ✅ **Better focus:** Core proxy functionality
- ✅ **Lower complexity:** Less code to maintain
- ✅ **Better security:** Delegate auth to Einstrust experts

---

## 🎯 Success Metrics

### Development Velocity
- Features 1-5: ~95 hours (avg 19h/feature)
- Features 6-8 (new): ~36-48 hours (avg 12-16h/feature)
- **38% faster development**

### Test Coverage
- Current: 191 tests passing
- Target (after 6-8): 191 + 34 + 38 + 44 = **307 tests**

### Bundle Size
- Current: 325.81 kB
- Target: < 380 kB (< 17% increase)

### User Value
- Old plan: 40% users (enterprise SAML/billing)
- New plan: 90% users (webhooks, API keys, testing)

---

## 🏗️ Architecture with Einstrust

```
┌─────────────────────────────────────────────────┐
│            Client Applications                  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│         FlexGate Proxy (API Gateway)            │
│                                                 │
│  Core Features:                                 │
│  ✅ Routing & Load Balancing                   │
│  ✅ Rate Limiting                               │
│  ✅ Circuit Breakers                            │
│  ✅ Metrics & Monitoring                        │
│  ✅ Log Management                              │
│  ✅ Basic OAuth (Google, GitHub, etc.)         │
│  ✅ Webhook Notifications                       │
│  ✅ API Key Management                          │
│  ✅ Request Replay & Testing                    │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │
                   ├─→ Upstream Services
                   │
                   ├─→ Webhook Endpoints
                   │
                   └─→ Einstrust SSO (for enterprise)
                       │
                       ├─→ SAML IdPs (Okta, Azure AD)
                       ├─→ LDAP/Active Directory
                       ├─→ Social OAuth
                       └─→ MFA Providers
```

---

## 📝 Next Steps

1. **Immediate (This Week)**
   - ✅ Clean up SAML branch
   - ✅ Update roadmap
   - 📋 Create Feature 6 spec (Webhooks)
   - 📋 Start webhook implementation

2. **February 2026**
   - Complete Feature 6 (Webhooks)
   - Complete Feature 7 (API Keys)
   - Complete Feature 8 (Request Replay)

3. **March 2026**
   - Create Einstrust integration placeholder
   - Document Einstrust integration API
   - Begin Einstrust repository setup

---

## 🎉 Summary

**Old Strategy:**
- Build everything in FlexGate
- 58-74 hours for Features 6-8
- Complex auth maintenance
- Limited user base for enterprise features

**New Strategy:**
- Focus on core proxy features
- 36-48 hours for Features 6-8 ✅
- Delegate SSO to Einstrust
- High-value features for all users

**Result:** 40% faster, 90% user value, better architecture! 🚀

---

**Status:** Ready to implement Feature 6 (Webhooks)  
**Next Feature:** Webhook Notifications (10-14h)  
**Branch:** `dev` (clean and ready)
