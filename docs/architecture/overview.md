# FlexGate Architecture Overview

## Component Roles

### Why We Use Both HAProxy AND Nginx

**They serve DIFFERENT purposes - not redundant!**

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER's BROWSER                              │
│                     (http://localhost:3002)                          │
└────────────┬────────────────────────────┬───────────────────────────┘
             │                            │
             │ Load HTML/JS/CSS           │ API Calls
             │ (Static Files)             │ (http://localhost:8080)
             │                            │
             ▼                            ▼
    ┌────────────────┐           ┌────────────────┐
    │  NGINX (3002)  │           │ HAProxy (8080) │
    │                │           │                │
    │  Purpose:      │           │  Purpose:      │
    │  - Serve React │           │  - Load balance│
    │    static files│           │    API traffic │
    │  - Gzip        │           │  - Health check│
    │  - Cache       │           │  - Failover    │
    │  - Security    │           │  - Stats       │
    │    headers     │           │                │
    └────────────────┘           └────┬───────┬───┘
                                      │       │
                        ┌─────────────┘       └─────────────┐
                        │                                    │
                        ▼                                    ▼
              ┌──────────────────┐                ┌──────────────────┐
              │  FlexGate App 1  │                │  FlexGate App 2  │
              │   (port 3000)    │                │   (port 3000)    │
              │                  │                │                  │
              │  - API Gateway   │                │  - API Gateway   │
              │  - Rate Limiting │                │  - Rate Limiting │
              │  - Auth          │                │  - Auth          │
              │  - Metrics       │                │  - Metrics       │
              │  - Webhooks      │                │  - Webhooks      │
              └────────┬─────────┘                └─────────┬────────┘
                       │                                    │
                       └──────────┬─────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
      ┌────────────┐      ┌────────────┐     ┌────────────┐
      │ PostgreSQL │      │   Redis    │     │    NATS    │
      │            │      │            │     │            │
      │ - Routes   │      │ - Cache    │     │ - Metrics  │
      │ - Users    │      │ - Sessions │     │ - Events   │
      │ - Webhooks │      │ - Rate     │     │ - Streams  │
      │ - Logs     │      │   limits   │     │            │
      └────────────┘      └────────────┘     └────────────┘
```

---

## Component Breakdown

### 1. **Nginx** (Port 3002)
**Role:** Static File Server for Admin UI

**Why Nginx?**
- ✅ **Fast static file serving** - Optimized for serving HTML/CSS/JS
- ✅ **Built-in gzip compression** - Reduces bandwidth
- ✅ **Caching headers** - Browser caching for assets
- ✅ **Security headers** - XSS, frame options, content-type
- ✅ **SPA routing** - All routes → index.html (React Router)
- ✅ **Production-ready** - Battle-tested, minimal config

**What it does NOT do:**
- ❌ API proxying (not needed - browser calls HAProxy directly)
- ❌ Load balancing (that's HAProxy's job)

**Alternatives considered:**
- `serve` (npm package) - Less features, no compression config
- `http-server` - Too basic for production
- Express.js - Overkill for static files

---

### 2. **HAProxy** (Port 8080)
**Role:** Load Balancer & Reverse Proxy for API Traffic

**Why HAProxy?**
- ✅ **Load balancing** - Distributes traffic across 2 FlexGate instances
- ✅ **Health checks** - Auto-removes unhealthy backends
- ✅ **Connection pooling** - Reuses TCP connections
- ✅ **Stats dashboard** - Real-time monitoring (port 8404)
- ✅ **High performance** - Handles 10K+ req/sec
- ✅ **Failover** - Automatic rerouting on failures

**Why NOT use Nginx here?**
- HAProxy is specifically designed for load balancing
- Better health check mechanisms
- Superior connection handling for APIs
- Industry standard for this use case

---

### 3. **FlexGate App** (2 instances on port 3000)
**Role:** API Gateway Application

**Why 2 instances?**
- ✅ **High availability** - One can fail, traffic continues
- ✅ **Rolling updates** - Update one at a time, zero downtime
- ✅ **Load distribution** - Handle more concurrent requests

---

### 4. **Infrastructure Services**

| Service | Port | Purpose |
|---------|------|---------|
| **PostgreSQL** | 5432 | Persistent storage (routes, users, webhooks, logs) |
| **Redis** | 6379 | Cache, sessions, rate limiting counters |
| **NATS** | 4222 | Pub/sub messaging, real-time metrics streaming |
| **Prometheus** | 9090 | Metrics collection and querying |
| **Grafana** | 3001 | Metrics visualization dashboards |

---

## Request Flow Examples

### Example 1: Load Admin UI
```
1. Browser → http://localhost:3002
2. Nginx → Serves index.html + bundled JS/CSS
3. Browser → Renders React application
```

### Example 2: API Call from Admin UI
```
1. React App (in browser) → fetch('http://localhost:8080/api/routes')
2. HAProxy → Health check backends
3. HAProxy → Forward to flexgate-app-1 or flexgate-app-2 (round-robin)
4. FlexGate App → Query PostgreSQL
5. FlexGate App → Return JSON
6. HAProxy → Return to browser
7. React → Update UI
```

### Example 3: External API Request
```
1. Client → http://localhost:8080/proxy/users
2. HAProxy → Forward to healthy backend (app-1 or app-2)
3. FlexGate App → Check auth (API key)
4. FlexGate App → Check rate limit (Redis)
5. FlexGate App → Proxy to upstream service
6. FlexGate App → Log request (PostgreSQL)
7. FlexGate App → Publish metrics (NATS)
8. FlexGate App → Return response
```

---

## Why This Architecture?

### ✅ **Separation of Concerns**
- **Nginx**: Static files (what it's best at)
- **HAProxy**: Load balancing (what it's best at)
- **FlexGate**: Business logic (API gateway features)

### ✅ **Scalability**
- Can scale FlexGate app horizontally (add more instances)
- HAProxy handles distribution automatically
- Nginx serves static files efficiently

### ✅ **High Availability**
- 2 FlexGate instances (one can fail)
- HAProxy detects failures and routes around them
- Zero downtime deployments possible

### ✅ **Performance**
- Static files served fast by nginx (gzip, caching)
- API requests load-balanced by HAProxy
- Connection pooling reduces latency

### ✅ **Production-Ready**
- Industry-standard components
- Well-documented, battle-tested
- Easy to monitor and debug

---

## Alternative Architectures Considered

### ❌ Option 1: Nginx for Everything
**Why not:**
- Nginx load balancing less mature than HAProxy
- Harder to configure health checks
- Less visible stats/monitoring
- Would need Lua scripting for advanced features

### ❌ Option 2: No Load Balancer (Single App)
**Why not:**
- Single point of failure
- Can't do rolling updates
- Limited horizontal scaling
- No health checks/failover

### ❌ Option 3: Serve static files from Node.js
**Why not:**
- Node.js slower for static files than nginx
- Need to write caching logic
- Security headers manual
- Gzip compression manual

---

## Port Reference

| Service | Port(s) | Access URL |
|---------|---------|------------|
| **Admin UI** | 3002 | http://localhost:3002 |
| **HAProxy API** | 8080 | http://localhost:8080 |
| **HAProxy Stats** | 8404 | http://localhost:8404/stats |
| **FlexGate App 1** | 3000 | Internal only |
| **FlexGate App 2** | 3000 | Internal only |
| **Prometheus** | 9090 | http://localhost:9090 |
| **Grafana** | 3001 | http://localhost:3001 |
| **PostgreSQL** | 5432 | Internal only |
| **Redis** | 6379 | Internal only |
| **NATS** | 4222, 8222 | http://localhost:8222 |

---

## Summary

**Nginx and HAProxy are NOT redundant - they have different jobs:**

1. **Nginx** = Static file server (Admin UI HTML/JS/CSS)
2. **HAProxy** = Load balancer (API traffic distribution)

**The browser makes API calls directly to HAProxy**, so there's no API proxying happening through Nginx. This is the standard architecture for modern web applications:

```
Static Files (nginx) ←→ Browser ←→ API (HAProxy → Apps)
```

This separation allows each component to do what it does best, resulting in better performance, reliability, and maintainability.

---

**Last Updated:** February 9, 2026  
**Version:** 1.0.0
