# Admin UI Settings

Complete guide to configuring FlexGate through the Admin UI Settings panel. This page documents all global configuration options available to developers and administrators.

## Accessing Settings

1. Login to Admin UI at http://localhost:3000/admin
2. Click **"Settings"** in the left sidebar
3. You'll see the Settings dashboard with multiple configuration tabs


## Settings Overview

The Settings panel is organized into these sections:

| Section | Description | User Access |
|---------|-------------|-------------|
| **General** | Server and application settings | Admin only |
| **Database** | PostgreSQL configuration | Admin only |
| **Redis** | Cache and session storage | Admin only |
| **Security** | Authentication and CORS | Admin only |
| **Rate Limiting** | Global rate limit defaults | Admin/Developer |
| **Circuit Breaker** | Default circuit breaker settings | Admin/Developer |
| **Health Checks** | Default health check configuration | Admin/Developer |
| **Logging** | Log levels and output | Admin only |
| **Monitoring** | Metrics and observability | Admin/Developer |
| **Webhooks** | Event notification settings | Admin/Developer |
| **API Keys** | API key generation settings | Admin only |
| **Advanced** | Expert-level configuration | Admin only |

## General Settings

### Server Configuration

Configure the core FlexGate server:

**HTTP Server:**

| Setting | Description | Default | Example |
|---------|-------------|---------|---------|
| **Port** | HTTP server port | `3000` | `8080` |
| **Host** | Bind address | `0.0.0.0` | `127.0.0.1` |
| **Base Path** | URL base path | `/` | `/gateway` |
| **Max Connections** | Maximum concurrent connections | `10000` | `50000` |
| **Keep-Alive Timeout** | Connection keep-alive (ms) | `60000` | `120000` |

**Configuration Example:**

```yaml
server:
  port: 3000
  host: 0.0.0.0
  basePath: /
  maxConnections: 10000
  keepAliveTimeout: 60000
  
  # Trust proxy headers
  trustProxy: true
  proxyHops: 1
  
  # Compression
  compression:
    enabled: true
    level: 6
    threshold: 1024  # bytes
```

**UI Form Fields:**

- **Port** (Number input, 1-65535)
  - Tooltip: "Port number for FlexGate to listen on"
  - Validation: Must not conflict with other services

- **Host** (Text input)
  - Options: `0.0.0.0` (all interfaces), `127.0.0.1` (localhost only)
  - Tooltip: "Network interface to bind to"

- **Trust Proxy** (Toggle)
  - When enabled: Trust `X-Forwarded-*` headers
  - Use when: Behind load balancer or reverse proxy

- **Compression** (Toggle + Settings)
  - Enable gzip/brotli compression
  - Level: 1-9 (higher = better compression, slower)
  - Threshold: Minimum response size to compress

### Admin UI Configuration

Customize the Admin UI itself:

| Setting | Description | Default |
|---------|-------------|---------|
| **Enabled** | Enable/disable Admin UI | `true` |
| **Path** | URL path for Admin UI | `/admin` |
| **Session Timeout** | Session duration (ms) | `3600000` (1h) |
| **Max Login Attempts** | Failed login limit | `5` |
| **Lockout Duration** | Account lockout time (ms) | `900000` (15m) |
| **Theme** | Default theme | `auto` |
| **Auto Refresh** | Dashboard refresh interval | `30000` (30s) |

**Configuration Example:**

```yaml
admin:
  enabled: true
  path: /admin
  sessionTimeout: 3600000
  maxLoginAttempts: 5
  lockoutDuration: 900000
  
  # UI Preferences
  theme: auto  # auto, light, dark
  autoRefresh: 30000
  
  # Branding
  branding:
    logo: /assets/logo.svg
    title: "FlexGate Admin"
    primaryColor: "#007bff"
```

**UI Form Fields:**

- **Session Timeout** (Duration picker)
  - Options: 15m, 30m, 1h, 2h, 4h, 8h
  - Tooltip: "How long users stay logged in without activity"

