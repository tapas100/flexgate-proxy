# Your First Route

Learn how to create and configure your first API route in FlexGate. This tutorial covers basic routing, rate limiting, and monitoring.

## Prerequisites

- FlexGate installed and running
- Admin UI accessible at http://localhost:3000/admin
- Basic understanding of HTTP and REST APIs

## What We'll Build

We'll create a route that:
1. Proxies requests to a public API (JSONPlaceholder)
2. Applies rate limiting (100 requests/minute)
3. Adds custom headers
4. Monitors traffic and performance

**Final route:**
- **Path:** `/api/users`
- **Upstream:** `https://jsonplaceholder.typicode.com/users`
- **Methods:** GET, POST
- **Rate Limit:** 100 requests per minute
- **Custom Headers:** `X-Powered-By: FlexGate`

## Method 1: Using the Admin UI (Recommended for Beginners)

### Step 1: Access the Admin UI

1. Open your browser
2. Navigate to **http://localhost:3000/admin**
3. Login with default credentials:
   - Username: `admin`
   - Password: `admin`

![Admin UI Login](../assets/admin-login.png)

### Step 2: Navigate to Routes

1. Click **"Routes"** in the left sidebar
2. You'll see the routes management page
3. Click the **"Add Route"** button (top right)

![Routes Page](../assets/routes-page.png)

### Step 3: Configure Basic Route Settings

Fill in the basic route information:

**General Settings:**
- **Route ID:** `users-api` (auto-generated if left blank)
- **Path:** `/api/users`
- **Upstream URL:** `https://jsonplaceholder.typicode.com/users`
- **Methods:** Select `GET` and `POST`
- **Enabled:** ✓ (checked)
- **Description:** `Proxy to JSONPlaceholder users API`

![Route Basic Settings](../assets/route-basic-settings.png)

### Step 4: Configure Rate Limiting

Scroll down to the **Rate Limiting** section:

1. Toggle **"Enable Rate Limiting"** ON
2. **Max Requests:** `100`
3. **Window (milliseconds):** `60000` (1 minute)
4. **Strategy:** Select `Token Bucket` (recommended)
5. **Scope:** Select `IP Address`

![Rate Limiting Settings](../assets/rate-limiting-settings.png)

**Rate Limiting Strategies Explained:**

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Token Bucket** | Smooth rate limiting with burst allowance | General purpose, recommended |
| **Fixed Window** | Reset counter at fixed intervals | Simple use cases |
| **Sliding Window** | More accurate, prevents bursts | Strict rate limiting |

### Step 5: Add Custom Headers

In the **Headers** section:

1. Click **"Add Header"**
2. **Name:** `X-Powered-By`
3. **Value:** `FlexGate`
4. **Direction:** `Response` (add to responses)

You can add multiple headers for request/response manipulation.

![Custom Headers](../assets/custom-headers.png)

### Step 6: Configure Health Checks (Optional)

Enable health checks to monitor upstream availability:

1. Toggle **"Enable Health Checks"** ON
2. **Health Check URL:** `https://jsonplaceholder.typicode.com/users/1`
3. **Interval:** `30000` ms (30 seconds)
4. **Timeout:** `5000` ms (5 seconds)
5. **Unhealthy Threshold:** `3` (mark as unhealthy after 3 failures)
6. **Healthy Threshold:** `2` (mark as healthy after 2 successes)

### Step 7: Save the Route

1. Review all settings
2. Click **"Save Route"** button
3. You'll see a success message
4. The route is now active!

![Route Saved](../assets/route-saved.png)

### Step 8: Test Your Route

Open a new terminal and test:

```bash
# Test GET request
curl http://localhost:3000/api/users

# Check response headers
curl -I http://localhost:3000/api/users
```

**Expected Response:**

```json
[
  {
    "id": 1,
    "name": "Leanne Graham",
    "username": "Bret",
    "email": "Sincere@april.biz",
    "address": {
      "street": "Kulas Light",
      "suite": "Apt. 556",
      "city": "Gwenborough",
      "zipcode": "92998-3874"
    },
    ...
  },
  ...
]
```

**Check Custom Header:**

```bash
curl -I http://localhost:3000/api/users | grep X-Powered-By
```

**Output:**
```
X-Powered-By: FlexGate
```

## Method 2: Using the REST API

### Step 1: Get Authentication Token

First, obtain a JWT token:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

Save the token:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Step 2: Create the Route

