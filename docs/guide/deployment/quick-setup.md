# Quick Setup Guide

## Overview

FlexGate offers **3 deployment modes** to suit different developer needs:

1. **Simple Mode** - Just the gateway (no infrastructure)
2. **Standard Mode** - Gateway + Database + Redis
3. **Production Mode** - Full stack with HAProxy, Prometheus, Grafana

---

## 1. Simple Mode (Zero Config)

### For: Quick testing, development, small projects

**Install and Run:**
```bash
npm install flexgate-proxy

# Option A: Run directly
npx flexgate start

# Option B: Add to your project
npm install flexgate-proxy --save
```

**What You Get:**
- ✅ API Gateway on port 8080
- ✅ In-memory configuration
- ✅ Basic rate limiting
- ✅ Health checks
- ❌ No persistence (restarts lose config)
- ❌ No metrics dashboard
- ❌ No load balancing

**Configure Programmatically:**
```javascript
// server.js
import { FlexGate } from 'flexgate-proxy';

const gateway = new FlexGate({
  port: 8080,
  routes: [
    {
      id: 'my-api',
      path: '/api/*',
      target: 'http://localhost:3000',
      rateLimit: { max: 100, window: 60000 }
    }
  ]
});

await gateway.start();
console.log('Gateway running on http://localhost:8080');
```

**Use Cases:**
- Local development
- Testing API routing
- Simple reverse proxy needs

---

## 2. Standard Mode (Recommended for Development)

### For: Development teams, staging environments, persistent configuration

**Install:**
```bash
npm install flexgate-proxy --save
```

**Generate Config:**
```bash
npx flexgate init
```

This creates:
```
flexgate.config.yml     # Main configuration
.env                     # Environment variables
podman-compose.dev.yml  # Just DB + Redis
```

**Start Services:**
```bash
# Start PostgreSQL + Redis only
npm run db:start

# Run database migrations
npm run db:migrate

# Start FlexGate
npm start
```

**What You Get:**
- ✅ API Gateway on port 8080
- ✅ PostgreSQL for configuration persistence
- ✅ Redis for caching and rate limiting
- ✅ Admin UI at `http://localhost:8080/admin`
- ✅ Configuration survives restarts
- ✅ Programmatic + UI configuration
- ❌ No metrics visualization
- ❌ No load balancing (single instance)

**Configure via Admin UI:**

1. Open `http://localhost:8080/admin`
2. Navigate to **Settings → General**
3. Configure:
   - Database connection (already connected)
   - Redis cache settings
   - Security (JWT, CORS)
   - Logging levels
4. Navigate to **Routes**
5. Add routes via UI:
   - Click "Add Route"
   - Set path pattern: `/api/*`
   - Set target: `http://localhost:3000`
   - Configure rate limits, timeouts
   - Save

**Or Configure via YAML:**
```yaml
# flexgate.config.yml
server:
  port: 8080
  host: 0.0.0.0

database:
  url: postgresql://flexgate:flexgate@localhost:5432/flexgate

redis:
  url: redis://localhost:6379

routes:
  - id: my-api
    path: /api/*
    target: http://localhost:3000
    rateLimit:
      max: 1000
      window: 60000
    circuitBreaker:
      enabled: true
      threshold: 0.5
      timeout: 30000
```

**Available Commands:**
```bash
npm start              # Start gateway (production mode)
npm run dev            # Start with hot reload
npm run db:start       # Start PostgreSQL + Redis
npm run db:stop        # Stop database services
npm run db:migrate     # Run migrations
npm run db:seed        # Seed sample data
npm run db:reset       # Reset and reseed database
npm test               # Run tests
npm run lint           # Lint code
```

**Use Cases:**
- Team development
- Staging environments
- Projects needing configuration persistence
- Testing with realistic data

---

## 3. Production Mode (Full Stack)

### For: Production deployments, high-traffic applications, monitoring needs

**Install:**
```bash
npm install flexgate-proxy --save
```

**Generate Full Stack Config:**
```bash
npx flexgate init --production
```

This creates:
```
flexgate.config.yml       # Main configuration
.env                       # Environment variables
podman-compose.yml         # Full stack compose file
haproxy/haproxy.cfg       # Load balancer config
infra/prometheus/         # Metrics collection
```

**Start Full Stack:**
```bash
# Build FlexGate container
npm run podman:build

# Start all services (HAProxy, FlexGate x2, DB, Redis, Prometheus, Grafana)
npm run podman:run

# Check status
podman ps
```

