# Port Configuration Issue - Single Source of Truth Problem

## 🔴 Problem Identified

You've identified a **critical architectural flaw**: the FlexGate port configuration is **not centralized**, leading to inconsistencies and maintenance nightmares.

### Current Situation (BROKEN)

The FlexGate API port is defined in **multiple places**:

1. **`config/flexgate.json`** - Main config file: `"port": 8080`
2. **`scripts/troubleshooting/health-check.sh`** - Health check script: `curl http://localhost:8080/health` (was hardcoded to 3000, now 8080)
3. **`admin-ui/package.json`** - React proxy: `"proxy": "http://localhost:8080"` (was 3000, now 8080)
4. **`scripts/start-with-deps.sh`** - Startup script: Prints "FlexGate API (port 3000)" (STILL WRONG!)
5. **Settings UI** - `/admin/settings`: Allows changing port to any value
6. **Default settings in code** - `routes/settings.ts`: `port: 3000`

### The Inconsistency

```
Config File:           port: 8080  ✅
Health Check Script:   port: 8080  ✅ (just fixed)
Admin UI Proxy:        port: 8080  ✅ (just fixed)
Start Script:          port: 3000  ❌ (hardcoded wrong!)
Settings Default:      port: 3000  ❌ (hardcoded wrong!)
```

**Result**: If you change the port in Settings UI, only `flexgate.json` updates. The health check, proxy, and startup scripts will BREAK.

---

## 🎯 What the Settings Page Is For

The Settings page (`/admin/settings`) is designed to allow **runtime configuration** of FlexGate without editing JSON files manually:

### Intended Purpose ✅
- Change log levels without restarting
- Update database connection strings
- Modify Redis settings
- Configure CORS origins
- Adjust rate limiting
- Update monitoring settings

### Current Problem ❌
- Changing the **server port** in Settings breaks everything
- No validation that dependent systems need updating
- No restart mechanism to apply port changes
- Scripts have hardcoded values

---

## 🔧 Why This Is Dangerous

### Scenario 1: User Changes Port in Settings
```
1. User goes to Settings → Server → Changes port from 8080 to 9000
2. Settings API updates flexgate.json: ✅
3. User restarts FlexGate: Server starts on 9000 ✅
4. Health check script: ❌ Still checks port 8080 (hardcoded)
5. Admin UI: ❌ Can't connect (proxy still points to 8080)
6. HAProxy: ❌ Still proxying to port 8080 (config not updated)
```

**Result**: System appears broken, health checks fail, Admin UI unreachable

### Scenario 2: Multiple Configuration Sources
```
flexgate.json:        8080
health-check.sh:      8080
admin-ui/package.json: 8080
start-with-deps.sh:   3000  ← Still wrong!
haproxy.dev.cfg:      3000  ← Backend target!
```

**Result**: Confusion about which port is "correct"

---

## ✅ Solutions (Choose One or Combine)

### **Option 1: Single Source of Truth (RECOMMENDED)**

Make `config/flexgate.json` the **only** source for port configuration.

#### Implementation:

1. **Health Check Script** - Read port from config:
```bash
# health-check.sh
PORT=$(jq -r '.server.port // 8080' config/flexgate.json)
curl -sf http://localhost:$PORT/health
```

2. **Admin UI Proxy** - Dynamic proxy or environment variable:
```json
// admin-ui/package.json
{
  "proxy": "http://localhost:${FLEXGATE_PORT:-8080}"
}
```
Or use `setupProxy.js`:
```javascript
// admin-ui/src/setupProxy.js
const { readFileSync } = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const config = JSON.parse(readFileSync('../config/flexgate.json'));
  const port = config.server?.port || 8080;
  
  app.use(
    '/api',
    createProxyMiddleware({
      target: `http://localhost:${port}`,
      changeOrigin: true
    })
  );
};
```

3. **Start Script** - Read port from config:
```bash
# start-with-deps.sh
FLEXGATE_PORT=$(jq -r '.server.port // 8080' config/flexgate.json)
echo "Starting FlexGate API (port $FLEXGATE_PORT)..."
```

4. **HAProxy Config** - Template with variable:
```
# haproxy/haproxy.dev.cfg
backend backend_api
    server api1 127.0.0.1:${FLEXGATE_API_PORT} check
```

---

### **Option 2: Lock Critical Settings (SAFER)**

Prevent changing the port (and other critical settings) via Settings UI.

#### Implementation:

```typescript
// routes/settings.ts
const LOCKED_SETTINGS = ['server.port', 'server.host'];

