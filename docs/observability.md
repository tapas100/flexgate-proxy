# Observability

## Philosophy
> **"If you can't measure it, you can't improve it. If you can't debug it in 5 minutes, your logging is broken."**

## Three Pillars

### 1. Logs (What happened?)
### 2. Metrics (How much happened?)
### 3. Traces (Where did time go?)

---

## Logs

### Structure
All logs are JSON for machine parsing:

```json
{
  "timestamp": "2026-01-26T10:30:45.123Z",
  "level": "info",
  "correlationId": "req-abc123-xyz789",
  "service": "proxy-server",
  "event": "request.completed",
  "http": {
    "method": "GET",
    "path": "/api/users/123",
    "statusCode": 200,
    "clientIp": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  },
  "upstream": {
    "host": "api.backend.com",
    "duration": 145,
    "statusCode": 200
  },
  "duration": 152,
  "metadata": {
    "userId": "user-456",
    "route": "api-users"
  }
}
```

### Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| `error` | Request failed, upstream down, config invalid | `"Upstream timeout after 30s"` |
| `warn` | Rate limit hit, slow response, auth retry | `"Request exceeded rate limit"` |
| `info` | Every request/response (sampled in prod) | `"Request completed"` |
| `debug` | Headers, body (dev only) | `"Request headers: {...}"` |

### Sampling Strategy
**Production**: Log 100% of errors, 10% of successful requests (configurable)

```yaml
logging:
  level: "info"
  sampling:
    enabled: true
    successRate: 0.1  # 10% of 2xx responses
    errorRate: 1.0    # 100% of errors
```

**Why**: At 5K req/sec, logging everything = 10GB/hour. Sampling preserves costs while keeping error visibility.

### Correlation IDs
Every request gets a unique ID:
```
X-Correlation-ID: req-abc123-xyz789
```

Propagated to:
- Upstream requests (forwarded header)
- All log entries for that request
- Error responses
- Metrics tags

**Debugging flow**:
1. User reports error
2. Get correlation ID from response
3. `grep correlationId=req-abc123` across all logs
4. See full request path

### What We Log

#### ✅ Always Log
- Request start/end
- Authentication attempts
- Rate limit hits
- Upstream failures
- Config reloads
- Circuit breaker state changes

#### ⚠️ Never Log (Security)
- API keys / tokens
- Authorization headers
- Password fields
- Credit card numbers
- PII (email, phone unless masked)

#### 🔧 Debug Only
- Request/response bodies
- Full headers
- DNS resolution details

### Log Rotation
```yaml
logging:
  file: "/var/log/proxy/access.log"
  maxSize: "100MB"
  maxFiles: 10
  compress: true
```

---

## Metrics

### Key Metrics

#### Request Metrics
```
# Request rate
http_requests_total{method="GET", route="/api/users", status="200"}

# Latency histogram
http_request_duration_ms{route="/api/users", quantile="0.95"}

# Request size
http_request_size_bytes{route="/api/users"}
```

#### Upstream Metrics
```
# Upstream response time
upstream_duration_ms{upstream="api.backend.com", quantile="0.99"}

# Upstream errors
upstream_errors_total{upstream="api.backend.com", error="timeout"}

# Connection pool
upstream_connections_active{upstream="api.backend.com"}
```

#### System Metrics
```
# Memory usage
process_memory_bytes{type="heapUsed"}

# Event loop lag
event_loop_lag_ms{quantile="0.99"}

# Active connections
tcp_connections_active
```

#### Business Metrics
```
# Rate limit hits
rate_limit_exceeded_total{route="/api/users", client="192.168.1.100"}

# Auth failures
auth_failures_total{reason="invalid_key"}

# Circuit breaker trips
circuit_breaker_opened_total{upstream="api.backend.com"}
```

### Percentiles We Track
- **P50**: Typical user experience
- **P95**: 1 in 20 requests (bad but tolerable)
- **P99**: 1 in 100 requests (red flag)
- **P99.9**: Worst-case outliers

**Why we care about P99**:
- P50/P95 can look great while P99 is terrible
- Users remember the slow requests, not the fast ones

### Metrics Exposition
Prometheus format at `/metrics`:
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/users",status="200"} 12543

# HELP http_request_duration_ms Request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{route="/api/users",le="10"} 8234
http_request_duration_ms_bucket{route="/api/users",le="50"} 12000
http_request_duration_ms_bucket{route="/api/users",le="100"} 12500
http_request_duration_ms_sum{route="/api/users"} 567890
http_request_duration_ms_count{route="/api/users"} 12543
```

---

## Health Checks

### Liveness Probe
**Endpoint**: `GET /health/live`  
**Purpose**: Is the process running?

```json
{
  "status": "UP",
  "timestamp": "2026-01-26T10:30:45.123Z"
}
```

Returns:
- `200` if server is alive
- `503` if shutting down

**Use**: Kubernetes liveness probe (restart if failing)

### Readiness Probe
**Endpoint**: `GET /health/ready`  
**Purpose**: Can it handle traffic?

```json
{
  "status": "UP",
  "checks": {
    "config": "UP",
    "upstreams": "UP",
    "rateLimiter": "UP"
  },
  "timestamp": "2026-01-26T10:30:45.123Z"
}
```

Returns:
- `200` if ready to serve traffic
- `503` if not ready (still starting, upstreams down, etc.)

**Use**: Kubernetes readiness probe (remove from load balancer if failing)

### Deep Health Check
**Endpoint**: `GET /health/deep` (internal only)  
**Purpose**: Detailed diagnostics

```json
{
  "status": "DEGRADED",
  "uptime": 86400,
  "checks": {
    "config": {
      "status": "UP",
      "lastReload": "2026-01-26T08:00:00Z"
    },
    "upstreams": {
      "status": "DEGRADED",
      "details": {
        "api.backend.com": {
          "status": "UP",
          "latency": 45
        },
        "legacy.backend.com": {
          "status": "DOWN",
          "error": "Connection timeout"
        }
      }
    },
    "memory": {
      "status": "UP",
      "heapUsed": 156782592,
      "heapTotal": 268435456,
      "percentUsed": 58.4
    },
    "eventLoop": {
      "status": "UP",
      "lag": 12
    }
  }
}
```

---

## Alerts

### What We Alert On

#### 🚨 Critical (Page On-Call)
```yaml
- name: "Proxy Down"
  condition: up == 0
  duration: 1m
  severity: critical
  
