# Settings Audit - Infrastructure vs Application Settings

## 🎯 Objective
Identify which settings are **safely editable via UI** vs. which are **infrastructure settings** requiring manual config edits and service restarts.

---

## 📊 Settings Categories

### ✅ SAFE - Runtime Application Settings
These can be changed via UI without breaking the system:

| Category | Setting | Reason | Impact |
|----------|---------|--------|--------|
| **Logging** | `level` | Runtime change | Immediate - no restart needed |
| **Logging** | `format` | Runtime change | Immediate - affects new logs only |
| **Logging** | `maxFileSize` | File rotation config | Next rotation cycle |
| **Logging** | `maxFiles` | File rotation config | Next cleanup |
| **Admin** | `sessionTimeout` | Session management | Affects new sessions |
| **Admin** | `maxLoginAttempts` | Security policy | Immediate |
| **Admin** | `lockoutDuration` | Security policy | Immediate |
| **Admin** | `theme` | UI preference | Immediate |
| **Admin** | `autoRefresh` | UI polling | Immediate |
| **Security** | `cors.enabled` | CORS middleware | Immediate after save |
| **Security** | `cors.origins` | CORS whitelist | Immediate after save |
| **Security** | `cors.methods` | CORS allowed methods | Immediate after save |
| **Security** | `cors.credentials` | CORS credentials | Immediate after save |
| **Security** | `jwt.expiresIn` | Token lifetime | Affects new tokens |
| **Server** | `compression.enabled` | Response compression | Immediate |
| **Server** | `compression.level` | Compression ratio | Immediate |
| **Server** | `compression.threshold` | Min size to compress | Immediate |
| **Server** | `maxConnections` | Connection limits | Immediate |
| **Server** | `keepAliveTimeout` | Connection timeout | Immediate |
| **Server** | `trustProxy` | Proxy header trust | Immediate |
| **Monitoring** | `prometheus.enabled` | Metrics collection | Immediate |
| **Monitoring** | `prometheus.endpoint` | Metrics path | Requires restart ⚠️ |
| **Monitoring** | `tracing.enabled` | Distributed tracing | Immediate |
| **Monitoring** | `tracing.sampleRate` | Trace sampling | Immediate |
| **Redis** | `cache.defaultTTL` | Cache expiration | Affects new cache entries |
| **Redis** | `cache.maxMemory` | Cache size limit | Immediate |
| **Redis** | `keyPrefix` | Key namespace | Affects new keys only |
| **Database** | `pool.min` | Min connections | Next pool adjustment |
| **Database** | `pool.max` | Max connections | Next pool adjustment |
| **Database** | `pool.idleTimeout` | Connection timeout | Next pool cycle |

---

### ⚠️ RISKY - Infrastructure Settings (Should be Read-Only)
These require coordinated updates across multiple systems:

| Category | Setting | Why Read-Only | Dependencies |
|----------|---------|---------------|--------------|
| **Server** | `port` | Port binding | Health checks, Admin UI proxy, HAProxy, monitoring |
| **Server** | `host` | Network binding | Health checks, service discovery |
| **Server** | `basePath` | URL routing | HAProxy, reverse proxies, client configs |
| **Admin** | `path` | URL routing | Reverse proxies, auth systems |
| **Database** | `host` | Connection string | Cannot change running DB host |
| **Database** | `port` | Connection string | Cannot change running DB port |
| **Database** | `database` | Database name | Cannot switch DB while running |
| **Database** | `user` | Authentication | Cannot change user while running |
| **Database** | `ssl.enabled` | TLS config | Requires DB restart |
| **Database** | `ssl.mode` | TLS verification | Requires DB restart |
| **Redis** | `host` | Connection string | Cannot change running Redis host |
| **Redis** | `port` | Connection string | Cannot change running Redis port |
| **Redis** | `db` | Database number | Requires reconnection |
| **Security** | `jwt.algorithm` | Token signing | Breaks existing tokens |
| **Admin** | `enabled` | Admin UI access | Could lock out users |

---

## 🎨 UI Design Recommendations

### Category 1: Fully Editable ✅
Display as normal input fields with save button:
- Logging settings
- Admin UI preferences (theme, refresh)
- Security policies (login attempts, lockout)
- CORS settings
- Compression settings
- Connection limits
- Monitoring toggles
- Cache settings
- Database pool settings

### Category 2: Read-Only Information ℹ️
Display as chips or info boxes (non-editable):
- Server port
- Server host
- Database host/port/name
- Redis host/port
- Admin path

### Category 3: Dangerous Changes ⚠️
Show with warning and require confirmation:
- JWT algorithm (breaks existing sessions)
- Admin enabled toggle (could lock out)
- Base path (breaks routing)

### Category 4: Not in UI ❌
Remove completely (edit config file only):
- Database user/password (security)
- JWT secret (security)
- Database SSL certificates (files)

