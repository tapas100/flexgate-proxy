# Getting Started

Get FlexGate up and running in under 5 minutes! This guide will walk you through installation, starting the gateway, and creating your first API route.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** (LTS recommended)
- **npm 9+** or **yarn 1.22+**
- **Podman** or **Docker** (for full stack deployment)
- **4GB RAM** minimum (8GB recommended)
- **macOS**, **Linux**, or **Windows** (WSL2)

### Quick Version Check

```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
podman --version  # Optional: for container deployment
```

## Installation Methods

Choose the installation method that works best for your use case:

### Method 1: NPM Global Install (Quickest)

Perfect for getting started quickly or single-node deployments:

```bash
# Install FlexGate globally
npm install -g flexgate-proxy

# Verify installation
flexgate --version

# Initialize configuration
flexgate init

# Start the gateway
flexgate start
```

The gateway will start on **http://localhost:3000** with the Admin UI available at **http://localhost:3000/admin**.

**Default Credentials:**
- Username: `admin`
- Password: `admin`

⚠️ **Change these immediately in production!**

### Method 2: NPM Local Install (Recommended for Projects)

Install FlexGate as part of your project:

```bash
# Create a new directory
mkdir my-api-gateway
cd my-api-gateway

# Initialize npm project
npm init -y

# Install FlexGate
npm install flexgate-proxy

# Create configuration file
npx flexgate init

# Add start script to package.json
npm pkg set scripts.start="flexgate start"

# Start the gateway
npm start
```

### Method 3: Podman/Docker Compose (Production)

Full stack deployment with all services (PostgreSQL, Redis, Prometheus, Grafana):

```bash
# Clone the repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start all services with Podman
make start
# OR with Docker
docker-compose up -d

# Check service status
make status
```

**Services Started:**
- FlexGate Gateway: http://localhost:3000
- Admin UI: http://localhost:3000/admin
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- NATS: localhost:4222

### Method 4: Build from Source

For contributors or advanced users:

```bash
# Clone repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start database
npm run db:start

# Run migrations
npm run migrate

# Start the gateway
npm run start:dev
```

## Initial Configuration

After installation, FlexGate creates a default configuration file:

**`config/proxy.yml`**

```yaml
# FlexGate Configuration
server:
  port: 3000
  host: 0.0.0.0
  
database:
  host: localhost
  port: 5432
  database: flexgate
  user: flexgate
  password: flexgate

redis:
  host: localhost
  port: 6379

security:
  jwtSecret: "CHANGE_THIS_SECRET_IN_PRODUCTION"
  sessionSecret: "CHANGE_THIS_TOO"

admin:
  enabled: true
  path: /admin
  username: admin
  password: admin  # ⚠️ Change immediately!

# Default routes (examples)
routes:
  - id: health-check
    path: /health
    upstream: http://localhost:3000/api/health
    methods: [GET]
    enabled: true
```

### Environment Variables

You can also configure FlexGate using environment variables:

```bash
# Server configuration
export FLEXGATE_PORT=3000
export FLEXGATE_HOST=0.0.0.0

# Database
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=flexgate
export DB_USER=flexgate
export DB_PASSWORD=your-secure-password

# Redis
export REDIS_HOST=localhost
export REDIS_PORT=6379

# Security
export JWT_SECRET=your-jwt-secret-here
export SESSION_SECRET=your-session-secret-here

# Admin UI
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your-admin-password
```

## Starting FlexGate

### Development Mode

Starts with hot reload and detailed logging:

```bash
flexgate start --dev
# OR
npm run start:dev
```

### Production Mode

Optimized for performance:

```bash
flexgate start --production
# OR
NODE_ENV=production flexgate start
```

### Custom Configuration

Specify a different config file:

```bash
flexgate start --config /path/to/config.yml
```

### Background Mode

Run as a daemon (Linux/macOS):

```bash
flexgate start --daemon
# OR using PM2
npm install -g pm2
pm2 start flexgate -- start
```

## Verify Installation

### 1. Check Health Endpoint

```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0-beta.1",
  "uptime": 123,
  "timestamp": "2026-02-09T10:30:00.000Z"
}
```

### 2. Access Admin UI

Open your browser and navigate to:

**http://localhost:3000/admin**

You should see the FlexGate Admin Dashboard:

![Admin UI Dashboard](../assets/admin-dashboard.png)

### 3. Check Metrics

View Prometheus metrics:

```bash
curl http://localhost:3000/metrics
```

**Expected Response:**
```
# HELP flexgate_requests_total Total number of requests
# TYPE flexgate_requests_total counter
flexgate_requests_total{method="GET",route="/health",status="200"} 1

# HELP flexgate_request_duration_seconds Request duration
# TYPE flexgate_request_duration_seconds histogram
...
```

### 4. Verify Database Connection

```bash
flexgate db:status
```

**Expected Output:**
```
✓ Database connected
✓ Migrations up to date
✓ Redis connected
```

## Create Your First Route

Let's create a simple route that proxies to a public API:

### Using the Admin UI

1. Navigate to **http://localhost:3000/admin**
2. Click **"Routes"** in the sidebar
3. Click **"Add Route"** button
4. Fill in the form:
   - **Path:** `/api/users`
   - **Upstream:** `https://jsonplaceholder.typicode.com/users`
   - **Methods:** `GET`
   - **Enabled:** ✓

