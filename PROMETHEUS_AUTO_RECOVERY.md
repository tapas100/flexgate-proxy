# Prometheus Auto-Recovery Implementation

## Summary

Added Prometheus monitoring to the auto-recovery system. When the auto-recovery button is clicked, the system now:

1. ✅ Checks PostgreSQL health
2. ✅ Checks Redis health  
3. ✅ Checks FlexGate API health
4. ✅ **NEW: Checks Prometheus health** ← Added in this update
5. ✅ Verifies database connectivity

## What Was Added

### Prometheus Health Checks

The auto-recovery script now:

- **Detects if Prometheus is installed**: Uses `command -v prometheus` to check
- **Health check**: Queries `http://localhost:9090/-/healthy` endpoint
- **Process verification**: Checks if Prometheus process is running using PID file
- **Automatic restart**: Starts Prometheus if down or unresponsive
- **Config file detection**: Looks for `prometheus.dev.yml` or `prometheus.yml`

### Recovery Scenarios

| Scenario | Action Taken |
|----------|-------------|
| Prometheus not installed | Shows info message (optional service) |
| Prometheus down, no PID file | Starts Prometheus, creates PID file |
| Prometheus down, has PID file | Starts Prometheus, updates PID file |
| Prometheus running but unresponsive | Kills process, restarts, updates PID file |
| Prometheus healthy | No action needed |

## Technical Details

### Port Configuration
- **Prometheus Port**: 9090
- **Health Endpoint**: `http://localhost:9090/-/healthy`
- **PID File**: `.prometheus.pid` (in project root)
- **Log File**: `logs/prometheus.log`

### Config File Locations (checked in order)
1. `infra/prometheus/prometheus.dev.yml` (development)
2. `infra/prometheus/prometheus.yml` (production/fallback)

### Startup Command
```bash
nohup prometheus \
  --config.file=infra/prometheus/prometheus.dev.yml \
  --storage.tsdb.path=./logs/prometheus \
  > logs/prometheus.log 2>&1 &
```

## Usage

### From Admin UI
1. Navigate to **Troubleshooting** page
2. Click **Auto Recovery** button
3. System will check all services including Prometheus
4. If Prometheus is down, it will restart automatically

### From Command Line
```bash
./scripts/troubleshooting/auto-recover.sh
```

### Expected Output (Healthy)
```
🔍 Checking Prometheus...
   ✅ Prometheus is healthy
```

### Expected Output (Recovery Needed)
```
🔍 Checking Prometheus...
   ❌ Prometheus is down or not responding
   🔧 Starting Prometheus...
   ✅ Prometheus started successfully (PID: 12345)
```

### Expected Output (Not Installed)
```
🔍 Checking Prometheus...
   ℹ️  Prometheus not installed (optional)
```

## Verification

After auto-recovery completes:

1. **Check Prometheus UI**: http://localhost:9090
2. **Check health endpoint**:
   ```bash
   curl http://localhost:9090/-/healthy
   # Expected: Prometheus is Healthy.
   ```
3. **Verify metrics**:
   ```bash
   curl http://localhost:9090/api/v1/query?query=up
   ```
4. **Check process**:
   ```bash
   ps -p $(cat .prometheus.pid)
   ```

## Troubleshooting

### Prometheus Not Starting

**Check logs**:
```bash
tail -f logs/prometheus.log
```

**Common issues**:
- Config file syntax error → Check YAML indentation
- Port 9090 already in use → Check for existing Prometheus instance
- Missing permissions → Check file permissions on logs directory

### Prometheus Installed but Not Detected

**Verify installation**:
```bash
which prometheus
prometheus --version
```

**If not found**:
```bash
# macOS
brew install prometheus

# Linux
sudo apt install prometheus  # Debian/Ubuntu
sudo yum install prometheus  # RHEL/CentOS
```

### Config File Not Found

**Check paths**:
```bash
ls -la infra/prometheus/prometheus.dev.yml
ls -la infra/prometheus/prometheus.yml
```

**Create if missing** (development):
```bash
mkdir -p infra/prometheus
cat > infra/prometheus/prometheus.dev.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'flexgate'
    static_configs:
      - targets: ['localhost:8080']
EOF
```

## Files Modified

### scripts/troubleshooting/auto-recover.sh
- Added section 4: Prometheus health check and recovery
- Updated summary to include Prometheus in service list
- Added Prometheus verification steps to output

## Integration with Admin UI

The auto-recovery endpoint (`POST /api/troubleshooting/auto-recover`) now returns Prometheus status:

```json
{
  "success": true,
  "recoveryPerformed": true,
  "servicesChecked": [
    "PostgreSQL",
    "Redis", 
    "FlexGate API",
    "Prometheus"
  ],
  "output": "... recovery logs ..."
}
```

## Performance Impact

- **Check time**: ~2 seconds (includes HTTP health check)
- **Restart time**: ~3 seconds (with sleep for stability)
- **Total overhead**: Minimal - only runs on-demand when auto-recovery triggered

## Security Considerations

- Prometheus runs as background process with nohup
- PID file stored in project root (not exposed)
- Logs written to `logs/` directory
- No sensitive credentials in Prometheus config

## Next Steps

1. ✅ Test auto-recovery with Prometheus down
2. ✅ Verify Prometheus restarts correctly
3. ✅ Check PID file management
4. ⏳ Add Prometheus metrics to Admin UI dashboard
5. ⏳ Add Prometheus status to health check endpoint

## Related Documentation

- [AUTO_RECOVERY_EXPLAINED.md](AUTO_RECOVERY_EXPLAINED.md) - Auto-recovery system overview
- [AUTO_RECOVERY_SCENARIOS.md](AUTO_RECOVERY_SCENARIOS.md) - Recovery scenarios
- [AUTO_RECOVERY_QUICK_REF.md](AUTO_RECOVERY_QUICK_REF.md) - Quick reference
- [PORT_CONFIGURATION.md](docs/PORT_CONFIGURATION.md) - Port configuration guide