- **Max Login Attempts** (Number input)
  - Range: 3-10
  - Tooltip: "Failed attempts before account lockout"

- **Branding** (Expandable section)
  - Upload logo (SVG/PNG)
  - Color picker for theme
  - Custom title text

## Database Settings

Configure PostgreSQL connection:

### Connection Settings

| Setting | Description | Example |
|---------|-------------|---------|
| **Host** | Database hostname | `localhost` |
| **Port** | Database port | `5432` |
| **Database** | Database name | `flexgate` |
| **User** | Database username | `flexgate` |
| **Password** | Database password | `••••••••` |
| **SSL Mode** | SSL connection mode | `prefer` |

**Configuration Example:**

```yaml
database:
  host: localhost
  port: 5432
  database: flexgate
  user: flexgate
  password: ${DB_PASSWORD}  # From environment
  
  # SSL Configuration
  ssl:
    enabled: true
    mode: prefer  # disable, prefer, require, verify-ca, verify-full
    ca: /path/to/ca.crt
    cert: /path/to/client.crt
    key: /path/to/client.key
  
  # Connection Pool
  pool:
    min: 2
    max: 10
    idleTimeout: 30000
    acquireTimeout: 30000
```

### Connection Pool

Optimize database performance:

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| **Min Connections** | Minimum pool size | `2` | 1-50 |
| **Max Connections** | Maximum pool size | `10` | 1-100 |
| **Idle Timeout** | Idle connection timeout (ms) | `30000` | 1000-300000 |
| **Acquire Timeout** | Connection acquire timeout (ms) | `30000` | 1000-60000 |

**UI Form Fields:**

- **Connection Test** (Button)
  - Click to test database connectivity
  - Shows: ✅ Connected or ❌ Error message

- **Migration Status** (Read-only display)
  - Current schema version
  - Pending migrations
  - "Run Migrations" button

- **Backup/Restore** (Actions)
  - Export database schema
  - Create backup
  - Restore from backup

## Redis Settings

Configure Redis for caching and sessions:

### Connection Settings

| Setting | Description | Default | Example |
|---------|-------------|---------|---------|
| **Host** | Redis hostname | `localhost` | `redis.example.com` |
| **Port** | Redis port | `6379` | `6379` |
| **Database** | Redis database number | `0` | `1` |
| **Password** | Redis password | - | `••••••••` |
| **Key Prefix** | Key namespace prefix | `flexgate:` | `prod:flexgate:` |

**Configuration Example:**

```yaml
redis:
  host: localhost
  port: 6379
  db: 0
  password: ${REDIS_PASSWORD}
  keyPrefix: "flexgate:"
  
  # Connection Options
  connectTimeout: 10000
  commandTimeout: 5000
  retryStrategy:
    maxAttempts: 3
    delay: 1000
  
  # Sentinel (High Availability)
  sentinel:
    enabled: false
    masterName: mymaster
    sentinels:
      - host: sentinel1
        port: 26379
      - host: sentinel2
        port: 26379
```

### Cache Settings

Configure caching behavior:

| Setting | Description | Default |
|---------|-------------|---------|
| **Default TTL** | Default cache lifetime (ms) | `300000` (5m) |
| **Max Memory** | Maximum cache memory (MB) | `1024` |
| **Eviction Policy** | Memory eviction strategy | `allkeys-lru` |

**Eviction Policies:**

- `noeviction` - Return errors when memory limit reached
- `allkeys-lru` - Evict least recently used keys
- `allkeys-lfu` - Evict least frequently used keys
- `volatile-lru` - Evict LRU keys with TTL set
- `volatile-ttl` - Evict keys with shortest TTL

**UI Form Fields:**

- **Connection Test** (Button)
  - Test Redis connectivity
  - Shows latency and memory usage

- **Clear Cache** (Button with confirmation)
  - Options: Clear all, Clear by prefix, Clear expired only
  - Warning: "This will invalidate all cached data"

- **Cache Statistics** (Read-only metrics)
  - Hit rate
  - Miss rate
  - Memory usage
  - Key count

## Security Settings

### Authentication

