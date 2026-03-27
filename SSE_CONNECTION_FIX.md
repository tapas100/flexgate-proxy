# SSE Connection Fix - Dashboard Metrics Stream

## 🐛 Problem Identified

The Dashboard was showing "Connection error. Attempting to reconnect..." because the SSE (`/api/stream/metrics`) endpoint was **closing the connection immediately** after the initial "connected" message.

### Root Cause Analysis:

1. **NATS/JetStream not running** - Backend logs showed:
   ```
   ❌ Failed to connect to NATS: CONNECTION_REFUSED
   ❌ Failed to initialize JetStream: CONNECTION_REFUSED
   ⚠️  Continuing without real-time streaming
   ```

2. **Polling fallback bug** - When JetStream was unavailable:
   - The `consumeMetrics()` function called `pollMetrics()`
   - `pollMetrics()` started a setInterval for polling
   - Function immediately `return`ed
   - The `finally` block executed and **closed the SSE connection**
   - Polling interval never got to send data (connection already closed!)

### Code Flow (Before Fix):

```javascript
const consumeMetrics = async () => {
  try {
    if (!jetStreamService.isConnected()) {
      await pollMetrics();  // Sets up interval
      return;               // Returns immediately!
    }
    // ... JetStream code
  } catch (error) {
    await pollMetrics();    // Sets up interval
  } finally {
    // ❌ BUG: This always executes when polling!
    isConnected = false;
    res.end();              // Closes connection immediately!
  }
};
```

## ✅ Solution Implemented

### File: `/src/routes/stream.js`

**Change 1: Modified `pollMetrics()` to return a Promise**

```javascript
const pollMetrics = async () => {
  logger.info(`Client ${clientId} using polling fallback (JetStream unavailable)`);
  
  const sendMetrics = async () => {
    // ... send metrics code
  };

  await sendMetrics(); // Send initial metrics
  
  const pollInterval = setInterval(sendMetrics, 5000);

  // ✅ FIX: Return a Promise that resolves when client disconnects
  return new Promise((resolve) => {
    req.on('close', () => {
      clearInterval(pollInterval);
      resolve();
    });
  });
};
```

**Change 2: Await `pollMetrics()` to prevent premature cleanup**

```javascript
const consumeMetrics = async () => {
  try {
    if (!jetStreamService.isConnected()) {
      logger.warn(`Client ${clientId}: JetStream not connected, using polling fallback`);
      // ✅ FIX: Await keeps function alive until client disconnects
      return await pollMetrics();
    }

    // ... rest of JetStream code
  } catch (error) {
    logger.error(`Stream error for client ${clientId}:`, error);
    logger.info(`Client ${clientId}: Falling back to polling`);
    // ✅ FIX: Await keeps function alive until client disconnects
    return await pollMetrics();
  } finally {
    // Now this only runs when JetStream streaming ends, not during polling
    isConnected = false;
    clearInterval(heartbeat);
    logger.info(`Client ${clientId} stream ended`);
    if (res.writable) {
      res.end();
    }
  }
};
```

## 🎯 How It Works Now

### When JetStream is NOT Available (Current State):

1. Client connects to `/api/stream/metrics`
2. Server sends `data: {"type":"connected","clientId":"..."}`
3. `consumeMetrics()` detects JetStream is down
4. Calls `await pollMetrics()` which:
   - Sends initial metrics immediately
   - Sets up interval to poll DB every 5 seconds
   - Returns a Promise that waits for client disconnect
5. **Connection stays open** ✅
6. Metrics are sent every 5 seconds via polling
7. When client disconnects:
   - Promise resolves
   - `finally` block executes
   - Connection closes cleanly

### When JetStream IS Available (Future):

1. Client connects to `/api/stream/metrics`
2. Server sends `data: {"type":"connected","clientId":"..."}`
3. `consumeMetrics()` detects JetStream is connected
4. Subscribes to JetStream `METRICS` stream
5. **Real-time metrics** streamed as they're published
6. Connection stays open until client disconnects or error occurs

## 🧪 Testing

### Before Fix:
```bash
$ curl -N -H "Accept: text/event-stream" http://localhost:3000/api/stream/metrics
data: {"type":"connected","clientId":"xxx"}

# Connection closes immediately ❌
```

### After Fix (Expected):
```bash
$ curl -N -H "Accept: text/event-stream" http://localhost:3000/api/stream/metrics
data: {"type":"connected","clientId":"xxx"}

data: {"summary":{"totalRequests":0,"avgLatency":"0.00",...},"timestamp":"..."}

: heartbeat

data: {"summary":{"totalRequests":0,"avgLatency":"0.00",...},"timestamp":"..."}

# Connection stays open indefinitely ✅
```

### Browser Console (Expected):
```
🔄 Dashboard render #1
🔄 Dashboard render #2
✅ Connected to JetStream
Dashboard stream connected
Stream connection confirmed. Client ID: xxx
🔄 Dashboard render #3
```

## 📊 Impact

### Before:
- ❌ Dashboard showed "Connection error. Attempting to reconnect..."
- ❌ "Disconnected" chip in red
- ❌ Metrics showing "..."
- ❌ Multiple failed connection attempts in network tab

### After:
- ✅ Dashboard shows "Live" chip in green
- ✅ Metrics update every 5 seconds (polling mode)
- ✅ Stable SSE connection
- ✅ No reconnection loops

## 🚀 Next Steps

1. **Restart the backend** to apply the fix:
   ```bash
   # Backend will auto-restart with nodemon if running
   # Or manually restart:
   cd /Users/tamahant/Documents/GitHub/flexgate-proxy
   npm start
   ```

2. **Refresh the Dashboard** in the browser

3. **Verify in browser console**:
   - Should see "Dashboard stream connected"
   - No "Connection error" alerts

4. **(Optional) Start NATS/JetStream** for real-time streaming:
   ```bash
   # If you have NATS server installed:
   nats-server -js
   
   # Backend will auto-detect and switch from polling to real-time streaming
   ```

## 📝 Files Modified

- `/src/routes/stream.js` - Fixed polling fallback to keep SSE connection alive

## 🔍 Additional Notes

### Why Polling Instead of Real-time?

The system is designed to work with **JetStream** (NATS streaming) for real-time metrics. When JetStream is not available, it falls back to **polling the database** every 5 seconds.

**Polling mode characteristics:**
- ✅ Works without NATS server
- ✅ Reliable fallback
- ⚠️ 5-second delay between updates
- ⚠️ Higher database load

**Real-time mode (with JetStream):**
- ✅ Sub-second latency
- ✅ Event-driven (no polling overhead)
- ❌ Requires NATS server running

### Starting NATS (Optional)

If you want real-time streaming:

```bash
# Install NATS server (if not installed):
# macOS:
brew install nats-server

# Start with JetStream enabled:
nats-server -js

# Backend will automatically detect and connect
```

## ✅ Status

- **Backend fix**: ✅ Complete
- **Frontend optimization**: ✅ Complete (from previous fix)
- **SSE connection**: ✅ Should work after backend restart
- **Ready to test**: ✅ Yes

The Dashboard should now show live metrics (via polling) instead of connection errors!
