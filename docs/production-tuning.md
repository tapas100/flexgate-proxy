# FlexGate Proxy — Production Tuning Guidelines

This document covers connection pool sizing, Go runtime tuning, graceful
shutdown configuration, and load testing procedures.

---

## 1. Go Runtime Tuning

### GOMEMLIMIT

Set `tuning.gomemlimit_mib` to **90% of the container memory limit**.

| Container limit | Recommended `gomemlimit_mib` |
|-----------------|------------------------------|
| 256 MiB         | 230                          |
| 512 MiB         | 460                          |
| 1 GiB           | 920                          |
| 2 GiB           | 1840                         |

**Why:** Without `GOMEMLIMIT`, Go's GC targets a live-heap doubling policy.
On a memory-constrained container this means the GC only kicks in when the
heap grows — but by then the container may already be OOM-killed.
Setting `GOMEMLIMIT` tells the GC "keep RSS below this value" and activates
a proportional GC that works harder as the process approaches the limit.

**Metric to watch:** `go_gc_heap_goal_bytes` — should stay well below
`GOMEMLIMIT`. If it equals `GOMEMLIMIT` constantly, the GC is thrashing and
you need a larger container.

### GOGC

| Scenario | Recommended `gogc_percent` |
|----------|---------------------------|
| Latency-sensitive, GOMEMLIMIT set | **200** |
| Default / unknown workload        | **100** (Go default) |
| Severely memory-constrained       | **50** |
| Profiling / GC debugging          | **off** (-1) — never in production |

**Why `200` + `GOMEMLIMIT`:** Higher GOGC means the GC runs less frequently,
reducing GC CPU overhead and tail latency caused by GC stop-the-world pauses.
`GOMEMLIMIT` then acts as the safety net, triggering GC before RSS exceeds
the container limit. This pair gives the best throughput/latency trade-off.

**Metric to watch:**
- `go_gc_duration_seconds` (histogram) — p99 GC pause should be < 1 ms.
- `process_resident_memory_bytes` — RSS under load.
- `go_memstats_gc_cpu_fraction` — fraction of CPU time spent in GC; aim < 5%.

### GOMAXPROCS

