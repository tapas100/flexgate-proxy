# FlexGate Proxy API Documentation

**Version:** 1.0.0  
**Config Schema Version:** 1.0.0  
**Last Updated:** January 27, 2026

---

## Table of Contents

- [Overview](#overview)
- [API Versioning](#api-versioning)
- [Health & Status Endpoints](#health--status-endpoints)
- [Metrics Endpoint](#metrics-endpoint)
- [Proxy Routes](#proxy-routes)
- [Headers](#headers)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Circuit Breaker](#circuit-breaker)

---

## Overview

FlexGate is a production-grade API gateway that provides intelligent routing, observability, and reliability features for your microservices.

**Base URL:** `http://localhost:3000` (configurable)

---

## API Versioning

### Version Headers

All responses include version information in headers:

```
X-API-Version: 1.0.0
X-Config-Version: 1.0.0
```

### Backward Compatibility

- **Breaking changes** will increment the major version (e.g., 1.x.x → 2.0.0)
- **New features** will increment the minor version (e.g., 1.0.x → 1.1.0)
- **Bug fixes** will increment the patch version (e.g., 1.0.0 → 1.0.1)

### Deprecation Policy

- Features marked as deprecated will be supported for at least **6 months**
- Deprecation warnings will be included in response headers: `X-Deprecated: <reason>`
- Deprecated features will be documented in the [CHANGELOG.md](../CHANGELOG.md)

---

## Health & Status Endpoints

### GET /version

Returns version information about the proxy.

**Response:**
```json
{
  "name": "flexgate-proxy",
  "version": "1.0.0",
  "apiVersion": "1.0.0",
  "configVersion": "1.0.0",
  "node": "v18.17.0",
  "uptime": 123.456
}
```

---

### GET /health

Simple health check endpoint.

**Response:**
```json
{
  "status": "UP",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "version": "1.0.0"
}
```

**Status Codes:**
- `200` - Service is healthy
- `503` - Service is unhealthy

---

### GET /health/live

Liveness probe for Kubernetes and container orchestration.

Checks if the application process is running.

**Response:**
```json
{
  "status": "UP",
  "timestamp": "2026-01-27T10:30:00.000Z",
  "version": "1.0.0"
}
```

**Status Codes:**
- `200` - Application is alive
- `503` - Application should be restarted

---

### GET /health/ready

Readiness probe for Kubernetes and container orchestration.

Checks if the application is ready to serve traffic.

**Response (Healthy):**
```json
{
  "status": "UP",
  "checks": {
    "config": "UP",
    "upstreams": "UP"
  },
  "timestamp": "2026-01-27T10:30:00.000Z"
}
```

**Response (Degraded):**
```json
{
  "status": "DEGRADED",
  "checks": {
    "config": "UP",
    "upstreams": "DEGRADED"
  },
  "timestamp": "2026-01-27T10:30:00.000Z"
}
```

**Status Codes:**
- `200` - Ready to serve traffic
- `503` - Not ready (circuit breakers open, dependencies unavailable)

---

### GET /health/deep

Detailed health check with circuit breaker states and resource usage.

**Response:**
```json
{
  "status": "UP",
  "uptime": 123.456,
  "timestamp": "2026-01-27T10:30:00.000Z",
  "circuitBreakers": {
    "httpbin": {
      "state": "CLOSED",
      "failures": 0,
      "successes": 100,
      "lastFailureTime": null
    },
    "jsonplaceholder": {
      "state": "HALF_OPEN",
      "failures": 5,
      "successes": 1,
      "lastFailureTime": "2026-01-27T10:29:00.000Z"
    }
  },
  "memory": {
    "heapUsed": 45678912,
    "heapTotal": 67108864,
    "percentUsed": "68.04"
  }
}
```

---

## Metrics Endpoint

### GET /metrics

Prometheus-compatible metrics endpoint.

**Response Format:** Prometheus text format

**Available Metrics:**

#### Standard Metrics
- `process_cpu_user_seconds_total` - CPU time spent in user mode
- `process_cpu_system_seconds_total` - CPU time spent in system mode
- `process_resident_memory_bytes` - Resident memory size
- `process_heap_bytes` - Process heap size
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_active_handles_total` - Active handles
- `nodejs_active_requests_total` - Active requests

#### Custom Metrics
- `http_requests_total` - Total number of HTTP requests
  - Labels: `method`, `route`, `status`
- `http_request_duration_ms` - HTTP request duration histogram
  - Labels: `method`, `route`, `status`
  - Buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]

**Example:**
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/users",status="200"} 1234

# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{method="GET",route="/api/users",status="200",le="5"} 100
http_request_duration_ms_bucket{method="GET",route="/api/users",status="200",le="10"} 500
...
```

---

## Proxy Routes

Routes are configured in `config/proxy.yml`. All proxy requests include:

- Request correlation ID
- Upstream service name tracking
- Automatic retry logic (if configured)
- Circuit breaker protection
- Rate limiting

### Example Routes

#### /httpbin/*

Proxies to httpbin.org for testing.

**Example Request:**
```bash
GET /httpbin/get?param=value
```

**Proxied to:**
```
https://httpbin.org/get?param=value
```

---

#### /api/*

Proxies to JSONPlaceholder API.

**Example Request:**
```bash
GET /api/posts/1
```

**Proxied to:**
```
https://jsonplaceholder.typicode.com/posts/1
```

---

## Headers

### Request Headers

#### Correlation ID
Every request is assigned a correlation ID for tracking.

**Auto-generated:**
```
X-Correlation-ID: req-1706349000000-abc123def
```

**Client-provided:**
```
X-Correlation-ID: my-custom-id
```

---

### Response Headers

All responses include:

```
X-API-Version: 1.0.0
X-Config-Version: 1.0.0
X-Correlation-ID: req-1706349000000-abc123def
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "Error Type",
  "message": "Descriptive error message",
  "correlationId": "req-1706349000000-abc123def",
  "retryAfter": 60
}
```

### Common Errors

#### 404 Not Found
```json
{
  "error": "Not Found",
  "correlationId": "req-1706349000000-abc123def"
}
```

#### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "correlationId": "req-1706349000000-abc123def",
  "retryAfter": 60
}
```

#### 502 Bad Gateway
```json
{
  "error": "Bad Gateway",
  "message": "Upstream error",
  "correlationId": "req-1706349000000-abc123def"
}
```

#### 503 Service Unavailable (Circuit Breaker)
```json
{
  "error": "Service Unavailable",
  "message": "Circuit breaker is open",
  "correlationId": "req-1706349000000-abc123def",
  "retryAfter": 60
}
```

---

## Rate Limiting

Rate limits are applied per route and can be configured in `config/proxy.yml`.

### Rate Limit Headers

When rate limiting is active, responses include:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706349060
```

### Rate Limit Exceeded

When limit is exceeded:

**Status:** `429 Too Many Requests`

**Headers:**
```
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706349060
```

**Response:**
```json
{
  "error": "Too Many Requests",
  "message": "Too many requests to httpbin",
  "correlationId": "req-1706349000000-abc123def"
}
```

---

## Circuit Breaker

Circuit breakers protect upstream services from cascading failures.

### States

1. **CLOSED** - Normal operation, requests pass through
2. **OPEN** - Too many failures, requests are rejected immediately
3. **HALF_OPEN** - Testing if upstream recovered, limited requests allowed

### Configuration

Default thresholds (per upstream in `config/proxy.yml`):

- **failureThreshold:** 5 failures
- **successThreshold:** 2 successes to close
- **timeout:** 60000ms (time circuit stays open)
- **halfOpenRequests:** 3 (test requests in half-open state)

### Circuit Breaker Response

When circuit is OPEN:

**Status:** `503 Service Unavailable`

**Response:**
```json
{
  "error": "Service Unavailable",
  "message": "Circuit breaker is open",
  "correlationId": "req-1706349000000-abc123def",
  "retryAfter": 60
}
```

---

## Configuration

See [Config Schema Documentation](../src/config/schema.js) for full configuration options.

### Example Configuration

```yaml
version: "1.0.0"

proxy:
  host: "0.0.0.0"
  port: 3000
  maxBodySize: "10mb"

upstreams:
  - name: "my-service"
    url: "https://api.example.com"
    circuitBreaker:
      enabled: true
      failureThreshold: 5

routes:
  - path: "/api/*"
    upstream: "my-service"
    rateLimit:
      enabled: true
      max: 100
      windowMs: 60000
```

---

## Best Practices

1. **Always include correlation IDs** from client for request tracking
2. **Handle circuit breaker responses** with appropriate retry logic
3. **Respect rate limits** and implement exponential backoff
4. **Monitor the /metrics endpoint** for observability
5. **Use /health/ready** for load balancer health checks
6. **Check API version headers** for compatibility

---

## Support

- **Documentation:** [README.md](../README.md)
- **Issues:** https://github.com/tapas100/flexgate-proxy/issues
- **Changelog:** [CHANGELOG.md](../CHANGELOG.md)

---

**Generated:** January 27, 2026  
**API Version:** 1.0.0