router.put('/', async (req: Request, res: Response) => {
  const newSettings = req.body;
  
  // Check for locked settings
  if (newSettings.server?.port !== undefined) {
    return res.status(403).json({
      success: false,
      error: 'Port cannot be changed via Settings API',
      message: 'Changing the server port requires updating multiple configuration files and restarting services. Please edit config/flexgate.json manually and restart FlexGate.'
    });
  }
  
  // ... rest of update logic
});
```

**UI Change**:
```tsx
// admin-ui/src/components/Settings/GeneralSettings.tsx
<TextField
  fullWidth
  label="Port"
  type="number"
  value={settings.server.port}
  disabled  // ← Make read-only
  helperText="Port is locked. Edit config/flexgate.json to change."
/>
```

---

### **Option 3: Orchestrated Port Change (ADVANCED)**

Make port changes trigger a full system reconfiguration.

#### Implementation:

```typescript
// routes/settings.ts
router.put('/change-port', async (req: Request, res: Response) => {
  const { newPort } = req.body;
  
  // Validate port
  if (newPort < 1024 || newPort > 65535) {
    return res.status(400).json({ error: 'Invalid port' });
  }
  
  // 1. Update flexgate.json
  await updateConfig({ server: { port: newPort } });
  
  // 2. Update health check script
  await updateHealthCheckScript(newPort);
  
  // 3. Update HAProxy config
  await updateHAProxyConfig(newPort);
  
  // 4. Schedule restart
  scheduleRestart();
  
  res.json({
    success: true,
    message: 'Port change scheduled. System will restart in 10 seconds.',
    newPort
  });
});
```

**UI Warning**:
```tsx
<Alert severity="warning">
  Changing the server port will:
  • Update all configuration files
  • Restart FlexGate API
  • Restart Admin UI
  • Reconfigure HAProxy
  • Take ~30 seconds to complete
</Alert>
```

---

## 📋 Recommended Action Plan

### Immediate Fix (Quick)
1. ✅ **Lock the port field in Settings UI** (Option 2)
2. ✅ **Document manual port change process**
3. ✅ **Add validation to prevent port changes**

### Long-term Fix (Proper)
1. ✅ **Implement config file reader in shell scripts** (Option 1)
2. ✅ **Use `setupProxy.js` in Admin UI for dynamic port**
3. ✅ **Add startup validation** (check all configs match)
4. ✅ **Add `make validate-config` command**

### Ultimate Solution (Enterprise)
1. ✅ **Implement orchestrated port change** (Option 3)
2. ✅ **Add configuration version tracking**
3. ✅ **Add rollback mechanism**
4. ✅ **Add pre-flight validation**

---

## 🛠️ Quick Fix Implementation

Let me implement **Option 2** (Lock the port field) right now to prevent further issues:

### 1. Update Settings API
```typescript
// routes/settings.ts - Add validation
if (newSettings.server?.port && newSettings.server.port !== currentConfig.server?.port) {
  return res.status(403).json({
    success: false,
    error: 'Port changes not allowed via API',
    message: 'To change the port, edit config/flexgate.json and restart FlexGate. This ensures all dependent services are properly reconfigured.'
  });
}
```

### 2. Update Settings UI
```tsx
// Make port field read-only
<TextField
  fullWidth
  label="Port"
  type="number"
  value={settings.server.port}
  disabled
  helperText="⚠️ Port is locked. Changing requires manual config edit and full restart."
/>
```

---

## 📝 Summary

**What's Wrong**: Port configuration is scattered across 6+ files with no synchronization.

**Why Settings Exists**: To allow runtime configuration changes for non-critical settings.

**Why Port Is Special**: Changing it requires:
- Updating multiple config files
- Restarting multiple services
- Reconfiguring proxy/load balancers
- Updating health check endpoints

**Solution**: Either:
1. Make config file the single source (read from scripts)
2. Lock critical settings to prevent changes
3. Implement orchestrated change workflow

**Immediate Action**: Lock the port field with a warning message.

---

## 🎯 Your Question Answered

> "what is that settings is for?"

**Settings UI Purpose**:
- ✅ Change log levels, cache TTL, timeouts (safe runtime changes)
- ✅ Update database/Redis credentials (no port conflicts)
- ✅ Configure monitoring, tracing, security (isolated settings)
- ❌ **NOT for**: Changing ports, hosts, or other "infrastructure" settings that require coordinated updates across multiple systems

The port field **should not** be editable in Settings UI because it creates this exact problem you discovered: scripts have hardcoded values that don't sync with the config file.

**The Fix**: Remove port editability from Settings UI, or implement proper single-source-of-truth configuration reading in all scripts.
