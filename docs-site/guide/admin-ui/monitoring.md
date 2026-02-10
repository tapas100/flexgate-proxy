# Monitoring & Metrics

Real-time monitoring and performance metrics through the FlexGate Admin UI.

## Monitoring Dashboard

Access comprehensive monitoring at **http://localhost:3000/admin/monitoring**

### Dashboard Layout

The monitoring dashboard consists of:

**Top Section:**
- Time range selector
- Auto-refresh toggle
- Export data button
- Alert configuration

**Main Panels:**
- System Overview (top)
- Traffic Metrics (left)
- Performance Metrics (right)
- Route Breakdown (bottom)

![Monitoring Dashboard](../../assets/monitoring-dashboard.png)

## Time Range Selection

Control the data time window:

**Quick Ranges:**
- Last 5 minutes
- Last 15 minutes
- Last hour
- Last 24 hours
- Last 7 days
- Last 30 days

**Custom Range:**
1. Click **"Custom"**
2. Select start date/time
3. Select end date/time
4. Click **"Apply"**

**Auto-Refresh:**
- Toggle on for live data
- Refresh intervals: 5s, 10s, 30s, 1m, 5m
- Pause/resume anytime

## System Overview

High-level system metrics:

### Current Status Cards

**Requests per Second (RPS)**
```
┌─────────────────────┐
│  2,456 req/sec      │
│  ▲ +12.5% vs 1h ago │
└─────────────────────┘
```

**Average Response Time**
```
┌─────────────────────┐
│  45ms average       │
│  ▼ -8% vs 1h ago    │
└─────────────────────┘
```

**Error Rate**
```
┌─────────────────────┐
│  0.8% errors        │
│  ▲ +0.3% vs 1h ago  │
└─────────────────────┘
```

**Active Connections**
```
┌─────────────────────┐
│  156 active         │
│  ━ No change        │
└─────────────────────┘
```

### System Health Indicators

**Health Status:**
- 🟢 **Healthy** - All systems operational
- 🟡 **Degraded** - Some issues detected
- 🟠 **Warning** - Critical issues
- 🔴 **Critical** - System down

**Component Status:**

| Component | Status | Details |
|-----------|--------|---------|
| FlexGate | 🟢 Healthy | All instances running |
| PostgreSQL | 🟢 Healthy | Connected, 45ms latency |
| Redis | 🟢 Healthy | Connected, 2ms latency |
| HAProxy | 🟢 Healthy | All backends up |
| Prometheus | 🟢 Healthy | Scraping metrics |

## Traffic Metrics

### Request Volume

**Request Rate Chart (Line)**

Shows requests per second over time:
```
req/sec
3000 │                    ╭─╮
2500 │                ╭───╯ ╰╮
2000 │           ╭────╯      ╰─╮
1500 │      ╭────╯             ╰───
1000 │  ╭───╯
 500 │──╯
     └─────────────────────────────
     10:00  11:00  12:00  13:00
```

**Features:**
- Hover for exact values
- Click to zoom in
- Drag to select range
- Multiple series (per route)

**Breakdown by:**
- Total requests
- Successful (2xx)
- Client errors (4xx)
- Server errors (5xx)
- Redirects (3xx)

### Status Code Distribution

**Pie Chart:**

```
     2xx (94%)
    ╱────────╲
   │          │  4xx (4%)
   │    ●     │──────
   │          │
    ╲────────╱
     5xx (2%)
```

**Status Code Table:**

| Code | Count | % | Trend |
|------|-------|---|-------|
| 200 OK | 45,234 | 92.1% | ▼ -1.2% |
| 201 Created | 1,023 | 2.1% | ▲ +5.3% |
| 400 Bad Request | 987 | 2.0% | ▲ +0.8% |
| 404 Not Found | 756 | 1.5% | ━ 0% |
| 429 Rate Limited | 456 | 0.9% | ▲ +12% |
| 500 Server Error | 234 | 0.5% | ▼ -2.1% |
| 502 Bad Gateway | 123 | 0.3% | ▲ +1.5% |
| 503 Unavailable | 87 | 0.2% | ▼ -0.5% |

### Throughput

**Data Transfer:**
- Inbound: 125 MB/s
- Outbound: 342 MB/s
- Total: 467 MB/s

**Bandwidth Chart:**
```
MB/s
400 │         Outbound ─────────
300 │                   ╱╲  ╱╲
200 │                  ╱  ╲╱  ╰─
100 │ Inbound ─────────────────
  0 └─────────────────────────
```

### Top Routes by Traffic

**Bar Chart:**

