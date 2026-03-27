# Testing Commands Cheat Sheet 🎯

**Quick copy-paste commands for testing FlexGate**

---

## 🚀 Quick Start

```bash
# Start all services
./scripts/start-all-with-deps.sh

# Run automated tests
./scripts/testing/critical-path-test.sh

# Check health
curl http://localhost:8080/health
```

---

## 🔴 Circuit Breaker

```bash
# Trigger OPEN (15 timeouts)
for i in {1..15}; do curl -m 2 http://localhost:8080/httpbin/delay/10; sleep 0.2; done

# Check state
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.state'

# Verify fast rejection
time curl http://localhost:8080/httpbin/status/200

# Wait for HALF_OPEN (30 seconds)
sleep 30

# Close circuit (3 successful requests)
for i in {1..3}; do curl http://localhost:8080/httpbin/status/200; sleep 1; done
```

---

## 🚦 Rate Limiter

```bash
# Test under limit (50 requests)
for i in {1..50}; do curl -s http://localhost:8080/httpbin/get > /dev/null; done

# Exceed limit (110 requests)
for i in {1..110}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/httpbin/get)
  echo "Request $i: $status"
  sleep 0.05
done

# Check headers
curl -v http://localhost:8080/httpbin/get 2>&1 | grep -i ratelimit
```

---

## 🤖 AI Incidents

```bash
# Create incident
INCIDENT=$(flexgate ai create --type LATENCY_ANOMALY --json | jq -r '.incident_id')
echo $INCIDENT

# List incidents
flexgate ai incidents --limit 5

# Show detail
flexgate ai show $INCIDENT

# Add recommendations
flexgate ai recommend $INCIDENT \
  --recommendations '[{"action_type":"RESTART_SERVICE","reasoning":"Test","confidence":0.9,"priority":1}]'

# Get recommendation ID
REC_ID=$(flexgate ai show $INCIDENT --json | jq -r '.recommendations[0].recommendation_id')

# Record decision
flexgate ai decide $INCIDENT $REC_ID --decision ACCEPTED --action RESTART_SERVICE

# Record outcome
flexgate ai outcome $INCIDENT --action RESTART_SERVICE --status RESOLVED --improvement 90

# Update status
flexgate ai update $INCIDENT --status RESOLVED --rating 5 --feedback "Worked!"

# View analytics
flexgate ai analytics --days 30
```

---

## 💻 Admin UI

```bash
# Open in browser
open http://localhost:3000

# Check if accessible
curl http://localhost:3000
```

**Manual Steps**:
1. Click Dashboard → Verify AI stats section
2. Click Metrics → Verify AI analytics section  
3. Click AI Incidents → Verify table loads
4. Click AI Analytics → Verify charts display
5. Change time range → Verify stats update

---

## 🔌 Webhooks

```bash
# Get webhook.site URL
# Visit: https://webhook.site

# Create webhook
curl -X POST http://localhost:8080/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Webhook",
    "url": "https://webhook.site/YOUR-UNIQUE-ID",
    "events": ["ai_incident.created", "circuit_breaker.opened"],
    "enabled": true
  }'

# Trigger event
flexgate ai create

# Check deliveries
curl http://localhost:8080/api/webhooks/deliveries | jq '.[0]'
```

---

## 📊 Database

```bash
# List tables
psql -U flexgate -d flexgate_proxy -c "\dt"

# Count incidents
psql -U flexgate -d flexgate_proxy -c "SELECT COUNT(*) FROM ai_incidents;"

# Recent incidents
psql -U flexgate -d flexgate_proxy -c \
  "SELECT incident_id, event_type, status FROM ai_incidents ORDER BY detected_at DESC LIMIT 5;"

# Webhook deliveries
psql -U flexgate -d flexgate_proxy -c \
  "SELECT event_type, response_code FROM webhook_deliveries ORDER BY created_at DESC LIMIT 5;"

# Clean test data
psql -U flexgate -d flexgate_proxy -c "DELETE FROM ai_incidents WHERE summary LIKE 'Test%';"
```

---

## 📈 Metrics

```bash
# Prometheus metrics
curl http://localhost:8080/metrics

# Filter circuit breaker
curl http://localhost:8080/metrics | grep circuit_breaker

# Filter rate limit
curl http://localhost:8080/metrics | grep rate_limit

# Filter AI incidents
curl http://localhost:8080/metrics | grep ai_incidents

# API metrics endpoint
curl http://localhost:8080/api/metrics | jq '.'
```

---

## 🔒 Security

