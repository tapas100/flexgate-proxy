# FlexGate Benchmark Suite

Credible, reproducible performance proof for FlexGate.

Five scenarios. One shared zero-logic upstream. All results written as
structured JSON and diffed by `compare.js`.

---

## Quick Start

```bash
# 1. Install dependencies (macOS)
brew install k6 haproxy nginx

# 2. Build the echo server (zero-logic upstream)
go build -o benchmarks/targets/echo-server/echo-server \
         ./benchmarks/targets/echo-server/

# 3. Build FlexGate (needed for Scenarios 3 + 4)
go build -o flexgate ./cmd/flexgate/

# 4. Run the full suite (~20 min)
bash benchmarks/scripts/run-all.sh full

# 5. Run CI-length suite (~5 min)
bash benchmarks/scripts/run-all.sh ci
```

FlexGate Scenarios 3 + 4 require a running Postgres instance.
The bench config is `config/flexgate.bench.json` (db: `flexgate_bench`, redis db: 1,
rate limiting disabled, log level `warn` to reduce I/O noise).

Results are written to `benchmarks/results/`.

---

## Scenarios

| # | Name | Topology | Port |
|---|------|----------|------|
| 0 | Baseline | k6 → Echo | 9000 |
| 1 | Nginx | k6 → Nginx → Echo | 9001 |
| 2 | HAProxy | k6 → HAProxy → Echo | 9002 |
| 3 | FlexGate inline | k6 → HAProxy → FlexGate → Echo | 9003 |
| 4 | FlexGate mirror | k6 → HAProxy → Echo + mirror → FlexGate | 9004 |

Full architecture description: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Metrics

| Metric | Source | Why |
|--------|--------|-----|
| RPS | k6 `http_reqs` rate | throughput |
| P50 / P95 / P99 / P99.9 latency | k6 `http_req_duration` | tail behaviour |
| Max latency | k6 | worst-case spike |
| StdDev | k6 | stability |
| Error rate % | k6 `http_req_failed` | correctness |
| CPU % (proxy) | `ps` sampled @ 1 Hz | cost |
| RSS MB (proxy) | `ps` sampled @ 1 Hz | cost |

---

## Load Profile

```
Stage       VUs         Duration
──────────────────────────────────────
warmup      1 → 50      30 s
ramp-up     50 → 200    60 s
sustained   200         120 s   ← measurement window
ramp-down   200 → 0     30 s
──────────────────────────────────────
Total                   ~4 min (full)

CI profile: 1 → 50 VUs, 60 s total
```

---

## Pass / Fail Thresholds

| Metric | STRICT (full) | RELAXED (ci) |
|--------|--------------|--------------|
| Error rate | < 0.1 % | < 0.5 % |
| P95 latency | < 50 ms | < 100 ms |
| P99 latency | < 100 ms | < 250 ms |

Overhead limits (vs baseline):

| Delta | Limit |
|-------|-------|
| ΔP50 | ≤ 2 ms |
| ΔP95 | ≤ 5 ms |
| ΔP99 | ≤ 15 ms |

---

## Files

```
benchmarks/
├── ARCHITECTURE.md          Full design rationale
├── k6/
│   ├── lib/
│   │   ├── thresholds.js    Pass/fail assertions
│   │   ├── metrics.js       Custom k6 metrics
│   │   └── result.js        Shared result envelope builder
│   ├── scenarios/
│   │   ├── baseline.js      Scenario 0
│   │   ├── nginx.js         Scenario 1
│   │   ├── haproxy.js       Scenario 2
│   │   ├── flexgate-inline.js  Scenario 3
│   │   └── flexgate-mirror.js  Scenario 4
│   └── options/
│       └── profiles.json    Stage timing reference
├── targets/
│   ├── echo-server/
│   │   ├── main.go          Zero-logic upstream
│   │   └── Containerfile
│   ├── nginx.conf           Nginx comparison config
│   ├── haproxy-bench.cfg    HAProxy benchmark config
│   └── podman-compose.yml   Full topology in containers
├── results/
│   └── schema.json          Result envelope schema (v1)
└── scripts/
    ├── run-all.sh           Orchestrate all scenarios
    ├── collect-metrics.sh   System CPU/RSS sampler
    └── compare.js           Diff results, print table
```

---

## Reading Results

```bash
# Compare a specific run
node benchmarks/scripts/compare.js benchmarks/results 1712345678

# Compare two specific files
node benchmarks/scripts/compare.js \
     benchmarks/results/baseline-1712345678.json \
     benchmarks/results/flexgate-inline-1712345678.json
```

Output: Markdown table of latency, overhead deltas, and threshold pass/fail.

---

## Honesty Constraints

1. All five scenarios run sequentially in the same session under identical load
2. StdDev is reported alongside every percentile
3. CPU cost is measured — a faster proxy that burns 3× CPU is not a win
4. Error rate > 0.1 % is flagged ⚠ in the comparison table
5. All numbers are loopback measurements — delta (overhead) is the
   meaningful number, not absolute RPS