---

## 🛠️ Implementation Plan

### Phase 1: Immediate Safety (PRIORITY)
✅ **COMPLETED**:
- Server port → Read-only chip
- Server host → Read-only chip
- API protection for port/host changes

🔲 **TO DO**:
1. Database host/port → Read-only chips
2. Redis host/port → Read-only chips
3. Remove base path (too risky)
4. Remove admin path (too risky)
5. Remove JWT algorithm field
6. Remove database name field

### Phase 2: Enhanced UX
1. Group settings by safety level
2. Add "Infrastructure" tab (read-only)
3. Add "Application" tab (editable)
4. Add tooltips explaining why fields are locked
5. Add warning badges for risky changes

### Phase 3: Advanced Features
1. Validate before save
2. Show restart required badge
3. Add "Test Connection" for DB/Redis (without saving)
4. Show current vs. new value comparison
5. Add rollback functionality

---

## 📋 Specific Changes Needed

### GeneralSettings.tsx

#### Server Tab
```tsx
// READ-ONLY (Already Done)
✅ Port → Chip display
✅ Host → Chip display

// REMOVE (Too Infrastructure)
❌ Base Path → Delete field

// KEEP AS EDITABLE
✅ Max Connections → TextField
✅ Keep Alive Timeout → TextField
✅ Trust Proxy → Switch
✅ Compression Settings → All fields
```

#### Admin Tab
```tsx
// REMOVE (Too Risky)
❌ Enabled → Could lock out users
❌ Path → URL routing dependency

// KEEP AS EDITABLE
✅ Session Timeout → TextField
✅ Max Login Attempts → TextField
✅ Lockout Duration → TextField
✅ Theme → Select
✅ Auto Refresh → TextField
```

#### Database Tab
```tsx
// READ-ONLY (Infrastructure)
→ Host → Chip display
→ Port → Chip display
→ Database Name → Chip display
→ User → Chip display

// REMOVE (Security - file only)
❌ Password field → Never show

// KEEP AS EDITABLE
✅ Pool Min/Max/Timeout → TextFields
```

#### Redis Tab
```tsx
// READ-ONLY (Infrastructure)
→ Host → Chip display
→ Port → Chip display
→ DB Number → Chip display

// KEEP AS EDITABLE
✅ Key Prefix → TextField (with warning)
✅ Cache TTL → TextField
✅ Max Memory → TextField
```

#### Security Tab
```tsx
// REMOVE (Breaks tokens)
❌ JWT Algorithm → Delete field
❌ JWT Secret → Never show

// KEEP AS EDITABLE
✅ JWT Expires In → TextField
✅ CORS Enabled → Switch
✅ CORS Origins → Array input
✅ CORS Methods → Array input
✅ CORS Credentials → Switch
```

#### Logging Tab
```tsx
// ALL SAFE - KEEP AS EDITABLE
✅ Level → Select (debug/info/warn/error)
✅ Format → Select (json/text)
✅ Max File Size → TextField
✅ Max Files → TextField
```

#### Monitoring Tab
```tsx
// ALL SAFE - KEEP AS EDITABLE
✅ Prometheus Enabled → Switch
✅ Prometheus Endpoint → TextField (with restart warning)
✅ Tracing Enabled → Switch
✅ Tracing Sample Rate → Slider (0-1)
```

---

## 🔐 Backend Protection

### Already Protected ✅
- Server port
- Server host

### Need Protection 🔲
Add to `routes/settings.ts`:

```typescript
// Prevent changing connection strings
if (newSettings.database?.host || newSettings.database?.port || newSettings.database?.database) {
  return res.status(403).json({
    error: 'Database connection settings locked',
    message: 'Edit config/flexgate.json to change database connection'
  });
}

if (newSettings.redis?.host || newSettings.redis?.port || newSettings.redis?.db) {
  return res.status(403).json({
    error: 'Redis connection settings locked',
    message: 'Edit config/flexgate.json to change Redis connection'
  });
}

if (newSettings.security?.jwt?.algorithm) {
  return res.status(403).json({
    error: 'JWT algorithm cannot be changed',
    message: 'Changing this would invalidate all existing sessions'
  });
}
```

---

## 📝 Summary

**Total Settings**: ~40 fields across 7 tabs

**Breakdown**:
- ✅ **Safe to edit**: 23 settings (58%)
- ℹ️ **Read-only display**: 10 settings (25%)
- ❌ **Remove from UI**: 7 settings (17%)

**User Experience**:
- Clear visual distinction between editable and locked fields
- Helpful tooltips explaining why fields are locked
- Manual edit instructions for infrastructure changes
- No risk of breaking the system via Settings UI

**Next Steps**:
1. Update GeneralSettings.tsx with read-only chips
2. Add backend protection for DB/Redis/JWT
3. Test all changes
4. Document manual config procedure
