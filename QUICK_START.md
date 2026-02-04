# 🚀 FlexGate - Quick Start Guide

> Production-grade API Gateway in 5 minutes

---

## 📦 Installation

```bash
npm install flexgate-proxy
```

Or globally for CLI access:

```bash
npm install -g flexgate-proxy
```

---

## ⚡ Quick Start (3 Methods)

### Method 1: Zero-Config CLI (Fastest)

```bash
# Start with defaults (port 8080)
npx flexgate start

# Start with custom port
npx flexgate start --port 3000

# Start with config file
npx flexgate start --config ./config.yml
```

**Access**:
- API Gateway: http://localhost:8080
- Admin UI: http://localhost:8080/admin
- Metrics: http://localhost:8080/metrics

---

### Method 2: Programmatic (Most Flexible)

```typescript
import { FlexGate } from 'flexgate-proxy';

// Create instance
const gateway = new FlexGate({
  port: 8080,
  upstreams: [
    {
      id: 'my-api',
      name: 'My API Service',
      target: 'http://localhost:3000',
      routes: ['/api'],
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: 30000
      }
    }
  ],
  rateLimiting: {
    enabled: true,
    windowMs: 60000,  // 1 minute
    max: 100          // 100 requests per minute
  }
});

// Start the gateway
await gateway.start();

console.log('✅ FlexGate running on port 8080');
```

---

### Method 3: Express Middleware (Integrate with Existing Apps)

```typescript
import express from 'express';
import { flexgateMiddleware } from 'flexgate-proxy';

const app = express();

// Add FlexGate as middleware
app.use('/gateway', flexgateMiddleware({
  upstreams: [
    {
      id: 'backend',
      target: 'http://localhost:4000',
      routes: ['/api']
    }
  ],
  rateLimiting: { enabled: true }
}));

// Your existing routes
app.get('/', (req, res) => {
  res.send('My App + FlexGate');
});

app.listen(3000);
```

---

## 🔧 Configuration

### Generate Default Config

```bash
npx flexgate init
```

This creates `flexgate.config.yml`:

```yaml
server:
  port: 8080
  host: '0.0.0.0'

upstreams:
  - id: example-api
    name: Example API
    target: http://localhost:3000
    routes:
      - /api
    healthCheck:
      enabled: true
      path: /health
      interval: 30000

rateLimiting:
  enabled: true
  windowMs: 60000
  max: 100

circuitBreaker:
  enabled: true
  threshold: 50
  timeout: 30000

database:
  enabled: true
  url: postgresql://user:password@localhost:5432/flexgate

monitoring:
  enabled: true
  prometheusPort: 9090
```

### Environment Variables

```bash
# Server
PORT=8080
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/flexgate

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# NATS (for events)
NATS_URL=nats://localhost:4222
```

---

## 📋 Common Use Cases

### 1. Simple Reverse Proxy

```typescript
import { FlexGate } from 'flexgate-proxy';

const gateway = new FlexGate({
  upstreams: [
    {
      id: 'backend',
      target: 'http://localhost:3000',
      routes: ['/']
    }
  ]
});

await gateway.start();
```

Requests to `http://localhost:8080/*` → `http://localhost:3000/*`

---

### 2. Multiple Upstreams

```typescript
const gateway = new FlexGate({
  upstreams: [
    {
      id: 'users-api',
      target: 'http://localhost:3001',
      routes: ['/api/users']
    },
    {
      id: 'products-api',
      target: 'http://localhost:3002',
      routes: ['/api/products']
    },
    {
      id: 'orders-api',
      target: 'http://localhost:3003',
      routes: ['/api/orders']
    }
  ]
});
```

**Routing**:
- `/api/users/*` → `http://localhost:3001/api/users/*`
- `/api/products/*` → `http://localhost:3002/api/products/*`
- `/api/orders/*` → `http://localhost:3003/api/orders/*`

---

### 3. Rate Limiting

```typescript
const gateway = new FlexGate({
  upstreams: [/* ... */],
  
  rateLimiting: {
    enabled: true,
    windowMs: 60000,        // 1 minute window
    max: 100,               // 100 requests per window
    message: 'Too many requests, please try again later',
    
    // Per-route limits
    routes: {
      '/api/heavy': { max: 10 },
      '/api/light': { max: 1000 }
    }
  }
});
```

---

### 4. Circuit Breaker

```typescript
const gateway = new FlexGate({
  upstreams: [{
    id: 'unstable-api',
    target: 'http://unstable-service:3000',
    routes: ['/api'],
    
    circuitBreaker: {
      enabled: true,
      threshold: 50,        // Open after 50% failures
      timeout: 30000,       // Try again after 30s
      resetTimeout: 10000   // Close after 10s of success
    }
  }]
});
```

---

