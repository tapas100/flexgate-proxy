# Auto-Start Progress Server for Clean Install

## Problem Solved ✅

**Before:** User had to manually run `npm run progress-server` before clicking Clean Install  
**After:** Progress server automatically starts when Clean Install button is clicked

## How It Works

### Flow Diagram

```
User clicks "Clean Install" button
          ↓
Enter admin password (admin123)
          ↓
Frontend: POST /api/troubleshooting/start-progress-server
          ↓
Backend checks if progress server already running (lsof -ti:8082)
          ↓
┌─────────┴─────────┐
│                   │
Already Running    Not Running
│                   │
Return success     Start it with:
                   spawn('node', ['scripts/progress-server.js'], {
                     detached: true,  // Survives parent
                     stdio: 'ignore'  // No pipes
                   })
                   child.unref()      // Detach from parent
          ↓
Backend returns: { success: true, port: 8082, pid: 12345 }
          ↓
Frontend: EventSource('http://localhost:8082/stream?password=...')
          ↓
Progress Server receives connection
          ↓
Spawns: bash scripts/troubleshooting/clean-install.sh
          ↓
Streams progress via SSE → Browser updates UI
          ↓
Clean Install Step 1: Stops main API server (port 8080)
          ↓
Progress Server (8082) keeps running! ✅
          ↓
Installation completes
          ↓
Progress server sends "complete" message and exits
```

## Code Changes

### 1. Backend: New Endpoint

**File:** `routes/troubleshooting.ts`

```typescript
router.post('/start-progress-server', async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body;

  // Verify password
  if (password !== 'admin123') {
    res.status(401).json({ success: false, error: 'Invalid admin password' });
    return;
  }

  // Check if already running
  try {
    const checkResult = await execAsync('lsof -ti:8082');
    if (checkResult.stdout.trim()) {
      res.json({
        success: true,
        message: 'Progress server already running',
        port: 8082,
        alreadyRunning: true,
      });
      return;
    }
  } catch (error) {
    // Not running, continue to start it
  }

  // Start progress server in background (detached)
  const progressServerPath = path.join(process.cwd(), 'scripts/progress-server.js');
  const child = spawn('node', [progressServerPath], {
    detached: true,  // ← CRITICAL: Process survives parent exit
    stdio: 'ignore', // ← No stdio pipes
    cwd: process.cwd(),
  });

  child.unref(); // ← Detach from parent process

  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s for startup

  res.json({
    success: true,
    message: 'Progress server started successfully',
    port: 8082,
    pid: child.pid,
  });
});
```

**Key Points:**
- `detached: true` - Process runs independently of parent
- `stdio: 'ignore'` - No stdin/stdout/stderr pipes to parent
- `child.unref()` - Parent can exit without waiting for child
- **Result:** Progress server survives when main API (port 8080) is killed

### 2. Frontend: Auto-Start Before SSE Connection

**File:** `admin-ui/src/pages/Troubleshooting.tsx`

```typescript
const runCleanInstall = async () => {
  // ... verify password ...
  
  try {
    // Step 1: Start the standalone progress server
    setInstallLogs(['🚀 Starting progress server...']);
    
    const startResponse = await fetch('/api/troubleshooting/start-progress-server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!startResponse.ok) {
      const error = await startResponse.json();
      setInstallLogs(prev => [...prev, `❌ Failed to start progress server: ${error.error}`]);
      setInstallComplete(true);
      setInstallSuccess(false);
      return;
    }

    const startResult = await startResponse.json();
    setInstallLogs(prev => [...prev, `✅ ${startResult.message} (port ${startResult.port})`]);
    
    // Step 2: Connect to the progress stream
    const eventSource = new EventSource(
      `http://localhost:8082/stream?password=${encodeURIComponent(password)}`
    );
    
    // ... handle SSE messages ...
  } catch (error: any) {
    setInstallLogs(prev => [...prev, `❌ Error: ${error.message}`]);
    setInstallComplete(true);
    setInstallSuccess(false);
  }
};
```

**Benefits:**
- No manual server startup required
- Progress server only runs when needed
- Idempotent: Safe to call multiple times (checks if already running)

## Testing

### 1. Verify API Server Running
```bash
curl http://localhost:8080/health
# Should return: {"status":"healthy"}
```

### 2. Test Progress Server Auto-Start
```bash
# Should NOT be running initially
lsof -i :8082
# (empty result)

# Start via API
curl -X POST http://localhost:8080/api/troubleshooting/start-progress-server \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}'

# Should return:
# {
#   "success": true,
#   "message": "Progress server started successfully",
#   "port": 8082,
#   "pid": 12345
# }

# Verify it's running
lsof -i :8082
# node    12345 user   23u  IPv6 0x123456  0t0  TCP *:8082 (LISTEN)
```

### 3. Test Idempotency (Call Again)
```bash
# Call again while already running
curl -X POST http://localhost:8080/api/troubleshooting/start-progress-server \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}'

# Should return:
# {
#   "success": true,
#   "message": "Progress server already running",
#   "port": 8082,
#   "alreadyRunning": true
# }
```

### 4. Test from UI
1. Go to: `http://localhost:3001/troubleshooting`
2. Click "Clean Install"
3. Enter password: `admin123`
4. Watch logs in progress dialog:
   ```
   🚀 Starting progress server...
   ✅ Progress server started successfully (port 8082)
   🔌 Connected to installation stream
   📛 Step 1/10: Stopping services...
   ...
   ```

## Architecture Benefits

### ✅ Zero Manual Intervention
- User just clicks button
- Everything starts automatically

### ✅ Survives API Server Restart
```
Main API (8080)     Progress Server (8082)
      ↓                      ↓
   RUNNING                RUNNING
      ↓                      ↓
 Clean Install             │
   Step 1: Kill API        │
      ↓                      ↓
   STOPPED ❌           RUNNING ✅
      ↓                      ↓
   Reinstalling            Streaming progress
      ↓                      ↓
   RESTARTED              Auto-exits
```

### ✅ No Port Conflicts
- Checks if already running before starting
- Safe to click Clean Install multiple times
- Old progress servers exit after completion

### ✅ Secure
- Password verified before starting server
- Same admin password for both endpoints
- No anonymous server spawning

## Troubleshooting

### Progress server won't start
```bash
# Check logs
curl -X POST http://localhost:8080/api/troubleshooting/start-progress-server \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' -v

# If port 8082 is stuck
lsof -ti :8082 | xargs kill -9
```

### Wrong password
```bash
curl -X POST http://localhost:8080/api/troubleshooting/start-progress-server \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}'

# Returns:
# {
#   "success": false,
#   "error": "Invalid admin password"
# }
# HTTP 401
```

### Manual cleanup
```bash
# Kill all progress servers
pkill -f "progress-server.js"

# Or kill specific PID
kill <PID from lsof output>
```

## Files Modified

1. ✅ `routes/troubleshooting.ts` - Added `/start-progress-server` endpoint
2. ✅ `admin-ui/src/pages/Troubleshooting.tsx` - Auto-start before SSE connection
3. ✅ `package.json` - Added `npm run progress-server` script (for manual testing)

## Summary

**Problem:** User had to manually run progress server before using Clean Install  
**Solution:** API endpoint that spawns detached progress server automatically  
**Result:** One-click Clean Install with zero manual setup! 🎉

The progress server:
- ✅ Starts automatically when needed
- ✅ Survives API server shutdown
- ✅ Only runs during installation
- ✅ Auto-exits when done
- ✅ Password protected
- ✅ Idempotent (safe to start multiple times)
