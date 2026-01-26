# Architectural Trade-offs

## Philosophy
> **"Every architectural decision is a trade-off. Document what you chose and why—it shows you think in systems, not just code."**

---

## Node.js vs Go/Rust

### Our Choice: Node.js

#### Why Node.js? ✅
1. **Developer Productivity**
   - Shared code with JavaScript backends
   - Huge ecosystem (npm)
   - Fast iteration cycles
   - Team expertise

2. **Use Case Fit**
   - More "smart proxy" than "raw speed"
   - Custom business logic in JavaScript
   - JSON parsing/manipulation is native

3. **Ecosystem**
   - Mature HTTP/2 support
   - Great observability tools (Pino, Prometheus client)
   - Easy to integrate with Redis, Postgres, etc.

#### What We Sacrifice ❌
1. **Performance**
   - Throughput: 5K req/sec vs 50K in Go
   - Memory: ~50MB base vs ~10MB in Go
   - Latency: P99 can spike due to GC pauses

2. **Multi-core Utilization**
   - Single-threaded event loop
   - Need clustering for multi-core
   - More complex deployment

3. **Type Safety**
   - No compile-time guarantees (even with TypeScript)
   - Runtime errors possible

### When to Switch to Go/Rust
- Throughput > 10K req/sec required
- P99 latency must be < 5ms
- Memory footprint critical (edge devices)
- Team has Go/Rust expertise

---

## Stateless vs Stateful

### Our Choice: Stateless

#### Why Stateless? ✅
1. **Horizontal Scaling**
   - Add instances without coordination
   - No session affinity needed
   - Easy k8s deployment

2. **Reliability**
   - Instance crash = no data loss
   - Rolling updates trivial
   - No state synchronization bugs

3. **Simplicity**
   - Easier to reason about
   - No distributed state management
   - No backup/restore complexity

#### What We Sacrifice ❌
1. **Performance**
   - Rate limiting requires Redis call (2-5ms)
   - No request coalescing (need shared state)
   - Can't cache auth results in memory

2. **Features**
   - No sticky sessions (some apps need this)
   - No connection-based rate limiting
   - No cross-request context

### External State (Redis)
We use Redis for:
- Rate limiting counters
- Circuit breaker state (shared across instances)

**Trade-off**:
- ✅ Accurate distributed rate limiting
- ❌ Redis = single point of failure (fallback to local state)

---

## Config-Driven vs Code-Driven

### Our Choice: Config-Driven

#### Why Config? ✅
1. **Operational Flexibility**
   - Change routes without code deploy
   - Hot reload (no downtime)
   - Non-engineers can manage

2. **Safety**
   - Config validation at load time
   - Bad config = startup failure (fail fast)
   - Can version control + audit config changes

3. **Consistency**
   - All environments use same code
   - Differences are in config only
   - Easier to test (swap config, not code)

#### What We Sacrifice ❌
1. **Expressiveness**
   - Can't express complex logic in YAML
   - Need to add new config options for new features
   - Some things still need code (custom auth)

2. **Type Safety**
   - YAML has no types (need runtime validation)
   - Typos discovered at runtime

3. **Complexity**
   - Config parser/validator is complex
   - Need to document config schema
   - Breaking config changes need migration path

### When to Use Code
- Custom authentication logic
- Complex request/response transformation
- Dynamic routing based on payload

---

## Synchronous vs Asynchronous Logging

### Our Choice: Asynchronous

#### Why Async? ✅
1. **Performance**
   - Logging doesn't block request processing
   - Batch writes to disk/network
   - 10x throughput improvement

2. **Reliability**
   - Slow log sink doesn't crash proxy
   - Can drop logs under extreme load (sample)

#### What We Sacrifice ❌
1. **Guarantees**
   - Last few logs might be lost on crash
   - Log order might not match event order (nanosecond level)

2. **Debugging**
   - Can't rely on "if no log, it didn't happen"
   - Need correlation IDs to trace requests

### Mitigation
- Critical events (auth failures, errors) → sync log
- Normal requests → async log with buffering

---

## Metrics: Push vs Pull

### Our Choice: Pull (Prometheus)

