# Clean Install with Standalone Progress Server

## Architecture

```
┌─────────────────┐
│   Admin UI      │ (port 3001)
│   (React)       │
└────────┬────────┘
         │
         ├──→ Main API Server (port 8080)
         │    └─ Gets KILLED during clean install
         │
         └──→ Progress Server (port 8082) ← INDEPENDENT!
              └─ Stays alive
              └─ Spawns clean-install.sh
              └─ Streams SSE progress
              └─ Auto-exits when done
```

## How It Works

### 1. User Clicks "Clean Install"
- Admin UI opens password dialog
- User enters `admin123`

### 2. UI Connects to Progress Server
```javascript
const eventSource = new EventSource(
  'http://localhost:8082/stream?password=admin123'
);
```

### 3. Progress Server Spawns Script
```javascript
const child = spawn('bash', ['clean-install.sh']);

// Stream stdout → SSE → Browser
child.stdout.on('data', (data) => {
  res.write(`data: ${JSON.stringify({
    type: 'progress',
    step: 3,
    totalSteps: 10,
    progress: 30,
    message: "📦 Installing dependencies...",
    timestamp: "2026-02-15T13:45:00.000Z"
  })}\n\n`);
});
```

### 4. Clean Install Kills Main API
```bash
# Step 1: Stop services
pkill -f "node.*app.ts"  # ← Main API dies here!
```

**But Progress Server (8082) keeps running!** ✅

### 5. Installation Completes
- Progress server sends final message
- Closes SSE connection
- Exits itself

## JSON Message Format

### Connection
```json
{
  "type": "connected",
  "message": "🔌 Connected to installation stream",
  "timestamp": "2026-02-15T13:45:00.000Z"
}
```

### Progress Update
```json
{
  "type": "progress",
  "step": 6,
  "totalSteps": 10,
  "progress": 60,
  "message": "📦 Step 6/10: Installing root dependencies...",
  "timestamp": "2026-02-15T13:45:30.000Z"
}
```

### Error (if any)
```json
{
  "type": "progress",
  "step": 6,
  "totalSteps": 10,
  "progress": 60,
  "message": "npm ERR! Could not resolve dependency",
  "level": "error",
  "timestamp": "2026-02-15T13:45:35.000Z"
}
```

### Completion
```json
{
  "type": "complete",
  "success": true,
  "exitCode": 0,
  "progress": 100,
  "message": "✅ Clean installation completed successfully!",
  "totalLogs": 247,
  "timestamp": "2026-02-15T13:50:00.000Z"
}
```

## Usage

### Start Progress Server
```bash
# From project root
node scripts/progress-server.js

# Output:
# 🚀 Progress Server Ready
# ========================
# Port: 8082
# Endpoint: http://localhost:8082/stream?password=admin123
# 
# Waiting for clean install request...
```

### Test Manually
```bash
# Test with curl
curl -N http://localhost:8082/stream?password=admin123

# You'll see SSE stream:
data: {"type":"connected","message":"🔌 Connected to installation stream"}

data: {"type":"progress","step":1,"totalSteps":10,"progress":10,"message":"📛 Step 1/10: Stopping services..."}

data: {"type":"progress","step":2,"totalSteps":10,"progress":20,"message":"🗑️  Step 2/10: Removing old containers..."}
...
```

### From Admin UI
1. Go to: `http://localhost:3001/troubleshooting`
2. Click "Clean Install"
3. Enter password: `admin123`
4. Watch progress stream!

## Benefits

### ✅ Survives API Server Restart
- Main API (8080) can be killed/restarted
- Progress server (8082) keeps streaming

### ✅ Rich JSON Data
- Progress percentage (0-100%)
- Current step (e.g., "6/10")
- Detailed log messages
- Timestamps
- Error levels

### ✅ Auto-Cleanup
- Progress server exits after installation
- No manual cleanup needed
- No lingering processes

### ✅ Simple & Lightweight
- ~150 lines of code
- No external dependencies
- Just Express + child_process
- No database needed

## Troubleshooting

### Progress server won't start
```bash
# Check if port 8082 is already in use
lsof -i :8082

# Kill existing process
kill <PID>
```

### No progress updates
```bash
# Check progress server logs
node scripts/progress-server.js

# Should show:
# 🔌 Client connected - starting clean installation...
# 📦 Spawned clean-install.sh (PID: 12345)
```

### Client disconnected error
```bash
# Browser disconnected before completion
# Progress server will kill the installation
# This is expected behavior
```

## Security

- ✅ Password protected (admin123)
- ✅ CORS enabled for localhost only
- ✅ Auto-exits after completion
- ✅ Kills child process on client disconnect

## Future Enhancements

- [ ] Store logs in file for later review
- [ ] Add WebSocket support as alternative
- [ ] Email notification on completion
- [ ] Slack/Discord webhook integration
- [ ] Resume capability (using JetStream)

## Files

- **`/scripts/progress-server.js`** - Standalone SSE server
- **`/scripts/troubleshooting/clean-install.sh`** - Installation script
- **`/admin-ui/src/pages/Troubleshooting.tsx`** - UI component

## Testing

Start all services:
```bash
# Terminal 1: Main API
npm start

# Terminal 2: Progress Server
node scripts/progress-server.js

# Terminal 3: Admin UI
cd admin-ui && npm start

# Terminal 4: HAProxy
haproxy -f haproxy/haproxy.dev.cfg
```

Then test clean install from UI!