**Environment**:
- **CPU**: Apple M1 Pro (8 cores)
- **RAM**: 16GB
- **OS**: macOS 13
- **Node.js**: v20.10.0

---

## Baseline Performance

### Test Setup
```bash
# Upstream: Simple echo server
node test/fixtures/echo-server.js

# Proxy: Default configuration
npm start

# Load tool: wrk
wrk -t4 -c100 -d30s http://localhost:3000/api/echo
```

### Results

| Metric | Value |
|--------|-------|
| **Requests/sec** | 4,732 |
| **Transfer/sec** | 1.2 MB |
| **Avg Latency** | 21ms |
| **P50 Latency** | 18ms |
| **P95 Latency** | 35ms |
| **P99 Latency** | 52ms |

### Overhead Analysis
```
Total request time: 21ms
├─ Proxy overhead: ~3ms
│  ├─ Request parsing: 0.5ms
│  ├─ Auth check: 0.5ms
│  ├─ Routing logic: 0.3ms
│  ├─ Logging: 1.2ms
│  └─ Response forwarding: 0.5ms
├─ Network to upstream: 1ms
├─ Upstream processing: 15ms
└─ Network from upstream: 2ms
```

**Proxy adds ~3ms overhead** (14% of total time)

---

## Impact of Features

### 1. Rate Limiting (Local)

**Config**: 1000 req/min per IP

| Metric | Baseline | With Rate Limit | Delta |
|--------|----------|-----------------|-------|
| Requests/sec | 4,732 | 4,615 | -2.5% |
| P95 Latency | 35ms | 37ms | +2ms |
| P99 Latency | 52ms | 55ms | +3ms |

**Overhead**: ~0.5ms per request

### 2. Rate Limiting (Redis)

**Config**: Redis on localhost

| Metric | Baseline | With Redis Rate Limit | Delta |
|--------|----------|----------------------|-------|
| Requests/sec | 4,732 | 3,890 | -18% |
| P95 Latency | 35ms | 48ms | +13ms |
| P99 Latency | 52ms | 72ms | +20ms |

**Overhead**: ~4ms per request (Redis round-trip)

**Note**: Network-based Redis would add 1-2ms more

### 3. Circuit Breaker

**Config**: Default thresholds

| Metric | Baseline | With Circuit Breaker | Delta |
|--------|----------|---------------------|-------|
| Requests/sec | 4,732 | 4,698 | -0.7% |
| P95 Latency | 35ms | 36ms | +1ms |

**Overhead**: Negligible (~0.2ms)

### 4. Full Observability Stack

**Config**: 
- Structured JSON logging (async)
- Prometheus metrics
- Correlation IDs

| Metric | Baseline | With Observability | Delta |
|--------|----------|-------------------|-------|
| Requests/sec | 4,732 | 4,520 | -4.5% |
| P95 Latency | 35ms | 38ms | +3ms |
| P99 Latency | 52ms | 58ms | +6ms |

**Overhead**: ~1.5ms per request

### 5. All Features Enabled

**Config**: Rate limit + Circuit breaker + Observability + Retries

| Metric | Baseline | All Features | Delta |
|--------|----------|--------------|-------|
| Requests/sec | 4,732 | 3,654 | -23% |
| P95 Latency | 35ms | 52ms | +17ms |
| P99 Latency | 52ms | 78ms | +26ms |

**Overhead**: ~8ms per request

---

## Scalability Tests

### Concurrency Impact

| Concurrent Connections | Requests/sec | P95 Latency | P99 Latency |
|----------------------|--------------|-------------|-------------|
| 10 | 4,850 | 12ms | 18ms |
| 50 | 4,780 | 28ms | 42ms |
| 100 | 4,732 | 35ms | 52ms |
| 200 | 4,620 | 58ms | 85ms |
| 500 | 4,210 | 125ms | 180ms |
| 1000 | 3,450 | 285ms | 420ms |

**Observations**:
- Linear scaling up to 100 connections
- Performance degrades beyond 500 concurrent

### Payload Size Impact

**Test**: Echo server with varying body sizes

| Payload Size | Requests/sec | P95 Latency | Throughput |
|--------------|--------------|-------------|------------|
| 1 KB | 4,732 | 35ms | 4.6 MB/s |
| 10 KB | 4,580 | 38ms | 44 MB/s |
| 100 KB | 3,210 | 52ms | 310 MB/s |
| 1 MB | 1,450 | 95ms | 1.4 GB/s |
| 10 MB | 180 | 720ms | 1.7 GB/s |

**Observations**:
- CPU-bound for small payloads (< 10KB)
- Network/memory-bound for large payloads (> 1MB)

---

## Memory Usage

### Baseline
```
Process memory: 45 MB
├─ Code + dependencies: 30 MB
├─ V8 heap: 10 MB
└─ Buffers: 5 MB
```

### Under Load (100 concurrent connections)
```
Process memory: 78 MB
├─ Code + dependencies: 30 MB
├─ V8 heap: 28 MB
├─ Buffers: 15 MB
└─ Connection state: 5 MB
```

### Memory per Connection
~330 KB per active connection

### Memory Leak Test
**Test**: 10M requests over 6 hours

