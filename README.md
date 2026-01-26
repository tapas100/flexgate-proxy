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

[**See observability docs →**](docs/observability.md)

### ⚙️ Operability
- **Config Hot Reload**: Update routes without restart
- **Graceful Shutdown**: Drain connections before exit
- **Error Handling**: Fail fast on bad config (don't serve traffic)
- **Kubernetes-Ready**: Health probes, resource limits, signals

---

## Quick Start

### 1. Install
```bash
git clone https://github.com/tapas100/proxy-server.git
cd proxy-server
npm install
```

### 2. Configure
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

### 3. Run
```bash
# Development
npm run dev

# Production
npm start
```

### 4. Test
```bash
curl http://localhost:3000/api/users
```

---

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/HTTPS
       ▼
┌─────────────────────────────────────┐
│         Proxy Server                │
│  ┌────────────────────────────┐    │
│  │  1. Authentication         │    │
│  │  2. Rate Limiting          │    │
│  │  3. Request Validation     │    │
│  │  4. Circuit Breaker Check  │    │
│  │  5. Route Resolution       │    │
│  └────────────────────────────┘    │
└─────────────┬───────────────────────┘
              │
              ▼
     ┌────────────────┐
     │ Redis (State)  │
     │ - Rate limits  │
     │ - CB state     │
     └────────────────┘
              │
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

#### `GET /health/live`
Kubernetes liveness probe.
```json
{
  "status": "UP",
  "timestamp": "2026-01-26T10:30:45.123Z"
}
```

#### `GET /health/ready`
Kubernetes readiness probe.
```json
{
  "status": "UP",
  "checks": {
    "config": "UP",
    "upstreams": "UP",
    "redis": "UP"
  }
}
```

#### `GET /metrics`
Prometheus metrics.
```
http_requests_total{method="GET",route="/api/users",status="200"} 12543
http_request_duration_ms_bucket{route="/api/users",le="50"} 12000
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
docker build -t proxy-server .
docker run -p 3000:3000 \
  -v $(pwd)/config:/app/config \
  -e NODE_ENV=production \
  proxy-server
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proxy-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: proxy-server
  template:
    metadata:
      labels:
        app: proxy-server
    spec:
      containers:
      - name: proxy
        image: proxy-server:latest
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
git clone https://github.com/tapas100/proxy-server.git
cd proxy-server
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

- [ ] **mTLS Support**: Mutual TLS to backends
- [ ] **OpenTelemetry**: Distributed tracing
- [ ] **GraphQL Federation**: GraphQL proxy support
- [ ] **WebAssembly Plugins**: Custom logic in Wasm
- [ ] **gRPC Support**: Proxy gRPC services
- [ ] **Admin UI**: Web UI for config management

---

## License

MIT © [Tapas Adhikary](https://github.com/tapas100)

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
