# Quick Test Reference Card 🎯

**Quick guide for testing critical FlexGate features**  
**See [PRODUCTION_TESTING_PLAN.md](./PRODUCTION_TESTING_PLAN.md) for full details**

---

## 🚀 Quick Start Testing (5 minutes)

```bash
# 1. Start all services
./scripts/start-all-with-deps.sh

# 2. Verify health
curl http://localhost:8080/health
curl http://localhost:3000

# 3. Quick proxy test
curl http://localhost:8080/httpbin/get

# 4. Check Admin UI
# Open: http://localhost:3000
```

---

## 🔴 Circuit Breaker (10 minutes)

### Trigger OPEN State
```bash
# Cause 15 failures (timeouts)
for i in {1..15}; do
  curl -m 2 http://localhost:8080/httpbin/delay/10
  sleep 0.2
done

# Verify state is OPEN
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.state'
# Expected: "OPEN"

# Try request (should be rejected instantly)
time curl http://localhost:8080/httpbin/status/200
# Expected: < 0.2s response time
```

### Close Circuit
```bash
# Wait 30 seconds for HALF_OPEN
sleep 30

# Make 3 successful requests
for i in {1..3}; do
  curl http://localhost:8080/httpbin/status/200
  echo "Request $i: OK"
  sleep 1
done

# Verify CLOSED
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.state'
# Expected: "CLOSED"
```

---

## 🚦 Rate Limiter (5 minutes)

### Exceed Global Limit
```bash
# Make 110 requests (limit: 100/min)
success=0
limited=0

for i in {1..110}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/httpbin/get)
  [ "$status" = "200" ] && ((success++)) || ((limited++))
  sleep 0.05
done

echo "Success: $success, Rate Limited: $limited"
# Expected: ~100 success, ~10 limited
```

### Check Rate Limit Headers
```bash
curl -v http://localhost:8080/httpbin/get 2>&1 | grep -i ratelimit
# Expected:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: XX
```

---

## 🤖 AI Incidents (15 minutes)

### Complete Workflow
```bash
# 1. Create incident
INCIDENT=$(flexgate ai create \
  --type LATENCY_ANOMALY \
  --severity WARNING \
  --json | jq -r '.incident_id')
echo "Created: $INCIDENT"

# 2. Add recommendations
flexgate ai recommend $INCIDENT \
  --recommendations '[{
    "action_type":"RESTART_SERVICE",
    "reasoning":"Service restart clears memory",
    "confidence":0.9,
    "priority":1
  }]'

# 3. Get recommendation ID
REC_ID=$(flexgate ai show $INCIDENT --json | \
  jq -r '.recommendations[0].recommendation_id')

# 4. Record decision
flexgate ai decide $INCIDENT $REC_ID \
  --decision ACCEPTED \
  --action RESTART_SERVICE

# 5. Record outcome
flexgate ai outcome $INCIDENT \
  --action RESTART_SERVICE \
  --status RESOLVED \
  --improvement 90

# 6. Update status
flexgate ai update $INCIDENT \
  --status RESOLVED \
  --rating 5 \
  --feedback "Perfect!"

# 7. View analytics
flexgate ai analytics
```

---

## 💻 Admin UI (10 minutes)

### Navigation Check
1. Open: http://localhost:3000
2. Click each menu item:
   - ✅ Dashboard
   - ✅ Routes
   - ✅ Metrics
   - ✅ Logs
   - ✅ Webhooks
   - ✅ **AI Incidents** (top nav)
   - ✅ **AI Analytics** (top nav)

### Dashboard AI Stats
1. Navigate to Dashboard
2. Scroll to "AI Incident Tracking (Last 24h)"
3. Verify 4 cards display:
   - Total Incidents
   - Resolved Today
   - AI Acceptance Rate
   - Open Incidents
4. Click each card to test navigation

### Metrics AI Analytics
1. Navigate to Metrics
2. Change time range: 1h → 24h → 7d → 30d
3. Scroll to "AI-Powered Incident Management"
4. Verify stats update with time range
5. Click "View Full Analytics"

---

## 🔧 CLI Commands (5 minutes)

### All 10 Commands
```bash
# 1. List incidents
flexgate ai incidents --limit 5

# 2. Show detail
flexgate ai show evt_xxx

# 3. Create incident
flexgate ai create --type ERROR_SPIKE

# 4. Update incident
flexgate ai update evt_xxx --status INVESTIGATING

# 5. Add recommendations
flexgate ai recommend evt_xxx --recommendations '[...]'

# 6. Record decision
flexgate ai decide evt_xxx rec_xxx --decision ACCEPTED

# 7. Record outcome
flexgate ai outcome evt_xxx --action RESTART_SERVICE --status RESOLVED

# 8. View analytics
flexgate ai analytics --days 30

# 9. Export data
flexgate ai export --format json > data.json

# 10. Watch mode
flexgate ai watch --interval 30
```

---

## 🔌 Webhooks (5 minutes)

