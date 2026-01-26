# Architecture Overview

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  Web Browser, Mobile App, Internal Service, External API       │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     │ HTTP/HTTPS
                     ▼
┌────────────────────────────────────────────────────────────────┐
│                      LOAD BALANCER                              │
│              (Kubernetes Service / AWS ALB)                     │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     │ Round Robin
                     ▼
        ┌────────────┴────────────┬────────────┐
        │                         │            │
        ▼                         ▼            ▼
┌──────────────┐        ┌──────────────┐  ┌──────────────┐
│ Proxy Pod 1  │        │ Proxy Pod 2  │  │ Proxy Pod 3  │
│              │        │              │  │              │
│ ┌──────────┐ │        │ ┌──────────┐ │  │ ┌──────────┐ │
│ │  Auth    │ │        │ │  Auth    │ │  │ │  Auth    │ │
│ └──────────┘ │        │ └──────────┘ │  │ └──────────┘ │
│ ┌──────────┐ │        │ ┌──────────┐ │  │ ┌──────────┐ │
│ │RateLimit │ │        │ │RateLimit │ │  │ │RateLimit │ │
│ └──────────┘ │        │ └──────────┘ │  │ └──────────┘ │
│ ┌──────────┐ │        │ ┌──────────┐ │  │ ┌──────────┐ │
│ │ Circuit  │ │        │ │ Circuit  │ │  │ │ Circuit  │ │
│ │ Breaker  │ │        │ │ Breaker  │ │  │ │ Breaker  │ │
│ └──────────┘ │        │ └──────────┘ │  │ └──────────┘ │
└──────┬───────┘        └──────┬───────┘  └──────┬───────┘
       │                       │                  │
       └───────────────────────┼──────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │      REDIS         │
                    │  (Shared State)    │
                    │  - Rate limits     │
                    │  - Circuit state   │
                    └────────────────────┘
                               │
       ┌───────────────────────┼──────────────────┐
       │                       │                  │
       ▼                       ▼                  ▼
┌──────────────┐        ┌──────────────┐  ┌──────────────┐
│ Upstream A   │        │ Upstream B   │  │ Upstream C   │
│ api-a.com    │        │ api-b.com    │  │ api-c.com    │
└──────────────┘        └──────────────┘  └──────────────┘

       │                       │                  │
       └───────────────────────┼──────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │   OBSERVABILITY    │
                    │                    │
                    │  ┌──────────────┐  │
                    │  │ Prometheus   │  │ ◄─── Scrapes /metrics
                    │  └──────────────┘  │
                    │  ┌──────────────┐  │
                    │  │  Grafana     │  │ ◄─── Visualizes
                    │  └──────────────┘  │
                    │  ┌──────────────┐  │
                    │  │ Elasticsearch│  │ ◄─── Stores logs
                    │  └──────────────┘  │
                    └────────────────────┘
```

## Request Flow

```
1. Client Request
   │
   ├─► [Load Balancer] ───► Selects Pod
   │
