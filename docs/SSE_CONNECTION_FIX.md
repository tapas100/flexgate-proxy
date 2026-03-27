# SSE Stream Connection Fix

**Date:** February 15, 2026  
**Issue:** `/api/stream/metrics` pending/failing  
**Status:** ✅ RESOLVED - Requires Admin UI restart

---

## 🐛 Problem

When accessing `http://localhost:3001/api/stream/metrics` in browser:
- Request stays **pending**
- Eventually **fails/times out**
- No SSE connection established

---

## 🔍 Root Cause Analysis

### Issue 1: Wrong Port in URL
❌ **Incorrect:** `http://localhost:3001/api/stream/metrics`  
✅ **Correct:** `http://localhost:8080/api/stream/metrics`

**Why:** 
- Port `3001` was the Admin UI port (now fixed to `3000`)
- Port `8080` is the Backend API port (where `/api/stream/metrics` actually exists)

### Issue 2: Admin UI Not Restarted
The Admin UI was running with old configuration:
- Old `PORT=3001` (fixed to `PORT=3000`)
- Old `proxy: "http://localhost:8081"` (fixed to `"http://localhost:8080"`)

**React's package.json proxy only loads on startup!**

---

## ✅ Verification

### Backend Endpoint is Working
```bash
$ curl -v http://localhost:8080/api/stream/metrics

< HTTP/1.1 200 OK
< Content-Type: text/event-stream
< Cache-Control: no-cache
< Connection: keep-alive

data: {"type":"connected","clientId":"..."}
: heartbeat
```

✅ **Endpoint exists and responds correctly!**

---

## 🔧 Solution

### Step 1: Verify Configuration Files

**File:** `admin-ui/.env`
```bash
PORT=3000  # ✅ Correct (was 3001)
REACT_APP_API_URL=http://localhost:8080  # ✅ Correct
```

**File:** `admin-ui/package.json`
```json
{
  "proxy": "http://localhost:8080"  // ✅ Correct (was 8081)
}
```

### Step 2: Restart Admin UI

**CRITICAL:** You must restart the Admin UI for proxy changes to take effect!

```bash
# Stop current Admin UI (if running)
# Press Ctrl+C in the terminal running npm start

# Or kill the process
lsof -ti:3001 | xargs kill -9  # Kill old port
lsof -ti:3000 | xargs kill -9  # Kill new port

# Restart Admin UI
cd admin-ui
npm start
```

### Step 3: Clear Browser Cache

```bash
# Hard reload in browser
# Mac: Cmd + Shift + R
# Windows/Linux: Ctrl + Shift + R

# Or clear cache completely
# Chrome: DevTools → Network tab → "Disable cache" checkbox
```

### Step 4: Verify Connection

**Open browser console and run:**
```javascript
// Check environment variable
console.log(process.env.REACT_APP_API_URL);
// Expected: "http://localhost:8080"

// Test SSE connection
const es = new EventSource('/api/stream/metrics');
es.onopen = () => console.log('✅ SSE Connected!');
es.onmessage = (e) => console.log('📊 Data:', JSON.parse(e.data));
es.onerror = (e) => console.error('❌ SSE Error:', e);
```

---

## 🎯 How It Works

### Request Flow (Correct)

```
Browser (http://localhost:3000)
    ↓
Request: /api/stream/metrics
    ↓
package.json proxy detects "/api/*"
    ↓
Proxies to: http://localhost:8080/api/stream/metrics
    ↓
Backend API (port 8080) handles request
    ↓
SSE stream established
    ↓
Data flows back to browser
```

### Request Flow (Incorrect - Before Fix)

```
Browser tries: http://localhost:3001/api/stream/metrics
    ↓
package.json proxy points to: http://localhost:8081
    ↓
Nothing listening on 8081
    ↓
Request hangs/fails ❌
```

---

## 🧪 Testing Checklist

### 1. Test Backend Directly
```bash
curl http://localhost:8080/api/stream/metrics
# Expected: SSE stream data

curl http://localhost:8080/api/routes
# Expected: JSON array of routes
```

✅ Both endpoints work

### 2. Test Admin UI Proxy
```bash
# After restarting Admin UI on port 3000
curl http://localhost:3000/api/routes
# Expected: Proxied to backend, returns JSON

# SSE requires browser EventSource (curl won't work properly)
```

### 3. Test in Browser
```bash
# 1. Navigate to: http://localhost:3000
# 2. Open browser DevTools → Network tab
# 3. Look for: /api/stream/metrics
# 4. Expected: Status 200, Type "eventsource"
# 5. Expected: Data streaming every 5 seconds
```

