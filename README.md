# Production-Grade Proxy Server

> **A config-driven HTTP proxy with enterprise-grade observability, security, and reliability—purpose-built for internal API gateways.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Why This Exists

### The Problem
You need a proxy that:
- ✅ Routes requests intelligently (not just round-robin)
- ✅ Validates requests before they hit your backend
- ✅ Rate limits abusive clients
- ✅ Fails gracefully when upstreams are down
- ✅ Gives you deep observability (not just access logs)
- ✅ Can be configured by non-engineers

**Nginx/HAProxy**: Fast but config is cryptic, no custom logic  
**Kong/Tyk**: Powerful but heavyweight, complex to operate  
**Roll your own**: Easy to start, hard to make production-ready

### This Proxy
A **middle ground**: production-ready proxy in Node.js with:
- Config-driven routing (YAML, not code)
- Built-in security (SSRF protection, rate limiting, auth)
- Deep observability (structured logs, Prometheus metrics, correlation IDs)
- Reliability patterns (circuit breakers, retries, timeouts)
- Developer-friendly (JavaScript, not Lua or C++)

---

## When to Use This

### ✅ Good Fit
- **Internal API gateway** for microservices
- **Development/staging** proxy with observability
- **Custom routing logic** that's easier in JavaScript than Nginx config
- **Request transformation** (header manipulation, body validation)
- **Team has Node.js expertise**

### ❌ Not a Good Fit
- **Public-facing edge proxy** (use Nginx/Cloudflare)
- **Ultra-high throughput** (> 10K req/sec per instance)
- **Ultra-low latency** (P99 < 5ms required)
- **Service mesh** (use Istio/Linkerd)

---

## What Makes This Production-Ready

Most "proxy tutorials" stop at forwarding requests. This goes further:

### 🔒 Security
- **SSRF Protection**: Block access to cloud metadata, private IPs
- **Authentication**: API key validation (HMAC-SHA256)
- **Rate Limiting**: Token bucket with Redis backend
- **Input Validation**: Header sanitization, payload size limits
- **Allow-list**: Deny by default, explicit upstream allow-list

[**See full threat model →**](docs/threat-model.md)