2. Proxy Pod
   │
   ├─► [Correlation ID] ───► Generated (req-abc123)
   │
   ├─► [Authentication] ───► API Key validation
   │                          │
   │                          ├─ Valid? Continue
   │                          └─ Invalid? 401 Unauthorized
   │
   ├─► [Rate Limiting] ────► Check Redis
   │                          │
   │                          ├─ Under limit? Continue
   │                          └─ Over limit? 429 Too Many Requests
   │
   ├─► [Route Resolution] ──► Match path → upstream
   │
   ├─► [Circuit Breaker] ───► Check state
   │                          │
   │                          ├─ CLOSED? Continue
   │                          ├─ OPEN? 503 Service Unavailable
   │                          └─ HALF_OPEN? Trial request
   │
   ├─► [Upstream Request] ───► Forward to backend
   │                          │
   │                          ├─ Success? Record success
   │                          └─ Failure? Record failure, retry?
   │
   ├─► [Response] ───────────► Stream back to client
   │
   └─► [Logging] ────────────► Structured log + metrics
       │
       ├─ Log: {"correlationId": "req-abc123", "duration": 45ms}
       └─ Metrics: http_requests_total++, latency histogram
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      app.js (Main)                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Middleware Stack                        │  │
│  │                                                       │  │
│  │  1. Morgan (HTTP logging)                            │  │
│  │  2. Body Parser (JSON, max 10MB)                     │  │
│  │  3. CORS                                              │  │
│  │  4. Request Logger (correlation IDs)                 │  │
│  │  5. Metrics Collector (Prometheus)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Core Modules                            │  │
│  │                                                       │  │
│  │  ┌────────────────┐  ┌────────────────┐             │  │
│  │  │ Config Loader  │  │    Logger      │             │  │
│  │  │ (YAML parser)  │  │ (Winston JSON) │             │  │
│  │  └────────────────┘  └────────────────┘             │  │
│  │                                                       │  │
│  │  ┌────────────────┐  ┌────────────────┐             │  │
│  │  │ Rate Limiter   │  │Circuit Breaker │             │  │
│  │  │ (Redis/Local)  │  │  (Per Upstream)│             │  │
│  │  └────────────────┘  └────────────────┘             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Routes                                  │  │
│  │                                                       │  │
│  │  /health/live      → Liveness probe                 │  │
│  │  /health/ready     → Readiness probe                │  │
│  │  /health/deep      → Detailed health                │  │
│  │  /metrics          → Prometheus metrics             │  │
│  │  /httpbin/*        → Proxy to httpbin.org           │  │
│  │  /api/*            → Proxy to jsonplaceholder       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: Rate Limiting

```
Request arrives
    │
    ▼
┌─────────────────────┐
│ Rate Limit Check    │
└──────┬──────────────┘
       │
       ├─► Redis Backend?
       │   │
       │   ├─ Yes: INCR ratelimit:{ip}:{route}
       │   │       GET TTL
       │   │       │
       │   │       ├─ Count > Limit? → 429 Too Many Requests
       │   │       └─ Count ≤ Limit? → Continue
       │   │
       │   └─ No: Local in-memory counter
       │         │
       │         ├─ Count > Limit? → 429 Too Many Requests
       │         └─ Count ≤ Limit? → Continue
       │
       ▼
Continue to next middleware
```

## Circuit Breaker State Machine

```
                    ┌──────────────┐
          ┌─────────│   CLOSED     │◄────────┐
          │         │              │         │
          │         └──────┬───────┘         │
          │                │                 │
          │    Failure threshold reached     │
          │    (e.g., 50% errors in 10s)    │
          │                │                 │
          │                ▼                 │
          │         ┌──────────────┐         │
          │    ┌────│     OPEN     │         │
          │    │    │              │         │
          │    │    └──────┬───────┘         │
          │    │           │                 │
          │    │  All requests fail fast     │
          │    │  (no upstream calls)        │
          │    │           │                 │
          │    │    After timeout (30s)      │
          │    │           │                 │
          │    │           ▼                 │
          │    │    ┌──────────────┐         │
          │    │    │  HALF_OPEN   │         │
          │    │    │              │         │
          │    │    └──────┬───────┘         │
          │    │           │                 │
          │    │    Trial requests (3)       │
          │    │           │                 │
          │    │     ┌─────┴─────┐           │
          │    │     │           │           │
    All fail │   │  Success   Failure        │
          │    │     │           │           │
          │    └─────┘           └───────────┘
          │
          └──► Back to OPEN
```

## Deployment Architecture (Kubernetes)

```
┌─────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                  │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │              Namespace: default                │ │
│  │                                                 │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │         Service (ClusterIP)              │  │ │
│  │  │         port: 80 → 3000                  │  │ │
│  │  └─────────────────┬────────────────────────┘  │ │
│  │                    │                            │ │
│  │                    ▼                            │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │    Deployment (proxy-server)             │  │ │
│  │  │    replicas: 3                           │  │ │
│  │  │                                           │  │ │
│  │  │  ┌────────┐  ┌────────┐  ┌────────┐     │  │ │
│  │  │  │ Pod 1  │  │ Pod 2  │  │ Pod 3  │     │  │ │
│  │  │  │        │  │        │  │        │     │  │ │
│  │  │  │ 256Mi  │  │ 256Mi  │  │ 256Mi  │     │  │ │
│  │  │  │ 500m   │  │ 500m   │  │ 500m   │     │  │ │
│  │  │  └────────┘  └────────┘  └────────┘     │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  │                                                 │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │   HorizontalPodAutoscaler                │  │ │
│  │  │   min: 3, max: 10                        │  │ │
│  │  │   target CPU: 70%                        │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  │                                                 │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │   PodDisruptionBudget                    │  │ │
│  │  │   minAvailable: 2                        │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │         ConfigMap (proxy-config)               │ │
│  │         data: proxy.yml                        │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │         Secret (proxy-secrets)                 │ │
│  │         data: redis-url, api-keys              │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Security Layers

```
Request from Internet
    │
    ▼
┌─────────────────────┐
│ 1. Network Layer    │
│ - Firewall rules    │
│ - VPC/Security Group│
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 2. Load Balancer    │
│ - TLS termination   │
│ - DDoS protection   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 3. Proxy Layer      │
│ - IP filtering      │
│ - Rate limiting     │
│ - SSRF protection   │
│ - Header validation │
│ - Auth check        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 4. Backend Layer    │
│ - Trusted zone      │
│ - Internal network  │
└─────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 20 | JavaScript execution |
| **Framework** | Express.js | HTTP server |
| **Proxy** | http-proxy-middleware | Request forwarding |
| **State** | Redis | Distributed rate limiting |
| **Logging** | Winston | Structured JSON logs |
| **Metrics** | Prometheus | Time-series metrics |
| **Visualization** | Grafana | Dashboards |
| **Container** | Docker | Containerization |
| **Orchestration** | Kubernetes | Container management |
| **Config** | YAML | Configuration format |

---

## Scalability Model

```
1 Instance:   ~4.7K req/sec
3 Instances:  ~14K req/sec  (linear)
10 Instances: ~47K req/sec  (near-linear)

Bottlenecks (in order):
1. Upstream capacity
2. Redis (rate limiting)
3. Network bandwidth
4. Proxy CPU (Node.js single-thread)
```

---

For more details, see:
- [README.md](../README.md) - Full documentation
- [docs/problem.md](problem.md) - Problem statement
- [docs/threat-model.md](threat-model.md) - Security analysis
