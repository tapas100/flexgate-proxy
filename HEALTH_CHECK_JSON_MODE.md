# Health Check JSON Mode Implementation

## Date: February 14, 2026

## Summary

Enhanced the health check script to support both **human-readable text output** (for terminal) and **structured JSON output** (for Admin UI API), eliminating the need for complex text parsing.

## Changes Made

### 1. Health Check Script (`scripts/troubleshooting/health-check.sh`)

**Added `--json` Flag:**
```bash
./scripts/troubleshooting/health-check.sh        # Text output
./scripts/troubleshooting/health-check.sh --json # JSON output
```

**JSON Output Format:**
```json
{
  "timestamp": "2026-02-14T11:58:04Z",
  "success": true,
  "services": [
    {
      "name": "FlexGate API",
      "status": "healthy",
      "mode": "native",
      "message": "healthy"
    },
    {
      "name": "PostgreSQL",
      "status": "healthy",
      "mode": "native",
      "message": "healthy"
    }
  ]
}
```

**Text Output (Unchanged):**
```
🏥 FlexGate Service Health

✅ FlexGate API: healthy
   └─ Process: running
✅ PostgreSQL: healthy [native]
✅ Redis: healthy [native]
ℹ️  HAProxy: not running [optional]
```

### 2. Service Status Fields

Each service in JSON includes:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Service name | `"PostgreSQL"` |
| `status` | string | `healthy`, `unhealthy`, `warning` | `"healthy"` |
| `mode` | string | `podman`, `docker`, `native`, `none` | `"native"` |
| `message` | string | Human-readable status | `"healthy"` |

### 3. Backend API (`routes/troubleshooting.ts`)

**Updated Endpoint:**
```typescript
POST /api/troubleshooting/health-check
```

**New Response:**
```json
{
  "success": true,
  "timestamp": "2026-02-14T11:58:04Z",
  "services": [
    {
      "name": "PostgreSQL",
      "status": "healthy",
      "mode": "native",
      "message": "healthy"
    }
  ],
  "exitCode": 0
}
```

**Benefits:**
- ✅ No text parsing needed
- ✅ Type-safe data structure
- ✅ No duplicate entries
- ✅ Clear mode indicators (podman/docker/native)
- ✅ Consistent status values

### 4. Admin UI (`admin-ui/src/pages/Troubleshooting.tsx`)

**Updated Health Check Handler:**
```typescript
const runHealthCheck = async () => {
  const response = await fetch('/api/troubleshooting/health-check', {
    method: 'POST',
  });
  
  const data = await response.json();
  
  // Map services from JSON to health checks
  const mappedChecks = data.services.map((service: any) => ({
    name: service.name,
    status: service.status,
    message: `${service.message} ${service.mode !== 'none' ? `[${service.mode}]` : ''}`
  }));
  
  setHealthChecks(mappedChecks);
};
```

**Display Format:**
```
PostgreSQL
healthy [native]
```

## Problems Solved

### ❌ Before: Text Parsing Issues

1. **Duplicate entries** - "Checking HAProxy..." and "HAProxy: not running" both captured
2. **Complex regex** - Had to parse emojis and status indicators
3. **Fragile parsing** - Text format changes broke the parser
4. **No mode information** - Couldn't tell if service was podman/docker/native

### ✅ After: Clean JSON Structure

1. **Single entry per service** - No duplicates
2. **Structured data** - Direct object mapping
3. **Robust** - Format changes don't break parsing
4. **Mode tags** - Clear `[native]`, `[podman]`, `[docker]` indicators

## Usage Examples

### Terminal (Human-Readable)

```bash
$ ./scripts/troubleshooting/health-check.sh

🏥 FlexGate Service Health

✅ FlexGate API: healthy
   └─ Process: running
✅ PostgreSQL: healthy [native]
✅ Redis: healthy [native]
ℹ️  HAProxy: not running [optional]
ℹ️  Prometheus: not running [optional]
⚠️  Admin UI: not built

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All critical services healthy

Access Points:
  • API:       http://localhost:3000
  • Admin UI:  http://localhost:3001
  • HAProxy:   http://localhost:8080 (if running)
  • Metrics:   http://localhost:9090 (if running)
```

### API (JSON)