```bash
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "id": "users-api",
    "path": "/api/users",
    "upstream": "https://jsonplaceholder.typicode.com/users",
    "methods": ["GET", "POST"],
    "enabled": true,
    "description": "Proxy to JSONPlaceholder users API",
    "rateLimit": {
      "enabled": true,
      "max": 100,
      "windowMs": 60000,
      "strategy": "token-bucket",
      "scope": "ip"
    },
    "headers": {
      "response": {
        "X-Powered-By": "FlexGate"
      }
    },
    "healthCheck": {
      "enabled": true,
      "url": "https://jsonplaceholder.typicode.com/users/1",
      "interval": 30000,
      "timeout": 5000,
      "unhealthyThreshold": 3,
      "healthyThreshold": 2
    }
  }'
```

**Response:**
```json
{
  "id": "users-api",
  "path": "/api/users",
  "upstream": "https://jsonplaceholder.typicode.com/users",
  "enabled": true,
  "createdAt": "2026-02-09T10:30:00.000Z",
  "updatedAt": "2026-02-09T10:30:00.000Z"
}
```

### Step 3: Verify Route Creation

```bash
# List all routes
curl http://localhost:3000/api/routes \
  -H "Authorization: Bearer $TOKEN"

# Get specific route
curl http://localhost:3000/api/routes/users-api \
  -H "Authorization: Bearer $TOKEN"
```

### Step 4: Test the Route

```bash
# Test GET
curl http://localhost:3000/api/users

# Test POST
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

## Method 3: Using Configuration File

### Step 1: Edit Configuration

Open `config/proxy.yml`:

```yaml
routes:
  - id: users-api
    path: /api/users
    upstream: https://jsonplaceholder.typicode.com/users
    methods:
      - GET
      - POST
    enabled: true
    description: Proxy to JSONPlaceholder users API
    
    # Rate limiting
    rateLimit:
      enabled: true
      max: 100
      windowMs: 60000  # 1 minute
      strategy: token-bucket
      scope: ip
    
    # Custom headers
    headers:
      response:
        X-Powered-By: FlexGate
    
    # Health checks
    healthCheck:
      enabled: true
      url: https://jsonplaceholder.typicode.com/users/1
      interval: 30000  # 30 seconds
      timeout: 5000    # 5 seconds
      unhealthyThreshold: 3
      healthyThreshold: 2
    
    # Timeouts
    timeout:
      connect: 5000
      request: 30000
    
    # Retry configuration
    retry:
      enabled: true
      attempts: 3
      backoff: exponential
```

### Step 2: Validate Configuration

```bash
# Check syntax
flexgate config:validate

# Dry run (show changes without applying)
flexgate config:reload --dry-run
```

### Step 3: Reload Configuration

```bash
# Reload without downtime
flexgate config:reload

# OR send SIGHUP signal
kill -HUP $(cat flexgate.pid)
```

### Step 4: Verify Changes

```bash
# Check route is loaded
flexgate routes:list

# Test the route
curl http://localhost:3000/api/users
```

## Testing Your Route

### Basic Functionality Test

```bash
# GET request
curl http://localhost:3000/api/users

# GET specific user
curl http://localhost:3000/api/users/1

# POST request
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com"}'
```

### Rate Limiting Test

Test that rate limiting works:

```bash
# Send 105 requests quickly
for i in {1..105}; do
  echo "Request $i:"
  curl -w " Status: %{http_code}\n" \
    http://localhost:3000/api/users \
    -s -o /dev/null
  sleep 0.1
done
```

After 100 requests, you should see:
```
Request 101: Status: 429
Request 102: Status: 429
...
```

**Rate limit response:**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 42 seconds.",
  "retryAfter": 42
}
```

### Custom Header Test

```bash
# Check response headers
curl -I http://localhost:3000/api/users

# Should include:
# X-Powered-By: FlexGate
```

### Performance Test

Use Apache Bench or similar tool:

```bash
# Install Apache Bench
sudo apt install apache2-utils  # Ubuntu
brew install httpd              # macOS

# Run 1000 requests, 10 concurrent
ab -n 1000 -c 10 http://localhost:3000/api/users

# Check results
```

**Example output:**
```
Requests per second:    2456.78 [#/sec] (mean)
Time per request:       4.070 [ms] (mean)
Time per request:       0.407 [ms] (mean, across all concurrent requests)
```

## Monitoring Your Route

### View Metrics in Admin UI

1. Navigate to **http://localhost:3000/admin/monitoring**
2. Select your route: `users-api`
3. View real-time metrics:
   - Requests per second
   - Response time (p50, p95, p99)
   - Error rate
   - Status code distribution

![Route Metrics](../assets/route-metrics.png)

### Check Prometheus Metrics

```bash
# View all metrics
curl http://localhost:3000/metrics

# Filter for your route
curl http://localhost:3000/metrics | grep users_api
```

**Example metrics:**
```
# Requests
flexgate_requests_total{route="users-api",method="GET",status="200"} 1523

# Response time
flexgate_request_duration_seconds_bucket{route="users-api",le="0.1"} 1450
flexgate_request_duration_seconds_bucket{route="users-api",le="0.5"} 1520

# Rate limit hits
flexgate_rate_limit_hits_total{route="users-api"} 23
```

