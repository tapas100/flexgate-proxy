# Troubleshooting & Settings Test Guide

**Created:** February 10, 2026  
**Purpose:** Comprehensive testing of UI and API integration for Troubleshooting and Settings features

---

## 📋 Overview

This test suite validates:
- **Troubleshooting API** endpoints (7 endpoints)
- **Settings API** endpoints (2 endpoints)
- **UI to API integration** (button clicks → API calls → responses)
- **Error handling** and edge cases
- **Real-world user flows**

---

## 🚀 Quick Start

### Prerequisites

1. **Start all services:**
   ```bash
   bash scripts/start-all.sh
   ```

2. **Verify services running:**
   ```bash
   # FlexGate API
   curl http://localhost:3000/health
   
   # Admin UI (optional for API tests)
   curl http://localhost:3002
   ```

### Run Tests

**Automated (Recommended):**
```bash
bash scripts/test-troubleshooting.sh
```

**Manual:**
```bash
npm test -- __tests__/troubleshooting-settings.test.ts --verbose
```

---

## 📊 Test Coverage

### 1. Troubleshooting API Tests

#### Health Check (`POST /api/troubleshooting/health-check`)

**What it tests:**
- ✅ Endpoint responds with 200 OK
- ✅ Returns structured health check data
- ✅ Includes status for all services
- ✅ Each health check has name, status, message

**Example response:**
```json
{
  "success": true,
  "healthChecks": [
    {
      "name": "FlexGate API",
      "status": "healthy",
      "message": "Running on port 3000"
    },
    {
      "name": "PostgreSQL",
      "status": "healthy",
      "message": "Connected"
    }
  ],
  "output": ["✅ FlexGate API: healthy", "..."],
  "exitCode": 0
}
```

**UI Flow:**
1. User clicks "Run Health Check" button
2. UI sends POST request to `/api/troubleshooting/health-check`
3. UI displays results in health check cards
4. Icons update based on status (✅ healthy, ❌ unhealthy, ⚠️ warning)

---

#### Requirements Check (`POST /api/troubleshooting/check-requirements`)

**What it tests:**
- ✅ Verifies system requirements
- ✅ Checks Node.js version
- ✅ Checks npm availability
- ✅ Checks Podman/Docker (optional)
- ✅ Validates port availability
- ✅ Checks disk space and memory

**Example response:**
```json
{
  "success": true,
  "systemChecks": [
    {
      "name": "Node.js Version",
      "status": "healthy",
      "message": "v20.11.0"
    },
    {
      "name": "Port Availability",
      "status": "healthy",
      "message": "Port 3000 available"
    }
  ],
  "output": ["..."],
  "exitCode": 0
}
```

**UI Flow:**
1. User clicks "Check Requirements" button
2. UI sends POST request
3. System checks displayed with status indicators
4. Warnings shown for any issues

---

#### Auto Recovery (`POST /api/troubleshooting/auto-recover`)

**What it tests:**
- ✅ Executes recovery script
- ✅ Returns detailed output
- ✅ Handles script errors gracefully
- ✅ Provides exit code

**Example response:**
```json
{
  "success": true,
  "output": [
    "Starting auto-recovery...",
    "Checking services...",
    "Restarting failed services..."
  ],
  "exitCode": 0
}
```

**UI Flow:**
1. User clicks "Auto Recover" button
2. UI shows loading spinner
3. API executes recovery script
4. UI displays output in scrollable text area
5. Success/failure message shown

---

#### Clean Install (`POST /api/troubleshooting/clean-install`)

**What it tests:**
- ✅ Performs clean installation
- ✅ Removes node_modules
- ✅ Reinstalls dependencies
- ✅ Returns installation progress

**Example response:**
```json
{
  "success": true,
  "output": [
    "Removing node_modules...",
    "Running npm install...",
    "Installation complete"
  ],
  "exitCode": 0
}
```

**UI Flow:**
1. User clicks "Clean Install" button
2. Confirmation dialog appears
3. If confirmed, API starts clean install
4. Progress shown in real-time
5. Completion message displayed

---

#### Nuclear Reset (`POST /api/troubleshooting/nuclear-reset`)

**What it tests:**
- ✅ Endpoint exists and responds
- ✅ Handles destructive operation safely
- ✅ Returns appropriate response