### 🎯 Reliability
- **Circuit Breakers**: Stop hitting failing upstreams
- **Retries**: Exponential backoff with jitter
- **Timeouts**: Request, connection, DNS, header, idle
- **Backpressure**: Reject when overloaded (don't OOM crash)
- **Connection Pooling**: Reuse TCP connections

[**See traffic control docs →**](docs/traffic-control.md)

### 📊 Observability
- **Structured Logs**: JSON logs with correlation IDs
- **Metrics**: Prometheus-compatible (RPS, latency histograms, error rates)
- **Health Checks**: Liveness, readiness, deep health
- **Tracing**: Request flow across services (correlation IDs)
- **Real-Time Metrics**: NATS JetStream streaming with SSE
- **Metrics Database**: PostgreSQL storage for historical analysis
- **Admin Dashboard**: React-based UI with live metrics visualization

[**See observability docs →**](docs/observability.md)

### ⚙️ Operability
- **Config Hot Reload**: Update routes without restart
- **Graceful Shutdown**: Drain connections before exit
- **Error Handling**: Fail fast on bad config (don't serve traffic)
- **Kubernetes-Ready**: Health probes, resource limits, signals
- **Admin UI**: Web-based management console
- **Webhook System**: Event-driven notifications with retry logic
- **Database-Backed Config**: PostgreSQL for routes, API keys, webhooks

---

## Quick Start

### 1. Install
```bash
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy
npm install
```

### 2. Setup Database
```bash
# Install PostgreSQL (if not already installed)
brew install postgresql  # macOS
# or
sudo apt-get install postgresql  # Linux

# Create database
createdb flexgate

# Run migrations
psql -d flexgate -f migrations/001_initial_schema.sql
psql -d flexgate -f migrations/002_audit_logs.sql
psql -d flexgate -f migrations/003_requests_table.sql
```

### 3. Setup NATS JetStream (for real-time metrics)
```bash
# Using Docker
docker run -d --name nats-jetstream \
  -p 4222:4222 -p 8222:8222 \
  nats:latest -js

# Or using Podman
podman run -d --name flexgate-nats \
  -p 4222:4222 -p 8222:8222 -p 6222:6222 \
  -v ~/flexgate-data/nats:/data:Z \
  nats:2.10-alpine -js -sd /data
```

### 4. Environment Variables
```bash
# Copy example .env
cp .env.example .env

# Edit .env with your settings
DATABASE_URL=postgresql://localhost/flexgate
DATABASE_USER=flexgate
DATABASE_PASSWORD=your-password
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222
PORT=3000
```

### 5. Configure Routes
```yaml
# config/proxy.yml
upstreams:
  - name: "example-api"
    url: "https://api.example.com"
    timeout: 5000
    retries: 3

routes:
  - path: "/api/*"
    upstream: "example-api"
    auth: required
    rateLimit:
      max: 100
      windowMs: 60000

security:
  allowedHosts:
    - "api.example.com"
  blockedIPs:
    - "169.254.169.254"  # AWS metadata
```

### 6. Build Admin UI
```bash
cd admin-ui
npm install
npm run build
cd ..
```

### 7. Run
```bash
# Development
npm run dev

# Production
npm start
```

### 8. Access Admin UI
```bash
# Open in browser
open http://localhost:3000/dashboard

# Available pages:
# http://localhost:3000/dashboard  - Real-time metrics
# http://localhost:3000/routes     - Route management
# http://localhost:3000/webhooks   - Webhook configuration
# http://localhost:3000/logs       - Audit logs
# http://localhost:3000/settings   - System settings
```

### 9. Test the Proxy
```bash
curl http://localhost:3000/api/users
```

---

## 🎨 Features Overview

### 🖥️ Admin UI
Modern React-based dashboard for managing your proxy:

- **📊 Real-Time Dashboard**: Live metrics with SSE streaming
  - Request rate, latency percentiles (P50, P95, P99)
  - Success/error rates, status code distribution
  - Auto-refreshing charts and gauges

- **🛣️ Route Management**: Visual interface for proxy routes
  - Create, edit, delete routes without config files
  - Enable/disable routes on-the-fly
  - Configure rate limits and circuit breakers per route

- **🔑 API Key Management**: Secure access control
  - Generate and revoke API keys
  - Set expiration dates and permissions
  - Usage tracking per key

- **🪝 Webhook Configuration**: Event-driven notifications
  - Subscribe to proxy events (errors, rate limits, circuit breaker trips)
  - Configure retry logic and backoff strategies
  - Monitor webhook delivery status

- **📝 Audit Logs**: Complete activity history
  - Track all configuration changes
  - User actions and system events
  - Searchable and filterable logs

[**See Admin UI docs →**](docs/features/01-admin-ui.md)

### ⚡ Real-Time Metrics (NATS JetStream)
High-performance streaming metrics powered by NATS JetStream:

- **Server-Sent Events (SSE)**: Real-time metric updates
- **Message Persistence**: Historical metrics storage
- **Scalable Architecture**: Handle millions of events
- **Event Consumers**: Durable consumers for reliability
- **Multiple Streams**: Separate METRICS and ALERTS channels

**Endpoints:**
- `GET /api/stream/metrics` - Real-time metrics SSE stream
- `GET /api/stream/alerts` - Real-time alerts SSE stream
- `GET /api/metrics` - HTTP polling fallback

### 📊 Database-Backed Metrics
PostgreSQL storage for comprehensive analytics:

- **Request Logging**: Every proxy request recorded
  - Method, path, status code, response time
  - Upstream, client IP, user agent
  - Request/response sizes, correlation IDs

- **Metrics Aggregation**: Pre-computed summaries
  - Hourly, daily, weekly rollups
  - Percentile calculations (P50, P95, P99)
  - Error rate trends and availability metrics

- **Data Retention**: Configurable retention policies
  - Auto-cleanup of old data
  - Partitioning for performance
  - Efficient indexing for fast queries

### 🪝 Webhook System
Event-driven architecture for integrations:

**Supported Events:**
- `request.error` - Failed requests
- `rate_limit.exceeded` - Rate limit violations
- `circuit_breaker.opened` - Circuit breaker trips
- `upstream.failure` - Upstream service failures
- `auth.failure` - Authentication failures

**Features:**
- **Automatic Retries**: Exponential backoff with jitter
- **Delivery Tracking**: Monitor success/failure rates
- **Custom Headers**: Authentication, signatures
- **Payload Filtering**: Subscribe to specific events
- **HMAC Signatures**: Webhook payload verification

[**See Webhooks docs →**](docs/features/07-webhooks.md)

---

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/HTTPS
       ▼
┌──────────────────────────────────────────────┐
│         FlexGate Proxy Server                │
│  ┌────────────────────────────────┐          │
│  │  1. Authentication (API Keys)  │          │
│  │  2. Rate Limiting (Redis)      │          │
│  │  3. Request Validation         │          │
│  │  4. Circuit Breaker Check      │          │
│  │  5. Route Resolution           │          │
│  │  6. Metrics Recording          │          │
│  └────────────────────────────────┘          │
└─────────────┬────────────────────────────────┘
              │
              ▼
     ┌─────────────────────┐
     │  Infrastructure     │
     │  ┌────────────┐     │
     │  │ PostgreSQL │     │  ← Config, Metrics, Logs
     │  └────────────┘     │
     │  ┌────────────┐     │
     │  │   Redis    │     │  ← Rate Limits, Cache
     │  └────────────┘     │
     │  ┌────────────┐     │
     │  │ JetStream  │     │  ← Real-time Streams
     │  └────────────┘     │
     └─────────────────────┘
              │
````
              ▼
┌─────────────────────────────────────┐
│       Backend Services              │
│  ┌─────────┐  ┌─────────┐          │
│  │ API A   │  │ API B   │          │
│  └─────────┘  └─────────┘          │
└─────────────────────────────────────┘
```

---

## Performance

| Metric | Value | Comparison |
|--------|-------|------------|
| **Throughput** | 4.7K req/sec | Nginx: 52K (11x faster) |
| **P95 Latency** | 35ms | Nginx: 8ms (4x faster) |
| **P99 Latency** | 52ms | Nginx: 12ms (4x faster) |
| **Memory** | 78 MB | Nginx: 12 MB (6x smaller) |
| **Proxy Overhead** | ~3ms | (14% of total latency) |

**Why slower than Nginx?**
- Node.js (interpreted) vs C (compiled)
- Single-threaded vs multi-threaded
- GC pauses

**Why use it anyway?**
- Custom logic in JavaScript (not Nginx config)
- Better observability
- Shared code with backend
- Faster development

[**See full benchmarks →**](benchmarks/README.md)

---

## Configuration

### Minimal Example
```yaml
# config/proxy.yml
upstreams:
  - name: "backend"
    url: "http://localhost:8080"

routes:
  - path: "/*"
    upstream: "backend"
```

### Full Example
```yaml
# Global settings
proxy:
  port: 3000
  timeout: 30000
  maxBodySize: "10mb"

# Security
security:
  allowedHosts:
    - "api.example.com"
    - "*.internal.corp"
  blockedIPs:
    - "169.254.169.254"
    - "10.0.0.0/8"
  auth:
    type: "apiKey"
    header: "X-API-Key"

# Rate limiting
rateLimit:
  backend: "redis"
  redis:
    url: "redis://localhost:6379"
  global:
    max: 1000
    windowMs: 60000

# Upstreams
upstreams:
  - name: "primary-api"
    url: "https://api.primary.com"
    timeout: 5000
    retries: 3
    circuitBreaker:
      enabled: true
      failureThreshold: 50
      openDuration: 30000
  
  - name: "fallback-api"
    url: "https://api.fallback.com"
    timeout: 10000

# Routes
routes:
  - path: "/api/users/*"
    upstream: "primary-api"
    auth: required
    rateLimit:
      max: 100
      windowMs: 60000
  
  - path: "/api/batch/*"
    upstream: "primary-api"
    auth: required
    timeout: 120000
    rateLimit:
      max: 10
      windowMs: 60000

# Logging
logging:
  level: "info"
  format: "json"
  sampling:
    successRate: 0.1
    errorRate: 1.0
```

[**See full config reference →**](docs/configuration.md)

---

## API Reference

### Health Endpoints

#### `GET /health`
Basic health check.
```json
{
  "status": "UP",
  "timestamp": "2026-01-29T10:30:45.123Z",
  "version": "1.0.0"
}
```

#### `GET /health/live`
Kubernetes liveness probe.
```json
{
  "status": "UP",
  "timestamp": "2026-01-29T10:30:45.123Z"
}
```

#### `GET /health/ready`
Kubernetes readiness probe.
```json
{
  "status": "UP",
  "checks": {
    "database": "UP",
    "redis": "UP",
    "jetstream": "UP"
  }
}
```

### Metrics Endpoints

#### `GET /api/metrics`
Get current metrics (HTTP polling).
```json
{
  "summary": {
    "totalRequests": 12543,
    "avgLatency": "23.45",
    "errorRate": "0.0012",
    "availability": "99.9988",
    "p50Latency": "18.00",
    "p95Latency": "45.00",
    "p99Latency": "67.00"
  },
  "requestRate": {
    "name": "Request Rate",
    "data": [
      { "timestamp": "2026-01-29T13:00:00.000Z", "value": "234.5" }
    ],
    "unit": "req/s"
  },
  "statusCodes": [
    { "code": 200, "count": 12000 },
    { "code": 404, "count": 543 }
  ]
}
```

#### `GET /api/stream/metrics`
Real-time metrics stream (SSE).
```
event: connected
data: {"type":"connected","clientId":"abc123"}

event: message
data: {"summary":{"totalRequests":12543,...},"timestamp":"2026-01-29T13:00:00.123Z"}

event: message
data: {"summary":{"totalRequests":12544,...},"timestamp":"2026-01-29T13:00:05.456Z"}
```

#### `GET /api/stream/alerts`
Real-time alerts stream (SSE).
```
event: message
data: {"type":"circuit_breaker.opened","upstream":"api-backend","timestamp":"..."}
```

### Route Management

#### `GET /api/routes`
List all routes.
```json
[
  {
    "id": 1,
    "path": "/api/users",
    "upstream": "https://api.example.com",
    "methods": ["GET", "POST"],
    "enabled": true,
    "rateLimit": { "requests": 100, "window": "60s" },
    "circuitBreaker": { "enabled": true, "threshold": 5 }
  }
]
```

#### `POST /api/routes`
Create a new route.
```json
{
  "path": "/api/products",
  "upstream": "https://products.example.com",
  "methods": ["GET"],
  "rateLimit": { "requests": 50, "window": "60s" }
}
```

#### `PUT /api/routes/:id`
Update a route.

#### `DELETE /api/routes/:id`
Delete a route.

### Webhook Management

#### `GET /api/webhooks`
List all webhooks.

#### `POST /api/webhooks`
Create a webhook subscription.
```json
{
  "url": "https://your-app.com/webhook",
  "events": ["request.error", "rate_limit.exceeded"],
  "enabled": true,
  "maxRetries": 3,
  "initialDelay": 1000,
  "backoffMultiplier": 2
}
```

#### `DELETE /api/webhooks/:id`
Delete a webhook.

### Log Endpoints

#### `GET /api/logs`
Get audit logs with pagination.
```json
{
  "logs": [
    {
      "id": 1,
      "timestamp": "2026-01-29T13:00:00.123Z",
      "level": "info",
      "message": "Route created",
      "metadata": { "routeId": 5, "path": "/api/users" }
    }
  ],
  "total": 1234,
  "page": 1,
  "pageSize": 10
}
```

#### `GET /prometheus/metrics`
Prometheus-compatible metrics endpoint.
```
http_requests_total{method="GET",route="/api/users",status="200"} 12543
http_request_duration_ms_bucket{route="/api/users",le="50"} 12000
http_request_duration_ms_sum{route="/api/users"} 295430
http_request_duration_ms_count{route="/api/users"} 12543
```

---

## Deployment

### Docker
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000
CMD ["node", "bin/www"]
```

```bash
docker build -t flexgate-proxy .
docker run -p 3000:3000 \
  -v $(pwd)/config:/app/config \
  -e NODE_ENV=production \
  flexgate-proxy
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flexgate-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: flexgate-proxy
  template:
    metadata:
      labels:
        app: flexgate-proxy
    spec:
      containers:
      - name: proxy
        image: flexgate-proxy:latest
        ports:
        - containerPort: 3000
        resources:
          limits:
            memory: "256Mi"
            cpu: "500m"
          requests:
            memory: "128Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: proxy-secrets
              key: redis-url
```

[**See deployment guide →**](docs/deployment.md)

---

## Monitoring

### Grafana Dashboard
Import `grafana/dashboard.json` for:
- Request rate (by route, status)
- Latency percentiles (P50, P95, P99)
- Error rate
- Circuit breaker state
- Rate limit hits

### Alerts
```yaml
# Prometheus alerts
groups:
  - name: proxy
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Proxy error rate > 5%"
      
      - alert: HighLatency
        expr: http_request_duration_ms{quantile="0.99"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency > 1s"
```

---

## Security

### SSRF Protection
```yaml
security:
  allowedHosts:
    - "api.example.com"
  blockedIPs:
    - "169.254.169.254"  # AWS metadata
    - "169.254.170.2"    # ECS metadata
    - "fd00:ec2::254"    # AWS IPv6 metadata
    - "10.0.0.0/8"       # Private network
    - "127.0.0.0/8"      # Localhost
```

### Authentication
```yaml
security:
  auth:
    type: "apiKey"
    header: "X-API-Key"
    keys:
      - key: "client-a-key-sha256-hash"
        name: "Client A"
      - key: "client-b-key-sha256-hash"
        name: "Client B"
```

### Rate Limiting
```yaml
rateLimit:
  perRoute:
    - path: "/api/expensive/*"
      max: 10
      windowMs: 60000
      message: "This endpoint is heavily rate limited"
```

[**See threat model →**](docs/threat-model.md)

---

## What This Proxy is NOT

| ❌ Not This | ✅ Use Instead |
|------------|---------------|
| CDN / Edge cache | Cloudflare, Fastly |
| Service mesh | Istio, Linkerd |
| Raw performance proxy | Nginx, HAProxy, Envoy |
| Public-facing API gateway | Kong, Tyk, AWS API Gateway |
| Load balancer | HAProxy, AWS ALB |

---

## When to Replace This

Consider switching to Nginx/Envoy when:
1. **Throughput > 10K req/sec** per instance needed
2. **P99 latency < 10ms** required
3. **No custom logic** needed (pure reverse proxy)
4. **Team lacks Node.js expertise**

---

## Failure Modes

### Upstream Down
```
Circuit breaker opens → Fast-fail with 503
↓
Retry every 30s (half-open state)
↓
If success → Circuit closes
```

### Proxy Overloaded
```
Queue fills → Backpressure kicks in
↓
Reject low-priority routes
↓
Sample logging aggressively
↓
If still overloaded → Reject all with 503
```

### Redis Down
```
Rate limiter falls back to local state
↓
Less accurate (per-instance limits)
↓
But service stays up
```

### Config Error
```
Config validation fails → Startup blocked
↓
Old config still serving (hot reload)
↓
Alert fires → Engineer fixes config
```

**Key principle**: **Fail closed, degrade gracefully**

---

## Documentation

- [**Problem Statement**](docs/problem.md) - Scope, constraints, use cases
- [**Threat Model**](docs/threat-model.md) - Security analysis
- [**Observability**](docs/observability.md) - Logging, metrics, tracing
- [**Traffic Control**](docs/traffic-control.md) - Rate limiting, circuit breakers, retries
- [**Trade-offs**](docs/trade-offs.md) - Architectural decisions
- [**Benchmarks**](benchmarks/README.md) - Performance numbers

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md).

### Development Setup
```bash
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy
npm install

# Run tests
npm test

# Run in dev mode (with hot reload)
npm run dev

# Lint
npm run lint

# Benchmarks
npm run benchmark
```

---

## Roadmap

### ✅ Completed
- [x] **Admin UI**: Web UI for config management (React + Material-UI)
- [x] **Real-Time Metrics**: NATS JetStream with SSE streaming
- [x] **Webhooks**: Event-driven notifications with retry logic
- [x] **Database Storage**: PostgreSQL for config and metrics
- [x] **API Key Auth**: HMAC-SHA256 authentication
- [x] **Circuit Breakers**: Per-route circuit breaking
- [x] **Rate Limiting**: Redis-backed token bucket
- [x] **Metrics Recording**: Request logging to database

### 🚧 In Progress
- [ ] **OAuth 2.0 / OIDC**: Social login for Admin UI
- [ ] **OpenTelemetry**: Distributed tracing integration
- [ ] **Metrics Export**: Prometheus /metrics endpoint

### 📋 Planned
- [ ] **mTLS Support**: Mutual TLS to backends
- [ ] **GraphQL Federation**: GraphQL proxy support
- [ ] **WebAssembly Plugins**: Custom logic in Wasm
- [ ] **gRPC Support**: Proxy gRPC services
- [ ] **Service Mesh**: Kubernetes integration with sidecars
- [ ] **Multi-tenancy**: Isolated environments per tenant

---

## License

MIT © [Tapas M](https://github.com/tapas100)

---

## Acknowledgments

Inspired by:
- [http-proxy](https://github.com/http-party/node-http-proxy)
- [Envoy Proxy](https://www.envoyproxy.io/)
- [Kong](https://konghq.com/)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/tapas100/proxy-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/tapas100/proxy-server/discussions)
- **Email**: support@example.com

---

**Built with ❤️ for the backend engineering community**
