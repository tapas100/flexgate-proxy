# Auto-Recovery System - All Scenarios Covered

## Overview
The FlexGate auto-recovery system (`scripts/troubleshooting/auto-recover.sh`) handles comprehensive failure scenarios for all system components.

**Version:** 2.0  
**Execution Time:** ~8-15 seconds  
**API Endpoint:** `POST /api/troubleshooting/auto-recover`

---

## 🔍 Scenarios Covered

### 1. PostgreSQL Failures

#### Scenario 1.1: Container Doesn't Exist
**Symptom:** Container not found  
**Detection:** `podman ps` returns empty  
**Action:**
- Create and start container using compose file
- Fallback to manual `podman run` if no compose file
- Wait 3 seconds for initialization

#### Scenario 1.2: Container Stopped/Exited
**Symptom:** Container exists but not running  
**Detection:** Status shows "Exited" or "Stopped"  
**Action:**
- Start existing container: `podman start flexgate-postgres`
- Wait 2 seconds for services

#### Scenario 1.3: Container in Restart Loop
**Symptom:** Continuous restart attempts  
**Detection:** Status shows "Restarting"  
**Action:**
- Force stop container
- Hard restart to break the loop
- Check for volume/permission issues

#### Scenario 1.4: Container Running but Unresponsive
**Symptom:** Container shows "Up" but pg_isready fails  
**Detection:** `pg_isready` command times out  
**Action:**
- Restart container: `podman restart flexgate-postgres`
- Wait 2 seconds

#### Scenario 1.5: Cannot Execute Queries
**Symptom:** pg_isready passes but queries fail  
**Detection:** `SELECT 1` query fails  
**Action:**
- Hard stop and start (not restart)
- Wait 3 seconds for full initialization
- May indicate corruption

---

### 2. Redis Failures

#### Scenario 2.1: Container Doesn't Exist
**Action:** Create and start using compose or manual run

#### Scenario 2.2: Container Stopped
**Action:** Start existing container

#### Scenario 2.3: Container in Restart Loop
**Action:** Force stop and restart

#### Scenario 2.4: Not Responding to PING
**Symptom:** `redis-cli ping` doesn't return PONG  
**Action:** Restart container
**Additional:** Check memory usage after recovery

---

### 3. HAProxy Failures (Optional Service)

#### Scenario 3.1: Container Stopped
**Action:** Start container

#### Scenario 3.2: Container in Restart Loop
**Action:** Force restart

#### Scenario 3.3: Stats Page Not Accessible
**Symptom:** Running but stats on :8080 or :8404 unreachable  
**Action:** Log warning (may be config issue)

---

### 4. Prometheus Failures (Optional Service)

#### Scenario 4.1: Container Stopped
**Action:** Start container

#### Scenario 4.2: Container in Restart Loop
**Action:** Force restart

#### Scenario 4.3: Not Responding to Health Check
**Symptom:** Container up but `/-/healthy` fails  
**Action:** Log warning

---

### 5. FlexGate API Failures

#### Scenario 5.1: Process Running but Unresponsive
**Symptom:** Node process exists but /health fails  
**Detection:**
```bash
pgrep -f "node.*app.ts"
pgrep -f "node.*dist/app.js"
```
**Action:**
- Kill with SIGKILL (-9)
- Wait 1 second
- Notify for manual restart

#### Scenario 5.2: Port 3000 Occupied by Another Process
**Symptom:** Port conflict preventing startup  
**Detection:** `lsof -ti:3000` returns different PID  
**Action:**
- Identify process name
- Kill conflicting process
- Log what was killed

#### Scenario 5.3: Zombie Processes
**Symptom:** Multiple defunct Node processes  
**Detection:** `ps aux | grep defunct`  
**Action:**
- Kill all FlexGate-related processes
- Clean up zombie processes

#### Scenario 5.4: Disk Space Full
**Symptom:** Cannot write logs or temp files  
**Detection:** `df -h` shows >90% usage  
**Action:**
- Log warning about disk space
- Suggest cleaning old logs
- May prevent startup

#### Scenario 5.5: Missing Dependencies
**Symptom:** node_modules folder not found  
**Detection:** Directory check  
**Action:**
- Log error
- Suggest `npm install`

---

### 6. Admin UI Failures

#### Scenario 6.1: React Dev Server Not Running
**Detection:** Port 3001 not responding  
**Action:** Log info, suggest starting manually

#### Scenario 6.2: Process Running but Not Responding
**Symptom:** webpack-dev-server PID exists but port unreachable  
**Action:** Log PID, may be compiling or in error state

---

### 7. Network Issues

#### Scenario 7.1: Localhost Resolution Failure
**Detection:** `ping localhost` fails  
**Action:** Log critical error (DNS/hosts file issue)

#### Scenario 7.2: No Ports in Use
**Symptom:** None of the expected ports are bound  
**Action:** Indicates no services running at all

#### Scenario 7.3: Port Conflicts
**Symptom:** Multiple processes competing for same port  
**Action:** Kill older processes, keep newest

---

### 8. Database Connectivity (Post-Recovery)

#### Scenario 8.1: PostgreSQL Running but Cannot Connect
**Symptom:** Container healthy but auth fails  
**Action:**
- Check credentials
- Verify .env file
- Log connection error details

