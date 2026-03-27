# Prometheus Auto-Recovery - Quick Test Guide

## Quick Test

```bash
# 1. Stop Prometheus (if running)
if [ -f .prometheus.pid ]; then
    kill $(cat .prometheus.pid) 2>/dev/null
    rm .prometheus.pid
fi

# 2. Verify Prometheus is down
curl http://localhost:9090/-/healthy
# Should fail with "Connection refused"

# 3. Run auto-recovery
./scripts/test-prometheus-recovery.sh

# 4. Verify Prometheus is up
curl http://localhost:9090/-/healthy
# Should return: "Prometheus Server is Healthy."

# 5. Check Prometheus UI
open http://localhost:9090
```

## Expected Output

### Before Recovery
```
$ curl http://localhost:9090/-/healthy
curl: (7) Failed to connect to localhost port 9090: Connection refused
```

### During Recovery
```
🧪 Testing Prometheus Auto-Recovery
====================================

🔍 Checking Prometheus...
   ❌ Prometheus is down or not responding
   🔧 Starting Prometheus...
   ✅ Prometheus started successfully (PID: 58278)

====================================
✅ Recovery performed
```

### After Recovery
```
$ curl http://localhost:9090/-/healthy
Prometheus Server is Healthy.
```

## One-Liner Verification

```bash
# Full test in one command
kill $(cat .prometheus.pid) 2>/dev/null; ./scripts/test-prometheus-recovery.sh && curl http://localhost:9090/-/healthy
```

## Cleanup

```bash
# Stop Prometheus
kill $(cat .prometheus.pid) 2>/dev/null
rm .prometheus.pid

# Clean logs (optional)
rm -f logs/prometheus.log
```

## Files Created/Modified

1. ✅ `scripts/troubleshooting/auto-recover.sh` - Added Prometheus recovery
2. ✅ `scripts/test-prometheus-recovery.sh` - Standalone test script
3. ✅ `PROMETHEUS_AUTO_RECOVERY.md` - Full documentation
4. ✅ `PROMETHEUS_AUTO_RECOVERY_COMPLETE.md` - Implementation summary
5. ✅ `PROMETHEUS_AUTO_RECOVERY_TEST.md` - This quick test guide

## Success Criteria

- [x] Prometheus health check detects down state
- [x] Auto-recovery starts Prometheus
- [x] PID file created correctly
- [x] Health endpoint responds after recovery
- [x] Prometheus UI accessible at http://localhost:9090
- [x] Process runs in background with nohup
- [x] Logs written to `logs/prometheus.log`

## Status: ✅ ALL TESTS PASSED
