# Rate Limiting

Comprehensive guide to protecting your APIs with rate limiting in FlexGate.

## What is Rate Limiting?

Rate limiting controls how many requests a client can make to your API within a time window. It protects your backend services from:

- **Abuse** - Malicious actors overwhelming your API
- **DDoS attacks** - Distributed denial of service
- **Resource exhaustion** - Too many requests consuming resources
- **Cost control** - Limiting usage for free tiers
- **Fair usage** - Ensuring all users get fair access

## Quick Start

Enable basic rate limiting on a route:

```yaml
routes:
  - id: api-users
    path: /api/users/*
    upstream: http://backend:8080
    
    rateLimit:
      enabled: true
      max: 100              # 100 requests
      windowMs: 60000       # per minute
```

This limits clients to 100 requests per minute.

## Rate Limiting Strategies

FlexGate supports four rate limiting algorithms:

### 1. Token Bucket (Recommended)

**How it works:**
- Bucket holds tokens (requests)
- Tokens replenished at steady rate
- Requests consume tokens
- Empty bucket = rate limited

**Configuration:**

```yaml
rateLimit:
  enabled: true
  strategy: token-bucket
  max: 100               # Bucket capacity
  windowMs: 60000        # Refill window (1 minute)
  tokensPerInterval: 100 # Tokens added per window
```

**Advantages:**
- ✅ Allows bursts (up to bucket capacity)
- ✅ Smooth over time
- ✅ Fair distribution
- ✅ Best for most use cases

**Visualization:**

```
Bucket (Capacity: 100)
┌─────────────────────┐
│ ████████████░░░░░░░ │ 60 tokens
└─────────────────────┘
        ↓
Request consumes 1 token
        ↓
┌─────────────────────┐
│ ███████████░░░░░░░░ │ 59 tokens
└─────────────────────┘

Tokens refilled: +100 every 60 seconds
```

**Example:**

```yaml
# API allows bursts up to 100 requests
# Then throttles to ~1.67 req/sec sustained
rateLimit:
  strategy: token-bucket
  max: 100
  windowMs: 60000
```

**Use cases:**
- General API protection
- Allowing temporary bursts
- User-facing APIs

### 2. Fixed Window

**How it works:**
- Counter resets at fixed intervals
- Simple and predictable
- Can allow bursts at boundaries

**Configuration:**

```yaml
rateLimit:
  enabled: true
  strategy: fixed-window
  max: 100
  windowMs: 60000
```

**Timeline:**

```
Time:    00:00    00:30    01:00    01:30    02:00
Window:  [--- Window 1 ---][--- Window 2 ---]
Requests: 50 req   50 req | 100 req    0 req
          ✅      ✅      | ❌         ✅
```

**Advantages:**
- ✅ Simple to understand
- ✅ Low memory usage
- ✅ Predictable resets

**Disadvantages:**
- ❌ Burst at window boundaries
- ❌ Can allow 2× limit (end + start of windows)

**Example:**

```yaml
# Exactly 100 requests per minute
# Counter resets at :00, :01, :02, etc.
rateLimit:
  strategy: fixed-window
  max: 100
  windowMs: 60000  # 1 minute windows
```

**Use cases:**
- Simple quotas
- Internal APIs
- When predictability matters

### 3. Sliding Window

**How it works:**
- Tracks requests in rolling window
- More accurate than fixed window
- Prevents boundary bursts

**Configuration:**

```yaml
rateLimit:
  enabled: true
  strategy: sliding-window
  max: 100
  windowMs: 60000
  precision: 60   # Number of sub-windows
```

**How it prevents bursts:**

```
Fixed Window Problem:
00:59 → 01:00 → 01:01
50 req  100 req = 150 requests in 2 seconds!

Sliding Window Solution:
Continuously tracks last 60 seconds
No boundary burst possible
```

**Advantages:**
- ✅ Most accurate
- ✅ No boundary bursts
- ✅ Fair distribution

**Disadvantages:**
- ❌ Higher memory usage
- ❌ More complex

**Example:**

```yaml
# Strict 100 requests per 60 seconds
# Calculated continuously
rateLimit:
  strategy: sliding-window
  max: 100
  windowMs: 60000
  precision: 60  # 60 1-second buckets
```

**Use cases:**
- Strict rate limiting
- Preventing abuse
- Public APIs

### 4. Leaky Bucket

**How it works:**
- Requests queue in bucket
- Leak at constant rate
- Overflow = rate limited

**Configuration:**

```yaml
rateLimit:
  enabled: true
  strategy: leaky-bucket
  max: 100              # Queue size
  rate: 10              # Leak rate (req/sec)
  windowMs: 1000        # Rate window
```

**Visualization:**

