# Traffic Control & Reliability

## Overview
How we prevent cascading failures and maintain reliability under load.

---

## Rate Limiting

### Algorithm: Token Bucket
Each client gets a "bucket" with tokens:
- Bucket capacity: `maxRequests` (e.g., 100)
- Refill rate: `maxRequests / windowMs` (e.g., 100 tokens per minute)
- Each request consumes 1 token
- Reject when bucket empty

**Why not sliding window?**
- Token bucket allows bursts (better UX)
- Simpler to implement in distributed system
- More predictable memory usage

### Configuration
```yaml
rateLimit:
  enabled: true
  keyGenerator: "ip"  # or "apiKey", "userId"
  
  global:
    windowMs: 60000      # 1 minute
    max: 1000            # 1000 requests per minute
  
  perRoute:
    - path: "/api/users"
      windowMs: 60000
      max: 100
    
    - path: "/api/expensive-query"
      windowMs: 60000
      max: 10
```

### Distributed Rate Limiting
**Problem**: In multi-instance setup, each instance has its own counter.

**Solution**: Redis-backed rate limiter
```
Key: ratelimit:192.168.1.100:api-users
Value: 87  (tokens remaining)
TTL: 60s   (window expiry)
```

**Trade-offs**:
- ✅ Accurate across instances
- ❌ Redis becomes single point of failure
- ❌ Extra network hop (2-5ms latency)

**Fallback**: If Redis unavailable → local rate limit (better than no limit)

### Response Headers
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1706267445
```

On rate limit exceeded:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45

{
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

---

## Timeouts

### Why Timeouts Matter
Without timeouts, a slow upstream can exhaust connections:
```
Slow upstream (60s response time)
× 100 concurrent requests
= 100 connections stuck for 60s
= No connections available for new requests
= Cascading failure
```

### Timeout Hierarchy
```
┌─────────────────────────────────────────┐
│ Request Timeout (30s)                   │  ← Overall request
│  ├─ Connection Timeout (5s)             │  ← TCP handshake
│  ├─ DNS Timeout (2s)                    │  ← DNS resolution
│  ├─ Header Timeout (10s)                │  ← Read headers
│  └─ Response Timeout (25s)              │  ← Read body
└─────────────────────────────────────────┘
```

### Configuration
```yaml
timeouts:
  request: 30000        # Total request time
  connection: 5000      # TCP connect
  dns: 2000             # DNS lookup
  header: 10000         # Read response headers
  idle: 60000           # Idle connection reuse
```

### Per-Route Overrides
```yaml
routes:
  - path: "/api/quick"
    upstream: "https://fast.api"
    timeout: 5000        # 5s for fast endpoint
  
  - path: "/api/batch"
    upstream: "https://batch.api"
    timeout: 120000      # 2min for batch job
```

---

## Retries

### When to Retry
| Error Type | Retry? | Why |
|------------|--------|-----|
| Connection refused | ✅ Yes | Upstream might be restarting |
| Connection timeout | ✅ Yes | Network blip |
| Read timeout | ❌ No | Upstream is slow, retrying makes it worse |
| 500 Internal Server Error | ⚠️ Maybe | Only if idempotent |
| 502 Bad Gateway | ✅ Yes | Upstream temporarily down |
| 503 Service Unavailable | ✅ Yes | Upstream overloaded |
| 429 Rate Limited | ❌ No | Retrying makes it worse |

### Idempotency Rules
**Safe to retry**:
- GET, HEAD, OPTIONS, TRACE (read-only)
- PUT, DELETE (idempotent by HTTP spec)

**NOT safe to retry**:
- POST (might create duplicate resources)
- Unless client sends `Idempotency-Key` header

### Configuration
```yaml
retry:
  enabled: true
  maxAttempts: 3
  backoff:
    type: "exponential"
    initialDelay: 100    # 100ms
    maxDelay: 5000       # 5s
    multiplier: 2        # 100ms, 200ms, 400ms...
  
  retryableStatusCodes: [502, 503, 504]
  retryableErrors: ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"]