Configure authentication methods:

**JWT Configuration:**

| Setting | Description | Example |
|---------|-------------|---------|
| **JWT Secret** | Signing secret | From environment |
| **Algorithm** | Signing algorithm | `HS256` |
| **Expiration** | Token lifetime | `24h` |
| **Issuer** | Token issuer | `flexgate` |
| **Audience** | Token audience | `api.example.com` |

**Configuration Example:**

```yaml
security:
  jwt:
    secret: ${JWT_SECRET}  # Required: Set in environment
    algorithm: HS256  # HS256, HS384, HS512, RS256, RS384, RS512
    expiresIn: 24h
    issuer: flexgate
    audience: api.example.com
    
    # Validation
    validateIssuer: true
    validateAudience: true
    validateExpiration: true
    clockTolerance: 5  # seconds
  
  # Session Configuration
  session:
    secret: ${SESSION_SECRET}
    name: flexgate.sid
    cookie:
      maxAge: 3600000  # 1 hour
      secure: true
      httpOnly: true
      sameSite: strict
```

**UI Form Fields:**

- **JWT Secret** (Password field)
  - "Generate Random" button
  - Validation: Minimum 32 characters
  - Warning: Changing this invalidates all tokens

- **Token Expiration** (Duration picker)
  - Options: 1h, 4h, 12h, 24h, 7d, 30d, Never
  - Default: 24h

### CORS Configuration

Configure Cross-Origin Resource Sharing:

| Setting | Description | Example |
|---------|-------------|---------|
| **Enabled** | Enable CORS | `true` |
| **Origins** | Allowed origins | `["https://example.com"]` |
| **Methods** | Allowed methods | `["GET", "POST"]` |
| **Headers** | Allowed headers | `["Content-Type"]` |
| **Credentials** | Allow credentials | `true` |
| **Max Age** | Preflight cache (seconds) | `86400` |

**Configuration Example:**

```yaml
security:
  cors:
    enabled: true
    
    # Allowed Origins
    origins:
      - https://example.com
      - https://*.example.com  # Wildcard subdomain
      - http://localhost:3000  # Development
    
    # Allowed Methods
    methods:
      - GET
      - POST
      - PUT
      - PATCH
      - DELETE
      - OPTIONS
    
    # Allowed Headers
    allowedHeaders:
      - Content-Type
      - Authorization
      - X-Requested-With
      - X-API-Key
    
    # Exposed Headers (visible to browser)
    exposedHeaders:
      - X-RateLimit-Limit
      - X-RateLimit-Remaining
      - X-Response-Time
    
    # Credentials
    credentials: true
    
    # Preflight Cache
    maxAge: 86400  # 24 hours
```

**UI Form Fields:**

- **Origins** (Tag input)
  - Add multiple origins
  - Supports wildcards: `*.example.com`
  - Validation: Valid URL format

- **Quick Presets** (Buttons)
  - "Development" - Allow localhost
  - "Production" - Strict HTTPS only
  - "Public API" - Allow all origins (not recommended)

### API Key Settings

Configure API key generation:

| Setting | Description | Default |
|---------|-------------|---------|
| **Key Length** | Generated key length | `32` |
| **Prefix** | Key prefix | `fg_` |
| **Default Expiration** | Default TTL | `never` |
| **Rate Limit** | Default rate limit | `1000/hour` |

**Configuration Example:**

```yaml
security:
  apiKeys:
    length: 32
    prefix: fg_
    defaultExpiration: never  # or duration like "30d"
    
    # Default Permissions
    defaultPermissions:
      - routes:read
      - metrics:read
    
    # Rate Limiting per Key
    defaultRateLimit:
      max: 1000
      windowMs: 3600000  # 1 hour
```

## Rate Limiting Defaults

Set global default values for rate limiting:

### Default Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Strategy** | Default algorithm | `token-bucket` |
| **Max Requests** | Default limit | `100` |
| **Window** | Default window (ms) | `60000` |
| **Scope** | Default scope | `ip` |
| **Headers** | Include rate limit headers | `true` |

