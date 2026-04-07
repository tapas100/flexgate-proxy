# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-beta.3] - 2026-04-07

### Fixed

- **README: migration file names corrected** — `002_audit_logs.sql` never existed; corrected to `002_migration_tracking.sql` and added all missing migrations (`004` through `008`)
- **README: Prometheus endpoint path corrected** — was documented as `GET /prometheus/metrics`; actual endpoint is `GET /prometheus-metrics` (renamed to avoid conflict with admin UI)
- **README: Support/Issues links fixed** — were pointing to old `tapas100/proxy-server` repo; updated to `tapas100/flexgate-proxy`
- **README: Broken doc links fixed** — `MANAGEMENT_SCRIPTS.md`, `AI_CLI_COMPLETE.md`, `CONTRIBUTING.md`, `docs/configuration.md`, `docs/deployment.md` were all missing; links updated to existing paths
- **README: Grafana dashboard reference fixed** — `grafana/dashboard.json` does not exist; updated to reference the live Grafana instance in the Podman stack and `infra/prometheus/alerts.yml`
- **Roadmap: Prometheus metrics moved to Completed** — `/prometheus-metrics` endpoint was already implemented in `app.ts`

## [0.1.0-beta.2] - 2026-03-27

### 🔒 Security

- **Removed `jade` dependency** — was a direct production dependency but completely unused. Eliminated 4 CVEs it carried transitively: `constantinople` (critical — sandbox bypass/RCE), `uglify-js` (critical — ReDoS), `clean-css` (moderate — ReDoS), `transformers` (high — ReDoS)
- **Upgraded `http-proxy-middleware` `^2.0.6` → `^3.0.5`** — removes the vulnerable `picomatch@2.3.1` transitive path. **Breaking change handled:** proxy event handlers migrated from top-level `onProxyReq`/`onProxyRes`/`onError` to nested `on: { proxyReq, proxyRes, error }` (v3 API)
- **Upgraded `morgan` `~1.9.1` → `~1.10.1`** — fixes `on-headers` HTTP response header manipulation vulnerability (CVE GHSA-76c9-3jph-rj3q)
- **Added `overrides`** in `package.json` to force safe transitive dependency versions:
  - `picomatch` → `^4.0.4` (fixes ReDoS + method injection CVEs)
  - `flatted` → `^3.4.2` (fixes unbounded recursion DoS + prototype pollution)
  - `brace-expansion` → `^5.0.5` (fixes zero-step sequence memory exhaustion)
- **Result:** `npm audit` now reports **0 vulnerabilities** (down from 13: 3 critical, 4 high, 3 moderate, 3 low)

### Changed

- CORS is now **restricted** — previously `app.use(cors())` allowed all origins; now uses an allowlist via `ALLOWED_ORIGINS` environment variable (comma-separated). Defaults to localhost development origins
- API rate limiting is now **tiered**:
  - `globalApiRateLimiter` — 100 req/min applied to all `/api/*`
  - `adminApiRateLimiter` — 60 req/min applied to admin routes (routes, webhooks, settings, logs, metrics, AI, troubleshooting)
  - `authRateLimiter` — 5 req/15min on `/api/auth` to prevent brute-force attacks

### Added

- New API routes registered in `app.ts`:
  - `GET|PUT|POST /api/settings` — general settings management with validation, sanitization and backup
  - `GET|PUT /api/settings/ai` — AI provider configuration
  - `GET|PUT /api/settings/claude` — Claude-specific settings
  - `GET|POST /api/ai` — AI analysis endpoints
  - `GET|POST|PUT|DELETE /api/ai-incidents` — AI incident tracking

---

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
