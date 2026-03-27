# ✅ Enhanced Port Availability Checking

## 🎯 Feature Summary

**Enhanced the System Requirements check to show WHAT is using each port, not just that it's in use!**

---

## 🔍 What Changed

### Before:
```
❌ Port 3001 already in use
node      60209 tamahant   21u  IPv4 0x... TCP *:redwood-broker (LISTEN)
```

### After:
```
❌ Port 3001 already in use by: React dev server
   Command: /opt/homebrew/Cellar/node/24.8.0/bin/node /Users/t...
```

---

## 📋 Detection Logic

The script now intelligently identifies what's using each port:

| Port | Service | Detection Method |
|------|---------|------------------|
| 3000 | FlexGate Backend | Looks for "flexgate" in command |
| 3001 | Admin UI | Detects "react-scripts" or "webpack" |
| 5432 | PostgreSQL | Detects "postgres" command |
| 6379 | Redis | Detects "redis" command |
| 8080 | HAProxy | Detects "haproxy" command |
| 9090 | Prometheus | Detects "prometheus" command |

**Fallback:** If none match, shows `COMMAND (PID: xxx, User: username)`

---

## 🛠️ Technical Implementation

### 1. Enhanced Shell Script (`check-requirements.sh`)

```bash
check_port() {
    local PORT=$1
    local SERVICE_NAME=$2
    
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        # Get process info
        local PROCESS_INFO=$(lsof -i :$PORT -sTCP:LISTEN | grep LISTEN | head -1)
        local PID=$(echo "$PROCESS_INFO" | awk '{print $2}')
        local COMMAND=$(echo "$PROCESS_INFO" | awk '{print $1}')
        
        # Get full command line
        local FULL_COMMAND=$(ps -p $PID -o command=)
        
        # Smart detection
        if [[ "$FULL_COMMAND" == *"postgres"* ]]; then
            USAGE_INFO="PostgreSQL database"
        elif [[ "$FULL_COMMAND" == *"redis"* ]]; then
            USAGE_INFO="Redis server"
        # ... more patterns
        fi
        
        echo "❌ Port $PORT already in use by: $USAGE_INFO"
        echo "   Command: ${FULL_COMMAND}..."
    else
        echo "✅ Port $PORT available ($SERVICE_NAME)"
    fi
}
```

### 2. Updated Backend Parser (`routes/troubleshooting.ts`)

```typescript
} else if (line.includes('Port')) {
  const portMatch = line.match(/Port (\d+)/);
  const portNum = portMatch ? portMatch[1] : 'unknown';
  
  // Extract what's using the port
  if (isUnhealthy && line.includes('by:')) {
    const usageMatch = line.match(/by: (.+)/);
    if (usageMatch) {
      message = `Port ${portNum}: ${usageMatch[1]}`;
    }
  }
  
  systemChecks.push({
    name: 'Port Availability',
    status: isHealthy ? 'healthy' : 'unhealthy',
    message,
  });
}
```

---

## 📊 Example Output

### When All Ports Available:
```
✅ Port 3000 available (FlexGate backend)
✅ Port 3001 available (Admin UI)
✅ Port 5432 available (PostgreSQL)
✅ Port 6379 available (Redis)
✅ Port 8080 available (HAProxy)
✅ Port 9090 available (Prometheus)
```

### When Ports In Use:
```
❌ Port 3000 already in use by: FlexGate (already running)
   Command: node ./dist/bin/www...

❌ Port 3001 already in use by: React dev server
   Command: /opt/homebrew/Cellar/node/24.8.0/bin/node /Users/t...

❌ Port 5432 already in use by: PostgreSQL database
   Command: /opt/homebrew/opt/postgresql@16/bin/postgres -D /o...

❌ Port 6379 already in use by: Redis server
   Command: /opt/homebrew/opt/redis/bin/redis-server 127.0.0.1...

❌ Port 8080 already in use by: HAProxy load balancer
   Command: haproxy -f haproxy/haproxy.dev.cfg -D -p .haproxy....

❌ Port 9090 already in use by: Prometheus monitoring
   Command: prometheus --config.file=infra/prometheus/promethe...
```

### Unknown Process:
```
❌ Port 8888 already in use by: java (PID: 12345, User: tamahant)
   Command: java -jar some-application.jar...
```

---

## 🎨 UI Display

The Troubleshooting page will now show:

**Before:**
```
⚠️ Port Availability
Port 3001 already in use
```

**After:**
```
⚠️ Port Availability  
Port 3001: React dev server
```

Much more informative! Users can immediately see what's conflicting.

---

## 🔧 Files Modified

1. ✅ `scripts/troubleshooting/check-requirements.sh`
   - Enhanced `check_port()` function
   - Smart process detection
   - Shows command line info

2. ✅ `routes/troubleshooting.ts`
   - Updated parser to extract usage info
   - Better message formatting

---

## 🚀 How to Use

### Via Troubleshooting Page:
1. Navigate to **Settings → Troubleshooting**
2. Click **"Check System Requirements"**
3. View enhanced port availability info

### Via Command Line:
```bash
cd /path/to/flexgate-proxy
./scripts/troubleshooting/check-requirements.sh
```

---

## 📱 Benefits

1. **Better Debugging** - Know exactly what's using each port
2. **Faster Resolution** - No need to run separate `lsof` commands
3. **User-Friendly** - Non-technical users can understand the issue
4. **Actionable** - Clear indication if it's FlexGate already running or a conflict

---

## 🎯 Example Scenarios

### Scenario 1: FlexGate Already Running
```
❌ Port 3000 already in use by: FlexGate (already running)
```
**Action:** Stop the running instance first

### Scenario 2: Different Service
```
❌ Port 3000 already in use by: Node.js application
```
**Action:** Either stop that app or configure FlexGate to use a different port

### Scenario 3: System Service
```
❌ Port 5432 already in use by: PostgreSQL database
```
**Action:** Good! PostgreSQL should be running

---

## ✅ Status

**Implemented:** 2026-02-15  
**Tested:** macOS (lsof + ps commands)  
**Compatible:** macOS, Linux  
**Backend:** Node.js + TypeScript  
**Frontend:** React + Material-UI

---

**Result:** Much better user experience when diagnosing port conflicts! 🎉
