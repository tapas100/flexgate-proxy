# Route Configuration

Complete reference for configuring routes in FlexGate. Learn all available options, patterns, and best practices.

## Route Schema

A route defines how FlexGate forwards requests to upstream services:

```yaml
routes:
  - id: example-route           # Required: Unique identifier
    path: /api/v1/*             # Required: URL path pattern
    upstream: http://backend:8080  # Required: Upstream server URL
    methods: [GET, POST]         # Optional: HTTP methods (default: all)
    enabled: true                # Optional: Enable/disable route (default: true)
    description: "Example route" # Optional: Human-readable description
    priority: 100                # Optional: Route priority (higher = first)
    
    # Additional configuration sections...
```

## Basic Configuration

### Path Patterns

FlexGate supports multiple path matching patterns:

#### Exact Match

```yaml
path: /api/users
# Matches: /api/users
# Does not match: /api/users/123, /api/users/
```

#### Prefix Match

```yaml
path: /api/users/*
# Matches: /api/users/123, /api/users/profile, /api/users/a/b/c
# Does not match: /api/user, /api
```

#### Wildcard Match

```yaml
path: /api/*/profile
# Matches: /api/users/profile, /api/admins/profile
# Does not match: /api/profile, /api/users/settings
```

#### Regular Expression

```yaml
path: ^/api/users/[0-9]+$
pathType: regex
# Matches: /api/users/123, /api/users/456789
# Does not match: /api/users/abc, /api/users/123/profile
```

#### Named Parameters

```yaml
path: /api/users/:userId/posts/:postId
# Matches: /api/users/123/posts/456
# Captures: userId=123, postId=456
```

### Upstream Configuration

#### Single Upstream

```yaml
upstream: https://api.example.com:8080
```

#### Multiple Upstreams (Load Balancing)

```yaml
upstreams:
  - url: http://backend1:8080
    weight: 70              # 70% of traffic
  - url: http://backend2:8080
    weight: 30              # 30% of traffic
  
loadBalancing:
  algorithm: weighted-round-robin
```

#### Upstream with Path Rewrite

```yaml
upstream: http://backend:8080
pathRewrite:
  from: /api/v1
  to: /v2
# Request: /api/v1/users → Backend receives: /v2/users
```

### HTTP Methods

Restrict routes to specific HTTP methods:

```yaml
# Single method
methods: [GET]

# Multiple methods
methods: [GET, POST, PUT, PATCH]

# All methods (default)
methods: [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]
```

### Priority

Control route matching order:

```yaml
routes:
  # Higher priority routes are matched first
  - id: specific-route
    path: /api/users/admin
    priority: 100
    upstream: http://admin-service:8080
  
  # Lower priority (more general) routes
  - id: general-route
    path: /api/users/*
    priority: 50
    upstream: http://user-service:8080
```

**Default Priority:** 50  
**Range:** 0-999 (higher = higher priority)

## Advanced Configuration

### Request Transformation

#### Headers

```yaml
headers:
  request:
    # Add headers
    add:
      X-API-Version: v1
      X-Request-ID: ${requestId}  # Dynamic value
      X-Forwarded-For: ${clientIp}
    
    # Remove headers
    remove:
      - Authorization  # Strip sensitive headers
      - X-Internal-Token
    
    # Rename headers
    rename:
      X-Custom-Auth: Authorization
  
  response:
    # Add to responses
    add:
      X-Powered-By: FlexGate
      X-Response-Time: ${responseTime}ms
      Cache-Control: public, max-age=3600
    
    # Remove from responses
    remove:
      - Server  # Hide server identity
      - X-Powered-By
```

#### Query Parameters

```yaml
query:
  # Add parameters
  add:
    source: flexgate
    version: "1.0"
  
  # Remove parameters
  remove:
    - debug
    - internal
  
  # Rename parameters
  rename:
    user_id: userId
```

#### Path Transformation

```yaml
pathRewrite:
  # Simple replacement
  from: /api/v1
  to: /api/v2

# OR regex replacement
pathRewrite:
  regex: ^/old/(.*)$
  replace: /new/$1
# /old/users → /new/users
```

#### Body Transformation

```yaml
transform:
  request:
    # Modify JSON request body
    body:
      # Add fields
      add:
        source: "flexgate"
        timestamp: "${timestamp}"
      
      # Remove fields
      exclude:
        - internalField
        - debugInfo
      
      # Rename fields
      rename:
        user_name: username
  
  response:
    # Modify JSON response body
    body:
      # Remove sensitive fields
      exclude:
        - password
        - ssn
        - creditCard
      
      # Add fields
      add:
        apiVersion: "1.0"
```

### Rate Limiting

Protect your APIs from abuse:

```yaml
rateLimit:
  enabled: true
  max: 100                # Max requests
  windowMs: 60000         # Time window (1 minute)
  strategy: token-bucket  # Algorithm
  scope: ip               # Limit by IP address
  
  # Advanced options
  skipSuccessfulRequests: false
  skipFailedRequests: false
  
  # Custom key function
  keyGenerator: ip+user   # Combine IP and user ID
  
  # Response headers
  headers: true           # Add X-RateLimit-* headers
  
  # Custom error response
  message: "Too many requests from this IP"
  statusCode: 429
```