**What You Get:**
- ✅ HAProxy load balancer on port 8080 (10K+ req/sec)
- ✅ 2x FlexGate instances (high availability)
- ✅ PostgreSQL for persistence
- ✅ Redis for caching
- ✅ Prometheus metrics on port 9090
- ✅ Grafana dashboards on port 3001
- ✅ HAProxy stats on port 8404
- ✅ Admin UI at `http://localhost:8080/admin`
- ✅ Auto-failover and health checks
- ✅ Full observability stack

**Service Ports:**

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| HAProxy | 8080 | http://localhost:8080 | Main Gateway Entry |
| HAProxy Stats | 8404 | http://localhost:8404 | Load Balancer Stats |
| Prometheus | 9090 | http://localhost:9090 | Metrics Query |
| Grafana | 3001 | http://localhost:3001 | Dashboards |
| Admin UI | 8080/admin | http://localhost:8080/admin | Configuration UI |

**Grafana Login:**
- Username: `admin`
- Password: `admin`

**Configure via Admin UI:**

Same as Standard Mode, but changes are automatically synced across both FlexGate instances.

1. Open `http://localhost:8080/admin`
2. Configure in **Settings**:
   - **General**: Server, compression, admin settings
   - **Database**: Already configured (PostgreSQL)
   - **Redis**: Already configured
   - **Security**: JWT secrets, CORS, API keys
   - **Logging**: Set log level (info for production)
   - **Monitoring**: Prometheus already enabled
   - **Notifications**: Set up webhooks, email alerts
3. Configure **Routes**:
   - Add routes via UI
   - Set rate limits
   - Enable circuit breakers
   - Configure health checks
4. View **Monitoring**:
   - Real-time metrics
   - Request graphs
   - Error rates
   - Latency percentiles

**Access Grafana Dashboards:**

1. Open http://localhost:3001
2. Login with `admin` / `admin`
3. Navigate to **Dashboards**
4. View:
   - FlexGate Overview
   - Request Latency
   - Error Rates
   - Circuit Breaker Status
   - Rate Limit Usage
   - System Resources

**Available Commands:**
```bash
npm run podman:build    # Build container image
npm run podman:run      # Start full stack
npm run podman:stop     # Stop all services
podman logs flexgate-app-1  # View app logs
podman logs flexgate-grafana  # View Grafana logs
podman stats            # Resource usage
```

**Use Cases:**
- Production deployments
- High-traffic applications (>5K req/sec)
- Applications requiring monitoring
- Mission-critical services
- Multi-instance deployments

---

## Comparison Matrix

| Feature | Simple Mode | Standard Mode | Production Mode |
|---------|-------------|---------------|-----------------|
| **Installation** | `npm install flexgate-proxy` | `npm install flexgate-proxy` | `npm install flexgate-proxy` |
| **Setup Time** | 30 seconds | 5 minutes | 10 minutes |
| **Configuration** | Code only | Code + UI + YAML | Code + UI + YAML |
| **Persistence** | ❌ In-memory | ✅ PostgreSQL | ✅ PostgreSQL |
| **Caching** | ❌ In-memory | ✅ Redis | ✅ Redis |
| **Admin UI** | ❌ No | ✅ Yes | ✅ Yes |
| **Metrics** | ❌ No | ❌ No | ✅ Prometheus |
| **Dashboards** | ❌ No | ❌ No | ✅ Grafana |
| **Load Balancing** | ❌ Single instance | ❌ Single instance | ✅ HAProxy |
| **High Availability** | ❌ No | ❌ No | ✅ 2+ instances |
| **Auto-failover** | ❌ No | ❌ No | ✅ Yes |
| **Alerting** | ❌ No | ❌ No | ✅ Yes |
| **Dependencies** | None | Podman/Docker | Podman/Docker |

---

## Configuration Methods

### 1. Programmatic (All Modes)

```javascript
import { FlexGate } from 'flexgate-proxy';

const gateway = new FlexGate({
  port: 8080,
  database: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL },
  routes: [/* ... */],
  rateLimit: {/* ... */},
  circuitBreaker: {/* ... */}
});

await gateway.start();
```

### 2. YAML Config (Standard/Production)

```yaml
# flexgate.config.yml
server:
  port: 8080

routes:
  - id: api
    path: /api/*
    target: http://backend:3000
```

### 3. Admin UI (Standard/Production)

Navigate to http://localhost:8080/admin:

- **Routes**: Add/edit/delete routes visually
- **Settings → General**: Configure server settings
- **Settings → Database**: Manage database connection
- **Settings → Redis**: Configure cache
- **Settings → Security**: JWT, CORS, API keys
- **Settings → Notifications**: Webhooks, emails
- **Monitoring**: View real-time metrics

### 4. Environment Variables (All Modes)

```bash
# .env
PORT=8080
DATABASE_URL=postgresql://user:pass@localhost/flexgate
REDIS_URL=redis://localhost:6379
NODE_ENV=production
LOG_LEVEL=info
```

