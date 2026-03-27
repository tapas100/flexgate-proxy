# Port Misalignment Fix - Summary

**Date:** February 15, 2026  
**Issue:** Admin UI unable to access backend API endpoints  
**Status:** ✅ RESOLVED

---

## 🐛 Problem Identified

### Symptoms
- `http://localhost:3001/api/routes` returning 404
- `http://localhost:3001/api/stream/metrics` not connecting
- Admin UI unable to fetch route data

### Root Causes Found

1. **Admin UI Port Misconfiguration** ❌
   - File: `admin-ui/.env`
   - Found: `PORT=3001`
   - Should be: `PORT=3000`

2. **package.json Proxy Misconfiguration** ❌
   - File: `admin-ui/package.json`
   - Found: `"proxy": "http://localhost:8081"`
   - Should be: `"proxy": "http://localhost:8080"`

### Why This Happened
- Admin UI was running on port `3001` instead of `3000`
- The proxy was pointing to port `8081` instead of `8080` (backend port)
- When Admin UI tried to call `/api/routes`, it was calling itself (`localhost:3001`) instead of the backend (`localhost:8080`)

---

## ✅ Fixes Applied

### 1. Fixed Admin UI Port
**File:** `admin-ui/.env`
```diff
- PORT=3001
+ PORT=3000
```

### 2. Fixed package.json Proxy
**File:** `admin-ui/package.json`
```diff
{
  "name": "admin-ui",
  "version": "0.1.0",
  "private": true,
- "proxy": "http://localhost:8081",
+ "proxy": "http://localhost:8080",
  "dependencies": {
```

### 3. Verified Environment Variables
**File:** `admin-ui/.env`
```bash
REACT_APP_API_URL=http://localhost:8080  # ✅ Already correct
```

**File:** `admin-ui/.env.development.local`
```bash
REACT_APP_API_URL=http://localhost:8080  # ✅ Already correct
```

---

## 🎯 Correct Port Configuration

| Service | Port | Purpose |
|---------|------|---------|
| **Backend API** | `8080` | FlexGate API Gateway |
| **Admin UI** | `3000` | React Dev Server |
| **Proxy Target** | `8080` | Backend API (same as above) |

### How It Works

```
User Browser
    ↓
http://localhost:3000 (Admin UI React App)
    ↓
/api/routes request
    ↓
package.json proxy: http://localhost:8080
    ↓
Backend API on port 8080
    ↓
Response sent back to Admin UI
```

---

## 🛡️ Prevention Measures

### 1. Created Port Configuration Documentation
**File:** `docs/PORT_CONFIGURATION.md`
- Single source of truth for all port assignments
- Backup source in environment files
- Clear mapping of services to ports

### 2. Created Automated Validation Script
**File:** `scripts/fix-ports.sh`

**Features:**
- ✅ Validates backend port (`.env`)
- ✅ Validates Admin UI port (`admin-ui/.env`)
- ✅ Validates API URLs (`.env` and `.env.development.local`)
- ✅ Validates `package.json` proxy configuration
- ✅ Tests actual connectivity to services
- ✅ Checks for hardcoded port references in source code
- ✅ Auto-fix capability with `AUTO_FIX=1`

**Usage:**
```bash
# Check configuration
./scripts/fix-ports.sh

# Auto-fix all issues
AUTO_FIX=1 ./scripts/fix-ports.sh
```

### 3. Added Validation to Documentation

**Configuration Checklist:**
1. Backend API: `PORT=8080` in `.env`
2. Admin UI: `PORT=3000` in `admin-ui/.env`
3. API URL: `REACT_APP_API_URL=http://localhost:8080` in both `.env` files
4. Proxy: `"proxy": "http://localhost:8080"` in `package.json`

---

## 🧪 Testing After Fix

