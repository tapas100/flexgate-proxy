# Webhook Event Testing Guide

## Quick Reference: How to Trigger Each Event

### ✅ Proxy Request Events

#### 1. `proxy.request_started`
```bash
curl http://localhost:3000/httpbin/get
```
**Triggered when**: Any request starts being proxied

---

#### 2. `proxy.request_completed`
```bash
curl http://localhost:3000/httpbin/get
```
**Triggered when**: Proxy request completes successfully

---

#### 3. `proxy.request_failed`
```bash
# Method 1: Invalid upstream
curl http://localhost:3000/test-api/nonexistent --max-time 3

# Method 2: Timeout
curl http://localhost:3000/httpbin/delay/10 --max-time 2
```
**Triggered when**: Proxy request fails (timeout, unreachable, error)

---

### ⚡ Circuit Breaker Events

#### 4. `circuit_breaker.opened`
```bash
# Make 10+ rapid failed requests
for i in {1..15}; do
  curl http://localhost:3000/test-api/fail --max-time 1 2>&1 | grep -q "error" && echo "Failed $i"
done
```
**Triggered when**: Circuit breaker opens due to too many failures

---

#### 5. `circuit_breaker.half_open`
```bash
# After circuit opens, wait for timeout (default: 60s)
# Circuit automatically transitions to half_open
sleep 65
curl http://localhost:3000/httpbin/get
```
**Triggered when**: Circuit breaker enters half-open state after timeout

---

#### 6. `circuit_breaker.closed`
```bash
# Make successful request while in half_open state
curl http://localhost:3000/httpbin/get
```
**Triggered when**: Circuit breaker closes after successful request in half_open

---

### 🚦 Rate Limit Events

**⚠️ Requires rate limiting to be enabled in config**

#### Enable Rate Limiting First:
Edit `config/proxy.yml`:
```yaml
rate_limit:
  enabled: true
  default:
    max: 5
    window: 60000  # 1 minute
    approaching_threshold: 0.8  # Trigger at 80% (4 requests)
```

#### 7. `rate_limit.approaching`
```bash
# Make requests approaching the limit (4 out of 5)
for i in {1..4}; do
  curl http://localhost:3000/httpbin/get
  sleep 1
done
```
**Triggered when**: Request count reaches 80% of limit (configurable)

---

#### 8. `rate_limit.exceeded`
```bash
# Make requests exceeding the limit (6 out of 5)
for i in {1..6}; do
  curl http://localhost:3000/httpbin/get
  sleep 1
done
```
**Triggered when**: Request count exceeds the limit

---

### 🏥 Health Check Events

**⚠️ Requires health check configuration**

#### Configure Health Checks:
Add to your route in `config/proxy.yml`:
```yaml
routes:
  - id: httpbin
    path: /httpbin/*
    upstream:
      id: httpbin
      url: https://httpbin.org
      health_check:
        enabled: true
        path: /status/200
        interval: 10000  # Check every 10 seconds
        timeout: 5000
        healthy_threshold: 2
        unhealthy_threshold: 3
```

#### 9. `health.check_failed`
```bash
# Method 1: Stop backend service (if you control it)
# Method 2: Block access to backend
sudo iptables -A OUTPUT -d httpbin.org -j DROP

# Method 3: Point to invalid health check endpoint
# Edit route health_check.path to /status/500
```
**Triggered when**: Backend health check fails N times (unhealthy_threshold)

---

#### 10. `health.check_recovered`
```bash
# Restore backend access
sudo iptables -D OUTPUT -d httpbin.org -j DROP

# Or restart backend service
```
**Triggered when**: Backend health check succeeds N times after failure (healthy_threshold)

---

### ⚙️ Config Events

#### 11. `config.updated`
```bash
# Method 1: Create route via API
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "test-route-'$(date +%s)'",
    "path": "/test/*",
    "target": "https://httpbin.org",
    "enabled": true
  }'

# Method 2: Update route via API
curl -X PUT http://localhost:3000/api/routes/test-route-123 \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Method 3: Delete route via API
curl -X DELETE http://localhost:3000/api/routes/test-route-123
```
**Triggered when**: Configuration changes (route created/updated/deleted)