**UI Flow:**
1. User clicks "Nuclear Reset" button
2. Warning dialog with confirmation input
3. User must type "RESET" to confirm
4. API performs full reset
5. Warning shown about data loss

---

#### View Logs (`GET /api/troubleshooting/logs`)

**What it tests:**
- ✅ Retrieves application logs
- ✅ Returns array of log entries
- ✅ Logs include timestamps
- ✅ Recent logs prioritized

**Example response:**
```json
{
  "logs": [
    "[2026-02-10 08:30:00] INFO: FlexGate started",
    "[2026-02-10 08:30:01] INFO: Connected to database",
    "..."
  ]
}
```

**UI Flow:**
1. User clicks "View Logs" button
2. Dialog opens with log viewer
3. Logs displayed in scrollable container
4. Auto-scroll to bottom for new logs

---

#### System Info (`GET /api/troubleshooting/system-info`)

**What it tests:**
- ✅ Returns platform information
- ✅ Provides Node.js version
- ✅ Shows memory usage statistics
- ✅ Reports system uptime

**Example response:**
```json
{
  "platform": "darwin",
  "nodeVersion": "v20.11.0",
  "memory": {
    "totalMB": 16384,
    "usedMB": 8192,
    "freeMB": 8192
  },
  "uptime": 3600
}
```

**UI Flow:**
1. System info card auto-refreshes every 30s
2. Displays platform, Node version
3. Shows memory usage with progress bar
4. Uptime displayed in human-readable format

---

### 2. Settings API Tests

#### Get Settings (`GET /api/settings`)

**What it tests:**
- ✅ Retrieves current configuration
- ✅ Returns valid JSON structure
- ✅ Handles missing settings gracefully

**UI Flow:**
1. Settings page loads
2. API fetches current settings
3. Form populated with current values
4. Default values shown if no settings exist

---

#### Update Settings (`PUT /api/settings`)

**What it tests:**
- ✅ Updates configuration
- ✅ Validates settings structure
- ✅ Returns success confirmation
- ✅ Persists changes

**UI Flow:**
1. User modifies settings in form
2. Clicks "Save Settings" button
3. API validates and saves
4. Success notification shown
5. Form reflects updated values

---

### 3. Integration Flow Tests

These tests simulate **real user interactions** from UI button click to API response:

#### Test: Health Check Button Flow
```
User Action: Click "Run Health Check"
  ↓
UI Action: Send POST /api/troubleshooting/health-check
  ↓
API Action: Execute health-check.sh script
  ↓
API Response: Return healthChecks array
  ↓
UI Action: Display status cards with icons
  ↓
Result: User sees service health status
```

#### Test: Requirements Check Flow
```
User Action: Click "Check Requirements"
  ↓
UI Action: Show loading spinner
  ↓
API Action: Execute check-requirements.sh
  ↓
API Response: Return systemChecks array
  ↓
UI Action: Display system requirements status
  ↓
Result: User sees if system meets requirements
```

#### Test: Auto Recovery Flow
```
User Action: Click "Auto Recover"
  ↓
UI Action: Confirm action
  ↓
API Action: Execute auto-recover.sh
  ↓
API Response: Stream output in real-time
  ↓
UI Action: Display output with scroll
  ↓
Result: User sees recovery progress and result
```

---

## 🧪 Test Scenarios

### Scenario 1: Healthy System
**Setup:** All services running normally  
**Expected:** All health checks return "healthy"  
**Result:** Green status indicators in UI

### Scenario 2: Service Down
**Setup:** Stop PostgreSQL  
**Expected:** PostgreSQL health check returns "unhealthy"  
**Result:** Red status indicator with error message

### Scenario 3: Missing Requirements
**Setup:** Rename node binary temporarily  
**Expected:** Requirements check fails for Node.js  
**Result:** Warning message with resolution steps

### Scenario 4: Recovery Success
**Setup:** Service in failed state  
**Action:** Run auto-recovery  
**Expected:** Service restarted successfully  
**Result:** Success message with recovery steps

### Scenario 5: Settings Update
**Setup:** Change log level to "debug"  
**Action:** Save settings  
**Expected:** Settings persisted  
**Result:** Confirmation message, form reflects new value

---

## 📈 Test Results Interpretation

