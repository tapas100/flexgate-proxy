# Feature 3 Specification: Metrics Dashboard

**Feature:** Real-time Metrics Visualization  
**Branch:** feature/admin-ui-metrics  
**Priority:** High  
**Estimated LOC:** ~1,500  
**Estimated Tests:** 15+  
**Timeline:** Week 5-6 (Jan 28 - Feb 10, 2026)

## Overview
Build a comprehensive metrics dashboard that displays real-time system performance data from Prometheus, including request rates, latency, error rates, SLI/SLO compliance, and circuit breaker status.

## Requirements

### Functional Requirements

#### 1. Metrics Service (API Integration)
- [ ] Fetch metrics from Prometheus API
- [ ] Support time range queries (1h, 6h, 24h, 7d, 30d)
- [ ] Parse Prometheus metric format
- [ ] Calculate SLI/SLO percentages
- [ ] Error handling for failed requests
- [ ] Mock data for development/testing

**Metrics to Display:**
- Request rate (requests/sec)
- Response time percentiles (p50, p95, p99)
- Error rate (4xx, 5xx)
- Success rate (2xx, 3xx)
- Circuit breaker status (open, half-open, closed)
- Active connections
- Route-specific metrics
- SLI/SLO compliance

#### 2. Chart Components (Recharts)
- [ ] Line chart for request rate over time
- [ ] Area chart for response time percentiles
- [ ] Bar chart for error breakdown
- [ ] Gauge chart for SLI/SLO compliance
- [ ] Pie chart for status code distribution
- [ ] Time range selector (1h, 6h, 24h, 7d, 30d)
- [ ] Auto-refresh toggle (30s, 1m, 5m, off)
- [ ] Responsive design for mobile/tablet

#### 3. Metrics Dashboard Page
- [ ] Grid layout with metric cards
- [ ] Summary cards (total requests, avg latency, error rate, uptime)
- [ ] Interactive charts with tooltips
- [ ] Loading states while fetching
- [ ] Error states with retry button
- [ ] Empty state when no data
- [ ] Export metrics (CSV, JSON)

#### 4. SLI/SLO Monitoring
- [ ] Availability SLO (target: 99.9%)
- [ ] Latency SLO (p95 < 200ms, p99 < 500ms)
- [ ] Error budget tracking
- [ ] SLO violation alerts (visual indicators)
- [ ] Historical SLO compliance trend

#### 5. Real-time Updates
- [ ] Polling mechanism (configurable interval)
- [ ] Optional WebSocket support for live updates
- [ ] Auto-refresh controls
- [ ] Data caching to reduce API calls
- [ ] Optimistic UI updates

### Non-Functional Requirements

#### Performance
- Charts must render < 100ms for 1000 data points
- Dashboard must load < 2s on 3G connection
- Memory usage < 50MB for dashboard page
- Smooth animations (60fps)

#### Accessibility
- ARIA labels for all charts
- Keyboard navigation for controls
- Screen reader support
- High contrast mode support

#### Testing
- 15+ unit tests for metrics service
- Component tests for each chart type
- Integration tests for dashboard
- Mock Prometheus responses
- Test edge cases (no data, error states)

## Technical Stack

### Dependencies to Install
```json
{
  "recharts": "^2.10.3",
  "date-fns": "^3.0.6"
}
```

### File Structure
```
admin-ui/src/
├── services/
│   ├── metrics.ts                      (Metrics service - API calls)
│   └── __tests__/
│       └── metrics.test.ts             (Metrics service tests)
├── utils/
│   ├── metricsHelpers.ts               (Data transformation utilities)
│   └── __tests__/
│       └── metricsHelpers.test.ts      (Utility tests)
├── components/
│   └── Charts/
│       ├── RequestRateChart.tsx        (Line chart - requests/sec)
│       ├── LatencyChart.tsx            (Area chart - response time)
│       ├── ErrorChart.tsx              (Bar chart - errors)
│       ├── SLOGauge.tsx                (Gauge - SLO compliance)
│       ├── StatusPieChart.tsx          (Pie - status codes)
│       └── __tests__/
│           ├── RequestRateChart.test.tsx
│           ├── LatencyChart.test.tsx
│           ├── ErrorChart.test.tsx
│           ├── SLOGauge.test.tsx
│           └── StatusPieChart.test.tsx
├── pages/
│   ├── Metrics.tsx                     (Main metrics dashboard)
│   └── __tests__/
│       └── Metrics.test.tsx            (Dashboard tests)
└── types/
    └── index.ts                        (Add metric types)
```

## API Endpoints

### Prometheus Query API (Backend Integration Required)
```typescript
GET /api/metrics/query?query=<promql>&time=<timestamp>
GET /api/metrics/query_range?query=<promql>&start=<timestamp>&end=<timestamp>&step=<duration>
GET /api/metrics/slo
```

### Expected Response Format
```typescript
interface MetricDataPoint {
  timestamp: number;
  value: number;
}

interface MetricTimeSeries {
  metric: Record<string, string>;
  values: MetricDataPoint[];
}

interface PrometheusResponse {
  status: 'success' | 'error';
  data: {
    resultType: 'matrix' | 'vector';
    result: MetricTimeSeries[];
  };
}

interface SLOMetrics {
  availability: {
    current: number;    // Current uptime %
    target: number;     // Target SLO (99.9%)
    budget: number;     // Error budget remaining
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    targetP95: number;  // Target (200ms)
    targetP99: number;  // Target (500ms)
  };
  errorRate: {
    current: number;    // Current error %
    target: number;     // Max allowed (0.1%)
  };
}
```

## Type Definitions