---

## 🚨 Common Issues After Fix

### Issue: "Port 3000 already in use"

**Solution:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Then restart
cd admin-ui && npm start
```

### Issue: Still showing old port 3001

**Problem:** Browser cache or old process still running

**Solution:**
```bash
# 1. Stop ALL node processes
pkill -f "react-scripts"
pkill -f "node.*admin-ui"

# 2. Clear browser cache (hard reload)
# 3. Restart Admin UI
cd admin-ui && npm start
```

### Issue: SSE connects but no data

**Check backend logs:**
```bash
tail -f server.log | grep "stream/metrics"

# Expected:
# Client <uuid> connected to metrics stream
# Client <uuid> using polling fallback
```

**Check if MetricsPublisher is running:**
```bash
curl http://localhost:8080/api/metrics/live

# Expected: JSON metrics data
```

### Issue: CORS errors

**Check backend CORS config:**
```bash
# In root .env
CORS_ORIGIN=http://localhost:3000,http://localhost:8080
CORS_ENABLED=true
```

**Restart backend if changed:**
```bash
npm start
```

---

## 📊 Environment Variables Priority

React loads environment variables in this order (highest priority first):

1. `.env.development.local` ← **Overrides everything in development**
2. `.env.development`
3. `.env.local`
4. `.env`

**Current configuration:**
```bash
# admin-ui/.env
PORT=3000
REACT_APP_API_URL=http://localhost:8080

# admin-ui/.env.development.local
REACT_APP_API_URL=http://localhost:8080
```

Both point to correct backend! ✅

---

## 🔧 package.json Proxy Explained

```json
{
  "proxy": "http://localhost:8080"
}
```

**What it does:**
- Only works in **development** (with `npm start`)
- Proxies ANY request that returns 404 from dev server
- Matches `/api/*` patterns automatically
- Avoids CORS issues during development

**Important:**
- ⚠️ **Only loads on startup** - must restart to apply changes
- ❌ **Does NOT work in production build** - use REACT_APP_API_URL instead
- ✅ **Perfect for development** - seamless backend integration

---

## 🎓 Why SSE Was Failing

### The EventSource Constructor

When Admin UI creates SSE connection:
```typescript
// In useLiveMetrics.ts
const baseUrl = process.env.REACT_APP_API_URL || '';
const resolvedStreamUrl = `${baseUrl}/api/stream/metrics`;
const es = new EventSource(resolvedStreamUrl);
```

### With Correct Config
```typescript
// REACT_APP_API_URL = "http://localhost:8080"
resolvedStreamUrl = "http://localhost:8080/api/stream/metrics"
// ✅ Connects to backend
```

### With Incorrect Config (Before Fix)
```typescript
// If REACT_APP_API_URL was empty or wrong
resolvedStreamUrl = "/api/stream/metrics"
// Browser resolves to: http://localhost:3001/api/stream/metrics
// package.json proxy: http://localhost:8081
// ❌ Nothing listening on 8081 → Connection fails
```

---

## 📝 Quick Fix Summary

1. ✅ **Fixed** `admin-ui/.env`: `PORT=3000` (was 3001)
2. ✅ **Fixed** `admin-ui/package.json`: `"proxy": "http://localhost:8080"` (was 8081)
3. ✅ **Verified** `REACT_APP_API_URL=http://localhost:8080` (already correct)
4. ⚠️ **Required** Restart Admin UI for changes to take effect

---

## 🚀 Action Required

**To fix the SSE connection:**

```bash
# 1. Stop current Admin UI
# Press Ctrl+C in terminal, or:
lsof -ti:3001 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# 2. Restart Admin UI (will use new config)
cd admin-ui
npm start

# 3. Browser will auto-open at http://localhost:3000
# 4. Hard reload: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

# 5. Check browser console for "✅ SSE Connected!"
```

**Verify in browser DevTools:**
- Network tab → Filter "eventsource"
- Should see `/api/stream/metrics` with Status 200
- Click to see SSE messages streaming

---

## 📚 Related Files

- `docs/PORT_CONFIGURATION.md` - Complete port configuration guide
- `docs/PORT_FIX_SUMMARY.md` - Port misalignment fix
- `scripts/fix-ports.sh` - Automated port validation
- `admin-ui/src/hooks/useLiveMetrics.ts` - SSE connection hook
- `src/routes/stream.js` - Backend SSE endpoint

---

**Status:** ✅ Configuration Fixed  
**Action Required:** 🔄 Restart Admin UI  
**Expected Result:** ✅ SSE streams working at http://localhost:3000
