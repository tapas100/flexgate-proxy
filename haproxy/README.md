# HAProxy High-Performance Setup for FlexGate

## 🚀 Overview

This setup uses **HAProxy as the data plane** (handling >10K req/sec) with **FlexGate Node.js as the control plane** (managing configuration).

### Architecture

```
Client Requests (>10K req/sec)
        │
        ▼
┌────────────────────────┐
│      HAProxy           │  ◄─── Configuration Updates
│   (Data Plane)         │
│  - Rate Limiting       │
│  - Circuit Breaker     │
│  - Load Balancing      │
└──────────┬─────────────┘
           │
           ▼
┌──────────────────────────┐
│  FlexGate App Instances  │
│  (Control Plane)         │
│  - Admin UI              │       ┌─────────────┐
│  - Config Generation     │──────►│ PostgreSQL  │
│  - Metrics Collection    │       └─────────────┘
└──────────────────────────┘
```

---

## 📦 What's Included

1. **HAProxy Configuration** (`haproxy/haproxy.cfg`)
   - Optimized for >10K req/sec
   - Rate limiting: 1000 req/10s per IP
   - Circuit breaker with health checks
   - Custom error pages

2. **Docker Compose** (`docker-compose.haproxy.yml`)
   - HAProxy container
   - 2x FlexGate app instances
   - PostgreSQL, Redis, Prometheus, Grafana

3. **Dynamic Config Generator** (`src/haproxy/configGenerator.ts`)
   - Generates HAProxy config from database
   - Validates and reloads HAProxy
   - Zero-downtime updates

---

## 🎯 Performance Specs

### HAProxy Configuration
- **Max Connections**: 50,000 concurrent
- **Threads**: 4 (adjust based on CPU cores)
- **Rate Limit**: 10,000 req/sec total (1000/IP)
- **Circuit Breaker**: 
  - Health check every 2s
  - 3 failures → mark server DOWN
  - 2 successes → mark server UP
  - Auto-retry after 10s

### Expected Performance
- **Throughput**: >10,000 req/sec
- **Latency**: <5ms (HAProxy overhead)
- **Memory**: ~500MB HAProxy + 512MB per app instance
- **CPU**: ~2 cores HAProxy + 1 core per app instance

---

## 🚀 Quick Start

### Option 1: Podman Compose (Recommended)

```bash
# Install podman-compose
pip3 install podman-compose

# Start the entire stack
podman-compose up -d

# Check HAProxy stats
open http://localhost:8404/stats
# Login: admin / changeme

# Access API through HAProxy
curl http://localhost:8080/api/routes

# View logs
podman-compose logs -f haproxy
```

**📘 For detailed Podman setup, see [PODMAN_SETUP.md](PODMAN_SETUP.md)**

### Option 2: Manual Setup

```bash
# 1. Install HAProxy
brew install haproxy  # macOS
# or
sudo apt-get install haproxy  # Ubuntu

# 2. Copy configuration
sudo cp haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo cp haproxy/errors/* /etc/haproxy/errors/

# 3. Validate config
haproxy -c -f /etc/haproxy/haproxy.cfg

# 4. Start HAProxy
sudo systemctl start haproxy
# or
haproxy -f /etc/haproxy/haproxy.cfg

# 5. Start FlexGate apps
PORT=3000 npm start &
PORT=3001 npm start &
```

---

## 📊 Monitoring

### HAProxy Stats Page

Access: http://localhost:8404/stats

**What you can see:**
- Real-time request rate
- Backend server health (UP/DOWN)
- Active connections
- Error rates
- Circuit breaker status

### Prometheus Metrics

Access: http://localhost:9090

**HAProxy exports metrics:**
- `haproxy_frontend_http_requests_total`
- `haproxy_backend_up`
- `haproxy_server_check_failures_total`

### Grafana Dashboard

Access: http://localhost:3001

Login: admin / admin

**Pre-built dashboards:**
- Request rate over time
- Error rate trends
- Circuit breaker events
- Backend health status

---

## 🔧 Configuration

### Rate Limiting

Edit `haproxy/haproxy.cfg`:

```haproxy
# Global rate limit (all IPs combined)
http-request deny deny_status 429 if { sc_http_req_rate(0) gt 10000 }

# Per-IP rate limit
stick-table type ip size 100k expire 30s store http_req_rate(10s)
acl rate_abuse sc_http_req_rate(0) gt 1000
http-request deny deny_status 429 if rate_abuse
```

**Adjust:**
- `10000` - Total requests per 10s
- `1000` - Requests per IP per 10s
- `expire 30s` - How long to track IPs

### Circuit Breaker

Edit backend server settings:

```haproxy
server api1 127.0.0.1:3000 check inter 2s rise 2 fall 3 maxconn 1000
```

**Parameters:**
- `inter 2s` - Check every 2 seconds
- `rise 2` - 2 successful checks → UP
- `fall 3` - 3 failed checks → DOWN
- `maxconn 1000` - Max connections per server

### Health Check