```typescript
// Add to admin-ui/src/types/index.ts

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface TimeSeriesMetric {
  name: string;
  data: MetricPoint[];
  unit: string;  // 'req/s', 'ms', '%', etc.
}

export interface MetricsSummary {
  totalRequests: number;
  avgLatency: number;
  errorRate: number;
  uptime: number;
}

export interface MetricsData {
  summary: MetricsSummary;
  requestRate: TimeSeriesMetric;
  latency: {
    p50: TimeSeriesMetric;
    p95: TimeSeriesMetric;
    p99: TimeSeriesMetric;
  };
  errorRate: TimeSeriesMetric;
  statusCodes: {
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };
  slo: SLOMetrics;
  circuitBreakers: {
    open: number;
    halfOpen: number;
    closed: number;
  };
}

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
export type RefreshInterval = '30s' | '1m' | '5m' | 'off';
```

## UI Components Specification

### 1. Metrics Summary Cards (Top Row)
```tsx
<Grid container spacing={3}>
  <Grid item xs={12} sm={6} md={3}>
    <MetricCard
      title="Total Requests"
      value="1.2M"
      change="+12.5%"
      trend="up"
      icon={<TrendingUpIcon />}
    />
  </Grid>
  {/* Similar cards for Avg Latency, Error Rate, Uptime */}
</Grid>
```

### 2. Request Rate Chart (Line Chart)
- X-axis: Time
- Y-axis: Requests per second
- Multiple lines for different routes
- Tooltip showing exact values
- Legend with route names

### 3. Latency Chart (Area Chart)
- X-axis: Time
- Y-axis: Latency (ms)
- Three areas: p50, p95, p99
- Color gradient for visual appeal
- Target lines for SLO thresholds

### 4. Error Rate Chart (Bar Chart)
- X-axis: Time intervals
- Y-axis: Error count
- Stacked bars for 4xx vs 5xx
- Red color for errors

### 5. SLO Gauge (Circular Progress)
- Current SLO percentage
- Target line indicator
- Color coding (green >99%, yellow 95-99%, red <95%)
- Error budget remaining

### 6. Status Code Pie Chart
- Segments for 2xx, 3xx, 4xx, 5xx
- Percentage labels
- Color coding (green, blue, orange, red)

## Test Plan

### Unit Tests (15+)

#### Metrics Service Tests (6 tests)
1. `fetchMetrics()` returns data successfully
2. `fetchMetrics()` handles API errors gracefully
3. `calculateSLO()` computes correct availability
4. `calculateSLO()` computes correct latency SLO
5. `parsePrometheusResponse()` transforms data correctly
6. `getTimeRange()` calculates correct time bounds

#### Metrics Helpers Tests (5 tests)
1. `formatMetricValue()` formats numbers correctly
2. `aggregateMetrics()` groups data by time interval
3. `calculatePercentile()` computes p50, p95, p99
4. `formatTimestamp()` displays dates correctly
5. `calculateTrend()` determines up/down/stable

#### Component Tests (4 tests)
1. `RequestRateChart` renders with data
2. `LatencyChart` displays percentiles correctly
3. `SLOGauge` shows correct percentage
4. `Metrics` page renders all charts

### Integration Tests (2 tests)
1. Dashboard fetches and displays metrics
2. Time range selector updates all charts

### Edge Case Tests (3 tests)
1. Empty state when no metrics available
2. Error state when API fails
3. Loading state while fetching

## Implementation Steps

### Phase 1: Setup & Dependencies (30 min)
1. Install Recharts and date-fns
2. Create type definitions
3. Set up file structure

### Phase 2: Metrics Service (1 hour)
1. Create metrics service with API calls
2. Add mock data for development
3. Write service tests

### Phase 3: Utility Functions (45 min)
1. Create metrics helpers
2. Add data transformation functions
3. Write utility tests

### Phase 4: Chart Components (2 hours)
1. Build RequestRateChart
2. Build LatencyChart
3. Build ErrorChart
4. Build SLOGauge
5. Build StatusPieChart
6. Write component tests

### Phase 5: Dashboard Page (1.5 hours)
1. Create Metrics page layout
2. Add summary cards
3. Integrate all charts
4. Add time range selector
5. Add auto-refresh controls
6. Write dashboard tests

### Phase 6: Integration & Testing (1 hour)
1. Run all tests
2. Fix any issues
3. Build for production
4. Verify bundle size

### Total Estimated Time: ~7 hours

## Success Criteria

- [ ] All 15+ tests passing
- [ ] Production build successful
- [ ] Bundle size increase < 50KB
- [ ] Charts render smoothly (60fps)
- [ ] Dashboard loads < 2s
- [ ] Real-time updates working
- [ ] All metrics display correctly
- [ ] SLO calculations accurate
- [ ] Error handling comprehensive
- [ ] Mobile responsive
- [ ] TypeScript strict mode compliant
- [ ] Zero console warnings/errors

## Mock Data Strategy

For development without backend:
1. Create `mockMetrics.ts` with sample data
2. Use conditional import based on environment
3. Simulate time-series data with random variations
4. Include edge cases (no data, errors, spikes)

## Backend Integration Notes

**Required Backend Changes:**
1. Prometheus scraping endpoint configured
2. `/api/metrics/query` endpoint implemented
3. `/api/metrics/query_range` endpoint implemented
4. `/api/metrics/slo` endpoint for SLO data
5. CORS configured for admin UI
6. Rate limiting on metrics endpoints

**Future Enhancements:**
- WebSocket for real-time push updates
- Metrics aggregation service
- Historical data storage (beyond Prometheus retention)
- Custom metric definitions
- Alerting rules configuration

---

**Next Actions:**
1. Install dependencies (recharts, date-fns)
2. Create type definitions
3. Build metrics service with mock data
4. Create chart components
5. Build dashboard page
6. Write tests
7. Commit and merge to dev
