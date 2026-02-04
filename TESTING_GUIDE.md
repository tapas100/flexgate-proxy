# FlexGate Proxy - Testing Guide

## 🎯 Quick Test Summary

**Date**: January 29, 2026  
**Branch**: dev  
**Status**: ✅ Ready for testing

## 🌐 Admin UI Access

### Login Page
- **URL**: http://localhost:3000
- **Demo Credentials**: 
  - Email: `admin@flexgate.dev`
  - Password: `admin123`

### Features Available
- ✅ Login Page (Email/Password + Enterprise SSO option)
- ✅ Routes Management
- ✅ Webhooks Management
- ✅ Logs Viewer
- ✅ Metrics Dashboard

## 🔌 API Endpoints (All Working)

### 1. Routes API
```bash
# Get all routes
curl http://localhost:3000/api/routes

# Get single route
curl http://localhost:3000/api/routes/:id

# Create route
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/test/*",
    "upstream": "https://api.example.com",
    "methods": ["GET", "POST"],
    "enabled": true
  }'

# Update route
curl -X PUT http://localhost:3000/api/routes/:id \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Delete route
curl -X DELETE http://localhost:3000/api/routes/:id
```

**Expected**: Returns routes from PostgreSQL database

### 2. Webhooks API
```bash
# Get all webhooks
curl http://localhost:3000/api/webhooks

# Create webhook
curl -X POST http://localhost:3000/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/unique-id",
    "events": ["route.created", "route.updated"],
    "enabled": true
  }'
```

**Expected**: Returns webhooks from PostgreSQL database

### 3. Logs API
```bash
# Get logs (paginated)
curl 'http://localhost:3000/api/logs?limit=10&offset=0'

# Get logs by level
curl 'http://localhost:3000/api/logs?level=ERROR'

# Search logs
curl 'http://localhost:3000/api/logs?search=database'

# Get log statistics
curl http://localhost:3000/api/logs/stats/summary
```

**Expected**: Returns real logs from Winston log files

### 4. Metrics API
```bash
# Get metrics dashboard data
curl http://localhost:3000/api/metrics

# Get Prometheus metrics (text format)
curl http://localhost:3000/metrics
```

**Expected**: Returns real-time metrics data

### 5. Health Endpoints
```bash
# Basic health check
curl http://localhost:3000/health

# Liveness probe
curl http://localhost:3000/health/live

# Readiness probe
curl http://localhost:3000/health/ready

# Deep health check
curl http://localhost:3000/health/deep
```

## 🧪 Browser Testing

### Using Playwright (flexgate-tests repo)

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-tests

# Update .env to use port 3000
echo "BASE_URL=http://localhost:3000" > .env
echo "API_URL=http://localhost:3000" >> .env

# Run specific test suites
CI=true npx playwright test tests/e2e/02-routes --project=chromium
CI=true npx playwright test tests/e2e/07-webhooks --project=chromium

# Run with UI mode (interactive)
CI=true npx playwright test --ui