---

#### 12. `config.validation_failed`
```bash
# Send invalid configuration
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "",
    "path": "",
    "target": "not-a-valid-url"
  }'
```
**Triggered when**: Configuration validation fails

---

## Testing Workflow

### 1. Start Webhook Receiver
```bash
cd webhook-receiver
node server.js
```

### 2. Create Webhooks for Different Events

#### Proxy Events Webhook:
```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Proxy Events",
    "url": "http://localhost:4000/webhook",
    "events": [
      "proxy.request_started",
      "proxy.request_completed",
      "proxy.request_failed"
    ],
    "enabled": true,
    "retry_count": 3,
    "retry_delay": 1000
  }'
```

#### Circuit Breaker Webhook:
```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Circuit Breaker Events",
    "url": "http://localhost:4000/webhook",
    "events": [
      "circuit_breaker.opened",
      "circuit_breaker.closed",
      "circuit_breaker.half_open"
    ],
    "enabled": true,
    "retry_count": 3,
    "retry_delay": 1000
  }'
```

### 3. Run Automated Tests
```bash
cd scripts/testing
node test-all-events.js
```

### 4. Check Results

#### In Webhook Receiver:
```
http://localhost:4000
```

#### In Admin UI:
```
http://localhost:3001/webhooks
```

#### In Database:
```bash
psql -d flexgate -c "
  SELECT 
    webhook_id, 
    event_type, 
    status, 
    COUNT(*) as deliveries,
    MAX(created_at) as last_delivery
  FROM webhook_deliveries
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY webhook_id, event_type, status
  ORDER BY event_type, status;
"
```

---

## Troubleshooting

### No Deliveries Showing Up?

1. **Check webhook is enabled**:
   ```bash
   curl http://localhost:3000/api/webhooks | jq '.data[] | select(.enabled == true)'
   ```

2. **Check webhook receiver is running**:
   ```bash
   curl http://localhost:4000/health
   ```

3. **Check database for deliveries**:
   ```bash
   psql -d flexgate -c "SELECT COUNT(*) FROM webhook_deliveries;"
   ```

4. **Check server logs**:
   ```bash
   tail -f logs/combined.log | grep -i webhook
   ```

### Events Not Being Triggered?

- **Circuit Breaker**: Make sure failure threshold is configured
- **Rate Limit**: Must be enabled in config
- **Health Checks**: Must be configured per route
- **Config Events**: Use API endpoints, not manual file edits

---

## Event Frequency Reference

| Event | How Often It Triggers |
|-------|----------------------|
| `proxy.request_started` | Every proxy request |
| `proxy.request_completed` | Every successful proxy request |
| `proxy.request_failed` | When proxy request fails |
| `circuit_breaker.opened` | When failure threshold exceeded |
| `circuit_breaker.half_open` | After circuit breaker timeout |
| `circuit_breaker.closed` | After successful request in half_open |
| `rate_limit.approaching` | When approaching rate limit threshold |
| `rate_limit.exceeded` | When rate limit exceeded |
| `health.check_failed` | When backend fails health checks |
| `health.check_recovered` | When backend recovers |
| `config.updated` | On configuration changes |
| `config.validation_failed` | On invalid configuration |

---

## Next Steps

1. **Enable Rate Limiting**: Uncomment rate limit config to test those events
2. **Configure Health Checks**: Add health check config to routes
3. **Create Event-Specific Webhooks**: Subscribe to specific events you care about
4. **Set Up Multiple Channels**: Try Slack, Teams, WhatsApp delivery (coming soon)
5. **Monitor Statistics**: Use `/api/webhooks/:id/stats` to track success rates

---

## Database Queries for Analysis

### Delivery Success Rate by Event:
```sql
SELECT 
  event_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM webhook_deliveries
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY total DESC;
```

### Deliveries in Last Hour:
```sql
SELECT 
  event_type,
  status,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM webhook_deliveries
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type, status
ORDER BY latest DESC;
```

### Failed Deliveries:
```sql
SELECT 
  delivery_id,
  webhook_id,
  event_type,
  attempts,
  error,
  created_at
FROM webhook_deliveries
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```
