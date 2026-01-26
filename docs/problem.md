# Problem Statement & Scope

## Target Use Case
**Primary**: Internal API Gateway for microservices architecture  
**Secondary**: Development/testing proxy with observability  
**Non-goal**: Edge proxy for public internet traffic (use Nginx/Envoy for that)

## Why This Exists
- **Flexibility**: Custom routing logic, request transformation, and policy enforcement that's easier to express in JavaScript than Nginx config
- **Observability**: Deep request/response inspection with structured logging and business metrics
- **Developer Experience**: Hot-reload policies, clear error messages, easy debugging
- **Integration**: Native integration with Node.js backends, shared validation logic

## Expected Throughput
- **Target**: 1,000-5,000 req/sec per instance
- **Acceptable**: 500+ req/sec sustained
- **Reality Check**: Node.js single-threaded nature limits raw throughput vs Nginx/Envoy
  - Use clustering for scale
  - Better suited for "smart" proxy work than raw speed

## Latency Budget
- **P50**: < 5ms overhead
- **P95**: < 20ms overhead  
- **P99**: < 50ms overhead
- **Timeout**: 30s default (configurable per route)

### Latency Breakdown
```
Total Request Time = Proxy Overhead + Upstream Time + Network Time
```
- Proxy overhead includes: auth, validation, logging, transformation
- Budget assumes local network (<1ms to upstream)

## Trust Boundaries

### Network Zones
```
┌─────────────────────────────────────────────────────────┐
│ Public Internet (UNTRUSTED)                             │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │ TLS termination at edge
                        ▼
┌─────────────────────────────────────────────────────────┐
│ DMZ / Load Balancer (SEMI-TRUSTED)                      │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │ mTLS or API key
                        ▼
┌─────────────────────────────────────────────────────────┐
│ THIS PROXY (ENFORCEMENT POINT)                          │
│  - IP filtering                                         │
│  - Authentication                                       │
│  - Rate limiting                                        │
│  - Request validation                                   │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │ Internal network
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Backend Services (TRUSTED)                              │
│  - Assume all requests are validated                    │
│  - No redundant auth checks                             │
└─────────────────────────────────────────────────────────┘
```

### Trust Assumptions
1. **Clients**: UNTRUSTED until authenticated
2. **Backend Services**: TRUSTED (on private network)
3. **Config Files**: TRUSTED (deployed via secure pipeline)
4. **Environment Variables**: TRUSTED (from secure secret manager)

### Security Posture
- **Deny by default**: All routes require explicit configuration
- **Fail closed**: On config error, reject traffic (don't fall back to permissive mode)
- **Defense in depth**: Even internal clients go through auth/validation

## Constraints

### Hard Limits
- **Max request size**: 10MB (configurable)
- **Max response size**: 50MB (configurable)
- **Max concurrent connections**: 10,000 (per instance)
- **Max request duration**: 30s default, 300s maximum

### Design Constraints
- **No state**: Proxy is stateless for horizontal scaling
  - Rate limit state in Redis
  - Session state in JWT/external store
- **Config-driven**: All routing/policy in config files (not hardcoded)
- **Graceful degradation**: Degrade features before failing completely
  - Example: Log sampling under load
  - Example: Skip non-critical validations if queue is backing up

### Technical Debt We Accept
- **Language choice**: Node.js is slower than Go/Rust for raw proxy work
  - **Trade-off**: Developer productivity, ecosystem, shared code with backends
- **Single-threaded**: Requires clustering for multi-core utilization
  - **Trade-off**: Simpler debugging, easier to reason about
- **GC pauses**: Potential for occasional latency spikes
  - **Mitigation**: Memory limits, connection pooling

## What This Is NOT
- ❌ Not a replacement for Nginx/HAProxy for raw performance
- ❌ Not a service mesh (use Istio/Linkerd for that)
- ❌ Not a CDN or edge cache
- ❌ Not for public-facing traffic (unless you really need the flexibility)

## Success Metrics
1. **Reliability**: 99.9% uptime (43 min/month downtime budget)
2. **Performance**: P95 < 20ms overhead
3. **Operability**: Mean time to debug < 5 minutes (via logs/metrics)
4. **Security**: Zero SSRF/injection incidents

## When to Replace This
Consider Nginx/Envoy when:
- Throughput > 10K req/sec per instance needed
- P99 latency must be < 10ms
- No custom logic required (pure reverse proxy)
- Team lacks Node.js expertise

## Configuration Philosophy
> **Config over code, constraints over features**

Every feature must answer:
- What's the blast radius if it fails?
- How do I know it's working?
- How do I turn it off quickly?