```

### Retry Storm Prevention
**Problem**: All instances retry at same time → amplified load on recovering upstream

**Solution**: Jittered backoff
```javascript
delay = min(maxDelay, initialDelay * (multiplier ** attempt) * (0.5 + random()))
```

Example:
```
Attempt 1: 100ms × 1 × 0.7 = 70ms
Attempt 2: 100ms × 2 × 1.2 = 240ms
Attempt 3: 100ms × 4 × 0.9 = 360ms
```

---

## Circuit Breaker

### State Machine
```
          ┌──────────┐
          │  CLOSED  │ ◄─── Normal operation
          └──────────┘
               │
               │ Failure threshold reached
               ▼
          ┌──────────┐
    ┌─────│   OPEN   │ ◄─── Fast-fail all requests
    │     └──────────┘
    │          │
    │          │ Timeout elapsed
    │          ▼
    │     ┌──────────┐
    │     │ HALF_OPEN│ ◄─── Trial period
    │     └──────────┘
    │          │
    │          ├─ Success → CLOSED
    └──────────┼─ Failure → OPEN
```

### Configuration
```yaml
circuitBreaker:
  enabled: true
  
  # When to open circuit
  failureThreshold: 50      # % of requests failing
  volumeThreshold: 10       # Minimum requests in window
  windowMs: 10000           # 10s rolling window
  
  # When to try again
  openDuration: 30000       # 30s in OPEN state
  halfOpenRequests: 3       # Trial requests in HALF_OPEN
```

### Example Scenario
```
Time 0-10s:  20 requests, 12 failures (60% error rate)
             → Failure threshold (50%) exceeded
             → Circuit OPEN

Time 10-40s: All requests fail immediately with 503
             (No load on upstream, it can recover)

Time 40s:    Circuit → HALF_OPEN
             Next 3 requests go through

Time 40-45s: 2/3 succeed
             → Circuit CLOSED (recovered)
```

### Per-Upstream Isolation
Each upstream has its own circuit breaker:
```yaml
upstreams:
  - name: "primary-api"
    url: "https://api.primary.com"
    circuitBreaker: {...}
  
  - name: "fallback-api"
    url: "https://api.fallback.com"
    circuitBreaker: {...}
```

If `primary-api` circuit opens → can fallback to `fallback-api`

---

## Backpressure

### The Problem
```
Proxy receives: 10K req/sec
Upstream handles: 5K req/sec
Queue grows: +5K req/sec
After 10s: 50K requests queued → OOM crash
```

### Solution: Reject Early
```yaml
backpressure:
  enabled: true
  maxQueueSize: 1000        # Max pending requests
  maxConnections: 5000      # Max concurrent connections
  queueTimeout: 5000        # Max time in queue
```

When limits reached:
```http
HTTP/1.1 503 Service Unavailable
Retry-After: 10

{
  "error": "Service overloaded, please retry",
  "retryAfter": 10
}
```

### Graceful Degradation
Instead of hard reject, shed load progressively:

```yaml
backpressure:
  thresholds:
    - queueSize: 500
      action: "disable_logging"     # Save CPU
    
    - queueSize: 750
      action: "sample_metrics"      # Reduce metrics cardinality
    
    - queueSize: 900
      action: "reject_low_priority" # Reject non-critical routes
    
    - queueSize: 1000
      action: "reject_all"          # Hard limit
```

---

## Connection Pooling

### Why It Matters
```
Without pooling:
  Request → New TCP connection (3-way handshake)
          → TLS handshake (if HTTPS)
          → Send request
          → Close connection
  Total: ~50ms overhead per request

With pooling:
  Request → Reuse existing connection
          → Send request
  Total: ~1ms overhead
```

### Configuration
```yaml
connectionPool:
  maxSockets: 100           # Per upstream
  maxFreeSockets: 10        # Idle connections to keep
  timeout: 60000            # Idle timeout (60s)
  keepAlive: true
```

### HTTP/2 Multiplexing
With HTTP/2:
- 1 connection = many concurrent requests
- No head-of-line blocking
- Automatic connection management

```yaml
upstreams:
  - name: "modern-api"
    url: "https://api.modern.com"
    http2: true             # Enable HTTP/2
