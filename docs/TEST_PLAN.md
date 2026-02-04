# JetStream Implementation Test Plan

## Overview
Comprehensive testing strategy for NATS JetStream integration with FlexGate Proxy.

## Test Categories

### 1. Backend Unit Tests ✅

#### JetStream Service (`tests/jetstream.test.js`)
- **Stream Creation**: Verify METRICS and ALERTS streams are created with correct configuration
- **Message Publishing**: Test publishing metrics to JetStream with acknowledgment
- **Consumer Management**: Test durable consumer creation and deletion
- **Message Consumption**: Test consuming and acknowledging messages
- **Error Handling**: Test connection failures, invalid streams, timeout errors
- **Performance**: Test high-volume publishing (1000+ msg/s), message ordering

**Run Command:**
```bash
npm test -- tests/jetstream.test.js
```

**Prerequisites:**
- NATS server running on localhost:4222 with JetStream enabled
- Install: `npm install --save-dev mocha chai sinon nats`

---

#### Metrics Publisher (`tests/metricsPublisher.test.js`)
- **Data Collection**: Test metrics aggregation from PostgreSQL
- **Error Rate Calculation**: Verify error rate and availability formulas
- **Publishing**: Test JetStream publishing integration
- **Interval Management**: Test start/stop publishing intervals
- **Error Handling**: Test database errors, JetStream disconnect scenarios
- **Data Formatting**: Test latency formatting, timestamp generation

**Run Command:**
```bash
npm test -- tests/metricsPublisher.test.js
```

**Prerequisites:**
- Install: `npm install --save-dev mocha chai sinon pg`
- No database needed (uses mocks)

---

### 2. Integration Tests ✅

#### SSE Endpoint (`tests/sse-endpoint.test.js`)
- **Connection Establishment**: Test SSE connection with correct headers
- **Message Streaming**: Test receiving real-time metrics updates
- **Concurrent Connections**: Test multiple simultaneous SSE connections
- **Connection Management**: Test client disconnect and cleanup
- **Data Format**: Test JSON parsing, required fields, timestamp format

**Run Command:**
```bash
npm test -- tests/sse-endpoint.test.js
```

**Prerequisites:**
- Install: `npm install --save-dev mocha chai supertest eventsource`
- Mock server (included in tests)

---

### 3. Frontend Tests ✅

#### useJetStream Hook (`admin-ui/src/hooks/useJetStream.test.ts`)
- **Connection State**: Test initial state, connection lifecycle
- **Message Reception**: Test receiving and parsing metrics
- **Reconnection Logic**: Test auto-reconnect on disconnect
- **Cleanup**: Test proper cleanup on unmount
- **Error Handling**: Test malformed JSON, connection failures
- **Callbacks**: Test onConnect, onDisconnect, onError callbacks

**Run Command:**
```bash
cd admin-ui && npm test -- useJetStream.test.ts
```

**Prerequisites:**
- Install: `cd admin-ui && npm install --save-dev vitest @testing-library/react @testing-library/react-hooks`
- Update `admin-ui/package.json`:
```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

---

## Test Execution Order

### Phase 1: Unit Tests (No External Dependencies)
```bash
# Test MetricsPublisher (mocked dependencies)
npm test -- tests/metricsPublisher.test.js
```
**Expected:** All tests pass ✅

---

### Phase 2: Integration Tests (Requires NATS)

**Setup:**
```bash
# Install Podman
brew install podman
podman machine init
podman machine start

# Start NATS with JetStream
podman run -d --name flexgate-nats \
  -p 4222:4222 -p 8222:8222 \
  nats:2.10-alpine --jetstream
```

**Run Tests:**
```bash
# Install NATS client
npm install nats

# Test JetStream Service
npm test -- tests/jetstream.test.js
```

**Expected:** All tests pass ✅

**Verify:**
```bash
# Check NATS is running
curl http://localhost:8222/varz

# Check streams created by tests
podman exec flexgate-nats nats stream ls
```

---

### Phase 3: SSE Endpoint Tests
```bash
# Install SSE testing dependencies
npm install --save-dev supertest eventsource

# Run SSE tests
npm test -- tests/sse-endpoint.test.js
```

**Expected:** All tests pass ✅

---

### Phase 4: Frontend Hook Tests
```bash
# Setup Vitest
cd admin-ui
npm install --save-dev vitest @testing-library/react @testing-library/react-hooks jsdom

# Add vitest config
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
EOF

# Run tests
npm test
```

**Expected:** All tests pass ✅

---

## End-to-End Test

### Full Integration Test Scenario

**Setup:**
```bash
# 1. Start NATS
podman run -d --name flexgate-nats \
  -p 4222:4222 -p 8222:8222 \
  nats:2.10-alpine --jetstream

# 2. Start PostgreSQL (if not running)
# Already running in your setup

# 3. Install dependencies
npm install nats uuid
cd admin-ui && npm install
cd ..

# 4. Build admin UI
cd admin-ui && npm run build
cd ..
```

**Manual E2E Test:**
```bash
# 1. Start FlexGate server
npm start

# 2. Open browser to http://localhost:3000

# 3. Verify Dashboard shows:
#    - "Live" indicator in green
#    - Real-time metrics updating every 5 seconds
#    - Connection status chip