#### Scenario 8.2: Empty Database Schema
**Symptom:** No tables found  
**Detection:** Query `information_schema.tables`  
**Action:**
- Warn about missing migrations
- Suggest `npm run migrate`

#### Scenario 8.3: Partial Schema
**Symptom:** Some tables exist but count is low  
**Action:** Log table count, may need migration

---

### 9. Redis Connectivity (Post-Recovery)

#### Scenario 9.1: Cannot Write to Redis
**Detection:** `SET` command fails  
**Action:** Log warning about write operations

#### Scenario 9.2: Can Write but Not Read
**Detection:** `GET` command fails or returns wrong value  
**Action:** May indicate memory/eviction issues

---

### 10. Comprehensive Checks

#### Scenario 10.1: All Services Down
**Action:**
- Start PostgreSQL → wait
- Start Redis → wait
- Kill hung API processes
- Provide manual restart steps

#### Scenario 10.2: Cascading Failures
**Example:** Database down → API fails → Admin UI can't connect  
**Action:**
- Recover in order: Database → Cache → API → UI
- Wait between each step
- Verify connectivity after each

---

## 🎯 Recovery Priority Order

1. **PostgreSQL** - Foundation (3s wait)
2. **Redis** - Caching (1s wait)
3. **HAProxy** - Load balancing (1s wait, optional)
4. **Prometheus** - Metrics (1s wait, optional)
5. **FlexGate API** - Core service (manual restart)
6. **Admin UI** - Frontend (manual restart)

---

## 📊 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All services healthy or successfully recovered |
| 1 | Recovery attempted but manual intervention needed |

---

## 🔧 Technical Implementation

### Recovery Flags
```bash
POSTGRES_RECOVERED=0    # Track if PostgreSQL was touched
REDIS_RECOVERED=0       # Track if Redis was touched
API_RECOVERED=0         # Track if API was killed
HAPROXY_RECOVERED=0     # Track HAProxy actions
PROMETHEUS_RECOVERED=0  # Track Prometheus actions
```

### Smart Detection
```bash
# Check container status
STATUS=$($RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Status}}")

# Multiple status checks
if [ -z "$STATUS" ]; then
    # Container doesn't exist
elif echo "$STATUS" | grep -qi "exited|stopped"; then
    # Container stopped
elif echo "$STATUS" | grep -qi "restarting"; then
    # Restart loop
else
    # Running - check health
fi
```

### Process Cleanup
```bash
# Kill hung processes
pkill -9 -f "node.*app.ts"

# Check port usage
lsof -ti:3000

# Find zombie processes
ps aux | grep defunct
```

---

## 🚀 Usage

### Via API (Recommended)
```bash
curl -X POST http://localhost:3000/api/troubleshooting/auto-recover
```

**Response:**
```json
{
  "success": true,
  "message": "Auto-recovery started in background"
}
```

Script runs asynchronously - check server logs for results.

### Direct Script Execution
```bash
./scripts/troubleshooting/auto-recover.sh
```

**Output:**
```
🔧 FlexGate Auto-Recovery System v2.0

🔍 Checking PostgreSQL...
   ✅ PostgreSQL is healthy

🔍 Checking Redis...
   ✅ Redis is healthy (using 2.5M)

🔍 Checking HAProxy...
   ✅ HAProxy is healthy

🔍 Checking Prometheus...
   ✅ Prometheus is healthy

🔍 Checking FlexGate API...
   ✅ FlexGate API is healthy

🔍 Checking Admin UI...
   ✅ Admin UI is responding

================================================
📊 RECOVERY SUMMARY
================================================
✅ No recovery needed - all services healthy!

System Status:
  • All containers running
  • Database connections working
  • API responding normally
================================================
```

---

## 🔍 Troubleshooting the Auto-Recovery

### Script Hangs
**Cause:** Container command stuck  
**Fix:** Add timeout to Docker/Podman commands

### False Positives
**Cause:** Service starting up slowly  
**Fix:** Increase wait times in script

### Repeated Failures
**Cause:** Underlying config/resource issue  
**Fix:** Check logs for root cause:
```bash
podman logs flexgate-postgres
podman logs flexgate-redis
tail -f logs/combined.log
```

### Network Timeout (504)
**Cause:** Script taking >60 seconds  
**Fix:** Already implemented - runs in background

---

## 📝 Future Enhancements

### Potential Additions
- [ ] Email/Slack notifications on recovery
- [ ] Retry logic with exponential backoff
- [ ] Automatic log collection on failure
- [ ] Integration with monitoring (Prometheus alerts)
- [ ] Recovery metrics tracking
- [ ] Automatic rollback on failed recovery

### Advanced Scenarios
- [ ] Database connection pool exhaustion
- [ ] Memory leak detection in API
- [ ] Disk I/O bottleneck detection
- [ ] Network partition handling
- [ ] SSL certificate expiration checks

---

## 📚 Related Documentation

- [AUTO_RECOVERY_EXPLAINED.md](./AUTO_RECOVERY_EXPLAINED.md) - Why we built this
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Manual troubleshooting guide
- [QUICK_START.md](./QUICK_START.md) - Initial setup guide

---

**Last Updated:** 2026-02-15  
**Status:** ✅ Production Ready