```

---

## Load Shedding

### Strategy: Priority Queues
Not all requests are equal:

```yaml
priorities:
  - name: "critical"
    routes: ["/health", "/api/payments"]
    weight: 100
  
  - name: "normal"
    routes: ["/api/users"]
    weight: 50
  
  - name: "low"
    routes: ["/api/analytics"]
    weight: 10
```

Under load:
1. Process 100% of critical
2. Process 50% of normal
3. Process 10% of low

### Predictive Load Shedding
Shed load *before* queues fill up:

```javascript
if (currentQPS > (maxCapacity * 0.9)) {
  rejectProbability = (currentQPS - maxCapacity * 0.9) / (maxCapacity * 0.1);
  if (Math.random() < rejectProbability) {
    return 503;
  }
}
```

---

## Bulkhead Pattern

### Isolation
Don't let one bad upstream affect others:

```yaml
upstreams:
  - name: "api-a"
    url: "https://api-a.com"
    limits:
      maxConnections: 50
      maxQueueSize: 100
  
  - name: "api-b"
    url: "https://api-b.com"
    limits:
      maxConnections: 50
      maxQueueSize: 100
```

If `api-a` is slow → only 50 connections blocked, `api-b` unaffected

---

## Monitoring Reliability Mechanisms

### Metrics to Track
```
# Rate limiting
rate_limit_exceeded_total{route="/api/users"}

# Circuit breaker
circuit_breaker_state{upstream="api.backend.com", state="open"}
circuit_breaker_rejected_total{upstream="api.backend.com"}

# Retries
retry_attempts_total{upstream="api.backend.com", attempt="2"}

# Backpressure
queue_size{type="pending"}
connections_active

# Timeouts
timeout_exceeded_total{type="request"}
```

---

## Failure Modes & Recovery

### Scenario 1: Upstream Completely Down
```
Circuit breaker opens → All requests fast-fail with 503
Retry every 30s (half-open) → Detect recovery
Circuit closes → Normal operation
```

**Recovery time**: 30s + time to detect success

### Scenario 2: Upstream Slow (Not Down)
```
Timeouts fire → Some requests fail
Retry with backoff → Amplified load (bad!)
Circuit breaker opens → Gives upstream breathing room
```

**Key**: Timeout + circuit breaker = graceful degradation

### Scenario 3: Proxy Overloaded
```
Queue fills → Backpressure kicks in
Low-priority requests rejected → Critical requests still work
Metrics spike → Auto-scaling triggers (if in k8s)
```

**Key**: Degrade non-critical features first

---

## Trade-offs

### Aggressive Timeouts
- ✅ Fast failure detection
- ❌ More false positives (slow != down)
- **Use**: Low-latency systems

### Conservative Timeouts
- ✅ Fewer false positives
- ❌ Slow failure detection
- **Use**: High-latency systems

### Aggressive Circuit Breaker
- ✅ Quick protection
- ❌ Might open on transient issues
- **Use**: Cascading failure prevention

### Conservative Circuit Breaker
- ✅ Fewer false opens
- ❌ Slower protection
- **Use**: Stable upstreams

---

## Testing Reliability

### Chaos Engineering
```bash
# Kill upstream
docker stop backend-api

# Slow network
tc qdisc add dev eth0 root netem delay 500ms

# Drop packets
iptables -A INPUT -p tcp --dport 8080 -j DROP -m statistic --mode random --probability 0.5
```

### Load Testing
```bash
# Gradual ramp
wrk -t4 -c100 -d60s --rate 1000 http://proxy:3000/api/users

# Spike test
wrk -t8 -c500 -d10s http://proxy:3000/api/users
```

---

## Future Enhancements

1. **Adaptive Timeouts**: ML-based timeout adjustment
2. **Global Rate Limiting**: Coordinate limits across all instances
3. **Request Coalescing**: Deduplicate identical concurrent requests
4. **Predictive Circuit Breaker**: Open before failure threshold