### 5. Health Checks

```typescript
const gateway = new FlexGate({
  upstreams: [{
    id: 'backend',
    target: 'http://localhost:3000',
    routes: ['/api'],
    
    healthCheck: {
      enabled: true,
      path: '/health',
      interval: 30000,      // Check every 30s
      timeout: 5000,        // Timeout after 5s
      unhealthyThreshold: 3 // Mark unhealthy after 3 failures
    }
  }]
});

// Listen to health events
gateway.on('upstream:health:failed', (upstream) => {
  console.error(`❌ ${upstream.name} is unhealthy`);
});

gateway.on('upstream:health:recovered', (upstream) => {
  console.log(`✅ ${upstream.name} recovered`);
});
```

---

## 🗄️ Database Setup

### Using PostgreSQL

```bash
# 1. Create database
createdb flexgate

# 2. Run migrations
npx flexgate migrate

# 3. Start with database enabled
npx flexgate start --database
```

### Using SQLite (Development)

```typescript
const gateway = new FlexGate({
  database: {
    enabled: true,
    type: 'sqlite',
    filename: './flexgate.db'
  }
});
```

---

## 📊 Monitoring & Observability

### Prometheus Metrics

```typescript
const gateway = new FlexGate({
  monitoring: {
    enabled: true,
    prometheusPort: 9090
  }
});

// Metrics available at http://localhost:9090/metrics
```

**Available Metrics**:
- `http_requests_total` - Total requests
- `http_request_duration_seconds` - Request latency
- `http_requests_errors_total` - Error count
- `circuit_breaker_state` - Circuit breaker status
- `rate_limit_exceeded_total` - Rate limit hits

### Custom Events

```typescript
gateway.on('request:received', (req) => {
  console.log(`📥 ${req.method} ${req.path}`);
});

gateway.on('request:completed', (req, res, duration) => {
  console.log(`✅ ${req.path} - ${res.statusCode} - ${duration}ms`);
});

gateway.on('error', (error) => {
  console.error(`❌ Error:`, error);
});
```

---

## 🔌 Webhooks

```typescript
const gateway = new FlexGate({
  webhooks: {
    enabled: true,
    endpoints: [
      {
        id: 'slack-alerts',
        url: 'https://hooks.slack.com/services/XXX',
        events: [
          'upstream:health:failed',
          'circuit_breaker:opened',
          'rate_limit:exceeded'
        ]
      }
    ]
  }
});
```

---

## 🐳 Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 8080

CMD ["npx", "flexgate", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  flexgate:
    image: node:20-alpine
    command: npx flexgate start
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/flexgate
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: flexgate
      POSTGRES_PASSWORD: password

  redis:
    image: redis:7-alpine
```

Run:
```bash
docker-compose up
```

---

## 🧪 Testing

```typescript
import { FlexGate } from 'flexgate-proxy';
import request from 'supertest';

describe('FlexGate', () => {
  let gateway: FlexGate;

  beforeAll(async () => {
    gateway = new FlexGate({ port: 8081 });
    await gateway.start();
  });

  afterAll(async () => {
    await gateway.stop();
  });

  it('should proxy requests', async () => {
    const res = await request('http://localhost:8081')
      .get('/api/test')
      .expect(200);
    
    expect(res.body).toBeDefined();
  });
});
```

---

## 📚 API Reference

### FlexGate Class

```typescript
class FlexGate {
  constructor(config: FlexGateConfig);
  
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  
  on(event: string, handler: Function): void;
  emit(event: string, ...args: any[]): void;
  
  getUpstream(id: string): Upstream | null;
  addUpstream(upstream: Upstream): void;
  removeUpstream(id: string): void;
  
  getMetrics(): Metrics;
  healthCheck(): HealthStatus;
}
```

---

## 🆘 Troubleshooting

### Port Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill it
kill -9 <PID>

# Or use different port
npx flexgate start --port 3000
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Run migrations
npx flexgate migrate

# Check connection string
echo $DATABASE_URL
```

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 🎓 Next Steps

1. ✅ **Installation** - You're here!
2. 📖 **Configuration** - Read [Configuration Guide](./docs/configuration.md)
3. 🚀 **Deployment** - Read [Deployment Guide](./docs/deployment.md)
4. 📊 **Monitoring** - Set up [Observability](./docs/observability.md)
5. 🔒 **Security** - Review [Security Guide](./docs/security.md)

---

## 🤝 Support

- 📖 **Documentation**: https://github.com/tapas100/flexgate-proxy
- 🐛 **Issues**: https://github.com/tapas100/flexgate-proxy/issues
- 💬 **Discussions**: https://github.com/tapas100/flexgate-proxy/discussions
- 📧 **Email**: mahanta.tapas9@gmail.com

---

**Happy Proxying! 🚀**