**Configuration Example:**

```yaml
rateLimit:
  defaults:
    strategy: token-bucket
    max: 100
    windowMs: 60000
    scope: ip
    headers: true
    
    # Error Response
    statusCode: 429
    message: "Rate limit exceeded"
    
    # Skip Conditions
    skipSuccessfulRequests: false
    skipFailedRequests: false
```

**UI Form Fields:**

- **Strategy Selector** (Radio buttons with descriptions)
  - Token Bucket (Recommended)
  - Fixed Window
  - Sliding Window
  - Leaky Bucket

- **Preview** (Live calculation)
  - Shows: "Users can make X requests per Y seconds"
  - Updates as you change settings

## Circuit Breaker Defaults

Default circuit breaker configuration:

### Default Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Threshold** | Error rate to trip (%) | `50` |
| **Timeout** | Open state duration (ms) | `30000` |
| **Reset Timeout** | Half-open retry time (ms) | `60000` |
| **Volume Threshold** | Min requests before evaluation | `10` |

**Configuration Example:**

```yaml
circuitBreaker:
  defaults:
    threshold: 50  # percentage
    timeout: 30000  # 30 seconds
    resetTimeout: 60000  # 1 minute
    volumeThreshold: 10
    
    # Error Conditions
    errorStatuses:
      - 500
      - 502
      - 503
      - 504
    
    # Fallback Response
    fallback:
      statusCode: 503
      body:
        error: "Service Unavailable"
        message: "Circuit breaker is open"
```

## Health Check Defaults

Default health check settings:

### Default Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Enabled** | Enable by default | `false` |
| **Interval** | Check interval (ms) | `30000` |
| **Timeout** | Request timeout (ms) | `5000` |
| **Healthy Threshold** | Successes to mark healthy | `2` |
| **Unhealthy Threshold** | Failures to mark unhealthy | `3` |

**Configuration Example:**

```yaml
healthCheck:
  defaults:
    enabled: false
    interval: 30000
    timeout: 5000
    healthyThreshold: 2
    unhealthyThreshold: 3
    
    # Expected Response
    expectedStatus: 200
    method: GET
    
    # Headers
    headers:
      User-Agent: "FlexGate-HealthCheck/1.0"
```

## Logging Settings

Configure logging behavior:

### Log Configuration

| Setting | Description | Default | Options |
|---------|-------------|---------|---------|
| **Level** | Minimum log level | `info` | debug, info, warn, error |
| **Format** | Log format | `json` | json, text |
| **Output** | Output destination | `file` | file, console, both |
| **Max File Size** | Log rotation size | `10MB` | - |
| **Max Files** | Retained log files | `10` | - |

**Configuration Example:**

```yaml
logging:
  level: info  # debug, info, warn, error
  format: json  # json or text
  
  # Output Destinations
  outputs:
    - type: file
      path: /var/log/flexgate
      filename: combined.log
      maxSize: 10485760  # 10MB
      maxFiles: 10
      
    - type: file
      path: /var/log/flexgate
      filename: error.log
      level: error
      maxSize: 10485760
      maxFiles: 5
    
    - type: console
      level: debug
  
  # Log Structure
  prettyPrint: false
  colorize: true
  timestamp: true
  
  # Sensitive Data
  redact:
    - password
    - token
    - authorization
    - cookie
```

**UI Form Fields:**

- **Log Level** (Dropdown)
  - Debug (verbose, development only)
  - Info (recommended for production)
  - Warn (warnings and errors only)
  - Error (errors only)

- **View Logs** (Button)
  - Opens log viewer in modal
  - Filter by level
  - Search functionality
  - Download logs

- **Log Rotation** (Settings)
  - Max file size slider
  - Number of files to retain
  - Compression option (gzip old logs)

## Monitoring Settings

Configure metrics and observability:

### Prometheus Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Enabled** | Enable Prometheus metrics | `true` |
| **Endpoint** | Metrics endpoint path | `/metrics` |
| **Include Defaults** | Include default metrics | `true` |
| **Labels** | Default labels | `{app: "flexgate"}` |