#### Why Pull? ✅
1. **Service Discovery**
   - Prometheus discovers targets (no hardcoded endpoints)
   - Auto-scales with k8s

2. **Reliability**
   - Proxy doesn't care if metrics system is down
   - No retry logic needed

3. **Flexibility**
   - Can scrape same endpoint multiple times
   - Historical data on metrics server, not proxy

#### What We Sacrifice ❌
1. **Granularity**
   - Scrape interval (15s) = miss short-lived spikes
   - Can't push event-based metrics

2. **Firewalls**
   - Need to open port for Prometheus
   - Doesn't work well in some network topologies

### When to Use Push
- Lambda/serverless (short-lived processes)
- Network doesn't allow inbound connections
- Need sub-second metric resolution

---

## Rate Limiting: Local vs Distributed

### Our Choice: Distributed (Redis)

#### Why Distributed? ✅
1. **Accuracy**
   - True limit across all instances
   - No "N instances × limit" problem

2. **Fairness**
   - Client gets same limit regardless of which instance it hits
   - No gaming the system by spreading requests

#### What We Sacrifice ❌
1. **Latency**
   - Redis call adds 2-5ms
   - Extra network hop

2. **Dependency**
   - Redis down = fallback to local (inaccurate)
   - More infrastructure to manage

3. **Cost**
   - Need Redis cluster (HA)
   - Redis memory for counters

### Hybrid Approach
```yaml
rateLimit:
  backend: "redis"
  fallback: "local"  # If Redis unavailable
```

---

## HTTP/1.1 vs HTTP/2

### Our Choice: Support Both

#### HTTP/2 Benefits ✅
- Multiplexing (multiple requests on 1 connection)
- Header compression (smaller payloads)
- Server push (for future)

#### HTTP/1.1 Benefits ✅
- Universal support (even old clients)
- Simpler debugging (plain text)
- Better for long-polling

### Configuration
```yaml
upstreams:
  - name: "modern-api"
    url: "https://api.example.com"
    http2: true          # Prefer HTTP/2
    fallback: "http1.1"  # Fallback if unavailable
```

---

## Error Handling: Fail Fast vs Retry

### Our Choice: Configurable

#### Fail Fast ✅
**When**: User-facing requests, low timeout budget

**Why**: Better UX to show error quickly than hang for 30s

**Config**:
```yaml
retry:
  enabled: false
timeout: 5000
```

#### Retry ✅
**When**: Background jobs, idempotent operations

**Why**: Transient errors are common, retrying increases reliability

**Config**:
```yaml
retry:
  enabled: true
  maxAttempts: 3
  backoff: "exponential"
```

### Trade-off
- Retry → Higher success rate, higher latency
- Fail fast → Lower latency, lower success rate

---

## Circuit Breaker: Per-Instance vs Global

### Our Choice: Per-Instance (with shared state in Redis)

#### Why Per-Instance? ✅
1. **Independence**
   - Instance failures don't propagate
   - Can gradually open/close across instances

2. **Resilience**
   - No coordination needed
   - Works without Redis (fallback to local state)

#### What We Sacrifice ❌
1. **Accuracy**
   - Upstream might see N × request volume during half-open state
   - Different instances might have different circuit states

### Hybrid: Redis-Backed State
```
Each instance checks Redis for circuit state
If Redis down → use local state
If local state = OPEN → write to Redis (share with others)
```

---

## Logging: Sampling vs Full

### Our Choice: Sampling in Production

#### Why Sample? ✅
1. **Cost**
   - 10% sampling = 10x cost reduction
   - Still see patterns (law of large numbers)

2. **Performance**
   - Less I/O = lower latency
   - Fewer CPU cycles on serialization

#### What We Sacrifice ❌
1. **Completeness**
   - Can't debug every single request
   - Might miss rare edge cases

### Sampling Strategy
```yaml
logging:
  sampling:
    successRate: 0.1   # 10% of 2xx
    errorRate: 1.0     # 100% of errors
    slowRate: 1.0      # 100% if > 1s
```

**Key**: Always log errors/anomalies, sample normal traffic

---