FlexGate does not set `GOMAXPROCS` explicitly; Go defaults to `runtime.NumCPU()`.
For containers with fractional CPU limits (e.g. `cpu: "0.5"`), use
[automaxprocs](https://github.com/uber-go/automaxprocs) or set
`GOMAXPROCS` via an environment variable in your container spec.

```yaml
# Kubernetes example
env:
  - name: GOMAXPROCS
    valueFrom:
      resourceFieldRef:
        resource: limits.cpu
        divisor: "1"
```

---

## 2. Connection Pool Sizing

### Postgres

```
max_conns = min(pg_max_connections / num_workers, (2 × vCPU) + 1)
min_conns = max(2, max_conns / 5)
```

Example (4 vCPU worker, `pg max_connections=200`, 4 workers):
- `max_conns = min(50, 9) = 9`
- `min_conns = 2`

Set in `flexgate.yaml`:
```yaml
store:
  pool:
    max_conns: 9
    min_conns: 2
    max_conn_lifetime_sec: 1800  # recycle every 30 min
    max_conn_idle_time_sec: 300  # close after 5 min idle
```

**Why `max_conn_lifetime_sec`:** Without recycling, long-lived connections
can accumulate state drift (e.g., `search_path` changes, cached query plans
becoming stale after a schema migration). Recycling every 30 minutes is safe
for all production workloads.

**Metric to watch:** `pg_stat_activity` — `wait_event_type = 'Client'` rows
are idle connections consuming server resources. If you see many idle
connections, lower `min_conns`.

### Redis

```
max_conns = num_concurrent_goroutines_that_issue_redis_commands
min_conns = max_conns / 10
```

For FlexGate, Redis is used only for route-cache pub/sub. A pool of 20–50
connections is sufficient for most deployments.

```yaml
store:
  pool:
    max_conns: 50
    min_conns: 5
    max_conn_idle_time_sec: 300
    max_conn_lifetime_sec: 1800
```

**Metric to watch:** `redis_connected_clients` in Redis `INFO stats`. Should
equal `min_conns` at idle and never exceed `max_conns` under load.

### NATS

NATS uses a single multiplexed connection per client; `nats.go` handles
all subscriptions and publishes over one TCP connection. The `reconnect_buf_size`
(64 MiB) controls how much data is buffered during a reconnect attempt.

For high-throughput event publishing, consider JetStream with ack policies
instead of core NATS fire-and-forget.

---

## 3. Graceful Shutdown

The shutdown sequence is:

```
SIGTERM received
  │
  ├─ 1. Tell HAProxy to drain (weight → 0%)
  │      HAProxy stops routing new requests immediately.
  │
  ├─ 2. Wait `drain_grace_period_sec` (default 5 s)
  │      Allows HAProxy health-check cycle to propagate the weight change
  │      and existing connections to complete naturally.
  │
  ├─ 3. http.Server.Shutdown(timeout_sec)
  │      Stops accepting new connections; waits for in-flight requests.
  │
  ├─ 4. Cancel root context
  │      Stops background goroutines (route cache, NATS subscriber).
  │
  └─ 5. Close stores (NATS drain → Redis close → Postgres pool close)
```

### Kubernetes pod termination

```yaml
# deployment.yaml
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60   # must be > drain_grace + shutdown_timeout
      containers:
        - name: flexgate
          lifecycle:
            preStop:
              exec:
                # Give Kubernetes time to remove the pod from Endpoints
                # before SIGTERM is sent.
                command: ["sleep", "5"]
```

```yaml
# flexgate.yaml
shutdown:
  drain_grace_period_sec: 5
  timeout_sec: 30
```

`terminationGracePeriodSeconds` (60) must exceed `preStop sleep` (5) +
`drain_grace_period_sec` (5) + `timeout_sec` (30) = 40 s. The 20 s margin
accounts for slow in-flight requests.

### HAProxy backend config

The `haproxy.backend` config key must match the backend/server name in
`haproxy.cfg` exactly:

```
backend flexgate
    server worker-1 127.0.0.1:8080 check inter 2s
```

```yaml
haproxy:
  backend: flexgate/worker-1
```

---

## 4. Security Headers

The `Security` middleware sets these response headers on every request:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS for 1 year |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `X-XSS-Protection` | `0` | Disable legacy XSS filter (see note) |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | No scripts/frames in API responses |
| `Permissions-Policy` | all features disabled | Disable browser APIs |

**Note on `X-XSS-Protection: 0`:** Modern browsers ignore this header. The
legacy `X-XSS-Protection: 1; mode=block` can actually be exploited in some
older browsers. Setting it to `0` disables the filter and removes the attack
surface.

### Request validation

| Check | Config key | Default |
|-------|-----------|---------|
| Max body size | `security.max_request_body_bytes` | 10 MiB |
| Allowed methods | `security.allowed_methods` | all methods |
| Blocked user-agents | `security.block_user_agents` | none |

---

## 5. Load Testing

### Prerequisites

```bash
brew install wrk       # macOS
apt-get install wrk    # Debian/Ubuntu
```

### Quick commands

```bash
# Baseline — health endpoint, 100 connections, 30 seconds
make go-loadtest-baseline

# Full suite — all 6 test scenarios
make go-loadtest

# Target a remote host
HOST=proxy.internal PORT=8080 make go-loadtest

# Mixed traffic simulation (production-like)
make go-loadtest-mix

# Concurrency ramp — find the saturation point
make go-loadtest-ramp

# 10-minute soak test (opt-in)
make go-loadtest-soak
```

### Expected results (4 vCPU / 1 GiB, production config)

| Test | Metric | Target |
|------|--------|--------|
| Baseline (`/health`, c=100) | Req/s | ≥ 80,000 |
| Baseline (`/health`, c=100) | p99 latency | < 1 ms |
| Proxy (`/`, c=100) | Req/s | ≥ 40,000 |
| Proxy (`/`, c=100) | p99 latency | < 5 ms |
| Low concurrency (`/health`, c=10) | p50 | < 0.5 ms |
| Low concurrency (`/health`, c=10) | p99 | < 2 ms |
| Concurrency c=500 | Req/s | ≥ 30,000 |
| Concurrency c=500 | Error rate | < 0.01% |
| Large body POST (64 KiB, c=50) | Req/s | ≥ 10,000 |
| Mixed method (c=100) | Req/s | ≥ 35,000 |
| Soak (10 min, c=100) | RSS growth | < 5% |

### Interpreting results

**Throughput lower than expected?**

1. Check `GOMAXPROCS` — ensure it matches the available vCPU count.
2. Check `go_gc_cpu_fraction` — if > 10%, lower `gogc_percent` or set `gomemlimit_mib`.
3. Check Postgres pool saturation: `flexgate_proxy_route_cache_size` should be stable (cache is working).
4. Check upstream saturation: if the upstream mock is the bottleneck, throughput will plateau regardless.

**High p99 latency?**

1. Check GC pause duration: `go_gc_duration_seconds{quantile="0.99"}` > 1 ms means GC is impacting tail latency.
2. Check intelligence timeout: `flexgate_intelligence_request_duration_seconds` — any spike here adds to p99.
3. Check connection pool wait time: if `store.pool.max_conns` is too low, requests queue waiting for a Postgres connection.

**High error rate?**

1. Check `flexgate_proxy_requests_total{status_class="5xx"}`.
2. Check `flexgate_proxy_upstream_response_status_total` for upstream errors.
3. Check `flexgate_intelligence_circuit_open` — if 1, the intelligence service is down (requests are still served via fail_open).

---

## 6. Container / Kubernetes Recommendations

```yaml
# Kubernetes resource spec
resources:
  requests:
    cpu: "500m"
    memory: "256Mi"
  limits:
    cpu: "2000m"
    memory: "512Mi"

# flexgate.yaml tuning block
tuning:
  gomemlimit_mib: 460   # 90% of 512 Mi
  gogc_percent: 200
```

**Liveness probe:** `GET /health` — should return 200 within 1 s.

**Readiness probe:** `GET /health` — remove from LB rotation when this fails.

**Startup probe:** `GET /health` with `failureThreshold: 10, periodSeconds: 3`
to allow up to 30 s for Postgres connection retries on cold start.

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 3
  periodSeconds: 5
  failureThreshold: 2

startupProbe:
  httpGet:
    path: /health
    port: 8080
  failureThreshold: 10
  periodSeconds: 3
```