### View Logs

```bash
# Tail logs
flexgate logs --tail 50

# Filter by route
flexgate logs --route users-api

# JSON output
flexgate logs --format json | jq '.route == "users-api"'
```

**Example log entry:**
```json
{
  "timestamp": "2026-02-09T10:30:15.123Z",
  "level": "info",
  "route": "users-api",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration": 45,
  "ip": "192.168.1.100",
  "userAgent": "curl/7.64.1"
}
```

## Advanced Configuration

### Add Circuit Breaker

Protect against cascading failures:

```yaml
routes:
  - id: users-api
    # ... other config ...
    
    circuitBreaker:
      enabled: true
      threshold: 50          # % of errors to trip
      timeout: 30000         # Time to wait before retry (ms)
      resetTimeout: 60000    # Time to attempt recovery (ms)
      volumeThreshold: 10    # Min requests before evaluation
```

### Add Request/Response Transformation

```yaml
routes:
  - id: users-api
    # ... other config ...
    
    transform:
      request:
        # Add query parameter
        query:
          source: flexgate
        
        # Modify headers
        headers:
          remove:
            - X-Internal-Token
          add:
            X-API-Version: "v1"
      
      response:
        # Remove sensitive fields
        body:
          exclude:
            - password
            - ssn
```

### Add Caching

```yaml
routes:
  - id: users-api
    # ... other config ...
    
    cache:
      enabled: true
      ttl: 300000          # 5 minutes
      varyBy:
        - method
        - path
        - query
      cacheableStatuses:
        - 200
        - 301
        - 404
```

### Add Authentication

```yaml
routes:
  - id: users-api
    # ... other config ...
    
    auth:
      enabled: true
      type: jwt
      jwt:
        secret: ${JWT_SECRET}
        algorithms:
          - HS256
        validateIssuer: true
        issuer: flexgate
        validateExpiration: true
```

## Troubleshooting

### Route Not Working

**Problem:** Requests return 404

**Solutions:**

1. Check route is enabled:
```bash
curl http://localhost:3000/api/routes/users-api \
  -H "Authorization: Bearer $TOKEN"
```

2. Verify path matching:
```bash
# Check routes list
flexgate routes:list

# Enable debug logging
export DEBUG=flexgate:*
flexgate start
```

3. Check HAProxy configuration:
```bash
# View generated HAProxy config
cat /etc/haproxy/haproxy.cfg | grep users-api
```

### Rate Limiting Not Working

**Problem:** No 429 responses after exceeding limit

**Solutions:**

1. Verify rate limit config:
```bash
curl http://localhost:3000/api/routes/users-api/rate-limit \
  -H "Authorization: Bearer $TOKEN"
```

2. Check Redis connection:
```bash
# Test Redis
redis-cli ping

# Check FlexGate logs
flexgate logs | grep redis
```

3. Clear rate limit counters:
```bash
# Reset for specific IP
redis-cli DEL rate-limit:users-api:192.168.1.100

# Reset all for route
redis-cli KEYS "rate-limit:users-api:*" | xargs redis-cli DEL
```

### Upstream Connection Failures

**Problem:** 502 Bad Gateway errors

**Solutions:**

1. Check upstream is reachable:
```bash
curl https://jsonplaceholder.typicode.com/users
```

2. Verify DNS resolution:
```bash
nslookup jsonplaceholder.typicode.com
```

3. Check health check status:
```bash
curl http://localhost:3000/api/routes/users-api/health \
  -H "Authorization: Bearer $TOKEN"
```

4. Increase timeout:
```yaml
timeout:
  connect: 10000  # Increase from 5000
  request: 60000  # Increase from 30000
```

## Next Steps

Now that you've created your first route, explore:

1. **[Route Configuration Reference](../config/routes.md)** - All route options
2. **[Rate Limiting Strategies](../config/rate-limiting.md)** - Advanced rate limiting
3. **[Circuit Breaker Pattern](../config/circuit-breaker.md)** - Prevent cascading failures
4. **[Load Balancing](../config/load-balancing.md)** - Multiple upstream servers
5. **[Authentication](../security/authentication.md)** - Secure your routes

## Summary

You've learned how to:

✅ Create routes using Admin UI, REST API, and configuration files  
✅ Configure rate limiting to protect your APIs  
✅ Add custom headers for branding and tracking  
✅ Set up health checks for upstream monitoring  
✅ Test routes with various HTTP methods  
✅ Monitor route performance and traffic  
✅ Troubleshoot common issues  

**Congratulations!** 🎉 You're now ready to build production-ready API routes with FlexGate.

---

Have questions? Join our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions) or check the [FAQ](../faq.md).