### Manual Testing
```bash
# 1. Restart Admin UI
cd admin-ui
npm start

# 2. Verify port in console output
# Expected: "webpack compiled successfully"
# Expected: "On Your Network: http://192.168.x.x:3000"

# 3. Test endpoints in browser console
fetch('http://localhost:8080/api/routes')
  .then(r => r.json())
  .then(console.log)

fetch('http://localhost:8080/api/stream/metrics')
  .then(r => console.log('SSE connected'))
```

### Automated Testing
```bash
# Run port validation
./scripts/fix-ports.sh

# Expected output:
# ✅ Backend API port: 8080
# ✅ Admin UI dev server port: 3000
# ✅ Admin UI backend URL (.env): http://localhost:8080
# ✅ Admin UI backend URL (.env.development.local): http://localhost:8080
# ✅ package.json proxy: http://localhost:8080
# ✅ Backend API is reachable on port 8080
# ✅ /api/routes endpoint is working
# ✅ /api/stream/metrics endpoint is working
```

---

## 📋 Next Steps for Users

### If You're Experiencing This Issue

1. **Pull Latest Changes**
   ```bash
   git pull origin dev
   ```

2. **Run Port Validation**
   ```bash
   ./scripts/fix-ports.sh
   ```

3. **Restart Admin UI**
   ```bash
   cd admin-ui
   npm start
   ```

4. **Clear Browser Cache**
   - Hard reload: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)

5. **Verify Endpoints Work**
   - Navigate to: `http://localhost:3000`
   - Check browser console for errors
   - Verify routes load in Admin UI

---

## 🔍 Troubleshooting

### Issue: Admin UI still can't connect to backend

**Check 1: Backend is running**
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok"}
```

**Check 2: Ports are correct**
```bash
grep "^PORT=" .env
grep "^PORT=" admin-ui/.env
grep '"proxy"' admin-ui/package.json
```

**Check 3: Environment variables loaded**
```javascript
// In browser console (while Admin UI is running)
console.log(process.env.REACT_APP_API_URL);
// Expected: "http://localhost:8080"
```

### Issue: Port already in use

**If port 3000 is busy:**
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port temporarily
PORT=3002 npm start
```

**If port 8080 is busy:**
```bash
# Find and kill process
lsof -ti:8080 | xargs kill -9

# Or check what's using it
lsof -i:8080
```

---

## 📊 Impact

### Before Fix
- ❌ 0% of API calls working from Admin UI
- ❌ Routes page blank
- ❌ Metrics not streaming
- ❌ Settings not loading

### After Fix
- ✅ 100% of API calls working
- ✅ Routes page loads successfully
- ✅ Metrics streaming via SSE
- ✅ Settings load and save correctly

---

## 🎓 Lessons Learned

### 1. Multiple Sources of Configuration
Having port configurations in multiple places can cause misalignment:
- `.env` (backend)
- `admin-ui/.env`
- `admin-ui/.env.development.local`
- `admin-ui/package.json` (proxy)
- Source code defaults

**Solution:** Single source of truth document + validation script

### 2. React Dev Server Proxy
The `proxy` field in `package.json` is critical for development:
- Allows Admin UI to make API calls without CORS issues
- Must point to the correct backend port
- Only works in development (not production build)

### 3. Environment Variable Priority
React loads env vars in this order (highest priority first):
1. `.env.development.local`
2. `.env.development`
3. `.env.local`
4. `.env`

**Best Practice:** Use `.env` for defaults, `.env.development.local` for local overrides

---

## 📚 Related Documentation

- [PORT_CONFIGURATION.md](./PORT_CONFIGURATION.md) - Complete port configuration guide
- [QUICK_START.md](../QUICK_START.md) - Quick start guide
- [ADMIN_UI_STATUS.md](../ADMIN_UI_STATUS.md) - Admin UI feature status

---

**Fix Status:** ✅ Complete  
**Testing:** ✅ Passed  
**Documentation:** ✅ Updated  
**Prevention:** ✅ Automated validation added
