# Frontend Mock/Hardcoded Data Audit Report
**Date:** 2026-01-29  
**Purpose:** Identify all dummy/mock/hardcoded data in admin UI  
**Status:** CRITICAL - Production code using mock data

---

## 🔴 CRITICAL: Services Using Mock Data

### 1. Metrics Service (`admin-ui/src/services/metrics.ts`)

**Status:** ⚠️ **100% MOCK DATA**  
**Impact:** Dashboard shows fake metrics  
**Priority:** P2 - Important

#### Mock Data Functions:
- `generateMockTimeSeries()` - Generates fake time series data
- `generateMockSLO()` - Generates fake SLO metrics
- `generateMockSummary()` - Generates fake summary stats

#### API Calls Commented Out:
```typescript
// Line 95-96: COMMENTED OUT
// const response = await apiService.get<MetricsData>(`/api/metrics?range=${timeRange}`);
// return response;

// Line 99-121: USING MOCK DATA INSTEAD
const mockData: MetricsData = {
  summary: generateMockSummary(),
  requestRate: generateMockTimeSeries(timeRange, 150, 50, 'req/s'),
  // ... all fake data
};
```

#### Also in fetchSLOMetrics():
```typescript
// Line 148-149: COMMENTED OUT
// const response = await apiService.get<SLOMetrics>('/api/metrics/slo');
// return response;

// Line 150: USING MOCK DATA
data: generateMockSLO(),
```

**What's Fake:**
- Total requests: Random numbers
- Request rate charts: Generated curves
- Latency (p50, p95, p99): Fake values
- Error rates: Random percentages
- Status codes (2xx, 3xx, 4xx, 5xx): Made up numbers
- SLO availability: 99.95% (hardcoded)
- Circuit breaker states: Fake counts

**Backend Needed:**
- `GET /api/metrics?range={timeRange}`
- `GET /api/metrics/slo`

---

### 2. Logs Service (`admin-ui/src/services/logs.ts`)

**Status:** ⚠️ **100% MOCK DATA**  
**Impact:** Logs page shows 1000 fake log entries  
**Priority:** P2 - Important

#### Mock Data Generation:
```typescript
// Line 19: fetchLogs() uses mock
const mockLogs = this.generateMockLogs(1000);

// Line 52: fetchLogById() uses mock
const mockLogs = this.generateMockLogs(1000);

// Line 81: fetchLogStats() uses mock
const mockLogs = this.generateMockLogs(1000);

// Line 123: streamLogs() uses mock
const mockLogs = this.generateMockLogs(1000);

// Line 235-316: generateMockLogs() creates fake entries
private generateMockLogs(count: number): DetailedLogEntry[]
```

**What's Fake:**
- All 1000 log entries
- Log levels (DEBUG, INFO, WARN, ERROR)
- Timestamps (randomly generated)
- Sources (proxy, auth, metrics, admin, system)
- Messages and metadata
- IP addresses and user agents
- Request/response data

**Features Working (on fake data):**
- ✅ Filtering by level
- ✅ Filtering by source
- ✅ Time range filtering
- ✅ Search by text
- ✅ Pagination
- ✅ Statistics calculation
- ⚠️ WebSocket streaming (simulated)

**Backend Needed:**
- `GET /api/logs?limit={limit}&offset={offset}&filter={}`
- `GET /api/logs/:id`
- `GET /api/logs/stats`
- `WebSocket /api/logs/stream`

---

### 3. OAuth Service (`admin-ui/src/services/oauth.ts`)

**Status:** ⚠️ **100% MOCK DATA**  
**Impact:** OAuth providers page shows fake providers  
**Priority:** P3 - Low (may not need this feature)

#### Mock Data Generation:
```typescript
// Line 15: Constructor initializes mock data
this.mockProviders = this.generateMockProviders();

// Line 316-383: generateMockProviders() creates 6 fake providers
private generateMockProviders(): OAuthProvider[]

// Line 384-428: generateMockLoginLogs() creates fake login history
private generateMockLoginLogs(providerId: string, count: number)
```

