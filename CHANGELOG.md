# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-26

### Added
- **Core proxy functionality**
  - HTTP/HTTPS request proxying
  - Streaming large responses
  - Connection pooling

- **Security**
  - SSRF protection (IP blacklist, host allowlist)
  - Header sanitization
  - Request/response size limits
  - API key authentication (HMAC-SHA256)
  
- **Reliability**
  - Circuit breaker pattern per upstream
  - Exponential backoff retries with jitter
  - Request/connection/DNS timeouts
  - Graceful degradation under load
  
- **Rate Limiting**
  - Token bucket algorithm
  - Redis-backed distributed rate limiting
  - Fallback to local rate limiting
  - Per-route configuration
  
- **Observability**
  - Structured JSON logging with correlation IDs
  - Prometheus metrics (RPS, latency, errors)
  - Health check endpoints (live, ready, deep)
  - Log sampling (configurable)
  
- **Configuration**
  - YAML-based config
  - Hot reload support
  - Per-route overrides
  - Environment variable support
  
- **Deployment**
  - Docker support with multi-stage build
  - Kubernetes manifests (Deployment, Service, HPA, PDB)
  - Docker Compose for local dev
  - Prometheus/Grafana stack
  
- **Documentation**
  - Comprehensive README
  - Threat model analysis
  - Observability guide
  - Traffic control patterns
  - Architectural trade-offs
  - Benchmark results

### Security
- SSRF protection against cloud metadata endpoints
- Deny-by-default security posture
- Input validation and sanitization

## [Unreleased]

### Planned
- mTLS support for upstream connections
- OpenTelemetry distributed tracing
- GraphQL federation support
- Admin UI for configuration management
- gRPC proxying
- WebAssembly plugin system

---

[1.0.0]: https://github.com/tapas100/proxy-server/releases/tag/v1.0.0