```bash
$ ./scripts/troubleshooting/health-check.sh --json | jq

{
  "timestamp": "2026-02-14T11:58:04Z",
  "success": true,
  "services": [
    {
      "name": "FlexGate API",
      "status": "healthy",
      "mode": "native",
      "message": "healthy"
    },
    {
      "name": "PostgreSQL",
      "status": "healthy",
      "mode": "native",
      "message": "healthy"
    },
    {
      "name": "Redis",
      "status": "healthy",
      "mode": "native",
      "message": "healthy"
    },
    {
      "name": "HAProxy",
      "status": "warning",
      "mode": "none",
      "message": "not running (optional)"
    }
  ]
}
```

### Admin UI Display

**Service Health Card:**
```
✅ PostgreSQL
   healthy [native]

✅ Redis
   healthy [native]

⚠️  HAProxy
   not running (optional)
```

## Mode Indicators

| Mode | Description | Example Use Case |
|------|-------------|------------------|
| `native` | Running via Homebrew/system | Development environment |
| `podman` | Running in Podman container | Production deployment |
| `docker` | Running in Docker container | Alternative containerization |
| `none` | Not running | Optional services |

## Deployment Priority

The script checks services in priority order:

1. **Podman** containers (production)
2. **Docker** containers (alternative)
3. **Native** processes (development)
4. **None** if not found

Example for PostgreSQL:
```bash
if [podman container exists]; then
  mode="podman"
elif [docker container exists]; then
  mode="docker"
elif [pg_isready succeeds]; then
  mode="native"
else
  mode="none"
fi
```

## Status Values

| Status | Icon | Description | UI Color |
|--------|------|-------------|----------|
| `healthy` | ✅ | Service operational | Green |
| `unhealthy` | ❌ | Service failed | Red |
| `warning` | ⚠️ | Service optional/not built | Orange |
| `unknown` | ❓ | Not yet checked | Gray |

## Benefits

### For Developers (Terminal)
- ✅ Clean, readable output with emojis
- ✅ Clear status indicators
- ✅ Mode tags show how services run
- ✅ Helpful access point URLs

### For Admin UI (JSON)
- ✅ No text parsing needed
- ✅ Type-safe data structure
- ✅ No duplicate entries
- ✅ Consistent format
- ✅ Easy to extend

### For DevOps (CI/CD)
- ✅ Exit code indicates success/failure
- ✅ JSON output for scripting
- ✅ Machine-readable status
- ✅ Can pipe to `jq` for filtering

## Testing

### Test Text Output
```bash
./scripts/troubleshooting/health-check.sh
```

### Test JSON Output
```bash
./scripts/troubleshooting/health-check.sh --json
```

### Test API Integration
```bash
curl -X POST http://localhost:3000/api/troubleshooting/health-check | jq
```

### Test Admin UI
1. Navigate to http://localhost:3001/troubleshooting
2. Click "Run Health Check"
3. Verify services display with mode tags

## Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `scripts/troubleshooting/health-check.sh` | Added JSON mode | ~100 |
| `routes/troubleshooting.ts` | Updated to use JSON | ~30 |
| `admin-ui/src/pages/Troubleshooting.tsx` | Map JSON services | ~10 |

## Migration Notes

### Breaking Changes
None. The API response format changed, but backward compatibility is maintained via `output` field.

### Deprecated
- `parseHealthCheckOutput()` function in `routes/troubleshooting.ts` (no longer used)

### Recommended
Update any custom scripts or tools that call the health check to use `--json` flag for structured output.

## Future Enhancements

1. **Additional Modes**
   - `systemd` - Services managed by systemd
   - `kubernetes` - K8s pods

2. **More Metadata**
   - Service version
   - Uptime
   - Resource usage (CPU/memory)

3. **Health Score**
   - Overall system health percentage
   - Critical vs optional service weighting

4. **Alerts**
   - Email/Slack notifications on failures
   - Webhook integrations

## Conclusion

The health check script now provides:
- ✅ **Dual-mode output** - Human-readable text OR machine-readable JSON
- ✅ **No parsing complexity** - Direct JSON consumption
- ✅ **Mode indicators** - Clear tags for podman/docker/native
- ✅ **No duplicates** - Single entry per service
- ✅ **Type-safe** - Structured data for Admin UI

This eliminates the duplicate HAProxy issue and makes the Admin UI more reliable! 🎉

---

**Date:** February 14, 2026  
**Author:** GitHub Copilot  
**Status:** ✅ Complete  
**Impact:** Medium (improved reliability, no breaking changes)
