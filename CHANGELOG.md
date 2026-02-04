# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-beta.1] - 2026-02-04

### 🎉 First Public Beta Release

This is the initial beta release of FlexGate Proxy available on npm!

**⚠️  Beta Status**: Not recommended for production use. Please report issues on GitHub.

### Added

#### NPM Package & CLI
- **NPM Package**: Published as `flexgate-proxy` on npm registry
- **CLI Tool**: `flexgate` command for easy management
  - `flexgate start` - Start the gateway
  - `flexgate init` - Generate configuration file
  - `flexgate migrate` - Run database migrations
  - `flexgate status` - Check health status
- **Programmatic API**: Use as a library in Node.js applications
- **Post-Install Guide**: Helpful welcome message and quick start
- **TypeScript Definitions**: Full .d.ts files included

#### Developer Experience
- **QUICK_START.md**: Get started in 5 minutes guide
- **Beta Release Checklist**: Complete release process documentation
- **Examples**: Common use case examples
- **Automated Security**: Dependabot + CodeQL configured

### Changed
- **Version**: Set to 0.1.0-beta.1 for initial beta release
- **Package Metadata**: Updated author, repository, and npm configuration
- **Build Output**: Optimized dist/ folder for npm distribution

### Known Limitations
- Admin UI requires separate build step
- Limited test coverage in some areas
- Performance not yet optimized for high load
- Some advanced features still in development

### Contributors
- @tapas100

---

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

[1.0.0]: https://github.com/tapas100/flexgate-proxy/releases/tag/v1.0.0