| Route | Requests | % of Total |
|-------|----------|------------|
| `/api/v1/users/*` | 25,456 | 42% |████████████ |
| `/api/v1/posts/*` | 12,345 | 20% |██████ |
| `/api/v1/search` | 8,234 | 14% |████ |
| `/api/v1/auth/*` | 5,678 | 9% |███ |
| `/api/v1/media/*` | 4,567 | 8% |██ |
| Other | 4,320 | 7% |██ |

## Performance Metrics

### Response Time

**Latency Percentiles:**

```
ms
500 │                         p99
400 │                    ╱────
300 │              ╱────  p95
200 │        ╱─────  p90
100 │  ─────  p50 (median)
  0 └─────────────────────────
```

**Current Values:**

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| p50 (median) | 25ms | <50ms | 🟢 Good |
| p90 | 78ms | <100ms | 🟢 Good |
| p95 | 123ms | <200ms | 🟢 Good |
| p99 | 287ms | <500ms | 🟢 Good |
| Max | 1,234ms | <2000ms | 🟡 Warning |

**Response Time Distribution (Histogram):**

```
Count
5000 │ ████
4000 │ ████
3000 │ ████ ████
2000 │ ████ ████ ████
1000 │ ████ ████ ████ ████
   0 └─────────────────────
     0-50 50-100 100-200 200+
           Response time (ms)
```

### Request Duration Breakdown

Where time is spent:

```
Total Request Time: 125ms
├─ DNS Lookup: 5ms (4%)
├─ TCP Connect: 8ms (6%)
├─ TLS Handshake: 12ms (10%)
├─ Request Send: 2ms (2%)
├─ Wait (TTFB): 78ms (62%)  ← Upstream processing
└─ Response Download: 20ms (16%)
```

### Slow Queries

Recent slow requests:

| Time | Method | Path | Duration | Status |
|------|--------|------|----------|--------|
| 13:45:23 | GET | `/api/v1/users/search` | 1,234ms | 200 |
| 13:44:15 | POST | `/api/v1/posts` | 987ms | 201 |
| 13:42:08 | GET | `/api/v1/analytics` | 856ms | 200 |

Click row to see:
- Full request details
- Response headers
- Tracing information
- Related logs

### Upstream Performance

Performance per upstream server:

**Upstream: `user-service:8080`**
- Avg Response: 45ms
- Error Rate: 0.5%
- Health: 🟢 Healthy
- Active Connections: 23

**Upstream: `post-service:8080`**
- Avg Response: 67ms
- Error Rate: 1.2%
- Health: 🟢 Healthy
- Active Connections: 18

**Upstream: `auth-service:8080`**
- Avg Response: 123ms
- Error Rate: 0.8%
- Health: 🟡 Degraded
- Active Connections: 12

## Route-Specific Metrics

### Select Route

Drill down into specific route metrics:

1. Click **"Select Route"** dropdown
2. Search or browse routes
3. Select route
4. View detailed metrics

### Route Dashboard

Per-route metrics include:

**Traffic Panel:**
- Total requests
- Request rate
- Success rate
- Error breakdown

**Performance Panel:**
- Response times (p50, p90, p95, p99)
- Throughput
- Connection stats

**Health Panel:**
- Upstream health status
- Circuit breaker state
- Health check results

**Rate Limiting Panel:**
- Rate limit hits
- Blocked requests
- Top blocked IPs

**Caching Panel:**
- Cache hit rate
- Cache size
- Cached responses

### Route Comparison

Compare multiple routes:

1. Click **"Compare Routes"**
2. Select up to 5 routes
3. View side-by-side metrics

**Comparison Table:**

| Metric | Route A | Route B | Route C |
|--------|---------|---------|---------|
| RPS | 1,234 | 567 | 890 |
| Avg Response | 45ms | 67ms | 123ms |
| Error Rate | 0.5% | 1.2% | 0.8% |
| Cache Hit Rate | 87% | 45% | 92% |

## Error Analysis

### Error Rate Trends

Track errors over time:

```
Error %
5.0 │                     ╭─╮
4.0 │                  ╭──╯ ╰╮
3.0 │               ╭──╯     ╰─
2.0 │            ╭──╯
1.0 │      ╭─────╯
0.0 └──────────────────────────
```

### Error Types

Breakdown by category:

| Type | Count | % | Impact |
|------|-------|---|--------|
| Client Errors (4xx) | 1,234 | 2.5% | 🟡 Medium |
| Server Errors (5xx) | 456 | 0.9% | 🔴 High |
| Timeout Errors | 123 | 0.2% | 🔴 High |
| Circuit Breaker | 89 | 0.2% | 🟠 Medium |
| Rate Limit | 567 | 1.1% | 🟢 Low |

### Error Details Table

Recent errors with full context:

| Time | Route | Error | Status | Message |
|------|-------|-------|--------|---------|
| 13:45 | `/api/users` | Server Error | 500 | Internal server error |
| 13:44 | `/api/posts` | Bad Gateway | 502 | Upstream unreachable |
| 13:43 | `/api/auth` | Timeout | 504 | Request timeout |

**Click error for:**
- Full stack trace
- Request/response details
- Correlated logs
- Similar errors

### Error Rate Alerts

Configure alerts for error spikes:

**Alert Rules:**
1. Error rate > 5% for 5 minutes
2. 5xx errors > 1% for 2 minutes
3. Specific route error rate > 10%

**Notification:**
- Email
- Slack
- PagerDuty
- Webhook

## Circuit Breaker Status

### Circuit Breaker Dashboard

Monitor all circuit breakers:

**Circuit States:**

| Route | State | Failures | Last Trip | Next Check |
|-------|-------|----------|-----------|------------|
| `/api/users` | 🟢 CLOSED | 0 | Never | - |
| `/api/posts` | 🟡 HALF_OPEN | 2 | 10m ago | Testing |
| `/api/legacy` | 🔴 OPEN | 156 | 5m ago | 25m |

**State Definitions:**
- 🟢 **CLOSED** - Normal operation
- 🟡 **HALF_OPEN** - Testing recovery
- 🔴 **OPEN** - Failing fast

### Circuit Breaker Events

Timeline of circuit breaker state changes:

```
13:45 [api/legacy] CLOSED → OPEN (50% errors, 156 failures)
13:35 [api/posts] OPEN → HALF_OPEN (timeout expired)
13:30 [api/posts] CLOSED → OPEN (timeout errors)
```

### Manual Circuit Breaker Control

**Actions:**
- **Reset** - Force circuit to CLOSED
- **Trip** - Force circuit to OPEN
- **Configure** - Adjust thresholds

## Rate Limiting Metrics

### Rate Limit Dashboard

Track rate limiting effectiveness:

**Overall Stats:**
- Total rate limited requests: 2,345
- Top limited IPs: 45
- Most limited routes: 8

**Rate Limit Chart:**

```
Blocked Requests
500 │        ╭───╮
400 │     ╭──╯   ╰─╮
300 │  ╭──╯        ╰──╮
200 │──╯              ╰─
100 │
    └────────────────────
```

### Top Blocked IPs

IPs hitting rate limits:

| IP Address | Blocks | Route | Last Blocked |
|------------|--------|-------|--------------|
| 192.168.1.100 | 234 | `/api/search` | 2m ago |
| 10.0.0.45 | 189 | `/api/users` | 5m ago |
| 172.16.0.12 | 156 | `/api/posts` | 8m ago |

**Actions:**
- View IP details
- Temporary ban
- Whitelist
- Investigate

### Rate Limit Effectiveness

Measure protection quality:

**Metrics:**
- Legitimate traffic allowed: 98.5%
- Malicious traffic blocked: 1.5%
- False positives: 0.2%
- False negatives: Estimated <0.1%

## Cache Performance

### Cache Hit Rate

Track caching effectiveness:

```
Hit Rate %
100 │ ────────────────────
 80 │     ╱────────╲
 60 │    ╱          ╲
 40 │ ───              ────
 20 │
  0 └──────────────────────
```

**Current Stats:**
- Hit Rate: 87%
- Hits: 45,234
- Misses: 6,789
- Cache Size: 245 MB
- Evictions: 123

### Cache by Route

Per-route cache performance:

| Route | Hit Rate | Hits | Size | TTL |
|-------|----------|------|------|-----|
| `/api/posts` | 92% | 12,345 | 89 MB | 5m |
| `/api/users` | 85% | 23,456 | 123 MB | 10m |
| `/api/search` | 45% | 8,901 | 33 MB | 1m |

### Cache Operations

**Actions:**
- Clear cache (all or per route)
- Invalidate specific entries
- Warm cache
- Adjust TTL

## Live Traffic View

### Real-time Request Stream

Watch requests as they happen:

```
🟢 13:45:23.123 GET  /api/users/123    200  45ms  192.168.1.100
🟢 13:45:23.234 POST /api/posts        201  123ms 10.0.0.5
🔴 13:45:23.345 GET  /api/legacy/data  502  5000ms 172.16.0.8
🟡 13:45:23.456 GET  /api/search       429  2ms   192.168.1.100
🟢 13:45:23.567 GET  /api/health       200  1ms   127.0.0.1
```

**Color Coding:**
- 🟢 Success (2xx, 3xx)
- 🟡 Client Error (4xx)
- 🔴 Server Error (5xx)

**Features:**
- Pause/resume stream
- Filter by status, route, IP
- Search in real-time
- Export visible logs

### Request Details

