# FlexGate Quickstart Guide

Get up and running with FlexGate in under 5 minutes.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **PostgreSQL** 15.x or higher ([Download](https://www.postgresql.org/download/))
- **Redis** 7.x or higher (Optional, for session management)

## Installation

### Option 1: NPM (Recommended for Quick Start)

```bash
# Install FlexGate globally
npm install -g flexgate-proxy

# Or add to your project
npm install flexgate-proxy
```

### Option 2: Podman/Docker (Recommended for Production)

```bash
# Clone the repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start all services with Podman
make start

# Or if you don't have make installed
~/Library/Python/3.9/bin/podman-compose up -d
```

## Your First API Gateway

### 1. Initialize FlexGate

```bash
# Create a new FlexGate project
mkdir my-gateway
cd my-gateway

# Initialize configuration
flexgate init
```

This creates:
```
my-gateway/
├── config/
│   └── proxy.yml          # Gateway configuration
├── .env                    # Environment variables
└── flexgate.config.js      # Advanced configuration
```

### 2. Configure Your First Route

Edit `config/proxy.yml`:

```yaml
version: 1.0.0
routes:
  - path: /api/users
    upstream: https://jsonplaceholder.typicode.com/users
    methods:
      - GET
      - POST
    enabled: true
    rateLimit:
      enabled: true
      max: 100
      windowMs: 60000  # 1 minute
```

### 3. Start the Gateway

```bash
# Start FlexGate
flexgate start

# Or with npm
npm start
```

You should see:
```
✅ FlexGate started successfully!
🌐 Gateway running on http://localhost:3000
📊 Admin UI available at http://localhost:3000/admin
📈 Metrics endpoint: http://localhost:3000/metrics
```

### 4. Test Your API Gateway

```bash
# Test the proxied endpoint
curl http://localhost:3000/api/users

# You should see the response from jsonplaceholder.typicode.com
```

### 5. Open the Admin UI

Navigate to: **http://localhost:3000/admin**

**Default Credentials:**
- Username: `admin`
- Password: `admin` (Change this immediately!)

## What's Next?

Now that you have FlexGate running, explore these guides:

- [**Admin UI Guide**](../admin-ui/overview.md) - Configure routes, view metrics, manage settings
- [**Route Configuration**](../configuration/routes.md) - Advanced routing and load balancing
- [**Authentication & Security**](../security/authentication.md) - Secure your gateway
- [**Monitoring & Metrics**](../observability/metrics.md) - Set up monitoring
- [**Production Deployment**](../deployment/production.md) - Deploy to production

## Common Issues

### Port Already in Use

If port 3000 is already in use:

```bash
# Set a custom port
PORT=8080 flexgate start
```

Or update `.env`:
```
PORT=8080
```

### Database Connection Failed

FlexGate runs in-memory mode if database is unavailable, but for persistence:

```bash
# Create PostgreSQL database
createdb flexgate

# Update DATABASE_URL in .env
DATABASE_URL=postgresql://user:password@localhost:5432/flexgate
```

### Admin UI Not Loading

1. Check FlexGate is running: `curl http://localhost:3000/health`
2. Clear browser cache
3. Check console for errors (F12)
4. Verify `ADMIN_ENABLED=true` in `.env`

## Getting Help

- 📚 [Full Documentation](../README.md)
- 💬 [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions)
- 🐛 [Report Issues](https://github.com/tapas100/flexgate-proxy/issues)
- 💼 [Commercial Support](mailto:support@flexgate.io)

---

**Next Steps:** [Configure Your First Route →](../admin-ui/routes.md)