**Strategies:**
- `token-bucket` - Smooth rate limiting with burst allowance (recommended)
- `fixed-window` - Reset counter at fixed intervals
- `sliding-window` - More accurate, prevents burst at window boundaries
- `leaky-bucket` - Constant rate, no bursts

**Scope Options:**
- `ip` - Per IP address
- `user` - Per authenticated user
- `apiKey` - Per API key
- `route` - Global for the route
- `custom` - Custom key function

### Circuit Breaker

Prevent cascade failures:

```yaml
circuitBreaker:
  enabled: true
  
  # Thresholds
  threshold: 50              # % of errors to trip (0-100)
  timeout: 30000             # Time circuit stays open (ms)
  resetTimeout: 60000        # Time to try recovery (ms)
  volumeThreshold: 10        # Min requests before evaluation
  
  # Error conditions
  errorStatuses:
    - 500
    - 502
    - 503
    - 504
  
  # Fallback response
  fallback:
    statusCode: 503
    body:
      error: "Service temporarily unavailable"
      message: "Circuit breaker is open"
```

**States:**
- `CLOSED` - Normal operation, requests pass through
- `OPEN` - Too many errors, requests fail fast
- `HALF_OPEN` - Testing if service recovered

### Health Checks

Monitor upstream availability:

```yaml
healthCheck:
  enabled: true
  
  # Health check endpoint
  url: http://backend:8080/health
  method: GET
  
  # Timing
  interval: 30000           # Check every 30 seconds
  timeout: 5000             # Request timeout
  
  # Thresholds
  healthyThreshold: 2       # Successes to mark healthy
  unhealthyThreshold: 3     # Failures to mark unhealthy
  
  # Expected response
  expectedStatus: 200
  expectedBody:
    contains: '"status":"healthy"'
  
  # Custom headers
  headers:
    Authorization: Bearer ${HEALTH_CHECK_TOKEN}
```

### Timeouts

Configure connection and request timeouts:

```yaml
timeout:
  connect: 5000             # Connection timeout (ms)
  request: 30000            # Request timeout (ms)
  keepAlive: 60000          # Keep-alive timeout (ms)
```

### Retry Logic

Automatically retry failed requests:

```yaml
retry:
  enabled: true
  attempts: 3               # Max retry attempts
  backoff: exponential      # Backoff strategy
  
  # Backoff configuration
  initialDelay: 100         # First retry delay (ms)
  maxDelay: 10000           # Max delay between retries
  multiplier: 2             # Delay multiplier
  
  # Retry conditions
  retryOn:
    statuses:
      - 502  # Bad Gateway
      - 503  # Service Unavailable
      - 504  # Gateway Timeout
    errors:
      - ECONNRESET
      - ETIMEDOUT
      - ECONNREFUSED
  
  # Do not retry on
  doNotRetryOn:
    statuses:
      - 400  # Bad Request
      - 401  # Unauthorized
      - 403  # Forbidden
      - 404  # Not Found
```

**Backoff Strategies:**
- `exponential` - Delay doubles each time (100ms, 200ms, 400ms...)
- `linear` - Fixed increase (100ms, 200ms, 300ms...)
- `constant` - Same delay every time
- `random` - Random jitter to prevent thundering herd

### Caching

Cache responses for better performance:

```yaml
cache:
  enabled: true
  ttl: 300000               # Cache lifetime (5 minutes)
  
  # Cache key components
  varyBy:
    - method                # GET vs POST
    - path                  # URL path
    - query                 # Query parameters
    - headers:              # Specific headers
        - Accept
        - Accept-Language
  
  # Cacheable responses
  cacheableStatuses:
    - 200
    - 301
    - 404
  
  # Cache storage
  storage: redis            # 'redis' or 'memory'
  
  # Cache control
  respectCacheHeaders: true # Honor Cache-Control headers
  
  # Bypass cache
  bypassOn:
    headers:
      - Cache-Control: no-cache
    query:
      - nocache: "1"
```

### Authentication

Secure your routes:

#### JWT Authentication

```yaml
auth:
  enabled: true
  type: jwt
  
  jwt:
    secret: ${JWT_SECRET}
    algorithms:
      - HS256
      - RS256
    
    # Validation
    validateIssuer: true
    issuer: "https://auth.example.com"
    
    validateAudience: true
    audience: "api.example.com"
    
    validateExpiration: true
    clockTolerance: 5       # Seconds
    
    # Token location
    location:
      - header: Authorization
        scheme: Bearer
      - cookie: auth_token
      - query: token
```

#### API Key Authentication

```yaml
auth:
  enabled: true
  type: apiKey
  
  apiKey:
    location:
      - header: X-API-Key
      - query: api_key
    
    # Key validation
    validateIn: database    # 'database' or 'config'
    
    # Rate limiting per key
    rateLimitPerKey: true
```

#### OAuth 2.0