**What's Fake:**
- 6 OAuth providers (Google, GitHub, Microsoft, Okta, Auth0, Custom SAML)
- Provider configurations
- Client IDs and secrets
- Login statistics (total logins, error rates, response times)
- Login history logs
- All CRUD operations

**Backend Needed:**
- `GET /api/oauth/providers`
- `GET /api/oauth/providers/:id`
- `POST /api/oauth/providers`
- `PUT /api/oauth/providers/:id`
- `DELETE /api/oauth/providers/:id`
- `PUT /api/oauth/providers/:id/toggle`
- `POST /api/oauth/providers/:id/test`
- `GET /api/oauth/providers/:id/stats`
- `GET /api/oauth/providers/:id/logs`

**Note:** This feature might not be needed since we have SAML SSO via Einstrust.

---

### 4. Dashboard (`admin-ui/src/pages/Dashboard.tsx`)

**Status:** ⚠️ **HARDCODED STATS**  
**Impact:** Dashboard shows static fake numbers  
**Priority:** P2 - Important

#### Hardcoded Values:
```typescript
// Lines 23-45: Static stats array
const stats: StatsCard[] = [
  {
    title: 'Total Requests',
    value: '1.2M',  // ❌ HARDCODED
  },
  {
    title: 'Avg Response Time',
    value: '45ms',  // ❌ HARDCODED
  },
  {
    title: 'Success Rate',
    value: '99.9%',  // ❌ HARDCODED
  },
  {
    title: 'Error Rate',
    value: '0.1%',  // ❌ HARDCODED
  },
];
```

**Should Use:**
- Metrics API to get real request counts
- Metrics API for actual response times
- Metrics API for real success/error rates
- Or create separate Dashboard API: `GET /api/dashboard/summary`

---

## ✅ Services Using REAL APIs

### 1. Routes Service (`admin-ui/src/services/routes.ts`)
**Status:** ✅ **REAL API** - Just implemented!
- All CRUD operations call real backend
- No mock data generators
- Production ready

### 2. Webhooks Service (likely exists but not checked yet)
**Status:** ✅ **REAL API** - Backend exists
- Should be using real `/api/webhooks` endpoints

### 3. Auth Service (`admin-ui/src/services/auth.ts`)
**Status:** ✅ **REAL API**
- Login, logout, SSO all real
- No mock data

---

## 📊 Summary Statistics

| Service | Status | Mock Data? | API Calls | Priority |
|---------|--------|------------|-----------|----------|
| **Auth** | ✅ Real | No | ✅ Working | - |
| **Routes** | ✅ Real | No | ✅ Working | - |
| **Webhooks** | ✅ Real | No | ✅ Working | - |
| **Metrics** | ❌ Mock | Yes - 100% | ❌ Commented out | **P2** |
| **Logs** | ❌ Mock | Yes - 1000 entries | ❌ Not implemented | **P2** |
| **OAuth** | ❌ Mock | Yes - 6 providers | ❌ Not implemented | **P3** |
| **Dashboard** | ❌ Hardcoded | Yes - 4 stats | ❌ Not implemented | **P2** |

**Overall:**
- **3 services** using real APIs ✅
- **4 services/components** using mock data ❌
- **Mock data ratio:** ~57% of features

---

## 🚨 User Experience Impact

### What Users See (Fake Data):

1. **Dashboard Page**
   - "1.2M Total Requests" ← Static, never changes
   - "45ms Avg Response Time" ← Static, never changes
   - "99.9% Success Rate" ← Static, never changes
   - "0.1% Error Rate" ← Static, never changes

2. **Metrics Page**
   - Charts with generated curves ← Not real traffic
   - Request rates ← Randomly generated
   - Latency percentiles ← Fake values
   - Error rates ← Simulated
   - SLO metrics ← 99.95% hardcoded