- name: "High Error Rate"
  condition: rate(http_requests_total{status=~"5.."}[5m]) > 0.05  # >5% errors
  duration: 2m
  severity: critical

- name: "Upstream Completely Down"
  condition: upstream_errors_total{error="connection_refused"} > 100
  duration: 1m
  severity: critical
```

#### ⚠️ Warning (Investigate During Business Hours)
```yaml
- name: "High Latency"
  condition: http_request_duration_ms{quantile="0.99"} > 1000  # P99 > 1s
  duration: 5m
  severity: warning

- name: "Memory Usage High"
  condition: process_memory_bytes / node_memory_total > 0.8  # >80% memory
  duration: 5m
  severity: warning

- name: "Rate Limit Hit Frequently"
  condition: rate(rate_limit_exceeded_total[5m]) > 10
  duration: 5m
  severity: warning
```

#### 📊 Info (Track, Don't Alert)
- Circuit breaker opened/closed
- Config reloaded
- Upstream degraded (but not down)
- Event loop lag spikes

### What We DON'T Alert On

#### ❌ Individual Request Failures
**Why**: Normal noise. Alert on error *rate*, not individual errors.

#### ❌ Low Traffic
**Why**: Might be expected (off-hours, maintenance window).

#### ❌ Slow Upstream
**Why**: We track it, but alert on circuit breaker instead.

---

## Dashboards

### Overview Dashboard
- **RPS**: Requests per second (by route, status)
- **Latency**: P50, P95, P99 (proxy + upstream)
- **Error Rate**: % of 5xx responses
- **Active Connections**: Current TCP connections

### Upstream Health Dashboard
- **Upstream Latency**: P95/P99 per upstream
- **Error Rate**: By upstream and error type
- **Circuit Breaker**: State per upstream
- **Connection Pool**: Active/idle connections

### Security Dashboard
- **Auth Failures**: By client IP
- **Rate Limit Hits**: By route and client
- **Blocked Requests**: SSRF, large payloads, etc.

---

## Debugging Playbook

### Symptom: High P99 Latency
1. Check upstream latency metrics → Is it the backend?
2. Check event loop lag → Node.js blocking?
3. Check GC pauses → Memory pressure?
4. Check request size → Large payloads?
5. Enable debug logging for slow requests

### Symptom: 5xx Errors
1. Get correlation ID from logs
2. Check upstream status → Down? Timeout?
3. Check circuit breaker state → Open?
4. Check auth failures → Invalid keys?
5. Review error logs for stack traces

### Symptom: Memory Leak
1. Check heap size over time
2. Enable heap dump on threshold
3. Analyze with Chrome DevTools
4. Look for connection leaks (unclosed sockets)

---

## Log Aggregation

### Recommended Stack
- **Fluentd/Vector**: Log shipping
- **Elasticsearch**: Storage + search
- **Kibana**: Visualization
- **Grafana**: Metrics + logs in one place

### Query Examples

**Find all errors for a user**:
```
level:error AND metadata.userId:"user-456"
```

**Find slow requests**:
```
duration:>1000 AND event:"request.completed"
```

**Find rate limit hits**:
```
event:"rate_limit.exceeded" AND http.path:"/api/users"
```

---

## Cost Optimization

### Log Storage Costs
At 5K req/sec with 10% sampling:
- 500 requests/sec logged
- ~1KB per log entry
- **= 500 KB/sec = 1.3 TB/month**

**Mitigations**:
1. Sampling (already doing)
2. Retention policy (7 days hot, 30 days cold, 90 days archived)
3. Compress old logs (gzip → 10:1 compression)

### Metrics Costs
With 50 unique metrics × 10 labels each:
- ~500 time series
- 15s scrape interval
- **= 2.88M samples/day**

**Mitigations**:
1. Limit cardinality (no user ID in labels!)
2. Aggregate low-value metrics (e.g., per-route → per-service)
3. Retention: 15 days full resolution, 90 days downsampled

---

## Future Enhancements

1. **Distributed Tracing**: OpenTelemetry integration
2. **Real User Monitoring**: Client-side latency tracking
3. **SLO Tracking**: Error budget dashboards
4. **Anomaly Detection**: ML-based alerting
5. **Cost Attribution**: Track cost per route/client
