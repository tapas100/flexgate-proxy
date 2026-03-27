# Clean Install Progress Tracking - READY TO TEST! 🎉

## ✅ What We've Implemented

### 1. **Backend-Only Clean Install**
The clean install script now **ONLY** cleans backend dependencies, keeping the Admin UI running:

**What Gets Cleaned:**
- ✅ Backend `node_modules` (root)
- ✅ Backend `dist` folder
- ✅ Backend `package-lock.json`
- ✅ npm cache

**What Stays Intact:**
- ✅ `admin-ui/node_modules` (UI keeps running!)
- ✅ `admin-ui/build` (UI stays accessible!)
- ✅ Database data (PostgreSQL, Redis)
- ✅ All configuration files

### 2. **Real-Time Progress Tracking via SSE**

**Backend SSE Endpoint:**
```
GET /api/troubleshooting/clean-install/stream?password=admin123
```

Streams installation progress in real-time using Server-Sent Events.

**Frontend Progress Dialog:**
- ⏳ Progress bar showing 0-100% completion
- 📝 Live terminal-style log viewer (dark theme)
- 🔄 Real-time updates as installation progresses
- ✅/❌ Success/failure indicators
- 💡 Message: "The Admin UI will remain accessible during installation"

### 3. **Service Architecture**

```
Browser → Admin UI (3001) → HAProxy (8081) → API Server (8080)
```

**Current Service Status:**
- ✅ API Server: Running on port 8080
- ✅ HAProxy: Running on port 8081  
- ✅ Admin UI: Running on port 3001 (RESTARTED with new proxy config)
- ✅ PostgreSQL: Running on port 5432
- ✅ Redis: Running on port 6379

## 🔧 What Was Fixed

### Issue 1: Admin UI Breaking During Clean Install
**Problem:** Original script deleted `admin-ui/node_modules`, causing webpack errors

**Solution:** Modified `clean-install.sh` to skip Admin UI directories:
```bash
# 3. Remove node_modules (BACKEND ONLY - keep Admin UI running)
rm -rf node_modules
rm -rf package-lock.json
# NOTE: We keep admin-ui/node_modules so the UI stays running during installation

# 7. Admin UI dependencies (SKIP - keep UI running)
# NOTE: We don't touch admin-ui/node_modules to keep the UI functional
```

### Issue 2: SSE Connection to Wrong Port
**Problem:** EventSource was connecting to `localhost:3001` instead of going through HAProxy

**Root Cause:** Admin UI dev server was started BEFORE proxy configuration was updated to port 8081

**Solution:** 
1. Updated `admin-ui/package.json`: `"proxy": "http://localhost:8081"`
2. Restarted Admin UI to apply new proxy configuration
3. EventSource now uses relative URL `/api/troubleshooting/clean-install/stream` which proxies through HAProxy

## 📋 How to Test

### 1. **Navigate to Troubleshooting Page**
Open: `http://localhost:3001/troubleshooting`

### 2. **Click "Clean Install" Button**
You'll see a password dialog

### 3. **Enter Admin Password**
Password: `admin123`

### 4. **Watch Real-Time Progress**
You should see:
- Modal dialog: "Installing Backend Dependencies..."
- Progress bar updating from 0% to 100%
- Live logs streaming in terminal-style viewer:
  ```
  🔌 Connected to installation stream
  📛 Step 1/10: Stopping services...
  🗑️  Step 2/10: Removing old containers...
  🗑️  Step 3/10: Cleaning backend dependencies...
  🧼 Step 5/10: Cleaning npm cache...
  📦 Step 6/10: Installing root dependencies...
  ...
  ✅ Clean installation completed successfully!
  ```

### 5. **Verify UI Stayed Running**
- The Admin UI should remain accessible throughout the entire process
- No webpack compilation errors
- No module not found errors

## 🎯 Expected Behavior

### During Installation (5-7 minutes):
1. ⏳ Progress dialog shows "Installing Backend Dependencies..."
2. 📊 Progress bar updates as steps complete
3. 📝 Live logs stream in real-time
4. 🌐 Admin UI remains fully functional
5. ⚠️ Dialog cannot be closed (button disabled)

### After Completion:
1. ✅ Progress bar at 100%
2. ✅ Dialog title: "Clean Installation Complete"
3. ✅ Final message: "✅ Clean installation completed successfully!"
4. ✅ "Close" button enabled
5. ✅ Backend dependencies reinstalled
6. ✅ Backend rebuilt and running

### On Failure:
1. ❌ Dialog title: "Installation Failed"
2. ❌ Error message in logs
3. ❌ "Close" button enabled to dismiss
4. ⚠️ User can retry

## 🔍 Troubleshooting

### If SSE Connection Fails:
```bash
# Check all services are running
lsof -i :8080 -i :8081 -i :3001 | grep LISTEN

# Should show:
# node (8080) - API Server
# haproxy (8081) - HAProxy
# node (3001) - Admin UI
```

### If Progress Doesn't Update:
1. Check browser console for errors
2. Check Network tab for SSE connection
3. Verify HAProxy is routing to API server:
   ```bash
   curl http://localhost:8081/api/health
   ```

### If Clean Install Actually Breaks UI:
1. Check that clean-install.sh still has BACKEND ONLY comments
2. Verify admin-ui/node_modules wasn't deleted
3. Re-run npm install in admin-ui if needed

## 📁 Files Modified

1. **`/scripts/troubleshooting/clean-install.sh`**
   - Removed `admin-ui/node_modules` deletion
   - Removed `admin-ui/build` deletion  
   - Added explanatory comments

2. **`/routes/troubleshooting.ts`**
   - Added `executeScriptWithStreaming()` helper
   - Added `GET /clean-install/stream` SSE endpoint
   - Streams bash output in real-time

3. **`/admin-ui/src/pages/Troubleshooting.tsx`**
   - Added progress dialog state
   - Implemented EventSource for SSE
   - Added progress bar component
   - Added live log viewer
   - Updated clean install description

4. **`/admin-ui/package.json`**
   - Updated proxy to port 8081 (HAProxy)

## 🚀 Next Steps

### Test Now:
1. Go to `http://localhost:3001/troubleshooting`
2. Click "Clean Install"
3. Enter password: `admin123`
4. Watch the progress!

### Future Enhancements:
- [ ] Add pause/cancel capability
- [ ] Show estimated time remaining
- [ ] Add to Nuclear Reset operation
- [ ] Add installation history log
- [ ] Email notification on completion

## 🎉 Summary

You now have a **professional, user-friendly Clean Install** feature with:
- ✅ Real-time progress tracking
- ✅ UI stays functional during installation
- ✅ Live streaming logs
- ✅ Clear success/failure messaging
- ✅ No more confusion about whether it's frozen

**The feature is READY TO TEST!** 🚀