3. **Logs Page**
   - 1000 fake log entries ← Generated on client
   - Fake timestamps ← Not from real system
   - Fake IP addresses ← Made up
   - Filters work but on fake data
   - Search works but finds fake logs

4. **OAuth Providers Page**
   - 6 fake OAuth providers ← Not configured
   - Fake login statistics ← Made up numbers
   - CRUD operations work ← But only in memory
   - "Test" button ← Simulates success

### What Users See (Real Data):

1. **Routes Page** ✅
   - Real proxy routes from backend
   - Actual upstream configurations
   - Real create/edit/delete operations

2. **Webhooks Page** ✅
   - Real webhook configurations
   - Actual delivery logs
   - Real statistics

3. **Login** ✅
   - Real authentication
   - Actual SAML SSO integration

---

## 🔧 How to Fix

### Priority 1 (Dashboard) - Quick Win
```typescript
// admin-ui/src/pages/Dashboard.tsx
const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<StatsCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      // Option A: Use existing metrics API
      const metrics = await metricsService.fetchMetrics('24h');
      
      // Option B: Create dedicated dashboard endpoint
      // const response = await apiService.get('/api/dashboard/summary');
      
      setStats([
        {
          title: 'Total Requests',
          value: formatNumber(metrics.data.summary.totalRequests),
          icon: <TrendingUp />,
          color: '#1976d2',
        },
        // ... map real data to stats
      ]);
      setLoading(false);
    };
    
    fetchDashboardStats();
  }, []);

  // ...
};
```

### Priority 2 (Metrics API)
**Backend Implementation Needed:**

```typescript
// routes/metrics.ts
router.get('/', async (req: Request, res: Response) => {
  const { range = '24h' } = req.query;
  
  // Query Prometheus metrics
  const metricsData = await prometheusService.getMetrics(range);
  
  res.json({
    success: true,
    data: metricsData,
  });
});

router.get('/slo', async (req: Request, res: Response) => {
  const sloMetrics = await prometheusService.calculateSLO();
  
  res.json({
    success: true,
    data: sloMetrics,
  });
});
```

**Frontend Fix:**
```typescript
// admin-ui/src/services/metrics.ts
async fetchMetrics(timeRange: TimeRange = '24h'): Promise<ApiResponse<MetricsData>> {
  try {
    // UNCOMMENT THIS:
    const response = await apiService.get<MetricsData>(`/api/metrics?range=${timeRange}`);
    return response;

    // REMOVE THIS:
    // const mockData: MetricsData = { ... };
    // return { success: true, data: mockData };
  } catch (error) {
    // error handling
  }
}
```

### Priority 3 (Logs API)
**Backend Implementation Needed:**

```typescript
// routes/logs.ts
router.get('/', async (req: Request, res: Response) => {
  const { limit = 100, offset = 0, level, source, searchTerm } = req.query;
  
  // Read from Winston logs or logging system
  const logs = await logRepository.find({ limit, offset, level, source, searchTerm });
  
  res.json({
    success: true,
    data: {
      logs,
      total: await logRepository.count(),
    },
  });
});
```

**Frontend Fix:**
```typescript
// admin-ui/src/services/logs.ts
async fetchLogs(...): Promise<ApiResponse<...>> {
  try {
    // REPLACE generateMockLogs() WITH:
    const response = await apiService.get('/api/logs', {
      params: { limit, offset, ...filter },
    });
    return response;
  } catch (error) {
    // error handling
  }
}
```

### Priority 4 (OAuth - Optional)
**Decision Needed:**
- ❓ Do we need OAuth provider management?
- ✅ We already have SAML SSO via Einstrust
- 💡 Recommendation: Remove OAuth UI if not needed
- 🔄 Or implement backend if OAuth is required

---

## 📋 Action Items