**Configuration Example:**

```yaml
monitoring:
  prometheus:
    enabled: true
    endpoint: /metrics
    includeDefaults: true
    
    # Default Labels (added to all metrics)
    labels:
      app: flexgate
      environment: production
      region: us-east-1
    
    # Histogram Buckets
    buckets:
      response_time: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    
    # Prefix for all metrics
    prefix: flexgate_
```

### Grafana Integration

| Setting | Description | Example |
|---------|-------------|---------|
| **URL** | Grafana instance URL | `http://localhost:3001` |
| **Dashboard ID** | Default dashboard | `flexgate-overview` |
| **API Key** | Grafana API key | From environment |

**Configuration Example:**

```yaml
monitoring:
  grafana:
    url: http://localhost:3001
    dashboardId: flexgate-overview
    apiKey: ${GRAFANA_API_KEY}
    
    # Auto-provisioning
    autoProvision: true
    datasource: prometheus
```

### Tracing Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Enabled** | Enable distributed tracing | `false` |
| **Provider** | Tracing backend | `jaeger` |
| **Sample Rate** | Percentage to trace | `0.1` (10%) |

**Configuration Example:**

```yaml
monitoring:
  tracing:
    enabled: false
    provider: jaeger  # jaeger, zipkin, otel
    
    # Jaeger Configuration
    jaeger:
      endpoint: http://localhost:14268/api/traces
      agentHost: localhost
      agentPort: 6831
    
    # Sampling
    sampler:
      type: probabilistic  # const, probabilistic, rate-limiting
      param: 0.1  # 10% of requests
    
    # Tags
    tags:
      service: flexgate
      environment: production
```

## Webhook Settings

Configure event notifications:

### Webhook Configuration

| Setting | Description | Example |
|---------|-------------|---------|
| **Enabled** | Enable webhooks | `true` |
| **Retry Attempts** | Max retry attempts | `3` |
| **Retry Delay** | Delay between retries (ms) | `1000` |
| **Timeout** | Webhook timeout (ms) | `5000` |

**Configuration Example:**

```yaml
webhooks:
  enabled: true
  
  # Retry Configuration
  retry:
    attempts: 3
    delay: 1000  # Initial delay
    backoff: exponential
    maxDelay: 10000
  
  # Request Configuration
  timeout: 5000
  headers:
    User-Agent: "FlexGate-Webhook/1.0"
  
  # Events
  events:
    - route.created
    - route.updated
    - route.deleted
    - circuit_breaker.opened
    - circuit_breaker.closed
    - health_check.failed
    - rate_limit.exceeded
```

**UI Form Fields:**

- **Event Selection** (Checkboxes)
  - Select which events trigger webhooks
  - Grouped by category (Routes, Health, Security, etc.)

- **Test Webhook** (Section)
  - Enter test URL
  - Select event type
  - Send test payload
  - View response

## Advanced Settings

Expert-level configuration options:

### Performance Tuning

| Setting | Description | Default |
|---------|-------------|---------|
| **Worker Threads** | Number of worker threads | CPU cores |
| **Max Request Size** | Maximum request body (MB) | `10` |
| **Request Timeout** | Global request timeout (ms) | `30000` |

**Configuration Example:**

```yaml
advanced:
  performance:
    workerThreads: 4  # or "auto"
    maxRequestSize: 10485760  # 10MB
    requestTimeout: 30000
    
    # Cluster Mode
    cluster:
      enabled: false
      workers: 4  # or "auto"
      gracefulShutdown: 30000
  
  # Memory Management
  memory:
    heapSize: 2048  # MB
    gcInterval: 60000  # Force GC interval (ms)
```

### Feature Flags

Enable/disable experimental features:

```yaml
advanced:
  features:
    # Experimental Features
    http2: false
    http3: false
    websocketCompression: true
    
    # Beta Features
    autoScaling: false
    mlAnomalyDetection: false
```

**UI Form Fields:**

- **⚠️ Warning Banner**
  - "Advanced settings can affect performance and stability"
  - "Only modify if you understand the implications"