```
Start:  78 MB
1 hour: 82 MB
3 hour: 85 MB
6 hour: 87 MB
```

**Growth rate**: ~1.5 MB/hour (likely V8 fragmentation)

**Mitigation**: Restart instances weekly or use `--max-old-space-size=512`

---

## CPU Usage

### Single Core Utilization
At 4,732 req/sec:
- **CPU**: 85% of 1 core
- **Peak**: 95% during GC

### Multi-Core Scaling (with clustering)

| Instances | Requests/sec | CPU Total | Efficiency |
|-----------|--------------|-----------|------------|
| 1 | 4,732 | 85% | 100% |
| 2 | 9,120 | 165% | 96% |
| 4 | 17,580 | 320% | 93% |
| 8 | 32,450 | 610% | 85% |

**Observations**:
- Near-linear scaling up to 4 cores
- Diminishing returns beyond (shared resources)

---

## Comparison with Alternatives

### Nginx (C)
```
Requests/sec: 52,000 (11x faster)
P95 Latency: 8ms (4x faster)
Memory: 12 MB (6x smaller)
```

**Why Nginx is faster**:
- Compiled C code
- Multi-threaded
- No GC pauses
- Minimal overhead

**Why we still use Node.js**:
- Custom logic in JavaScript
- Shared code with backend
- Better observability
- Easier debugging

### Envoy (C++)
```
Requests/sec: 48,000 (10x faster)
P95 Latency: 10ms (3.5x faster)
Memory: 25 MB (3x smaller)
```

**When to use Envoy**:
- Service mesh deployment
- Need advanced routing (gRPC, HTTP/2)
- Throughput > 10K req/sec

### Kong (Nginx + Lua)
```
Requests/sec: 35,000 (7x faster)
P95 Latency: 12ms (3x faster)
Memory: 40 MB (similar)
```

**Trade-off**:
- Faster than our proxy
- Plugin ecosystem
- But Lua is less familiar than JavaScript

---

## GC Pause Analysis

### Typical GC Behavior
```
Minor GC: Every 2-3 seconds (5-15ms pause)
Major GC: Every 30-60 seconds (50-100ms pause)
```

### Impact on Latency
```
P99 Latency distribution:
├─ 50ms: Normal request (no GC)
├─ 65ms: During minor GC (+15ms)
└─ 150ms: During major GC (+100ms)
```

**P99.9 latency**: 150ms (dominated by GC)

### Mitigation Strategies
1. **Increase heap size**: Fewer GC cycles
   ```bash
   node --max-old-space-size=2048 app.js
   ```

2. **Use object pools**: Reduce allocation rate

3. **Monitor GC**: Alert if pauses > 100ms
   ```javascript
   const v8 = require('v8');
   v8.setFlagsFromString('--trace_gc');
   ```

---

## Streaming Performance

### Non-Streaming (Buffer Entire Response)
```
10 MB response:
├─ Time to first byte: 850ms
├─ Total time: 920ms
└─ Memory: 180 MB peak
```

### Streaming (Pipe Response)
```
10 MB response:
├─ Time to first byte: 45ms (18x faster)
├─ Total time: 920ms (same)
└─ Memory: 52 MB peak (3.5x smaller)
```

**Recommendation**: Always stream large responses

---

## HTTP/2 vs HTTP/1.1

### Upstream: HTTP/1.1
```
100 concurrent requests:
├─ Connections: 100
├─ P95 Latency: 35ms
└─ Throughput: 4,732 req/sec
```

### Upstream: HTTP/2
```
100 concurrent requests:
├─ Connections: 1 (multiplexed)
├─ P95 Latency: 28ms (20% faster)
└─ Throughput: 5,120 req/sec (8% more)
```

**Benefits of HTTP/2**:
- Fewer connections (less overhead)
- Header compression
- Better for high-latency networks

---

## Recommendations

### For Low Latency (P95 < 20ms)
```yaml
- Use HTTP/2 to upstream
- Disable Redis rate limiting (use local)
- Reduce logging (sample aggressively)
- Increase heap size (reduce GC)
```

### For High Throughput (> 5K req/sec)
```yaml
- Use clustering (1 worker per core)
- Enable HTTP/2
- Use streaming for large responses
- Optimize upstream (biggest bottleneck)
```

### For Low Memory (< 100 MB per instance)
```yaml
- Limit concurrent connections (500 max)
- Stream large responses
- Use smaller heap (--max-old-space-size=256)
- Disable verbose logging
```

---

## Future Optimizations

1. **Connection Pooling**: Reduce per-request overhead
2. **Worker Threads**: Offload CPU-heavy tasks
3. **Native Modules**: Rewrite hot paths in C++
4. **HTTP/3 (QUIC)**: Better for lossy networks

---

## How to Run Benchmarks

```bash
# Install dependencies
npm install

# Start echo server (terminal 1)
node test/fixtures/echo-server.js

# Start proxy (terminal 2)
npm start

# Run benchmark (terminal 3)
npm run benchmark

# Generate report
npm run benchmark:report
```

See `benchmarks/run.sh` for full test suite.