---

## What Happens After Installation?

### Simple Mode
```bash
npm install flexgate-proxy
# ✅ Package installed
# ✅ CLI available: npx flexgate
# ❌ No automatic setup
# ❌ No services started

npx flexgate start
# ✅ Gateway starts on port 8080
# ❌ No database (in-memory only)
# ❌ No metrics
```

### Standard Mode
```bash
npm install flexgate-proxy
npx flexgate init
# ✅ Creates flexgate.config.yml
# ✅ Creates .env
# ✅ Creates podman-compose.dev.yml
# ❌ Services NOT automatically started

npm run db:start
# ✅ Starts PostgreSQL container
# ✅ Starts Redis container
# ❌ Gateway NOT started yet

npm run db:migrate
# ✅ Creates database tables

npm start
# ✅ Gateway starts on port 8080
# ✅ Connects to PostgreSQL
# ✅ Connects to Redis
# ✅ Admin UI available at /admin
```

### Production Mode
```bash
npm install flexgate-proxy
npx flexgate init --production
# ✅ Creates full config files
# ✅ Creates haproxy.cfg
# ✅ Creates prometheus.yml
# ✅ Creates podman-compose.yml
# ❌ Services NOT started

npm run podman:build
# ✅ Builds FlexGate container image

npm run podman:run
# ✅ Starts HAProxy (port 8080)
# ✅ Starts FlexGate x2 instances
# ✅ Starts PostgreSQL
# ✅ Starts Redis
# ✅ Starts Prometheus (port 9090)
# ✅ Starts Grafana (port 3001)
# ✅ All services connected and ready
```

---

## Developer Workflow

### First Time Setup

1. **Install FlexGate:**
   ```bash
   npm install flexgate-proxy --save
   ```

2. **Choose Your Mode:**
   ```bash
   # Simple (just run)
   npx flexgate start
   
   # Standard (with UI)
   npx flexgate init
   npm run db:start && npm run db:migrate && npm start
   
   # Production (full stack)
   npx flexgate init --production
   npm run podman:build && npm run podman:run
   ```

3. **Configure:**
   - **Simple**: Edit code
   - **Standard/Production**: Use Admin UI at http://localhost:8080/admin

4. **Add Routes:**
   - **Via UI**: Go to Routes → Add Route
   - **Via Config**: Edit `flexgate.config.yml`
   - **Via Code**: Update gateway initialization

5. **Test:**
   ```bash
   curl http://localhost:8080/api/test
   ```

6. **Monitor (Production only):**
   - Grafana: http://localhost:3001
   - Prometheus: http://localhost:9090
   - HAProxy Stats: http://localhost:8404

### Day-to-Day Development

```bash
# Start services
npm run db:start         # Standard mode
npm run podman:run       # Production mode

# Start gateway
npm run dev              # With hot reload

# Make changes in Admin UI
# → Open http://localhost:8080/admin
# → Navigate to Routes
# → Edit route configuration
# → Save (persists to database)

# Or edit YAML
# → Edit flexgate.config.yml
# → Restart: npm run dev

# View logs
npm run dev              # See console
podman logs flexgate-app-1  # Production mode

# Stop services
npm run db:stop          # Standard mode
npm run podman:stop      # Production mode
```

---

## Summary

### For Developers Using FlexGate:

**Q: Do I need to configure HAProxy, Prometheus, Grafana manually?**

**A: No!** It depends on the mode:

- **Simple Mode**: Nothing to configure - just run `npx flexgate start`
- **Standard Mode**: `npx flexgate init` creates all configs, then use Admin UI
- **Production Mode**: `npx flexgate init --production` creates everything, then configure via Admin UI

### Configuration is Done Via:

1. **Admin UI** (Easiest) - Visual configuration at http://localhost:8080/admin
2. **YAML Files** - Edit `flexgate.config.yml` 
3. **Code** - Programmatic configuration in your app
4. **Environment Variables** - `.env` file

### What Starts Automatically:

- **Simple**: Only FlexGate gateway
- **Standard**: You manually start DB + Redis, then FlexGate
- **Production**: `npm run podman:run` starts everything (HAProxy, FlexGate x2, PostgreSQL, Redis, Prometheus, Grafana)

### Where to Configure:

**Don't edit** `haproxy.cfg`, `prometheus.yml` directly - these are generated.

**Do configure** via:
- Admin UI Settings page (recommended)
- `flexgate.config.yml` (version control friendly)
- Environment variables in `.env`

The beauty of FlexGate is you get all the power of HAProxy + Prometheus + Grafana **without manually configuring them**! 🎉