```
Incoming Requests
      ↓↓↓↓↓
┌─────────────────┐
│ ████████████░░░ │ Queue (100 max)
│ ████████████░░░ │
└────────┬────────┘
         ↓ Leak: 10/sec
    Processed Requests
```

**Advantages:**
- ✅ Perfectly smooth output
- ✅ Predictable rate
- ✅ No bursts

**Disadvantages:**
- ❌ Can cause delays
- ❌ Queue management complexity

**Example:**

```yaml
# Process at exactly 10 req/sec
# Queue up to 100 requests
rateLimit:
  strategy: leaky-bucket
  max: 100
  rate: 10
  windowMs: 1000
```

**Use cases:**
- Backend protection
- Upstream rate limits
- Queue-based systems

## Rate Limit Scope

Control what the limit applies to:

### Per IP Address (Default)

Limit by client IP:

```yaml
rateLimit:
  enabled: true
  scope: ip
  max: 100
  windowMs: 60000
```

**Use case:** Prevent single IP from overwhelming API

**Redis key:** `rate-limit:route-id:192.168.1.100`

### Per User

Limit by authenticated user:

```yaml
rateLimit:
  enabled: true
  scope: user
  max: 1000  # Higher limit for authenticated users
  windowMs: 60000
```

**Requirements:**
- Authentication enabled
- User ID available in request

**Redis key:** `rate-limit:route-id:user:12345`

**Use case:** Different limits per user tier

### Per API Key

Limit by API key:

```yaml
rateLimit:
  enabled: true
  scope: apiKey
  max: 10000  # Enterprise API key limit
  windowMs: 60000
```

**Redis key:** `rate-limit:route-id:key:abc123`

**Use case:** API key quotas

### Global (Per Route)

Limit total traffic to route:

```yaml
rateLimit:
  enabled: true
  scope: route
  max: 10000  # Total limit for all clients
  windowMs: 60000
```

**Redis key:** `rate-limit:route-id:global`

**Use case:** Protect backend capacity

### Custom Scope

Combine multiple factors:

```yaml
rateLimit:
  enabled: true
  scope: custom
  keyGenerator: ip+user+apiKey
  max: 100
  windowMs: 60000
```

**Redis key:** `rate-limit:route-id:192.168.1.100:user123:key456`

**Use case:** Complex rate limiting scenarios

## Advanced Configuration

### Different Limits by Method

```yaml
rateLimit:
  enabled: true
  
  # Different limits per HTTP method
  limits:
    GET:
      max: 1000
      windowMs: 60000
    
    POST:
      max: 100
      windowMs: 60000
    
    DELETE:
      max: 10
      windowMs: 60000
```

### Tiered Rate Limiting

Different limits based on user tier:

```yaml
rateLimit:
  enabled: true
  scope: user
  
  tiers:
    free:
      max: 100
      windowMs: 60000
    
    pro:
      max: 1000
      windowMs: 60000
    
    enterprise:
      max: 100000
      windowMs: 60000
```

**Implementation:**

```javascript
// Determine tier from JWT claims or database
const tier = req.user.subscriptionTier; // 'free', 'pro', 'enterprise'
```

### Dynamic Rate Limits

Adjust limits based on system load:

```yaml
rateLimit:
  enabled: true
  dynamic: true
  
  # Base limits
  max: 1000
  windowMs: 60000
  
  # Reduce when system under load
  loadThresholds:
    cpu: 80      # % CPU usage
    memory: 85   # % Memory usage
    reduction: 50  # % reduction in limit
```

**Example:**
- Normal: 1000 req/min
- High load (CPU > 80%): 500 req/min

### Skip Conditions

Don't count certain requests:

```yaml
rateLimit:
  enabled: true
  max: 100
  windowMs: 60000
  
  skip:
    # Don't count successful requests
    successfulRequests: false
    
    # Don't count failed requests
    failedRequests: false
    
    # Skip based on headers
    headers:
      X-Admin-Token: secret123
    
    # Skip based on IP
    ips:
      - 127.0.0.1
      - 10.0.0.0/8
    
    # Skip based on user role
    roles:
      - admin
      - service-account
```

### Custom Error Response

Customize rate limit response:

```yaml
rateLimit:
  enabled: true
  max: 100
  windowMs: 60000
  
  response:
    statusCode: 429
    headers:
      X-RateLimit-Limit: "${max}"
      X-RateLimit-Remaining: "${remaining}"
      X-RateLimit-Reset: "${reset}"
      Retry-After: "${retryAfter}"
    
    body:
      error: "Rate Limit Exceeded"
      message: "You have exceeded the rate limit of ${max} requests per ${window}."
      retryAfter: "${retryAfter}"
      documentation: "https://docs.example.com/rate-limits"
```