- **Feature Toggles** (Switches with descriptions)
  - Each feature has:
    - Name and description
    - Stability status (Stable, Beta, Experimental)
    - Documentation link

## Configuration Import/Export

### Export Configuration

Export current settings:

1. Click **"Export Configuration"**
2. Select sections to export
3. Choose format (YAML, JSON, ENV)
4. Download file

**Export Options:**
- All settings
- Selected sections only
- Exclude sensitive data (passwords, secrets)
- Include environment variables

### Import Configuration

Import settings from file:

1. Click **"Import Configuration"**
2. Upload file (YAML/JSON)
3. Review changes (diff view)
4. Confirm import

**Safety Features:**
- Preview changes before applying
- Validate configuration
- Backup current config
- Rollback option

### Environment Variables

View all configurable environment variables:

```bash
# Server
FLEXGATE_PORT=3000
FLEXGATE_HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flexgate
DB_USER=flexgate
DB_PASSWORD=secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret

# Security
JWT_SECRET=your-secret-here
SESSION_SECRET=your-secret-here

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_URL=http://localhost:3001
```

## Configuration Validation

### Real-time Validation

Settings are validated as you type:

**Validation Rules:**
- ✅ Required fields not empty
- ✅ Valid data types
- ✅ Value ranges (min/max)
- ✅ Format validation (URLs, durations)
- ✅ Dependency checks (if X enabled, Y required)

**Validation Indicators:**
- 🟢 Green checkmark - Valid
- 🔴 Red X - Invalid (with error message)
- 🟡 Yellow warning - Valid but not recommended

### Configuration Test

Test configuration before applying:

1. Click **"Test Configuration"**
2. FlexGate validates settings
3. Shows:
   - Database connectivity ✅/❌
   - Redis connectivity ✅/❌
   - Port availability ✅/❌
   - File permissions ✅/❌
4. Apply if all tests pass

## Best Practices

### Security

1. **Never commit secrets to git**
   - Use environment variables
   - Use secret management systems

2. **Strong authentication**
   - Change default passwords
   - Use long JWT secrets (32+ chars)
   - Enable 2FA for admin accounts

3. **CORS configuration**
   - Whitelist specific origins
   - Avoid wildcard (`*`) in production

### Performance

1. **Database connection pool**
   - Min: 2-5 connections
   - Max: Based on database capacity
   - Monitor pool utilization

2. **Redis cache**
   - Set appropriate TTLs
   - Monitor memory usage
   - Use eviction policies

3. **Logging**
   - Use `info` level in production
   - Rotate logs regularly
   - Don't log sensitive data

### Reliability

1. **Health checks**
   - Enable for all external services
   - Reasonable intervals (30s-60s)
   - Set appropriate thresholds

2. **Circuit breakers**
   - Protect critical dependencies
   - Monitor open/close events
   - Tune thresholds based on SLAs

3. **Rate limiting**
   - Protect against abuse
   - Set limits based on capacity
   - Monitor rate limit hits

## Troubleshooting

### Configuration Not Saving

**Symptoms:**
- Changes not persisted
- Settings revert after restart

**Solutions:**
1. Check file permissions
2. Verify database connectivity
3. Check logs for errors
4. Ensure not using read-only config

### Performance Issues

**Symptoms:**
- Slow Admin UI
- High memory usage
- Database connection errors

**Solutions:**
1. Reduce connection pool size
2. Increase heap size
3. Enable database query logging
4. Check Redis memory usage

### Settings Conflicts

**Symptoms:**
- Validation errors
- Unexpected behavior
- Service won't start

**Solutions:**
1. Use "Test Configuration" button
2. Check dependency requirements
3. Review validation messages
4. Compare with default config

## Next Steps

- **[Route Configuration](../config/routes.md)** - Configure individual routes
- **[Security Guide](../security/authentication.md)** - Secure your gateway
- **[Production Deployment](../deployment/production.md)** - Deploy to production

---

**Need help?** Join our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions).