```yaml
auth:
  enabled: true
  type: oauth2
  
  oauth2:
    provider: google        # google, github, custom
    clientId: ${OAUTH_CLIENT_ID}
    clientSecret: ${OAUTH_CLIENT_SECRET}
    redirectUri: http://localhost:3000/auth/callback
    
    scopes:
      - openid
      - email
      - profile
```

### CORS

Configure Cross-Origin Resource Sharing:

```yaml
cors:
  enabled: true
  
  # Allowed origins
  origins:
    - https://example.com
    - https://*.example.com  # Wildcard subdomain
  
  # Allowed methods
  methods:
    - GET
    - POST
    - PUT
    - DELETE
  
  # Allowed headers
  allowedHeaders:
    - Content-Type
    - Authorization
    - X-Custom-Header
  
  # Exposed headers
  exposedHeaders:
    - X-RateLimit-Remaining
    - X-Response-Time
  
  # Credentials
  credentials: true
  
  # Preflight cache
  maxAge: 86400             # 24 hours
```

### WebSocket Support

Enable WebSocket proxying:

```yaml
websocket:
  enabled: true
  
  # Ping/pong
  pingInterval: 30000       # Send ping every 30s
  pongTimeout: 5000         # Expect pong within 5s
  
  # Connection limits
  maxConnections: 1000
  maxMessageSize: 1048576   # 1MB
  
  # Compression
  compression: true
```

### Request Validation

Validate incoming requests:

```yaml
validation:
  enabled: true
  
  # JSON Schema validation
  requestBody:
    schema:
      type: object
      required:
        - email
        - password
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
  
  # Header validation
  headers:
    required:
      - Content-Type
      - Authorization
    
    validate:
      Content-Type:
        enum:
          - application/json
  
  # Query parameter validation
  query:
    schema:
      type: object
      properties:
        page:
          type: integer
          minimum: 1
        limit:
          type: integer
          minimum: 1
          maximum: 100
```

## Complete Example

Here's a production-ready route configuration:

```yaml
routes:
  - id: api-v1-users
    path: /api/v1/users/*
    upstream: http://user-service:8080
    methods: [GET, POST, PUT, DELETE]
    enabled: true
    description: "User management API with full protection"
    priority: 100
    
    # Path transformation
    pathRewrite:
      from: /api/v1
      to: /api
    
    # Headers
    headers:
      request:
        add:
          X-API-Version: "1.0"
          X-Request-ID: ${requestId}
        remove:
          - X-Internal-Token
      
      response:
        add:
          X-Powered-By: FlexGate
          X-Response-Time: ${responseTime}ms
        remove:
          - Server
    
    # Rate limiting
    rateLimit:
      enabled: true
      max: 1000
      windowMs: 60000
      strategy: token-bucket
      scope: apiKey
      headers: true
    
    # Circuit breaker
    circuitBreaker:
      enabled: true
      threshold: 50
      timeout: 30000
      resetTimeout: 60000
      volumeThreshold: 10
    
    # Health checks
    healthCheck:
      enabled: true
      url: http://user-service:8080/health
      interval: 30000
      timeout: 5000
      healthyThreshold: 2
      unhealthyThreshold: 3
      expectedStatus: 200
    
    # Timeouts
    timeout:
      connect: 5000
      request: 30000
    
    # Retry logic
    retry:
      enabled: true
      attempts: 3
      backoff: exponential
      retryOn:
        statuses: [502, 503, 504]
    
    # Caching
    cache:
      enabled: true
      ttl: 300000
      varyBy: [method, path, query]
      cacheableStatuses: [200]
      storage: redis
    
    # Authentication
    auth:
      enabled: true
      type: jwt
      jwt:
        secret: ${JWT_SECRET}
        algorithms: [HS256]
        validateExpiration: true
    
    # CORS
    cors:
      enabled: true
      origins: ["https://example.com"]
      methods: [GET, POST, PUT, DELETE]
      credentials: true
    
    # Validation
    validation:
      enabled: true
      requestBody:
        schema:
          type: object
          required: [email]
```

## Best Practices

### Performance

1. **Use caching** for read-heavy endpoints
2. **Set appropriate timeouts** (5s connect, 30s request)
3. **Enable compression** for large responses
4. **Use health checks** to detect unhealthy upstreams early

### Security

1. **Always use authentication** on sensitive routes
2. **Configure CORS** properly
3. **Validate input** with JSON schemas
4. **Remove internal headers** before proxying
5. **Use HTTPS** in production

### Reliability

1. **Enable circuit breaker** for external services
2. **Configure retry logic** for transient failures
3. **Set up health checks** for all upstreams
4. **Use rate limiting** to prevent abuse

### Maintainability

1. **Use descriptive IDs** and descriptions
2. **Group related routes** with priority
3. **Document custom configurations**
4. **Version your routes** (/api/v1, /api/v2)

## Next Steps

- **[Rate Limiting Guide](./rate-limiting.md)** - Deep dive into rate limiting
- **[Circuit Breaker Pattern](./circuit-breaker.md)** - Resilience patterns
- **[Load Balancing](./load-balancing.md)** - Multiple upstream servers
- **[Health Checks](./health-checks.md)** - Monitoring upstreams

---

**Questions?** Join our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions).