```bash
# Test SSRF protection (should be blocked)
curl -v http://localhost:8080/proxy/169.254.169.254  # Cloud metadata
curl -v http://localhost:8080/proxy/127.0.0.1        # Localhost
curl -v http://localhost:8080/proxy/192.168.1.1      # Private IP

# Valid external (should work)
curl http://localhost:8080/httpbin/get
```

---

## ⚡ Performance

```bash
# Response time
time curl http://localhost:8080/httpbin/get

# Load test (requires Apache Bench)
ab -n 1000 -c 100 http://localhost:8080/httpbin/get

# Memory usage
ps aux | grep "node.*dist/bin/www" | awk '{print "Memory: " $6/1024 " MB"}'

# Database connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname='flexgate_proxy';"
```

---

## 🐛 Troubleshooting

```bash
# Check if backend is running
ps aux | grep "node.*dist/bin/www"

# Check logs
tail -f logs/flexgate.log
tail -f logs/flexgate.log | grep ERROR

# Restart backend
pkill -f "node.*dist/bin/www"
npm run build && npm start

# Check Admin UI
ps aux | grep "react-scripts"

# Restart Admin UI
cd admin-ui && npm start

# Check database
pg_isready
psql -U flexgate -d flexgate_proxy -c "SELECT 1;"

# Check CLI
which flexgate
flexgate --version

# Reinstall CLI
npm install -g .
```

---

## 📦 Environment

```bash
# Start all services (automated)
./scripts/start-all-with-deps.sh

# Or manually:

# Terminal 1: Backend
npm run build
PORT=8080 NODE_ENV=development node dist/bin/www

# Terminal 2: Admin UI
cd admin-ui && npm start

# Terminal 3: PostgreSQL
pg_ctl -D /usr/local/var/postgres start

# Terminal 4: Redis (optional)
redis-server
```

---

## ✅ Pre-Production Checks

```bash
# 1. Health
curl http://localhost:8080/health

# 2. Database
curl http://localhost:8080/ready

# 3. Metrics
curl http://localhost:8080/metrics | wc -l

# 4. Proxy works
curl http://localhost:8080/httpbin/get

# 5. Circuit breaker
# (Run circuit breaker test above)

# 6. Rate limiter
# (Run rate limit test above)

# 7. AI incidents
flexgate ai create && flexgate ai incidents

# 8. Admin UI
curl http://localhost:3000

# 9. CLI works
flexgate --version

# 10. Run automated test
./scripts/testing/critical-path-test.sh
```

---

## 🎯 One-Line Tests

```bash
# All health checks
curl -s http://localhost:8080/health && curl -s http://localhost:8080/ready && echo "✓ Healthy"

# Test proxy
curl -s http://localhost:8080/httpbin/get | grep -q "httpbin" && echo "✓ Proxy working"

# Count incidents
psql -U flexgate -d flexgate_proxy -t -c "SELECT COUNT(*) FROM ai_incidents;" | xargs echo "Incidents:"

# Check circuit breaker state
curl -s http://localhost:8080/api/metrics | jq -r '.circuitBreakers.httpbin.state' | xargs echo "Circuit:"

# Test CLI
flexgate ai incidents --limit 1 > /dev/null && echo "✓ CLI working"
```

---

## 📋 Testing Workflow

```bash
# Complete test flow (copy all at once)

# 1. Setup
./scripts/start-all-with-deps.sh
sleep 10

# 2. Basic checks
curl http://localhost:8080/health
curl http://localhost:3000 > /dev/null

# 3. Create incident
INCIDENT=$(flexgate ai create --type LATENCY_ANOMALY --json | jq -r '.incident_id')
echo "Created: $INCIDENT"

# 4. Test circuit breaker
echo "Testing circuit breaker..."
for i in {1..15}; do curl -m 2 http://localhost:8080/httpbin/delay/10 2>&1 | head -1; done
echo "Circuit should be OPEN"

# 5. Test rate limiter
echo "Testing rate limiter..."
for i in {1..110}; do curl -s http://localhost:8080/httpbin/get > /dev/null; done
echo "Should have hit rate limit"

# 6. Run full automated test
./scripts/testing/critical-path-test.sh

# 7. Done
echo "Testing complete!"
```

---

## 🔗 Documentation Links

- Full Plan: [PRODUCTION_TESTING_PLAN.md](./PRODUCTION_TESTING_PLAN.md)
- Quick Ref: [QUICK_TEST_REFERENCE.md](./QUICK_TEST_REFERENCE.md)
- Summary: [TESTING_SUITE_SUMMARY.md](./TESTING_SUITE_SUMMARY.md)
- Docs Index: [DOCS_INDEX.md](./DOCS_INDEX.md)

---

**Last Updated**: February 16, 2026