# 4. Check browser console:
#    - Should see: "✅ Connected to JetStream"
#    - Should see: "Dashboard stream connected"

# 5. Check server logs:
#    - Should see: "✅ Connected to NATS JetStream"
#    - Should see: "Published metrics to JetStream: seq=X"

# 6. Monitor NATS:
curl http://localhost:8222/varz | jq '.jetstream'
```

**Automated E2E Test:**
```bash
# Run existing Playwright tests
cd flexgate-tests
npx playwright test

# Should pass:
# - Dashboard loads without errors
# - Metrics page displays data
# - No undefined property errors
```

---

## Test Coverage Goals

### Backend
- **JetStream Service**: 90%+ coverage
  - Connection management: 100%
  - Stream operations: 95%
  - Message publish/consume: 95%
  - Error handling: 85%

- **Metrics Publisher**: 85%+ coverage
  - Data collection: 90%
  - Publishing logic: 90%
  - Interval management: 80%

- **SSE Endpoint**: 80%+ coverage
  - Connection handling: 90%
  - Message streaming: 85%
  - Cleanup: 75%

### Frontend
- **useJetStream Hook**: 85%+ coverage
  - State management: 90%
  - Message handling: 90%
  - Reconnection: 80%
  - Cleanup: 85%

- **Dashboard Component**: 75%+ coverage (visual testing)
  - Data rendering: 80%
  - Connection status: 85%
  - Error states: 70%

---

## Success Criteria

### All Tests Must Pass
- ✅ JetStream Service Tests (30+ tests)
- ✅ Metrics Publisher Tests (20+ tests)
- ✅ SSE Endpoint Tests (15+ tests)
- ✅ useJetStream Hook Tests (20+ tests)

### Performance Benchmarks
- ✅ Message publishing: > 100 msg/s
- ✅ SSE latency: < 100ms
- ✅ Reconnection time: < 5 seconds
- ✅ Memory usage: < 200MB (NATS + Node.js)

### Functional Requirements
- ✅ Real-time metrics update every 5 seconds
- ✅ Auto-reconnect on disconnect
- ✅ No memory leaks over 1-hour run
- ✅ Graceful degradation when NATS is down

---

## Test Data Setup

### PostgreSQL Test Data
```sql
-- Insert sample request logs for testing
INSERT INTO requests (timestamp, status_code, response_time_ms, path, method)
VALUES 
  (NOW() - INTERVAL '1 hour', 200, 45, '/api/users', 'GET'),
  (NOW() - INTERVAL '2 hours', 200, 50, '/api/posts', 'GET'),
  (NOW() - INTERVAL '3 hours', 404, 30, '/api/missing', 'GET'),
  (NOW() - INTERVAL '4 hours', 500, 120, '/api/error', 'POST'),
  (NOW() - INTERVAL '5 hours', 200, 42, '/api/users/1', 'GET');

-- Repeat to create more data
INSERT INTO requests (timestamp, status_code, response_time_ms, path, method)
SELECT 
  NOW() - (random() * INTERVAL '24 hours'),
  (ARRAY[200, 200, 200, 200, 404, 500])[floor(random() * 6 + 1)],
  (random() * 200)::int,
  (ARRAY['/api/users', '/api/posts', '/api/comments'])[floor(random() * 3 + 1)],
  (ARRAY['GET', 'POST', 'PUT'])[floor(random() * 3 + 1)]
FROM generate_series(1, 10000);
```

---

## Troubleshooting

### NATS Connection Failed
```bash
# Check NATS is running
podman ps | grep nats

# Check logs
podman logs flexgate-nats

# Restart NATS
podman restart flexgate-nats

# Test connection
curl http://localhost:8222/varz
```

### Tests Timing Out
```bash
# Increase timeout in test files
this.timeout(10000); // 10 seconds

# Check system resources
podman stats
```

### EventSource Not Working (Frontend)
```bash
# Check browser console for errors
# Verify SSE endpoint is accessible
curl http://localhost:3000/api/stream/metrics

# Check CORS headers
# Ensure Content-Type is text/event-stream
```

---

## Next Steps After Tests Pass

1. **Update Documentation** ✅
   - Update README.md with JetStream setup
   - Add troubleshooting guide

2. **CI/CD Integration**
   - Add test jobs to GitHub Actions
   - Include NATS container in CI pipeline

3. **Monitoring Setup**
   - Add Prometheus metrics for NATS
   - Create Grafana dashboard for streaming metrics

4. **Production Deployment**
   - Deploy NATS cluster for HA
   - Configure persistent storage
   - Set up monitoring and alerts

---

## Test Execution Summary

Run all tests in order:
```bash
# 1. Unit tests (no external deps)
npm test -- tests/metricsPublisher.test.js

# 2. Start NATS
podman run -d --name flexgate-nats -p 4222:4222 -p 8222:8222 nats:2.10-alpine --jetstream

# 3. Integration tests
npm test -- tests/jetstream.test.js
npm test -- tests/sse-endpoint.test.js

# 4. Frontend tests
cd admin-ui && npm test

# 5. E2E tests
cd flexgate-tests && npx playwright test
```

**Expected Result:** All tests pass ✅ → Ready to implement!