## Timeouts: Aggressive vs Conservative

### Our Choice: Configurable Per Route

#### Aggressive (5s) ✅
**When**: Low-latency APIs, health checks

**Why**: Fast failure detection, prevent queue buildup

**Risk**: False positives if upstream occasionally slow

#### Conservative (30s) ✅
**When**: Batch operations, complex queries

**Why**: Fewer false positives, better success rate

**Risk**: Slow failure detection, queue buildup

### Recommendation
```yaml
routes:
  - path: "/api/quick"
    timeout: 5000      # Aggressive
  
  - path: "/api/batch"
    timeout: 30000     # Conservative
```

---

## Connection Pooling: Max Sockets

### Trade-off

#### Large Pool (200+ connections) ✅
- **Pro**: Handle spikes, low latency (connection ready)
- **Con**: Memory usage, backend connection limits

#### Small Pool (20-50 connections) ✅
- **Pro**: Low memory, fewer backend connections
- **Con**: Connection contention under load

### Our Choice
```yaml
connectionPool:
  maxSockets: 100      # Per upstream
  maxFreeSockets: 10   # Idle connections to keep
```

**Reasoning**: Balance between resource usage and performance

---

## Security: Allow-list vs Deny-list

### Our Choice: Allow-list (Deny by Default)

#### Why Allow-list? ✅
1. **Security**
   - Unknown = blocked
   - Explicit opt-in for routes

2. **Clarity**
   - Easy to audit (read config = know what's allowed)
   - No implicit behavior

#### What We Sacrifice ❌
1. **Flexibility**
   - Can't proxy arbitrary URLs (by design)
   - New upstreams need config change

### Example
```yaml
upstreams:
  allowed:
    - "api.example.com"
    - "*.internal.corp"
  
  blocked:
    - "169.254.169.254"  # Cloud metadata
```

---

## Deployment: Container vs VM

### Our Choice: Container (Docker + k8s)

#### Why Containers? ✅
1. **Portability**
   - Same image dev → prod
   - No "works on my machine"

2. **Scaling**
   - k8s auto-scaling
   - Rolling updates

3. **Resource Limits**
   - Memory/CPU guarantees
   - Better multi-tenancy

#### What We Sacrifice ❌
1. **Complexity**
   - Need k8s knowledge
   - More moving parts

2. **Overhead**
   - Small overhead vs bare metal
   - More layers to debug

### When to Use VMs
- Regulatory requirements (kernel isolation)
- Very high performance needed
- Team unfamiliar with containers

---

## Summary Table

| Decision | Choice | Alternative | Why |
|----------|--------|-------------|-----|
| Language | Node.js | Go/Rust | Productivity, ecosystem |
| State | Stateless | Stateful | Horizontal scaling |
| Config | YAML files | Code | Hot reload, non-engineer friendly |
| Logging | Async | Sync | Performance |
| Metrics | Pull (Prometheus) | Push | Service discovery |
| Rate Limit | Distributed (Redis) | Local | Accuracy |
| HTTP | Support both 1.1/2 | HTTP/2 only | Compatibility |
| Circuit Breaker | Per-instance + Redis | Global only | Resilience |
| Sampling | 10% success, 100% errors | Full logging | Cost |
| Security | Allow-list | Deny-list | Security by default |
| Deployment | Containers | VMs | Portability, scaling |

---

## Decision Framework

When adding new features, ask:

1. **What's the blast radius?**
   - If this fails, what else breaks?

2. **What's the operational burden?**
   - How much more complexity does this add?

3. **Is it config or code?**
   - Can operators change it without engineers?

4. **How do I debug it?**
   - What logs/metrics/traces do I need?

5. **What's the performance impact?**
   - How much latency/memory/CPU does this add?

6. **What's the security impact?**
   - Does this expand the attack surface?

---

## Future Trade-offs to Consider

1. **gRPC Support**: Better performance vs HTTP/1.1 compatibility
2. **WebAssembly Plugins**: Ultimate flexibility vs operational complexity
3. **Service Mesh Integration**: Full observability vs vendor lock-in
4. **GraphQL Federation**: API consolidation vs query complexity