**Response example:**

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1707485723
Retry-After: 42

{
  "error": "Rate Limit Exceeded",
  "message": "You have exceeded the rate limit of 100 requests per 60000ms.",
  "retryAfter": 42,
  "documentation": "https://docs.example.com/rate-limits"
}
```

## Response Headers

FlexGate adds rate limit headers to responses:

### Standard Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1707485723
```

**Explanation:**
- `Limit`: Total requests allowed in window
- `Remaining`: Requests left in current window
- `Reset`: Unix timestamp when limit resets

### Additional Headers

```http
X-RateLimit-Window: 60000
X-RateLimit-Scope: ip
X-RateLimit-Strategy: token-bucket
```

### Retry-After Header

When rate limited:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
```

**Value:** Seconds until limit resets

## Storage Backend

Rate limit counters are stored in Redis:

### Redis Configuration

```yaml
redis:
  host: localhost
  port: 6379
  db: 0
  password: your-redis-password
  
  # Rate limit specific settings
  rateLimit:
    prefix: "rate-limit:"
    ttl: 86400  # 24 hours
```

### Redis Key Structure

Keys follow this pattern:

```
rate-limit:{route-id}:{scope}:{identifier}
```

**Examples:**

```
rate-limit:api-users:ip:192.168.1.100
rate-limit:api-posts:user:12345
rate-limit:api-search:apiKey:abc123
rate-limit:api-public:global
```

### Inspecting Redis

View rate limit data:

```bash
# List all rate limit keys
redis-cli KEYS "rate-limit:*"

# Get specific counter
redis-cli GET "rate-limit:api-users:ip:192.168.1.100"

# View TTL
redis-cli TTL "rate-limit:api-users:ip:192.168.1.100"

# Delete (reset) counter
redis-cli DEL "rate-limit:api-users:ip:192.168.1.100"
```

### Redis Failover

Handle Redis failures gracefully:

```yaml
rateLimit:
  enabled: true
  max: 100
  windowMs: 60000
  
  # Fallback when Redis unavailable
  fallback:
    strategy: allow  # or 'deny', 'memory'
    
    # Use in-memory rate limiting
    memory:
      enabled: true
      syncInterval: 5000  # Sync to Redis when available
```

**Strategies:**
- `allow` - Allow requests (fail open)
- `deny` - Deny requests (fail closed)
- `memory` - Use in-memory store (not distributed)

## Monitoring Rate Limits

### Metrics

FlexGate exports rate limit metrics:

```
# Total rate limit hits
flexgate_rate_limit_hits_total{route="api-users",scope="ip"} 234

# Remaining quota
flexgate_rate_limit_remaining{route="api-users",scope="ip"} 45

# Blocked requests
flexgate_rate_limit_blocked_total{route="api-users",scope="ip"} 156
```

### Admin UI

View rate limiting in Admin UI:

**Dashboard:**
1. Navigate to http://localhost:3000/admin/monitoring
2. Rate Limiting section shows:
   - Total blocked requests
   - Top blocked IPs
   - Rate limit hit rate
   - Per-route statistics

**Route Details:**
1. Go to Routes → Select route
2. Rate Limiting tab shows:
   - Current limits
   - Hit statistics
   - Blocked clients
   - Reset times

### Logs

Rate limit events are logged:

```json
{
  "timestamp": "2026-02-09T10:30:15.123Z",
  "level": "warn",
  "message": "Rate limit exceeded",
  "route": "api-users",
  "clientIp": "192.168.1.100",
  "limit": 100,
  "window": 60000,
  "remaining": 0,
  "resetAt": 1707485723
}
```

## Testing Rate Limits

### Manual Testing

Test with curl:

```bash
# Send 105 requests quickly
for i in {1..105}; do
  echo "Request $i:"
  curl -w "Status: %{http_code}, Remaining: %header{X-RateLimit-Remaining}\n" \
    http://localhost:3000/api/users \
    -s -o /dev/null
done
```

**Expected output:**

```
Request 1: Status: 200, Remaining: 99
Request 2: Status: 200, Remaining: 98
...
Request 100: Status: 200, Remaining: 0
Request 101: Status: 429, Remaining: 0
Request 102: Status: 429, Remaining: 0
```

### Automated Testing

Test with Apache Bench:

```bash
# 1000 requests, 50 concurrent
ab -n 1000 -c 50 \
  -H "Authorization: Bearer token123" \
  http://localhost:3000/api/users

# Check results
```

### Load Testing

Use k6 for comprehensive testing:

```javascript
// rate-limit-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp to 100 users
    { duration: '3m', target: 100 },  // Stay at 100
    { duration: '1m', target: 0 },    // Ramp down
  ],
};