5. Click **"Save"**

### Using the REST API

```bash
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "path": "/api/users",
    "upstream": "https://jsonplaceholder.typicode.com/users",
    "methods": ["GET"],
    "enabled": true
  }'
```

### Using Configuration File

Edit `config/proxy.yml`:

```yaml
routes:
  - id: users-api
    path: /api/users
    upstream: https://jsonplaceholder.typicode.com/users
    methods: [GET]
    enabled: true
    rateLimit:
      enabled: true
      max: 100
      windowMs: 60000  # 100 requests per minute
```

Reload configuration:

```bash
flexgate reload
# OR send SIGHUP signal
kill -HUP $(cat flexgate.pid)
```

### Test Your Route

```bash
curl http://localhost:3000/api/users
```

**Expected Response:**
```json
[
  {
    "id": 1,
    "name": "Leanne Graham",
    "username": "Bret",
    "email": "Sincere@april.biz",
    ...
  },
  ...
]
```

## Enable Rate Limiting

Protect your route with rate limiting:

### Via Admin UI

1. Go to **Routes** → **Edit Route** (`/api/users`)
2. Expand **"Rate Limiting"** section
3. Enable rate limiting
4. Set **Max Requests:** `100`
5. Set **Window (ms):** `60000` (1 minute)
6. Click **"Save"**

### Via API

```bash
curl -X PATCH http://localhost:3000/api/routes/users-api \
  -H "Content-Type: application/json" \
  -d '{
    "rateLimit": {
      "enabled": true,
      "max": 100,
      "windowMs": 60000
    }
  }'
```

### Test Rate Limiting

Send multiple requests quickly:

```bash
for i in {1..105}; do
  curl -w "%{http_code}\n" http://localhost:3000/api/users
  sleep 0.1
done
```

After 100 requests, you should see:
```
429
```

**Response Body:**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 42 seconds.",
  "retryAfter": 42
}
```

## Monitor Your Gateway

### Real-time Metrics in Admin UI

1. Navigate to **http://localhost:3000/admin/monitoring**
2. View live dashboards:
   - Request rate (req/sec)
   - Response times (p50, p95, p99)
   - Error rates
   - Active connections

### Prometheus Metrics

View raw metrics:

```bash
curl http://localhost:3000/metrics
```

### Grafana Dashboards

If using the full stack deployment:

1. Open **http://localhost:3001**
2. Login: `admin` / `admin`
3. Navigate to **Dashboards** → **FlexGate Overview**

## Common Issues

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:** Change the port in config or environment:

```bash
export FLEXGATE_PORT=3001
flexgate start
```

### Database Connection Failed

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Start PostgreSQL:

```bash
# Using Podman
make db:start

# Using Docker
docker run -d \
  -e POSTGRES_USER=flexgate \
  -e POSTGRES_PASSWORD=flexgate \
  -e POSTGRES_DB=flexgate \
  -p 5432:5432 \
  postgres:15

# Or install locally
brew install postgresql  # macOS
sudo apt install postgresql  # Ubuntu
```

### Admin UI Not Loading

**Check:**
1. Gateway is running: `curl http://localhost:3000/health`
2. Admin UI enabled in config: `admin.enabled: true`
3. Correct path: `http://localhost:3000/admin` (note the `/admin` path)
4. Browser console for errors (F12)

### JWT Secret Warning

```
Warning: Using default JWT secret in production is insecure
```

**Solution:** Generate a secure secret:

```bash
# Generate random secret
openssl rand -base64 32

# Set in config or environment
export JWT_SECRET="your-generated-secret"
```

## Next Steps

Now that FlexGate is running, explore these guides:

1. **[First Route Tutorial](./first-route.md)** - Detailed route configuration
2. **[Admin UI Overview](../admin-ui/overview.md)** - Master the web interface
3. **[Configuration Reference](../config/routes.md)** - Advanced routing options
4. **[Security Setup](../security/authentication.md)** - Secure your gateway
5. **[Production Deployment](../deployment/production.md)** - Deploy to production

## Quick Reference

### Common Commands

```bash
# Start gateway
flexgate start

# Start in development mode
flexgate start --dev

# Stop gateway
flexgate stop

# Reload configuration
flexgate reload

# Check status
flexgate status

# View logs
flexgate logs

# Run migrations
flexgate db:migrate

# Reset database
flexgate db:reset
```

### Default Ports

| Service | Port | URL |
|---------|------|-----|
| FlexGate | 3000 | http://localhost:3000 |
| Admin UI | 3000 | http://localhost:3000/admin |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3001 | http://localhost:3001 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |
| NATS | 4222 | localhost:4222 |

### File Locations

```
~/.flexgate/
├── config/
│   └── proxy.yml          # Main configuration
├── logs/
│   ├── combined.log       # All logs
│   └── error.log          # Error logs only
└── data/
    └── flexgate.db        # SQLite (if not using PostgreSQL)
```

---

**Congratulations!** 🎉 You've successfully installed and configured FlexGate. Start exploring the features and build your API infrastructure!
