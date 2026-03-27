# HAProxy & Prometheus Integration - Complete

## Date: February 14, 2026

## Summary

Successfully integrated HAProxy and Prometheus into the FlexGate automated startup system. Both services now start automatically with `start-with-deps.sh` and can be used for production-grade features in development.

## Changes Made

### 1. HAProxy Configuration

**Created:** `haproxy/haproxy.dev.cfg`
- Development-specific HAProxy configuration
- Points to `localhost:3000` (FlexGate API) instead of container names
- Points to `localhost:3001` (Admin UI) for admin routes
- Relaxed rate limits for development (5000 req/10s vs 1000 in production)
- Includes rate limiting, circuit breaker, and health checks
- Stats page available at http://localhost:8404/stats (admin/admin)

**Key Features:**
- Load balancing (ready for multiple instances)
- Rate limiting per IP
- Circuit breaker pattern
- Custom request IDs for tracing
- CORS and security headers
- Compression (gzip)
- Health checks every 2 seconds
- Automatic retry logic

### 2. Prometheus Setup

**Configuration:** `infra/prometheus/prometheus.yml` (existing)
- Metrics collection from FlexGate API
- 7-day retention period
- Scrapes metrics from http://localhost:3000/metrics
- Web UI at http://localhost:9090

### 3. Start Script Updates (`scripts/start-with-deps.sh`)

**Added Services:**
1. **HAProxy** (Step 4)
   - Auto-installs via Homebrew if not present
   - Starts with development config (`haproxy.dev.cfg`)
   - Creates PID file (`.haproxy.pid`)
   - Logs to `logs/haproxy.log`
   - Port check: 8080 (main proxy), 8404 (stats)

2. **Prometheus** (Step 5)
   - Auto-installs via Homebrew if not present
   - Starts with FlexGate config (`infra/prometheus/prometheus.yml`)
   - Creates PID file (`.prometheus.pid`)
   - Logs to `logs/prometheus.log`
   - Stores TSDB data in `logs/prometheus`
   - Port check: 9090

**Status Output Enhanced:**
- Shows HAProxy and Prometheus status in verification
- Displays URLs for both services
- Shows PIDs in process info
- Added log viewing commands

### 4. Stop Script Updates (`scripts/stop-with-deps.sh`)

**Added Cleanup:**
- Stops HAProxy gracefully (checks `.haproxy.pid`)
- Stops Prometheus gracefully (checks `.prometheus.pid`)
- Removes PID files on shutdown

### 5. Health Check Support

The existing health check script will detect:
- HAProxy running on port 8080
- Prometheus running on port 9090
- Both shown as "optional" services

## Service Architecture (Development)

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Requests                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  HAProxy (Port 8080)                                        │
│  - Rate Limiting (5000 req/10s per IP)                      │
│  - Circuit Breaker (3 failures → mark down)                 │
│  - Request Tracing (X-Request-ID)                           │
│  - Stats: http://localhost:8404/stats                       │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  /api/*       │  │  /admin       │  │  /webhooks/*  │
│  Backend API  │  │  Admin UI     │  │  Webhooks     │
│  :3000        │  │  :3001        │  │  :3000        │
└───────────────┘  └───────────────┘  └───────────────┘
        │                                      │
        └──────────────────┬───────────────────┘
                           ↓
                ┌─────────────────────┐
                │  FlexGate API       │
                │  localhost:3000     │
                │  - REST API         │
                │  - WebSocket        │
                │  - SSE Streaming    │
                │  - Metrics Export   │
                └─────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  PostgreSQL   │  │  Redis        │  │  NATS         │
│  :5432        │  │  :6379        │  │  :4222        │
│  (native)     │  │  (native)     │  │  (native)     │
└───────────────┘  └───────────────┘  └───────────────┘
        │
        ↓