### Setup & Test
```bash
# 1. Get webhook.site URL
# Visit: https://webhook.site
# Copy your unique URL

# 2. Create webhook
curl -X POST http://localhost:8080/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Webhook",
    "url": "https://webhook.site/YOUR-ID",
    "events": ["circuit_breaker.opened", "ai_incident.created"],
    "enabled": true
  }'

# 3. Trigger event (create incident)
flexgate ai create

# 4. Check webhook.site for delivery

# 5. Verify in database
curl http://localhost:8080/api/webhooks/deliveries | jq '.[0]'
```

---

## 📊 Database Checks (2 minutes)

```bash
# Check all tables exist
psql -U flexgate -d flexgate_proxy -c "\dt"

# Count incidents
psql -U flexgate -d flexgate_proxy -c \
  "SELECT COUNT(*) FROM ai_incidents;"

# Recent incidents
psql -U flexgate -d flexgate_proxy -c \
  "SELECT incident_id, event_type, status FROM ai_incidents ORDER BY detected_at DESC LIMIT 5;"

# Webhook deliveries
psql -U flexgate -d flexgate_proxy -c \
  "SELECT webhook_id, event_type, response_code FROM webhook_deliveries ORDER BY created_at DESC LIMIT 5;"
```

---

## 🔒 Security Checks (3 minutes)

```bash
# SSRF protection
curl http://localhost:8080/proxy/169.254.169.254
# Expected: 403 Forbidden

curl http://localhost:8080/proxy/127.0.0.1
# Expected: 403 Forbidden

# Valid external should work
curl http://localhost:8080/httpbin/get
# Expected: 200 OK
```

---

## 📈 Metrics (2 minutes)

```bash
# Prometheus metrics
curl http://localhost:8080/metrics | grep -E "circuit_breaker|rate_limit|ai_incidents"

# Expected metrics:
# - circuit_breaker_state
# - circuit_breaker_failures_total
# - circuit_breaker_successes_total
# - rate_limit_requests_rejected
# - ai_incidents_total
# - ai_recommendations_accepted
```

---

## 🧪 Load Test (2 minutes)

```bash
# Simple load test (requires Apache Bench)
ab -n 1000 -c 100 http://localhost:8080/httpbin/get

# Check results:
# - Requests per second > 100
# - 95th percentile < 500ms
# - No failed requests
```

---

## ⚡ Performance Checks

```bash
# Memory usage
ps aux | grep "node.*dist/bin/www" | awk '{print "Memory: " $6/1024 " MB"}'

# Database connections
psql -U postgres -c "SELECT count(*) as connections FROM pg_stat_activity WHERE datname='flexgate_proxy';"

# Response time
time curl http://localhost:8080/httpbin/get
# Expected: < 0.5s
```

---

## 🐛 Troubleshooting

### Server not responding
```bash
# Check if running
ps aux | grep "node.*dist/bin/www"

# Check logs
tail -f logs/flexgate.log

# Restart
pkill -f "node.*dist/bin/www"
npm start
```

### Database connection issues
```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -U flexgate -d flexgate_proxy -c "SELECT 1;"

# Check permissions
psql -U flexgate -d flexgate_proxy -c "\dt"
```

### Admin UI not loading
```bash
# Check if running
ps aux | grep "react-scripts"

# Restart
cd admin-ui
npm start
```

---

## ✅ Pre-Production Checklist

Quick verification before production:

```bash
# 1. Health check
curl http://localhost:8080/health
# ✅ Status: healthy

# 2. Database connected
curl http://localhost:8080/ready
# ✅ Database: connected

# 3. Metrics working
curl http://localhost:8080/metrics | wc -l
# ✅ > 50 lines

# 4. Circuit breaker functional
# Run circuit breaker test (see above)
# ✅ State transitions: CLOSED → OPEN → HALF_OPEN → CLOSED

# 5. Rate limiter functional
# Run rate limit test (see above)
# ✅ Requests limited at threshold

# 6. AI incidents working
flexgate ai create && flexgate ai incidents
# ✅ Incident created and listed

# 7. Admin UI accessible
curl http://localhost:3000
# ✅ HTML returned

# 8. CLI functional
flexgate --version
# ✅ Version displayed

# 9. Webhooks delivering
# Create webhook and test (see above)
# ✅ Delivery recorded

# 10. No errors in logs
tail -50 logs/flexgate.log | grep -i error
# ✅ No critical errors
```

---

## 🎯 Critical Path Tests (Must Pass)

**Minimum tests before production deployment:**

1. ✅ Core proxy: `curl http://localhost:8080/httpbin/get` → 200
2. ✅ Circuit breaker: Trigger OPEN state → verify rejection
3. ✅ Rate limiter: Exceed limit → verify 429 errors
4. ✅ AI incidents: Create → recommend → outcome → resolve
5. ✅ Admin UI: All pages load without errors
6. ✅ CLI: All 10 commands execute successfully
7. ✅ Database: All tables accessible, data persisting
8. ✅ Webhooks: Events delivered successfully
9. ✅ Health checks: All endpoints return healthy
10. ✅ Load test: Handle 1000 requests without failures

---

## 📝 Notes

- **Full testing plan**: See [PRODUCTION_TESTING_PLAN.md](./PRODUCTION_TESTING_PLAN.md)
- **Estimated time**: ~60 minutes for all quick tests
- **Critical path**: ~30 minutes
- **Dependencies**: PostgreSQL, Redis (optional), NATS (optional)

**Last Updated**: February 16, 2026
