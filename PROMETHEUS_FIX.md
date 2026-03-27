# Prometheus Auto-Start Fix - Issue Resolution

## 🐛 Problem Identified

**Issue:** Prometheus was showing as "not running (optional)" in the Admin UI, and the auto-recovery and start scripts were NOT starting it.

**Root Causes Found:**

### 1. Wrong Config File Path ❌
```bash
# Script was looking for:
if [ -f "config/prometheus.yml" ]; then

# But actual location is:
infra/prometheus/prometheus.yml
```

### 2. Missing podman-compose ❌
```bash
# Script only started Prometheus if podman-compose was available:
if [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.dev.yml" ]; then
    podman-compose -f podman-compose.dev.yml up -d prometheus
fi

# But podman-compose was NOT installed!
$ podman-compose
zsh: command not found: podman-compose
```

### 3. Podman Machine Not Running ❌
```bash
# Podman machine was never started:
$ podman machine list
NAME                     VM TYPE     CREATED       LAST UP
podman-machine-default*  applehv     2 months ago  Never

# Containers couldn't start without the machine!
```

---

## ✅ Solutions Implemented

### 1. Fixed Config File Path
**File:** `scripts/start-all-with-deps.sh`

```bash
# Before:
if [ -f "config/prometheus.yml" ]; then

# After:
if [ -f "infra/prometheus/prometheus.yml" ] || [ -f "infra/prometheus/prometheus.dev.yml" ]; then
```

### 2. Added Manual Fallback (No Compose Required)
```bash
# New fallback when podman-compose not available:
else
    # Manual start without compose
    PROM_CONFIG="infra/prometheus/prometheus.yml"
    [ -f "infra/prometheus/prometheus.dev.yml" ] && PROM_CONFIG="infra/prometheus/prometheus.dev.yml"
    
    $RUNTIME run -d \
        --name flexgate-prometheus \
        -p 9090:9090 \
        -v "$(pwd)/$PROM_CONFIG:/etc/prometheus/prometheus.yml:ro" \
        prom/prometheus:latest \
        --config.file=/etc/prometheus/prometheus.yml \
        --storage.tsdb.path=/prometheus
    
    if [ $? -eq 0 ]; then
        print_success "Prometheus started (manual)"
    fi
fi
```

### 3. Auto-Start Podman Machine
**File:** `scripts/start-all-with-deps.sh`

```bash
# Check if Podman machine is running (macOS/Windows)
if podman machine list 2>/dev/null | grep -q "Currently running"; then
    print_success "Podman machine: running"
elif podman machine list 2>/dev/null | grep -q "Never\|Stopped"; then
    print_warning "Podman machine not running - starting..."
    podman machine start 2>/dev/null
    if [ $? -eq 0 ]; then
        print_success "Podman machine started"
        sleep 3
    fi
fi
```

### 4. Created Quick Start Script
**File:** `scripts/start-prometheus.sh`

```bash
#!/bin/bash
# Quick script to start just Prometheus

# Auto-start Podman machine if needed
# Start Prometheus container
# Verify it's running
```

---

## 🎯 How to Use

### Quick Start Prometheus Only
```bash
./scripts/start-prometheus.sh
```

### Start All Services (Now Includes Prometheus)
```bash
./scripts/start-all-with-deps.sh
# Will automatically:
# 1. Start Podman machine
# 2. Start Prometheus container
# 3. Verify it's healthy
```

### Manual Start
```bash
# Start Podman machine first
podman machine start

# Start Prometheus
podman run -d \
    --name flexgate-prometheus \
    -p 9090:9090 \
    -v "$(pwd)/infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
    prom/prometheus:latest \
    --config.file=/etc/prometheus/prometheus.yml \
    --storage.tsdb.path=/prometheus
```

---

## 🔍 Verification

### Check Prometheus is Running
```bash
# Check container
podman ps --filter "name=flexgate-prometheus"

# Check endpoint
curl http://localhost:9090/-/healthy

# Access UI
open http://localhost:9090
```

### Check Admin UI Status Page
Navigate to: http://localhost:3001/troubleshooting

Should now show:
```
Prometheus: ✅ healthy [running]
```

---

## 📋 Updated File Priorities

The scripts now check compose files in this order:

1. **podman-compose.yml** (production)
2. **podman-compose.dev.yml** (development)
3. **Manual podman run** (fallback)

This ensures Prometheus starts even without podman-compose!

---

## 🎉 Test Results

### Before Fix
```
Prometheus: ⚠️ not running (optional)
```

### After Fix
```bash
$ ./scripts/start-all-with-deps.sh

==> Starting Prometheus...
⚠️  Podman machine not running - starting...
✅ Podman machine started
🚀 Starting Prometheus container...
✅ Prometheus started (manual)

$ podman ps
NAME                STATUS        PORTS
flexgate-prometheus  Up 10 seconds  0.0.0.0:9090->9090/tcp
```

Admin UI now shows:
```
Prometheus: ✅ healthy [running]
```

---

## 📝 Files Modified

1. ✅ `scripts/start-all-with-deps.sh` - Fixed Prometheus detection and startup
2. ✅ `scripts/start-prometheus.sh` - NEW: Quick start script
3. ✅ Priority: Check `podman-compose.yml` before `.dev.yml`
4. ✅ Fallback: Manual start without compose

---

## 🔧 Additional Improvements

### Install podman-compose (Optional)
```bash
# macOS
brew install podman-compose

# Or with pip
pip3 install podman-compose
```

### Configure Podman Machine for Docker Compatibility
```bash
# Install helper for Docker API compatibility
sudo /opt/homebrew/Cellar/podman/5.7.0/bin/podman-mac-helper install
podman machine stop
podman machine start
```

---

## ✅ Summary

**Problem:** 3 issues prevented Prometheus from starting
1. ❌ Wrong config path
2. ❌ Missing podman-compose
3. ❌ Podman machine not running

**Solution:** All fixed!
1. ✅ Correct config path: `infra/prometheus/prometheus.yml`
2. ✅ Manual fallback (no compose required)
3. ✅ Auto-start Podman machine

**Result:** Prometheus now starts automatically! 🎉

---

**Fixed:** 2026-02-15  
**Status:** ✅ Resolved  
**Prometheus:** Running on http://localhost:9090
