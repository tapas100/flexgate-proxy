# FlexGate Benchmark Architecture — Stage 6

## 1. Goal

Produce **credible, reproducible proof** that FlexGate adds minimal latency
overhead and maintains high throughput by comparing it directly against:

* Direct backend (baseline — no proxy)
* Nginx (industry reference)
* HAProxy (FlexGate's own data plane)
* FlexGate inline (HAProxy → FlexGate → Backend)
* FlexGate mirror (HAProxy → Backend + FlexGate shadow copy)

All five targets run on **the same machine, sequentially**, under identical
load profiles. The upstream is a zero-logic echo server so that every
millisecond measured is proxy overhead, not application work.

---

## 2. Test Topology

### Scenario 0 — Baseline (no proxy)

```
┌──────────┐   HTTP   ┌──────────────┐
│  k6 VUs  │ ───────► │  Echo Server │
│          │          │  :9000       │
└──────────┘          └──────────────┘

Purpose  : establish the floor — RTT + TCP + echo cost only
Port     : 9000
```

---

### Scenario 1 — Nginx

```
┌──────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐
│  k6 VUs  │ ───────► │  Nginx       │ ───────► │  Echo Server │
│          │          │  :9001       │          │  :9000       │
└──────────┘          └──────────────┘          └──────────────┘

Purpose  : reference point for a well-tuned C proxy
Port     : 9001
Config   : benchmarks/targets/nginx.conf
```

---

### Scenario 2 — HAProxy

```
┌──────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐
│  k6 VUs  │ ───────► │  HAProxy     │ ───────► │  Echo Server │
│          │          │  :9002       │          │  :9000       │
└──────────┘          └──────────────┘          └──────────────┘

Purpose  : FlexGate's own data plane in isolation
Port     : 9002
Config   : benchmarks/targets/haproxy-bench.cfg
```

---

### Scenario 3 — FlexGate Inline

```
┌──────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐
│  k6 VUs  │ ───────► │  HAProxy     │ ───────► │  FlexGate    │ ───────► │  Echo Server │
│          │          │  :9003       │          │  :8080       │          │  :9000       │
└──────────┘          └──────────────┘          └──────────────┘          └──────────────┘

Purpose  : FlexGate as an active inline layer between HAProxy and backend
           All requests pass through FlexGate; it can mutate/reject/observe
Port     : 9003  (HAProxy front)  →  8080 (FlexGate)  →  9000 (echo)
```

---

### Scenario 4 — FlexGate Mirror

```
┌──────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐
│  k6 VUs  │ ───────► │  HAProxy     │ ───────► │  Echo Server │
│          │          │  :9004       │          │  :9000       │
└──────────┘          └──────────────┘          └──────────────┘
                              │
                              │  mirror (fire-and-forget)
                              ▼
                       ┌──────────────┐
                       │  FlexGate    │
                       │  :8080       │
                       └──────────────┘

Purpose  : FlexGate receives a copy of every request for analysis but sits
           completely off the critical path — pure overhead measurement
           HAProxy uses `http-request mirror` to the FlexGate HTTP endpoint
Port     : 9004  (HAProxy front)  →  9000 (echo, primary path)
           copy  →  8080 (FlexGate, async)
```

---

### Scenario 5 — Realistic Traffic (Stage 2)

```
┌──────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐   HTTP   ┌──────────────┐
│  k6 VUs  │ ───────► │  HAProxy     │ ───────► │  FlexGate    │ ───────► │  Echo Server │
│ (mixed   │          │  :9006       │          │  :8080       │          │  :9000 fast  │
│  workload│          └──────────────┘          └──────────────┘          └──────────────┘
│  + think │                                            │                  ┌──────────────┐
│   time)  │                                            └────────────────► │  Echo Server │
└──────────┘                                        /bench/slow path       │  :9007 slow  │
                                                                           │  (50 ms lat) │
                                                                           └──────────────┘

Purpose  : Measure FlexGate under realistic traffic conditions —
           varied paths, POST bodies, think time, slow upstream, 404s
Port     : 9006  (HAProxy)  →  8080 (FlexGate)  →  9000 / 9007 (echo)
Config   : benchmarks/k6/scenarios/realistic.js
           benchmarks/k6/lib/workload.js
```

**Request mix (8 classes, weighted):**

| Path | Method | Weight | Purpose |
|------|--------|--------|---------|
| `/bench` | GET | 400/1000 | Hot path — matches Stage 1 baseline |
| `/bench/v2` | GET | 150/1000 | Warm path — second route cache entry |
| `/bench/echo` | POST | 150/1000 | Body-parsing pressure (64-byte JSON) |
| `/bench/status` | GET | 100/1000 | Shallow health-style endpoint |
| `/bench/items` | GET | 80/1000 | List-style URL |
| `/bench/items/42` | GET | 60/1000 | Resource-with-ID path |
| `/bench/slow` | GET | 30/1000 | Slow upstream (50 ms echo latency) |
| `/bench/missing` | GET | 30/1000 | 404 — negative cache / error path |

**Think time:** Pareto(α=1.5, x_m=50ms), capped 3000ms — right-skewed to mimic browser pacing.

---

---

### Scenario 6 — Steady Load (Stage 3)

```
┌──────────────────────────────┐
│  k6  (10 → 100 VUs ramp)     │   GET /api/test
│  ≈100 → 1000 RPS             │ ──────────────────►  HAProxy (:9003)
│  120 s sustained window      │                          │
└──────────────────────────────┘                          │
                                                          ▼
                                                   FlexGate (:8080)
                                                          │
                                                          ▼
                                                   Echo Server (:9000)

Purpose : prove stable SLA-compliant latency across the full RPS range
Shape   : 30 s warmup → 60 s ramp → 120 s sustained → 30 s drain
Pass    : p95<50 ms, p99<100 ms, error<0.1 % during sustained window
```

---

### Scenario 7 — Spike Test (Stage 3)

```
VUs
500 ┤                    ███████████████████████
 50 ┤ ████████████████                          ██   ███████████████████
  0 ┤                                               ▼
    0                  60      62             182  184               244  254 s

    └──pre-spike──┘ onset  └────spike-hold────┘ drop └──post-spike──┘ drain

Purpose : verify no errors under 10× burst; latency recovers within 30 s
Peak    : 500 VUs (10× normal)
Pass    : error<1 % overall; post-spike p95<100 ms
Abort   : error>10 % (system broken — stop immediately)
```

---

### Scenario 8 — Stress Test (Stage 3)

```
VUs
750 ┤                                                              ████
600 ┤                                                        ████
500 ┤                                                  ████
400 ┤                                            ████
300 ┤                                      ████
250 ┤                                ████
200 ┤                          ████
150 ┤                    ████
100 ┤              ████
 50 ┤        ████
  0 ┤ ────────────────────────────────────────────────────── drain ──
    step-1  2    3    4    5    6    7    8    9   10
           30 s per step — staircase to breaking point

Purpose : find saturation point; confirm bounded errors + clean recovery
Steps   : 10 steps × 30 s, 50 VU increments (50 → 750 VUs)
Abort   : error>10 % OR p99>2000 ms
Report  : breaking_step recorded in result envelope stress_meta field
```

---

## 3. Hardware Assumptions

All five scenarios run on the **same single node, sequentially**.
No cross-machine network is involved.

| Parameter | Value |
|-----------|-------|
| Machine | Apple M-series (arm64) — dev reference |
| CPU cores pinned to echo server | 1 |
| CPU cores pinned to proxy under test | 1–2 |
| CPU cores reserved for k6 | 2 |
| RAM | ≥ 16 GB |
| OS scheduler | default (no cgroup pinning in dev) |
| Network | loopback only (`127.0.0.1`) |

> **Production guidance:** Run on a dedicated bare-metal Linux node with
> `taskset` CPU pinning. Loopback numbers are conservative — real-world
> NIC latency will reduce the relative overhead percentage.

---

## 4. Metrics Collected

### 4.1 k6 (primary — from load driver)

| Metric | k6 name | Reported as |
|--------|---------|-------------|
| Requests per second | `http_reqs` rate | rps |
| Latency P50 | `http_req_duration{p(50)}` | ms |
| Latency P95 | `http_req_duration{p(95)}` | ms |
| Latency P99 | `http_req_duration{p(99)}` | ms |
| Latency P99.9 | `http_req_duration{p(99.9)}` | ms |
| Latency max | `http_req_duration{max}` | ms |
| Error rate | `http_req_failed` rate | % |
| Connection time | `http_req_connecting` | ms |
| Wait (TTFB) | `http_req_waiting` | ms |
| Data sent | `data_sent` | bytes/s |
| Data received | `data_received` | bytes/s |

### 4.2 System (sampled every 1 s during run)

| Metric | Tool | Notes |
|--------|------|-------|
| CPU % (proxy process) | `ps -o %cpu` | PID of proxy under test |
| RSS memory (proxy process) | `ps -o rss` | KiB |
| CPU % (echo server) | `ps -o %cpu` | PID of echo server |
| Load average | `sysctl vm.loadavg` | 1-min |

### 4.3 HAProxy stats (scenarios 2–4)

Scraped from `http://127.0.0.1:PORT/stats;csv` at run end:

| Field | HAProxy CSV column |
|-------|--------------------|
| scur (current sessions) | col 4 |
| stot (total sessions) | col 7 |
| bin (bytes in) | col 8 |
| bout (bytes out) | col 9 |
| ereq (request errors) | col 12 |
| econ (connection errors) | col 13 |
| eresp (response errors) | col 14 |
| req_rate (req/s peak) | col 47 |
| req_tot | col 49 |

---

## 5. Scenario Definitions

### 5.1 Ramp Profile (all scenarios)

```
Stage       VUs      Duration   Purpose
────────────────────────────────────────────────────
warmup      1→50     30 s       JIT / connection pool warm
ramp-up     50→200   60 s       find saturation point
sustained   200      120 s      steady-state measurement window
ramp-down   200→0    30 s       clean drain
────────────────────────────────────────────────────
Total                ~4 min per scenario
```

> **CI profile** (options/ci.json): 1→50 VUs, 60 s total — gates fast.
> **Full profile** (options/full.json): as above — used for release validation.

### 5.2 Request Shape

```
Method    : GET
Path      : /bench
Body      : none
Response  : {"ok":true,"ts":<unix_ns>}   (from echo server)
```

Each VU sleeps 0 ms between iterations (maximum pressure).
A separate "realistic" scenario (Stage 2) adds think time and varied paths.

### 5.3 Pass / Fail Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| `http_req_failed` | < 0.1 % | No scenario should drop requests |
| `http_req_duration p(99)` | < 100 ms | Well under human-perceptible |
| `http_req_duration p(95)` | < 50 ms | SLA-grade target |
| RPS | > 500 | Minimum useful throughput on one core |

Scenarios that exceed their threshold fail with **exit code 1** (CI-safe).

---

## 6. Result Format

Every run emits a JSON file:

```
benchmarks/results/<scenario>-<timestamp>.json
```

Schema defined in `benchmarks/results/schema.json`.
The `benchmarks/scripts/compare.js` script diffs any two result files
and prints a Markdown comparison table.

---

## 7. File Map

```
benchmarks/
├── ARCHITECTURE.md              ← this file
│
├── k6/
│   ├── lib/
│   │   ├── thresholds.js        shared pass/fail assertions (STRICT / RELAXED)
│   │   ├── metrics.js           custom counters + system sampler
│   │   ├── result.js            shared result envelope builder   ← Stage 1
│   │   ├── workload.js          request mix + think time         ← Stage 2
│   │   └── load-profiles.js     VU stages + thresholds for load tests ← Stage 3
│   ├── scenarios/
│   │   ├── baseline.js          Scenario 0 — direct to echo
│   │   ├── nginx.js             Scenario 1 — Nginx proxy
│   │   ├── haproxy.js           Scenario 2 — HAProxy only
│   │   ├── flexgate-inline.js   Scenario 3 — FlexGate inline
│   │   ├── flexgate-mirror.js   Scenario 4 — FlexGate mirror
│   │   ├── realistic.js         Scenario 5 — realistic mixed traffic  ← Stage 2
│   │   ├── steady-load.js       Scenario 6 — 100 → 1000 RPS ramp     ← Stage 3
│   │   ├── spike.js             Scenario 7 — 10× burst + recovery     ← Stage 3
│   │   └── stress.js            Scenario 8 — staircase to break point ← Stage 3
│   └── options/
│       └── profiles.json        ci / full profile definitions
│
├── targets/
│   ├── echo-server/
│   │   └── main.go              zero-logic upstream (-latency for slow instance)
│   ├── nginx.conf               Nginx comparison config
│   ├── haproxy-bench.cfg        HAProxy config (ports 9002–9004, 9006)
│   └── podman-compose.yml       reproducible local topology
│
├── results/
│   └── schema.json              result envelope schema (v1)
│
└── scripts/
    ├── run-all.sh               orchestrate all 9 scenarios (Stages 1–3)
    ├── collect-metrics.sh       ps-based system sampler
    └── compare.js               diff result files, emit Markdown table
```

---

## 8. What Is NOT Measured Here

The following are **intentionally excluded** from Stage 1 to keep results
honest and focused on proxy overhead:

* TLS termination (adds ~0.5–2 ms, will be Stage 5)
* Redis rate limiting (measured separately in Stage 2)
* Postgres-backed route loading (warm cache only, cold-start in Stage 3)
* Intelligence microservice latency (grpc bench already in `benchmarks/intelligence/`)
* Multi-node / HA setups

---

## 10. Stage 6 — Soak Testing

### Goal

Verify **long-term stability** of FlexGate under sustained moderate load.
A soak test does not seek to find the saturation point (Stage 3 does that);
it seeks to detect slow-moving failure modes:

| Failure Mode | Detection Mechanism |
| ------------- | ------------------- |
| Memory leak | Linear regression of RSS over time; flag if slope > 0 & growth > 15 % |
| FD leak | Linear regression of open-FD count; flag if slope > 50 FDs/hr & R² > 0.7 |
| Goroutine / connection leak | Monotonic RSS growth even under steady load |
| Latency drift | Compare p99 in window 1 vs window 6 (> 20 % = flag) |
| Process crash | soak-monitor polls `/api/health` every N seconds |
| Log bloat | Operator concern — not automated, but log file size is recorded |

### Topology

```
┌──────────┐  HTTP   ┌────────────────┐  HTTP   ┌──────────────┐
│  k6 VUs  │ ──────► │  FlexGate :8080│ ──────► │  Echo  :9000 │
│  10–30   │         │                │         │              │
└──────────┘         └────────────────┘         └──────────────┘
                              │
                     soak-monitor.sh
                     (CPU%, RSS, FDs, health)
```

HAProxy is NOT in the soak topology — the goal is to observe FlexGate's own
resource usage in isolation.

### Soak Profiles

| Profile | VUs | Duration | Est. RPS | Total Requests | Monitor Interval |
| ------- | --- | -------- | -------- | -------------- | ---------------- |
| smoke   | 5   | 5 min    | ~45      | ~13 500        | 5 s |
| 1h      | 30  | 1 hour   | ~270     | ~972 000       | 5 s |
| 6h      | 30  | 6 hours  | ~270     | ~5 800 000     | 15 s |
| 24h     | 20  | 24 hours | ~180     | ~15 500 000    | 30 s |

VU counts are kept at 30–40 % of the stress test peak.  Think time of 100 ms
is added between iterations to pace the load without saturating CPU.

### Request Mix

The same 8-route weighted mix is used every run (no variance) so that latency
drift is attributable to FlexGate state, not workload randomness:

| Weight | Method | Path |
| ------ | ------ | ---- |
| 40 % | GET  | /api/status   |
| 20 % | GET  | /api/metrics  |
| 15 % | POST | /api/events   |
| 10 % | GET  | /api/config   |
| 5 %  | GET  | /api/routes   |
| 4 %  | GET  | /api/health   |
| 3 %  | PUT  | /api/settings |
| 3 %  | GET  | /api/webhooks |

### Time Windows

Each run is divided into **6 equal windows**.  `soak-report.js` computes
mean/max RSS, CPU%, and FD count per window and emits a comparison table.
The window-1 → window-6 delta is the primary drift signal.

### Thresholds

Soak thresholds are designed to pass under steady production load while
catching any degradation that develops over hours:

```
http_req_failed  rate < 0.0001   (0.01 % — near-zero errors over millions of reqs)
http_req_duration p(95) < 150 ms
http_req_duration p(99) < 200 ms (wider than stress; allows GC pauses)
http_reqs        rate > 50       (throughput floor — catches progressive slowdown)
```

`abortOnFail: false` — the run must complete in full to observe drift.

### Files

| File | Role |
| ---- | ---- |
| `k6/lib/soak-profiles.js` | Profile constants, options builder, window helpers |
| `k6/scenarios/soak.js` | k6 VU scenario, handleSummary → envelope |
| `scripts/soak-monitor.sh` | System sampler (CPU/RSS/FD/health) → JSONL |
| `scripts/soak-report.js` | Post-run analysis → soak-summary.json + soak-report.md |
| `scripts/run-soak.sh` | Top-level orchestrator: start → monitor → k6 → report |

### Quick Start

```bash
# Smoke run (5 min — CI gate)
./benchmarks/scripts/run-soak.sh smoke

# 1-hour soak
./benchmarks/scripts/run-soak.sh 1h

# 6-hour soak with an existing FlexGate process
FLEXGATE_PID=<pid> SKIP_SERVICES=1 ./benchmarks/scripts/run-soak.sh 6h

# 24-hour soak
./benchmarks/scripts/run-soak.sh 24h
```

Results land in `benchmarks/results/soak-<profile>-<timestamp>/`.

### Leak Detection Algorithm

**Memory:** Linear regression of `rss_mb` vs `elapsed_hours` over all monitor
samples.  A leak is flagged when the RSS at the end of the run is > 15 %
higher than at the start (after the warmup window).

**FDs:** Same regression on `fd_count` vs `elapsed_hours`.  A leak is flagged
when slope > 50 FDs/hr AND R² > 0.7 (strong linear trend).

**Visualization:** `soak-report.md` includes ASCII sparklines for RSS, CPU,
FDs, and health-check results over the full run duration.

---

## 12. Stage 7 — Failure Testing

### Goal

Validate **resilience** of FlexGate under four distinct upstream fault conditions.
Each test confirms that FlexGate:
- Returns the correct error status code quickly (no hanging)
- Does not crash or OOM under sustained fault
- Recovers automatically when the fault is removed

### Fault Scenarios

| # | Scenario | Fault Injected | Expected FlexGate Behaviour |
|---|----------|----------------|-----------------------------|
| 1 | `backend-down` | Upstream TCP port closes (connection refused) | `502` in < 200 ms; fast-fail; recovery after reconnect |
| 2 | `slow-backend` | Upstream delays every response by 800 ms | `200` (proxied successfully); p99 ≥ 800 ms; full latency recovery |
| 3 | `timeout` | Upstream hangs indefinitely | `504` after ≤ 35 s (Go `context.WithTimeout`); no hang |
| 4 | `redis-down` | Redis unavailable (SIGSTOP or iptables DROP) | `200` always (fail-open); < 10 ms overhead |

### Topology

```
k6 VUs (10)
   │
   ▼
FlexGate :8080  ────────────────►  fault-server :9008  (data plane)
   │                                      │
   │                              ctrl-plane :9099
   │                                      │
   └──────── run-failure.sh  ◄────────────┘
             (switches fault mode between phases)
```

For `redis-down`, the fault-server is not involved — Redis itself is blocked
at the OS level (SIGSTOP on macOS, iptables DROP on Linux).

### Test Phases

Each scenario runs three phases back-to-back in a single k6 execution:

```
0 ────── 30 s ───── baseline   healthy traffic; establishes error-rate floor
30 ───── 90 s ───── fault      fault is active; degraded behaviour expected
90 ───── 120 s ──── recovery   fault removed; system must self-heal
120 ──── 125 s ──── drain
```

Phase switching is handled by `run-failure.sh` which sleeps 30 s, calls the
fault-server control plane (`POST /fault/set?mode=<mode>`), then sleeps 60 s,
then resets.

### Fault Server

`benchmarks/targets/fault-server/main.go` is a purpose-built Go HTTP server
with a runtime-switchable fault mode via a control plane on a separate port.

```
Modes    healthy  → normal 200 echo
         down     → accept then close (simulates connection refused)
         slow     → delay N ms then 200
         timeout  → hang until client closes (FlexGate timeout fires)
         reset    → accept then SO_LINGER=0 close (TCP RST)

Control  POST /fault/set?mode=<mode>
         POST /fault/reset
         GET  /fault/status
```

### What is NOT in the Go proxy core

Reading `internal/proxy/handler.go`:
- **No built-in circuit breaker** — the per-route circuit breaker is in the intelligence/Node.js layer. The Go proxy will continue forwarding to a slow upstream until the per-request `context.WithTimeout` fires.
- **No retry logic** — `httputil.ReverseProxy` makes exactly one upstream request. Retries are the responsibility of the caller (HAProxy or the client).
- **Fail-open rate limiting** — the intelligence HTTP client has a consecutive-failure circuit: after 5 failures it stops calling Redis and approves all requests.

These are documented as **expected behaviours**, not gaps.

### Files

| File | Role |
|------|------|
| `k6/lib/failure-profiles.js` | Fault scenario constants, phase timing, threshold builders, `currentPhase()` |
| `k6/scenarios/failure.js` | k6 VU scenario — parameterized by `FAULT_SCENARIO` env var |
| `targets/fault-server/main.go` | Go fault-injection server with runtime control plane |
| `scripts/run-failure.sh` | Orchestrator: build → start fault-server → run scenarios → report |
| `scripts/failure-report.js` | Post-run reporter: per-phase tables, check verdicts, `failure-summary.json` |

### Quick Start

```bash
# Build fault-server (once)
go build -o benchmarks/targets/fault-server/fault-server \
         ./benchmarks/targets/fault-server/

# Run all four failure scenarios
./benchmarks/scripts/run-failure.sh all

# Run a single scenario
./benchmarks/scripts/run-failure.sh backend-down

# Run against a specific FlexGate instance
FLEXGATE_URL=http://myhost:8080 ./benchmarks/scripts/run-failure.sh timeout
```

Results land in `benchmarks/results/failure-<timestamp>/` with
`<scenario>-report.md`, `failure-summary.json`, and `manifest.json`.

---

## 13. Honesty Constraints

1. **No cherry-picking**: all five scenarios run under the same profile in the
   same session. Results are written atomically; no manual editing.
2. **Stddev reported**: a result with p99 = 4 ms and stddev = 20 ms is worse
   than p99 = 8 ms stddev = 2 ms. Both are shown.
3. **CPU cost included**: a faster proxy that burns 3× more CPU is honestly
   slower at scale.
4. **Errors are failures**: any `http_req_failed > 0.1 %` is flagged in the
   comparison table with ⚠.
5. **Loopback disclaimer**: all numbers carry a note that loopback RTT
   (~0.05 ms) is 10–100× lower than real NIC RTT. The **delta** (proxy overhead)
   is the meaningful number, not the absolute RPS.