┌─────────────────────┐
│  Prometheus         │
│  localhost:9090     │
│  - Scrapes /metrics │
│  - 7d retention     │
└─────────────────────┘
```

## Usage

### Start All Services (Including HAProxy & Prometheus)

```bash
./scripts/start-with-deps.sh
```

**Interactive Prompts:**
- Installs HAProxy if not present (y/n)
- Installs Prometheus if not present (y/n)
- Also handles PostgreSQL, Redis, NATS installation

### Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| FlexGate API | http://localhost:3000 | - |
| Admin UI | http://localhost:3001 | - |
| **HAProxy Proxy** | **http://localhost:8080** | - |
| **HAProxy Stats** | **http://localhost:8404/stats** | **admin/admin** |
| **Prometheus** | **http://localhost:9090** | - |
| Health Check | http://localhost:3000/health | - |

### Stop All Services

```bash
./scripts/stop-with-deps.sh
```

Stops: FlexGate, Admin UI, NATS, **HAProxy**, **Prometheus**
Optional: PostgreSQL, Redis (via prompt)

### View Logs

```bash
# HAProxy logs
tail -f logs/haproxy.log

# Prometheus logs
tail -f logs/prometheus.log

# FlexGate logs
tail -f logs/flexgate.log

# Admin UI logs
tail -f logs/admin-ui.log

# NATS logs
tail -f logs/nats.log
```

## Testing

### 1. Test HAProxy Proxy

```bash
# Direct to FlexGate (bypasses HAProxy)
curl http://localhost:3000/health

# Through HAProxy (goes through rate limiter, circuit breaker)
curl http://localhost:8080/health
```

### 2. Check HAProxy Stats

Open browser: http://localhost:8404/stats
- Username: `admin`
- Password: `admin`

**View:**
- Request rates
- Backend server health
- Active connections
- Error rates

### 3. Test Rate Limiting

```bash
# Send many requests quickly
for i in {1..100}; do curl -s http://localhost:8080/api/health; done

# Should see rate limit headers in response
curl -v http://localhost:8080/api/health | grep RateLimit
```

### 4. Check Prometheus Metrics

Open browser: http://localhost:9090

**Try Queries:**
```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_errors_total[5m])

# Response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

## Production Differences

| Feature | Development | Production (Podman) |
|---------|-------------|---------------------|
| HAProxy Config | `haproxy.dev.cfg` | `haproxy.cfg` |
| Backend Targets | `localhost:3000` | `flexgate-app-1:3000` |
| Rate Limit | 5000 req/10s | 1000 req/10s |
| Instances | 1 FlexGate instance | 2+ instances (load balanced) |
| HTTPS | Disabled | Enabled (port 8443) |
| Stats Auth | `admin/admin` | `admin/changeme` |

## Benefits

### 1. **Production Parity**
- Develop with same HAProxy features as production
- Test rate limiting and circuit breakers locally
- Validate configuration before deployment

### 2. **Observability**
- HAProxy stats show real-time traffic patterns
- Prometheus collects application metrics
- Admin UI displays real-time dashboards

### 3. **Performance**
- HAProxy handles compression
- Connection pooling to backend
- Request buffering and retries

### 4. **Safety**
- Rate limiting prevents abuse during development
- Circuit breaker protects from cascading failures
- Request tracing for debugging

## Next Steps (Optional)

1. **Alert Manager**
   - Configure Prometheus alerts
   - Email/Slack notifications for errors
   - Automated incident response

3. **Custom Metrics**
   - Add business metrics to `/metrics` endpoint
   - Track webhook delivery rates
   - Monitor route usage patterns

4. **HAProxy Tuning**
   - Adjust rate limits based on testing
   - Configure custom error pages
   - Enable SSL for local HTTPS testing

## Files Modified

- ✅ `scripts/start-with-deps.sh` - Added HAProxy & Prometheus startup
- ✅ `scripts/stop-with-deps.sh` - Added HAProxy & Prometheus shutdown
- ✅ `haproxy/haproxy.dev.cfg` - NEW: Development HAProxy config
- ℹ️ `haproxy/haproxy.cfg` - Existing: Production config (unchanged)
- ℹ️ `infra/prometheus/prometheus.yml` - Existing: Prometheus config (unchanged)

## Status

✅ **COMPLETE** - HAProxy and Prometheus fully integrated into automated startup system
✅ **TESTED** - Ready to use with `./scripts/start-with-deps.sh`
✅ **DOCUMENTED** - Full usage guide provided

---

**Last Updated:** February 14, 2026
**Author:** GitHub Copilot
**Related Docs:** 
- `AUTOMATIC_DEPENDENCY_STARTUP.md`
- `haproxy/SETUP_SUMMARY.md`
- `haproxy/PODMAN_SETUP.md`
