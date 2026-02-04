# Database Routes Integration Fix

**Date:** January 29, 2026  
**Issue:** Routes created via Admin UI were not being used by the proxy - no metrics generated

---

## 🐛 Problem

### Symptoms
1. Routes were visible in Admin UI (/routes page)
2. Routes were stored in database successfully
3. But proxy was not routing traffic to those upstreams
4. Dashboard showed no metrics (totalRequests: 0)
5. All requests to proxy routes returned 404 Not Found

### Root Causes

**Issue #1: Routes Only Loaded from Config File**

The proxy server was only loading routes from the config file (`config/proxy.yml`), never from the database:

```typescript
// OLD CODE - Only config routes
const routes = config.get<ProxyRoute[]>('routes', []) || [];
routes.forEach((route: ProxyRoute) => {
  // Setup proxy for config routes only
});
```

Routes created via the Admin UI were saved to the PostgreSQL `routes` table but never loaded by the proxy.

**Issue #2: Wildcard Route Handling**

Database routes use wildcards like `/httpbin/*`, but Express middleware requires special handling:

```typescript
// WRONG: Express doesn't match /httpbin/get with /httpbin/*
app.use('/httpbin/*', proxy);

// CORRECT: Remove /* and use pathRewrite
app.use('/httpbin', proxy({ pathRewrite: { '^/httpbin': '' } }));
```

**Issue #3: Middleware Registration Order**

The static file middleware for the Admin UI was registered **before** database routes were loaded asynchronously:

```typescript
// WRONG ORDER:
app.use(express.static(adminUIPath));  // Registered immediately
// ... later, asynchronously ...
database.initialize().then(() => loadRoutes());  // Routes registered too late!
```

In Express, middleware order matters - the static file handler was catching all requests before they reached the proxy routes.

---

## ✅ Solution

### Fix #1: Load Routes from Database

Created a `loadAndSetupRoutes()` function that loads routes from both config file AND database:

```typescript
async function loadAndSetupRoutes() {
  // Load routes from config file
  const configRoutes = config.get<ProxyRoute[]>('routes', []) || [];
  logger.info(`Loading ${configRoutes.length} routes from config file`);
  configRoutes.forEach(setupProxyRoute);
  
  // Load routes from database
  try {
    const result = await database.query('SELECT * FROM routes WHERE enabled = true ORDER BY created_at DESC');
    const dbRoutes = result.rows.map((row: any) => ({
      id: row.route_id,
      path: row.path,
      upstream: row.upstream,  // This is a URL for database routes
      methods: row.methods || ['GET'],
      enabled: row.enabled !== false,
      stripPath: row.strip_path,
      rateLimit: row.rate_limit_enabled ? {
        enabled: row.rate_limit_enabled,
        max: row.rate_limit_max || 100,
        windowMs: row.rate_limit_window_ms || 60000,
        message: row.rate_limit_message,
      } : undefined,
      timeout: row.timeout,
    } as ProxyRoute));
    
    logger.info(`Loading ${dbRoutes.length} routes from database`);
    dbRoutes.forEach(setupProxyRoute);
  } catch (error) {
    logger.warn('Failed to load routes from database - continuing with config routes only', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
```

### Fix #2: Handle Wildcard Routes

Modified `setupProxyRoute()` to handle wildcard routes properly:

```typescript
function setupProxyRoute(route: ProxyRoute) {
  // Handle wildcard routes - convert /path/* to /path and strip the base path
  let expressPath = route.path;
  let pathRewrite: { [key: string]: string } | undefined;
  
  if (route.path.endsWith('/*')) {
    expressPath = route.path.slice(0, -2); // Remove /*
    pathRewrite = {
      [`^${expressPath}`]: '' // Strip the base path
    };
  } else if (route.stripPath) {
    pathRewrite = {
      [`^${route.stripPath}`]: ''
    };
  }
  
  // Create proxy middleware with pathRewrite
  const proxyOptions: ProxyOptions = {
    target: upstreamUrl,
    changeOrigin: true,
    pathRewrite,  // Use calculated pathRewrite
    // ... other options
  };
  
  // Register with Express using cleaned path
  app.use(expressPath, createProxyMiddleware(proxyOptions));
}
```

### Fix #3: Correct Middleware Registration Order

Moved admin UI static file registration to **AFTER** database routes are loaded:

```typescript
// Initialize routes after database is ready
database.initialize()
  .then(() => loadAndSetupRoutes())
  .then(() => {
    // Register admin UI static files AFTER dynamic routes are loaded
    // This ensures proxy routes take precedence
    const adminUIPath = path.join(__dirname, '..', 'admin-ui', 'build');
    app.use(express.static(adminUIPath));

    // Handle client-side routing
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Skip proxy routes
      if (req.path.startsWith('/api/') || 
          req.path.startsWith('/health') || 
          req.path.startsWith('/httpbin/') ||
          req.path.startsWith('/external/') ||
          req.path.startsWith('/test-api/')) {
        return next();
      }
      
      res.sendFile(path.join(adminUIPath, 'index.html'));
    });

    // Register error handlers
    // ...

    logger.info('✅ All routes configured and server ready');
  })
  .catch((err: Error) => {
    logger.warn('Database initialization failed - loading config routes only', { error: err.message });
    // Fallback to config routes only
  });
```

### Fix #4: Handle Database Route Format

Database routes store upstream as a full URL, not a name reference:

```typescript
// Database route format:
{
  path: '/httpbin/*',
  upstream: 'https://httpbin.org',  // Full URL
  methods: ['GET', 'POST']
}

// Config route format:
{
  path: '/httpbin/*',
  upstream: 'httpbin',  // Name reference
  methods: ['GET', 'POST']
}
```

Updated `setupProxyRoute()` to handle both formats:

```typescript
function setupProxyRoute(route: ProxyRoute) {
  let upstream: Upstream | undefined;
  let upstreamUrl: string;
  let upstreamName: string;
  
  if (route.upstream.startsWith('http://') || route.upstream.startsWith('https://')) {
    // Database route - upstream is a URL
    upstreamUrl = route.upstream;
    upstreamName = new URL(route.upstream).host;
    upstream = {
      name: upstreamName,
      url: upstreamUrl,
    } as Upstream;
  } else {
    // Config route - upstream is a name reference
    upstream = upstreams.find((u: Upstream) => u.name === route.upstream);
    if (!upstream) {
      logger.error(`Route ${route.path} references unknown upstream: ${route.upstream}`);
      return;
    }
    upstreamUrl = upstream.url;
    upstreamName = upstream.name;
  }
  
  // ... setup proxy with upstreamUrl and upstreamName
}
```

---

## 🧪 Testing

### Before Fix

**Test 1: Route Proxying**
```bash
curl http://localhost:3000/httpbin/get
# Response: 404 Not Found
```

**Test 2: Metrics Dashboard**
- Dashboard showed: **Total Requests: 0**
- No real-time data flowing
- Metrics stream empty

**Test 3: Database Check**
```bash
curl http://localhost:3000/api/routes | jq '.data | length'
# Response: 5 routes in database

# But they weren't being used!
```

### After Fix

**Test 1: Route Proxying**
```bash
curl http://localhost:3000/httpbin/get | jq '.url'
# Response: "https://httpbin.org/get"
✅ Route works!

curl http://localhost:3000/external/api/posts/1 | jq '.title'
# Response: "sunt aut facere repellat..."
✅ Route works!
```

**Test 2: Metrics Dashboard**
```bash
curl -s http://localhost:3000/api/stream/metrics 2>&1 | head -3
# Response:
data: {"type":"connected","clientId":"..."}
data: {"summary":{"totalRequests":68,"avgLatency":"0.19","errorRate":"0.0000",...
✅ Real-time metrics flowing!
```

**Test 3: Server Logs**
```bash
grep "Loading.*routes" /tmp/flexgate-server.log
# Response:
"Loading 2 routes from config file"
"Loading 5 routes from database"

grep "Route configured" /tmp/flexgate-server.log
# Response:
"Route configured: /httpbin/* -> httpbin.org (https://httpbin.org)"
"Route configured: /external/api/* -> jsonplaceholder.typicode.com (...)"
"Route configured: /test-api/* -> api.example.com (...)"
"Route configured: /api/users -> localhost:8080 (...)"
"Route configured: /api/stream/metrics -> localhost:3000 (...)"
✅ All routes loaded from database!
```

---

## 📝 Files Changed

| File | Changes | Description |
|------|---------|-------------|
| `app.ts` | +100, -50 | Added database route loading, wildcard handling, fixed middleware order |

---

## 🎯 Impact

### Before Fix
- ❌ Routes created in Admin UI were ignored
- ❌ No metrics generated from proxy traffic
- ❌ Dashboard showed totalRequests: 0
- ❌ Users couldn't dynamically create routes without editing config files

### After Fix
- ✅ Routes created in Admin UI work immediately (after server restart)
- ✅ Metrics are collected from all proxy traffic
- ✅ Dashboard shows real-time metrics: **68 requests, 0.19ms avg latency**
- ✅ Users can create routes via Admin UI without touching config files
- ✅ Both config routes AND database routes are supported

---

## 📊 Metrics Now Flowing

Dashboard SSE stream showing real data:

```json
{
  "summary": {
    "totalRequests": 68,
    "avgLatency": "0.19",
    "errorRate": "0.0000",
    "availability": "100.0000",
    "p50Latency": "0.00",
    "p95Latency": "1.00",
    "p99Latency": "1.00",
    "serverErrors": 0,
    "clientErrors": 0,
    "successfulRequests": 68
  },
  "requestRate": {
    "name": "Request Rate",
    "data": [
      {"timestamp": "2026-01-29T13:11:00.000Z", "value": "4.40"},
      {"timestamp": "2026-01-29T13:15:00.000Z", "value": "8.00"},
      {"timestamp": "2026-01-29T14:47:00.000Z", "value": "0.40"},
      {"timestamp": "2026-01-29T15:17:00.000Z", "value": "0.40"},
      {"timestamp": "2026-01-29T15:21:00.000Z", "value": "0.40"}
    ],
    "unit": "req/s"
  },
  "statusCodes": [
    {"code": 200, "count": 68}
  ]
}
```

---

## 🚀 Next Steps

1. **Hot Reloading (Future):** Currently requires server restart to load new routes from database
   - Could implement route hot-reloading by watching database changes
   - Or expose an API endpoint to reload routes: `POST /api/routes/reload`

2. **Route Priority:** Currently config routes and database routes are loaded in order
   - Could add priority field to control which routes take precedence

3. **Route Validation:** Add more validation when loading routes from database
   - Check upstream URL is reachable
   - Validate path patterns
   - Check for conflicts with existing routes

---

**Status:** ✅ **FIXED and WORKING**

Routes created via Admin UI now work correctly. Metrics are flowing from real proxy traffic. Dashboard displays live data.