```haproxy
option httpchk GET /health HTTP/1.1\r\nHost:\ localhost
http-check expect status 200
```

**Customize:**
- `/health` - Health check endpoint
- `200` - Expected status code

---

## 🔄 Dynamic Configuration Updates

### Using the Config Generator

```typescript
import haproxyConfig from './src/haproxy/configGenerator';

// Generate config from database
const config = await haproxyConfig.generateConfig();

// Validate config
const isValid = await haproxyConfig.validateConfig();

// Reload HAProxy (zero-downtime)
await haproxyConfig.reloadHAProxy();

// Or do all in one step
await haproxyConfig.update();
```

### API Endpoint for Config Reload

```bash
# Trigger HAProxy config reload
curl -X POST http://localhost:3000/api/admin/haproxy/reload \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🧪 Testing

### Load Testing with Artillery

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery quick --count 100 --num 1000 http://localhost:8080/api/health

# Expected output:
# - Scenarios launched: 100000
# - RPS: 10000+
# - p95 latency: <10ms
```

### Test Rate Limiting

```bash
# Trigger rate limit (>1000 req in 10s)
for i in {1..1500}; do
  curl http://localhost:8080/api/test &
done

# Should see 429 responses after 1000 requests
```

### Test Circuit Breaker

```bash
# 1. Stop backend servers
docker-compose -f docker-compose.haproxy.yml stop flexgate-app-1 flexgate-app-2

# 2. Send requests (should fail fast with 503)
curl http://localhost:8080/api/test

# 3. Check HAProxy stats
open http://localhost:8404/stats
# Servers should show "DOWN" in red

# 4. Restart servers
docker-compose -f docker-compose.haproxy.yml start flexgate-app-1 flexgate-app-2

# 5. Wait for circuit to close (~4-6 seconds)
# Servers should show "UP" in green
```

---

## 🔐 Production Checklist

- [ ] Change HAProxy stats password (`stats auth admin:changeme`)
- [ ] Enable TLS/SSL (`bind *:8443 ssl crt /path/to/cert.pem`)
- [ ] Tune `maxconn` based on load testing
- [ ] Adjust thread count (`nbthread`) to match CPU cores
- [ ] Set up log shipping (Filebeat/Fluentd)
- [ ] Configure Prometheus alerting
- [ ] Set up HAProxy runtime API for live updates
- [ ] Enable HAProxy Dataplane API for advanced management
- [ ] Implement proper backup servers
- [ ] Configure sticky sessions if needed

---

## 📈 Scaling Guidelines

### Horizontal Scaling

**Add more backend servers:**

```haproxy
backend backend_api
    server api1 10.0.1.1:3000 check ...
    server api2 10.0.1.2:3000 check ...
    server api3 10.0.1.3:3000 check ...  # Add more
    server api4 10.0.1.4:3000 check ...
```

### Vertical Scaling

**Increase HAProxy resources:**

```yaml
# docker-compose.haproxy.yml
deploy:
  resources:
    limits:
      cpus: '4'      # Increase CPUs
      memory: 2G     # Increase memory
```

**Tune configuration:**

```haproxy
global
    maxconn 100000    # Increase max connections
    nbthread 8        # Match CPU cores
```

---

## 🐛 Troubleshooting

### High Latency

```bash
# Check HAProxy stats
curl http://localhost:8404/stats

# Look for:
# - Queue time (Qtime) - should be 0
# - Backend connect time - should be <5ms
# - Total time - should be <50ms
```

**Fix:**
- Increase backend server count
- Tune `maxconn` per server
- Check database connection pool

### Rate Limiting Too Aggressive

**Symptoms:** Too many 429 errors

**Fix:**
- Increase limits in `haproxy.cfg`
- Adjust window size
- Implement per-user tokens

### Circuit Breaker Flapping

**Symptoms:** Servers constantly UP/DOWN

**Fix:**
- Increase `rise` parameter (need more successes)
- Decrease `fall` parameter (allow more failures)
- Increase health check interval

---

## 📚 Resources

- [HAProxy Documentation](http://www.haproxy.org/documentation.html)
- [HAProxy Best Practices](https://www.haproxy.com/blog/haproxy-best-practice-tuning-your-system/)
- [Stick Tables Guide](https://www.haproxy.com/blog/introduction-to-haproxy-stick-tables/)
- [Circuit Breaker Pattern](https://www.haproxy.com/blog/circuit-breaking-haproxy/)

---

## 🎯 Next Steps

1. **Deploy to production**
   ```bash
   docker-compose -f docker-compose.haproxy.yml up -d
   ```

2. **Set up monitoring alerts**
   - Configure Prometheus AlertManager
   - Set up PagerDuty/Slack notifications

3. **Remove custom Node.js rate limiter**
   - HAProxy handles it now
   - Remove `src/rateLimiter.ts` usage
   - Remove `src/circuitBreaker.ts` usage

4. **Optimize for your workload**
   - Run load tests
   - Tune configuration based on metrics
   - Adjust rate limits and circuit breaker thresholds

---

**Made with ❤️ for high-performance API gateways**
