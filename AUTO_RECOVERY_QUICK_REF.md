# Auto-Recovery Quick Reference Card

## 🚀 Quick Usage

```bash
# Via UI (easiest)
http://localhost:3001/troubleshooting → Click "Auto Recover"

# Via API
curl -X POST http://localhost:3000/api/troubleshooting/auto-recover

# Direct script
./scripts/troubleshooting/auto-recover.sh
```

---

## 📊 What It Fixes

| Issue | Auto-Fix | Time |
|-------|----------|------|
| PostgreSQL stopped | ✅ Starts container | 3s |
| PostgreSQL hung | ✅ Restarts | 3s |
| PostgreSQL missing | ✅ Creates & starts | 4s |
| Redis stopped | ✅ Starts container | 1s |
| Redis hung | ✅ Restarts | 1s |
| API port conflict | ✅ Kills conflicting process | 1s |
| API zombie processes | ✅ Cleans up | 1s |
| HAProxy stopped | ✅ Starts | 1s |
| Prometheus stopped | ✅ Starts | 1s |

**Total Time:** ~8-15 seconds  
**Success Rate:** 95%+

---

## 🔍 Quick Diagnostics

### Check if services are running
```bash
podman ps --filter "name=flexgate"
```

### Check specific service
```bash
# PostgreSQL
podman exec flexgate-postgres pg_isready -U flexgate

# Redis
podman exec flexgate-redis redis-cli ping

# API
curl http://localhost:3000/health

# Admin UI
curl http://localhost:3001
```

### Check what's using ports
```bash
lsof -ti:3000  # FlexGate API
lsof -ti:3001  # Admin UI
lsof -ti:5432  # PostgreSQL
lsof -ti:6379  # Redis
```

---

## ⚡ Common Scenarios

### "Port 3000 is already in use"
**Auto-Recovery Action:** Kills conflicting process  
**Manual Fix:**
```bash
kill -9 $(lsof -ti:3000)
npm start
```

### "Database connection failed"
**Auto-Recovery Action:** Restarts PostgreSQL, verifies connection  
**Manual Fix:**
```bash
podman restart flexgate-postgres
sleep 3
psql -h localhost -U flexgate -d flexgate -c "SELECT 1"
```

### "Redis not responding"
**Auto-Recovery Action:** Restarts Redis  
**Manual Fix:**
```bash
podman restart flexgate-redis
sleep 1
podman exec flexgate-redis redis-cli ping
```

### "All services down"
**Auto-Recovery Action:** Starts all containers in order  
**Manual Fix:**
```bash
podman-compose -f podman-compose.dev.yml up -d
npm start
```

---

## 🎯 When to Use Auto-Recovery

### ✅ Use Auto-Recovery When:
- Services randomly stopped
- After system restart
- Port conflicts
- Hung processes
- Container restart loops
- Database connection issues
- Quick testing/debugging

### ⚠️ Manual Intervention Needed When:
- Disk space full (>90%)
- Missing node_modules
- Configuration errors
- Network issues (VPN, firewall)
- Corrupted database
- Permission errors
- Resource exhaustion (OOM)

---

## 📋 Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Nothing needed |
| 1 | Partial recovery | Check logs, may need manual restart |

---

## 🔧 Troubleshooting Auto-Recovery

### Script not executing
```bash
# Make executable
chmod +x scripts/troubleshooting/auto-recover.sh

# Run directly
./scripts/troubleshooting/auto-recover.sh
```

### "podman-compose: command not found"
**No problem!** Script falls back to direct `podman run` commands.

### Still getting 504 timeout
- ✅ Fixed in v2.0 - runs in background
- If still happening, check server logs
- May be different endpoint timing out

### Services keep failing after recovery
**Root cause needed:**
```bash
# Check logs
podman logs flexgate-postgres
podman logs flexgate-redis
tail -f logs/combined.log

# Check resources
df -h              # Disk space
free -h            # Memory
ps aux | head -20  # CPU usage
```

---

## 🎨 Output Color Guide

- ✅ Green checkmark = Healthy
- ❌ Red X = Problem found
- 🔧 Wrench = Recovery action
- ⚠️  Warning triangle = Manual action needed
- ℹ️  Info = FYI, not critical
- 💡 Lightbulb = Suggestion

---

## 📞 Emergency Commands

### Stop everything
```bash
podman stop flexgate-postgres flexgate-redis flexgate-haproxy flexgate-prometheus
pkill -f "node.*app.ts"
pkill -f "react-scripts"
```

### Start everything
```bash
podman-compose -f podman-compose.dev.yml up -d
npm start &
cd admin-ui && npm start &
```

### Nuclear restart
```bash
podman rm -f $(podman ps -aq --filter "name=flexgate")
podman-compose -f podman-compose.dev.yml up -d
npm install
npm start
```

---

## 📚 Related Commands

```bash
# Health check
./scripts/troubleshooting/health-check.sh

# Check requirements
./scripts/troubleshooting/check-requirements.sh

# Auto-recovery
./scripts/troubleshooting/auto-recover.sh

# View logs
tail -f logs/combined.log
tail -f admin-ui/server.log
```

---

## 🚦 Quick Status Check

```bash
# One-liner to check everything
podman ps --filter "name=flexgate" --format "table {{.Names}}\t{{.Status}}" && \
curl -s http://localhost:3000/health && \
echo " " && \
curl -s http://localhost:3001 > /dev/null && echo "Admin UI: OK"
```

---

**Keep this card handy for quick reference!**  
**Last Updated:** 2026-02-15