Click any request to see:

**Request Tab:**
- Method, path, query
- Headers
- Body (if any)
- Client IP, user agent

**Response Tab:**
- Status code
- Headers
- Body (formatted)
- Size

**Timing Tab:**
- DNS lookup
- Connection time
- TLS handshake
- Request sent
- TTFB
- Download time
- Total time

**Trace Tab:**
- Request ID
- Parent span
- Child spans
- Distributed trace

## Custom Dashboards

### Create Dashboard

Build custom monitoring views:

1. Click **"New Dashboard"**
2. Name dashboard
3. Add widgets:
   - Metrics chart
   - Status card
   - Table
   - Gauge
   - Heatmap

### Widget Configuration

**Chart Widget:**
- Select metric(s)
- Choose chart type (line, bar, pie)
- Set time range
- Configure thresholds

**Example Widgets:**
- "API Error Rate by Service"
- "Top 10 Slowest Endpoints"
- "Cache Hit Rate Trend"
- "Rate Limit Blocks by IP"

### Share Dashboards

- Save dashboard
- Share URL
- Export dashboard JSON
- Import dashboard

## Alerts & Notifications

### Alert Configuration

Set up intelligent alerts:

**Alert Types:**

1. **Threshold Alert**
   - Metric exceeds value
   - Example: Error rate > 5%

2. **Anomaly Detection**
   - ML-based anomaly detection
   - Example: Unusual traffic pattern

3. **Composite Alert**
   - Multiple conditions
   - Example: High errors AND slow response

### Alert Rules

**Create Alert Rule:**

```yaml
name: High Error Rate
condition: error_rate > 5%
duration: 5m
severity: warning
notifications:
  - email: ops@example.com
  - slack: #alerts
throttle: 15m
```

**Alert States:**
- 🟢 **OK** - Condition not met
- 🟡 **Warning** - Threshold approaching
- 🔴 **Critical** - Condition met
- 🔵 **Acknowledged** - Alert seen

### Notification Channels

Configure where alerts go:

**Email:**
- Recipients
- Subject template
- Body template

**Slack:**
- Workspace
- Channel
- Mention @user or @channel

**Webhook:**
- URL
- HTTP method
- Headers
- Payload template

**PagerDuty:**
- Service key
- Severity mapping
- Auto-resolve

### Alert History

View past alerts:

| Time | Alert | Severity | Duration | Status |
|------|-------|----------|----------|--------|
| 13:45 | High Error Rate | 🔴 Critical | 5m | Resolved |
| 13:30 | Slow Response | 🟡 Warning | 12m | Resolved |
| 12:15 | Circuit Breaker | 🔴 Critical | 2m | Resolved |

## Data Export

### Export Options

Export monitoring data for analysis:

**Format:**
- CSV
- JSON
- Parquet
- Excel

**Data:**
- Metrics (time series)
- Logs
- Traces
- Alerts

**Time Range:**
- Current view
- Custom range
- Last N days

### Export Process

1. Click **"Export Data"**
2. Select data type
3. Choose format
4. Select time range
5. Click **"Download"**

**Example CSV:**
```csv
timestamp,route,method,status,response_time_ms
2026-02-09T13:45:23Z,/api/users,GET,200,45
2026-02-09T13:45:24Z,/api/posts,POST,201,123
```

## Best Practices

### Monitoring Strategy

1. **Set Baselines**
   - Establish normal ranges
   - Monitor for deviations
   - Adjust thresholds

2. **Alert Fatigue**
   - Avoid too many alerts
   - Use severity levels
   - Aggregate related alerts
   - Set throttling

3. **Dashboard Organization**
   - Overview dashboard (high-level)
   - Service dashboards (per team)
   - Incident dashboard (on-call)

4. **Data Retention**
   - Real-time: 24 hours
   - High resolution: 7 days
   - Aggregated: 90 days
   - Long-term: 1 year (sampled)

### Performance Monitoring

Monitor these key metrics:

**Golden Signals:**
1. Latency (response time)
2. Traffic (request rate)
3. Errors (error rate)
4. Saturation (resource usage)

**SLIs (Service Level Indicators):**
- Availability: 99.9%
- Latency p99: <500ms
- Error rate: <1%
- Throughput: >10k req/sec

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `R` | Refresh data |
| `P` | Pause auto-refresh |
| `T` | Change time range |
| `E` | Export data |
| `F` | Toggle fullscreen |
| `L` | Open live traffic |
| `S` | Search/filter |

## Next Steps

- **[Route Management](./routes.md)** - Configure routes
- **[Settings](./settings.md)** - Global configuration
- **[Prometheus Guide](../observability/prometheus.md)** - Advanced metrics

---

**Need help?** Join our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions).