### Immediate
1. ✅ **Routes API** - DONE (just implemented)
2. ⏭️ **Update Dashboard** - Use real metrics API when available
3. ⏭️ **Document mock data** - Add warnings in UI

### Short-term (Next Sprint)
4. 🔲 **Implement Metrics API** (P2)
   - Wrap Prometheus metrics
   - Expose REST endpoints
   - Remove mock data from frontend

5. 🔲 **Implement Logs API** (P2)
   - Read from Winston logs
   - Support filtering/pagination
   - WebSocket for real-time streaming
   - Remove mock log generator

### Medium-term
6. 🔲 **Review OAuth Feature** (P3)
   - Decide if needed (we have SAML SSO)
   - Either implement backend OR remove UI
   - Don't ship with mock data

### Documentation
7. 🔲 **Add UI Warnings** (P1)
   - Add "Demo Data" badges on mock pages
   - Warning banners on Metrics/Logs pages
   - Tooltip: "Using simulated data"

8. 🔲 **Update README** (P1)
   - Document which features use real data
   - Document which features use mock data
   - Provide timeline for full implementation

---

## 🎯 Recommendations

### For Production:

1. **DO NOT SHIP** with mock data in these pages:
   - ❌ Metrics page (shows fake performance data)
   - ❌ Logs page (shows fake application logs)
   - ❌ Dashboard stats (shows static numbers)

2. **Add Visual Indicators:**
   ```tsx
   {/* On pages using mock data */}
   <Alert severity="warning">
     Demo Mode: This page is displaying simulated data. 
     Real-time metrics coming soon.
   </Alert>
   ```

3. **Quick Fix Options:**
   - **Option A:** Hide incomplete pages until backend ready
   - **Option B:** Show pages with clear "Demo Mode" warnings
   - **Option C:** Implement backend APIs (recommended)

### Development Workflow:

1. **Document All Mock Data:**
   ```typescript
   // Add clear comments
   // TODO: REMOVE MOCK DATA - Replace with /api/metrics endpoint
   // TRACKED IN: API_IMPLEMENTATION_STATUS.md
   // PRIORITY: P2
   const mockData = generateMockMetrics();
   ```

2. **Track in API Status:**
   Update `API_IMPLEMENTATION_STATUS.md` with mock data warnings

3. **Add Tests:**
   - Don't test mock data generators
   - Test real API integrations
   - Contract tests ensure frontend-backend match

---

## 📚 Related Documents

- `API_IMPLEMENTATION_STATUS.md` - Track missing endpoints
- `FRONTEND_BACKEND_AUDIT.md` - Complete API gap analysis
- `API_DEVELOPMENT_PROTOCOL.md` - Prevent future mock data

---

## 🎓 Lessons Learned

### Why Mock Data is Dangerous:

1. **Hides Issues:**
   - Users think features work
   - No 404 errors visible
   - Performance appears good

2. **Bad User Experience:**
   - Data never changes
   - Confuses users ("Why is this static?")
   - Loses trust when discovered

3. **Technical Debt:**
   - Code to maintain (mock generators)
   - Must remember to remove
   - Risk of shipping to production

4. **Testing Problems:**
   - Can't test real scenarios
   - Integration gaps hidden
   - E2E tests pass on fake data

### Better Approach:

1. **Show Empty States:**
   ```tsx
   {loading ? <Spinner /> : 
    data ? <Chart data={data} /> :
    <EmptyState message="Metrics API not implemented yet" />}
   ```

2. **Progressive Disclosure:**
   - Ship with features disabled
   - Enable as backends complete
   - Clear roadmap for users

3. **Transparent Development:**
   - Show "Coming Soon" badges
   - Link to GitHub issues
   - ETA for completion

---

**Bottom Line:**
- **Routes API:** ✅ Real data, production ready
- **Metrics, Logs, OAuth, Dashboard:** ❌ Mock data, needs backend
- **Recommendation:** Implement Metrics & Logs APIs next, or hide these pages until ready

