# Quick Start Guide

Get the proxy server running in 5 minutes.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Docker** (optional, for full stack)

## 1. Install Dependencies

```bash
npm install
```

## 2. Start the Proxy

### Option A: Standalone (Simplest)
```bash
npm start
```

The proxy will start on `http://localhost:3000`

### Option B: Development Mode (Auto-reload)
```bash
npm run dev
```

### Option C: Full Stack with Docker (Recommended)
```bash
docker-compose up -d
```

This starts:
- Proxy server on port 3000
- Redis on port 6379
- Prometheus on port 9090
- Grafana on port 3001

## 3. Test It

```bash
# Health check
curl http://localhost:3000/health/live

# Test proxy (httpbin.org)
curl http://localhost:3000/httpbin/get

# Test proxy (jsonplaceholder)
curl http://localhost:3000/api/users/1

# View metrics
curl http://localhost:3000/metrics
```

## 4. View Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

## 5. Configure

Edit `config/proxy.yml` to customize:

```yaml
upstreams:
  - name: "my-api"
    url: "https://api.myservice.com"
    timeout: 5000

routes:
  - path: "/my-api/*"
    upstream: "my-api"
    rateLimit:
      max: 100
      windowMs: 60000
```

Hot reload:
```bash
# Send SIGHUP to reload config
kill -HUP $(pgrep -f "node.*www")
```

## Troubleshooting

### Port 3000 already in use
```bash
# Change port in config/proxy.yml or environment
PORT=4000 npm start
```

### Redis connection failed
```bash
# Install Redis
brew install redis  # macOS
sudo apt-get install redis  # Linux

# Or run in Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Proxy returns 404
Check that:
1. Route is configured in `config/proxy.yml`
2. Upstream host is in `allowedHosts` list
3. Path matches route pattern

## Next Steps

- Read [README.md](README.md) for full documentation
- Check [docs/](docs/) for deep dives
- Run benchmarks: `npm run benchmark`
- Deploy to Kubernetes: `npm run k8s:deploy`

## Common Commands

```bash
# Development
npm run dev              # Start with auto-reload
npm run lint             # Check code style
npm run lint:fix         # Fix code style issues

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode

# Production
npm start                # Start server
npm run benchmark        # Run performance tests

# Docker
npm run docker:build     # Build image
npm run docker:run       # Run full stack
npm run docker:stop      # Stop all containers

# Kubernetes
npm run k8s:deploy       # Deploy to k8s
npm run k8s:delete       # Remove from k8s
```

## Getting Help

- **Issues**: https://github.com/tapas100/proxy-server/issues
- **Docs**: https://github.com/tapas100/proxy-server/tree/main/docs
- **Examples**: See `config/proxy.yml` for annotated config

---

**Happy proxying! 🚀**