# Generate test with codegen
npx playwright codegen http://localhost:3000
```

### Manual Browser Testing Checklist

#### ✅ Login Page
- [ ] Page loads at http://localhost:3000
- [ ] Email field visible
- [ ] Password field visible
- [ ] "SIGN IN" button visible
- [ ] "LOGIN WITH ENTERPRISE SSO" button visible
- [ ] Demo credentials shown

#### ✅ Routes Page
- [ ] Navigate to /routes
- [ ] See list of routes
- [ ] Create new route
- [ ] Edit existing route
- [ ] Delete route
- [ ] Enable/disable route

#### ✅ Webhooks Page
- [ ] Navigate to /webhooks
- [ ] See list of webhooks
- [ ] Create new webhook
- [ ] Edit webhook
- [ ] Delete webhook
- [ ] Test webhook delivery

#### ✅ Logs Page
- [ ] Navigate to /logs
- [ ] See log entries
- [ ] Filter by level (DEBUG, INFO, WARN, ERROR)
- [ ] Search logs
- [ ] Pagination works
- [ ] Log details expandable

#### ✅ Metrics Page
- [ ] Navigate to /metrics
- [ ] See dashboard
- [ ] Request rate chart
- [ ] Latency charts (P50, P95, P99)
- [ ] Error rate
- [ ] SLO status
- [ ] Circuit breaker status

## ��️ Database Verification

### Check PostgreSQL
```bash
psql -U flexgate -d flexgate -c "SELECT * FROM routes;"
psql -U flexgate -d flexgate -c "SELECT * FROM webhooks;"
psql -U flexgate -d flexgate -c "SELECT * FROM users;"
```

### Check Winston Logs
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

## 🚀 Server Start/Stop

### Start Server
```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
npm run build
node ./dist/bin/www
```

### Stop Server
```bash
pkill -9 node
# or
lsof -ti :3000 | xargs kill -9
```

### Check Server Status
```bash
curl http://localhost:3000/health
ps aux | grep "node.*www"
```

## 📊 What's Working

### ✅ Fully Implemented
1. **PostgreSQL Database**: 7 tables, migrations, seed data
2. **Routes API**: All CRUD operations with database
3. **Webhooks API**: All CRUD operations with database
4. **Metrics API**: Real Prometheus metrics
5. **Logs API**: Real Winston logs with filtering
6. **Admin UI**: React SPA with all pages
7. **Static File Serving**: Admin UI served from root
8. **Client-side Routing**: SPA routing working

### ✅ Real Data (No Mocks)
- Routes: 3 routes in database
- Webhooks: 2 webhooks in database
- Logs: 300+ real log entries
- Metrics: Live Prometheus data
- All API responses use real database/log data

### ⚠️ Not Implemented (Yet)
1. **Authentication**: Login page exists but not functional
   - Backend `/api/auth` routes exist but not connected
   - SSO button present but not implemented
2. **WebSocket Streaming**: Logs page polls instead of streaming
3. **Einstrust Integration**: Config exists but not active

## 🐛 Known Issues

1. **Login Not Functional**: 
   - UI shows login page
   - Backend has auth routes
   - Need to connect auth service to UI

2. **Test Suite Expects Auth**:
   - Playwright tests expect working login
   - Tests fail because auth not implemented
   - Need to skip auth for testing or implement it

## 📝 Testing Strategy

### Phase 1: API Testing (✅ Ready)
```bash
# Test all API endpoints with curl
./scripts/testing/test-routes-api.sh
```

### Phase 2: UI Component Testing (✅ Ready)
- Navigate to each page manually
- Verify data displays correctly
- Test CRUD operations

### Phase 3: E2E Testing (⚠️ Needs Auth)
- Currently blocked by missing auth
- Can test with auth disabled
- Or implement basic auth first

### Phase 4: Integration Testing (✅ Ready)
```bash
cd /Users/tamahant/Documents/GitHub/flexgate-tests
CI=true npm run test:api
```

## 🎯 Recommended Test Flow

1. **Start Server**
   ```bash
   npm start
   ```

2. **Verify Health**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Test APIs**
   ```bash
   curl http://localhost:3000/api/routes
   curl http://localhost:3000/api/webhooks
   curl http://localhost:3000/api/logs?limit=5
   ```

4. **Open Browser**
   - Navigate to http://localhost:3000
   - See login page
   - **Note**: Login not functional yet
   - Can navigate directly to pages:
     - http://localhost:3000/routes
     - http://localhost:3000/webhooks
     - http://localhost:3000/logs
     - http://localhost:3000/metrics

5. **Run Playwright Tests**
   ```bash
   cd ../flexgate-tests
   CI=true npx playwright test --project=chromium
   ```

## 📈 Success Criteria

- ✅ All API endpoints return 200 OK
- ✅ Database queries return real data
- ✅ Admin UI loads in browser
- ✅ Pages navigate correctly
- ✅ Real data displays in UI
- ⚠️ Authentication (pending)
- ✅ No console errors
- ✅ Logs writing to files

## 🔗 Links

- **Admin UI**: http://localhost:3000
- **API Base**: http://localhost:3000/api
- **Metrics**: http://localhost:3000/metrics
- **Health**: http://localhost:3000/health
- **GitHub Repo**: https://github.com/tapas100/flexgate-proxy
- **Test Repo**: https://github.com/tapas100/flexgate-tests

---

**Last Updated**: January 29, 2026  
**By**: tapas100  
**Status**: Ready for Manual and API Testing ✅