### Success Indicators
```
✅ All tests passed
✓ Health Check button flow successful
✓ Requirements Check button flow successful
✓ Auto Recovery button flow successful
✓ System info refresh flow successful
✓ Logs viewer flow successful
```

### Common Issues

#### Issue: Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```
**Solution:** Start FlexGate API
```bash
bash scripts/start-all.sh
```

#### Issue: Timeout
```
Error: timeout of 30000ms exceeded
```
**Solution:** Increase timeout or check system performance

#### Issue: Script Not Found
```
Error: bash: scripts/health-check.sh: No such file or directory
```
**Solution:** Ensure all scripts in `scripts/troubleshooting/` exist

---

## 🔍 Debugging Failed Tests

### Enable Verbose Output
```bash
npm test -- __tests__/troubleshooting-settings.test.ts --verbose
```

### Check Service Logs
```bash
# FlexGate logs
tail -f logs/flexgate.log

# Script output
tail -f logs/troubleshooting.log
```

### Manual API Testing
```bash
# Test health check endpoint
curl -X POST http://localhost:3000/api/troubleshooting/health-check

# Test system info
curl http://localhost:3000/api/troubleshooting/system-info

# Test with verbose output
curl -v -X POST http://localhost:3000/api/troubleshooting/check-requirements
```

### Test Individual Endpoints
```bash
# Run single test
npx jest __tests__/troubleshooting-settings.test.ts -t "should run health check"

# Run specific test suite
npx jest __tests__/troubleshooting-settings.test.ts -t "Troubleshooting API Tests"
```

---

## 📊 Test Metrics

### Expected Coverage
- **API Endpoints:** 9/9 (100%)
- **UI Flows:** 5/5 (100%)
- **Error Scenarios:** 3/3 (100%)
- **Integration Tests:** 5/5 (100%)

### Performance Benchmarks
- Health Check: < 2 seconds
- Requirements Check: < 3 seconds
- Auto Recovery: < 10 seconds
- Clean Install: < 60 seconds
- System Info: < 100ms
- Logs Retrieval: < 500ms

---

## 🛠️ Continuous Integration

### GitHub Actions Workflow
```yaml
name: Troubleshooting Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: bash scripts/start-all.sh
      - run: bash scripts/test-troubleshooting.sh
```

---

## 📝 Adding New Tests

### Example: Testing New Endpoint

```typescript
describe('POST /api/troubleshooting/new-feature', () => {
  test('should execute new feature', async () => {
    const response = await apiClient.post('/new-feature');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('success');
    expect(response.data).toHaveProperty('result');

    console.log('✓ New feature test passed');
  });
});
```

### Example: Testing UI Flow

```typescript
describe('New Feature Button Flow', () => {
  test('should simulate button click', async () => {
    console.log('\n🔘 Simulating: User clicks new button\n');

    const response = await apiClient.post('/new-feature');

    expect(response.status).toBe(200);
    
    console.log('📊 UI would display:', response.data);
    console.log('✓ Button flow successful\n');
  });
});
```

---

## ✅ Checklist Before Running Tests

- [ ] FlexGate API running on port 3000
- [ ] Admin UI running on port 3002 (optional)
- [ ] All troubleshooting scripts exist in `scripts/troubleshooting/`
- [ ] Dependencies installed (`npm install`)
- [ ] No other services using ports 3000, 3002
- [ ] Sufficient system resources (memory, disk)
- [ ] Test environment variables set (if needed)

---

## 🎯 Next Steps

1. **Run the tests:**
   ```bash
   bash scripts/test-troubleshooting.sh
   ```

2. **Review results:**
   - Check console output for pass/fail
   - Review detailed logs if failures occur

3. **Fix issues:**
   - Use debugging guide above
   - Check service logs
   - Verify scripts are executable

4. **Commit test code:**
   ```bash
   git add __tests__/troubleshooting-settings.test.ts
   git add scripts/test-troubleshooting.sh
   git commit -m "test: Add comprehensive troubleshooting and settings tests"
   ```

---

## 📚 References

- **API Documentation:** `docs/api.md`
- **Troubleshooting Scripts:** `scripts/troubleshooting/README.md`
- **Admin UI Components:** `admin-ui/src/pages/Troubleshooting.tsx`
- **Settings Components:** `admin-ui/src/components/Settings/`

---

**Happy Testing!** 🚀