export default function () {
  let res = http.get('http://localhost:3000/api/users');
  
  check(res, {
    'not rate limited': (r) => r.status !== 429,
    'has rate limit headers': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
  });
}
```

Run test:

```bash
k6 run rate-limit-test.js
```

## Common Patterns

### Public API Pattern

Different limits for public vs. authenticated:

```yaml
routes:
  - id: api-public
    path: /api/public/*
    upstream: http://backend:8080
    
    rateLimit:
      enabled: true
      scope: ip
      max: 10          # Low limit for anonymous
      windowMs: 60000

  - id: api-authenticated
    path: /api/auth/*
    upstream: http://backend:8080
    
    auth:
      enabled: true
      type: jwt
    
    rateLimit:
      enabled: true
      scope: user
      max: 1000        # Higher for authenticated
      windowMs: 60000
```

### Freemium Pattern

Tiered limits based on subscription:

```yaml
rateLimit:
  enabled: true
  scope: apiKey
  
  tiers:
    free:
      max: 100
      windowMs: 86400000    # Per day
    
    starter:
      max: 10000
      windowMs: 86400000
    
    professional:
      max: 100000
      windowMs: 86400000
    
    enterprise:
      max: 1000000
      windowMs: 86400000
```

### Resource-Based Pattern

Different limits per endpoint:

```yaml
routes:
  # Read-heavy endpoints
  - id: api-users-list
    path: /api/users
    methods: [GET]
    rateLimit:
      max: 1000
      windowMs: 60000
  
  # Write endpoints (more expensive)
  - id: api-users-create
    path: /api/users
    methods: [POST]
    rateLimit:
      max: 100
      windowMs: 60000
  
  # Search (very expensive)
  - id: api-search
    path: /api/search
    rateLimit:
      max: 10
      windowMs: 60000
```

### Burst Protection Pattern

Allow bursts but limit sustained rate:

```yaml
rateLimit:
  strategy: token-bucket
  
  # Allow burst of 100
  max: 100
  
  # But sustain only ~16.7 req/sec
  tokensPerInterval: 100
  windowMs: 60000
```

## Best Practices

### 1. Choose Appropriate Strategy

| Use Case | Strategy |
|----------|----------|
| General protection | Token Bucket |
| Simple quotas | Fixed Window |
| Strict limits | Sliding Window |
| Backend protection | Leaky Bucket |

### 2. Set Reasonable Limits

**Too low:**
- ❌ Frustrates legitimate users
- ❌ False positives

**Too high:**
- ❌ Doesn't protect backend
- ❌ Allows abuse

**Just right:**
- ✅ Based on backend capacity
- ✅ Monitor and adjust
- ✅ Different limits per tier

### 3. Use Appropriate Scope

| Scenario | Scope |
|----------|-------|
| Public API | IP + User |
| Internal API | User |
| Partner API | API Key |
| Backend protection | Route (global) |

### 4. Provide Clear Feedback

Always include:
- ✅ Rate limit headers
- ✅ Retry-After header
- ✅ Helpful error message
- ✅ Documentation link

### 5. Monitor and Alert

Track:
- Rate limit hit rate
- Most blocked IPs
- Unusual patterns
- False positives

### 6. Plan for Scale

Consider:
- Redis cluster for high traffic
- Distributed counters
- Eventual consistency
- Failover strategy

## Troubleshooting

### Rate Limits Not Working

**Check:**
1. Rate limiting enabled: `rateLimit.enabled: true`
2. Redis connected: `redis-cli ping`
3. Correct scope configured
4. TTL not expired immediately

**Debug:**

```bash
# Check Redis keys
redis-cli KEYS "rate-limit:*"

# Monitor Redis commands
redis-cli MONITOR

# Check FlexGate logs
flexgate logs --grep "rate limit"
```

### Too Many False Positives

**Solutions:**
1. Increase limits
2. Change scope (IP → User)
3. Add skip conditions
4. Use whitelist

### Redis Memory Issues

**Check memory:**

```bash
redis-cli INFO memory
```

**Solutions:**
1. Set TTL on keys
2. Use LRU eviction
3. Increase Redis memory
4. Scale Redis (cluster)

### Inconsistent Limits

**Cause:** Multiple FlexGate instances with memory backend

**Solution:**
- ✅ Use Redis (distributed)
- ❌ Don't use memory backend in production

## Next Steps

- **[Circuit Breaker](./circuit-breaker.md)** - Complement with circuit breaker
- **[Authentication](../security/authentication.md)** - Combine with auth
- **[Monitoring](../admin-ui/monitoring.md)** - Monitor rate limits

---

**Questions?** Join our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions).
