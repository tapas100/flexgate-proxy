# Managing Routes

Complete guide to creating, editing, and managing routes through the FlexGate Admin UI.

## Routes Dashboard

The Routes page is your central hub for managing all API routes in FlexGate.

### Accessing Routes

1. Login to Admin UI at http://localhost:3000/admin
2. Click **"Routes"** in the left sidebar
3. You'll see the routes management dashboard


### Dashboard Overview

The routes dashboard displays:

**Stats Cards (Top):**
- Total Routes
- Active Routes
- Routes with Errors
- Total Traffic (24h)

**Routes Table:**
- Route ID and Path
- Upstream URL
- Status (Enabled/Disabled)
- Health Status
- Traffic Stats
- Quick Actions

**Toolbar:**
- Search bar
- Filter options
- Add Route button
- Bulk actions
- Import/Export

## Creating a New Route

### Method 1: Quick Create

For simple routes, use the quick create form:

1. Click **"Add Route"** button (top right)
2. Fill in the essential fields:
   - **Path:** `/api/example`
   - **Upstream:** `http://backend:8080`
   - **Methods:** Select methods (GET, POST, etc.)
3. Click **"Create"**

The route is created with default settings and immediately active.

### Method 2: Advanced Create

For routes with advanced configuration:

1. Click **"Add Route"** → **"Advanced"**
2. Fill in the comprehensive form with all sections
3. Preview the configuration
4. Click **"Create and Configure"**

### Route Creation Form

#### General Settings

**Required Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| **Route ID** | Unique identifier | `api-users-v1` |
| **Path** | URL path pattern | `/api/v1/users/*` |
| **Upstream** | Backend server URL | `http://user-service:8080` |

**Optional Fields:**

| Field | Description | Default |
|-------|-------------|---------|
| **Methods** | HTTP methods | All methods |
| **Description** | Human-readable desc | Empty |
| **Priority** | Route matching order | 50 |
| **Enabled** | Active status | true |
| **Tags** | Organizational tags | [] |

**Path Pattern Helper:**

The UI provides a pattern helper with examples:
- `/exact/path` - Exact match
- `/prefix/*` - Prefix match
- `/api/*/resource` - Wildcard match
- Click **"Pattern Guide"** for regex examples

**Upstream Validation:**

The form validates upstream URLs:
- ✅ `http://backend:8080`
- ✅ `https://api.example.com`
- ✅ `http://192.168.1.100:3000`
- ❌ `backend:8080` (missing protocol)
- ❌ `https://` (missing host)

#### Rate Limiting Section

Enable and configure rate limiting:

1. Toggle **"Enable Rate Limiting"** 
2. Configure settings:

**Basic Settings:**
- **Max Requests:** `100`
- **Time Window:** `60000` ms (1 minute)
- **Strategy:** Dropdown with options:
  - Token Bucket (recommended)
  - Fixed Window
  - Sliding Window
  - Leaky Bucket

**Advanced Settings:**
- **Scope:** IP Address, User, API Key, Route
- **Key Generator:** Custom expression
- **Skip Successful Requests:** Checkbox
- **Skip Failed Requests:** Checkbox

**Custom Response:**
- **Status Code:** `429`
- **Message:** Custom error message
- **Headers:** Add X-RateLimit-* headers

**Preview Panel:**

The UI shows a live preview:
```
With current settings:
- Users can make 100 requests per minute
- Requests are limited per IP address
- Excess requests return 429 status
- Rate limit resets every 60 seconds
```

#### Health Checks Section

Configure upstream health monitoring:

1. Toggle **"Enable Health Checks"**
2. Configure:

**Health Check URL:**
- Default: Same as upstream + `/health`
- Custom: Enter specific endpoint
- Test button validates endpoint

**Timing:**
- **Interval:** `30000` ms (30 seconds)
- **Timeout:** `5000` ms (5 seconds)

**Thresholds:**
- **Healthy Threshold:** `2` successes
- **Unhealthy Threshold:** `3` failures

**Expected Response:**
- **Status Code:** `200`
- **Contains Text:** Optional validation

**Status Indicator:**

Live health status shows:
- 🟢 **Healthy** - All checks passing
- 🟡 **Degraded** - Some checks failing
- 🔴 **Unhealthy** - Health checks failing
- ⚪ **Unknown** - No health data yet

#### Circuit Breaker Section

Protect against cascading failures:

1. Toggle **"Enable Circuit Breaker"**
2. Configure:

**Thresholds:**
- **Error Threshold:** `50` % (0-100)
- **Volume Threshold:** `10` requests minimum
- **Timeout:** `30000` ms (open duration)
- **Reset Timeout:** `60000` ms (recovery attempt)

**Error Conditions:**
- **Status Codes:** 500, 502, 503, 504
- **Network Errors:** ECONNREFUSED, ETIMEDOUT

**Fallback Response:**
- **Status Code:** `503`
- **Response Body:** JSON or text
- **Custom Headers:** Optional

**Circuit State Visualization:**

The UI shows current state:
```
[CLOSED] ──error threshold──> [OPEN]
   ▲                              │
   │                              │
   └───successful requests────[HALF_OPEN]
```

#### Headers Section

Add, remove, or modify headers:

**Request Headers:**

| Action | Name | Value | Direction |
|--------|------|-------|-----------|
| Add | `X-API-Version` | `v1` | Request |
| Add | `X-Request-ID` | `${requestId}` | Request |
| Remove | `X-Internal-Token` | - | Request |

Click **"+ Add Header"** to add more.

**Response Headers:**

| Action | Name | Value | Direction |
|--------|------|-------|-----------|
| Add | `X-Powered-By` | `FlexGate` | Response |
| Remove | `Server` | - | Response |

**Dynamic Values:**

Use variables in header values:
- `${requestId}` - Unique request ID
- `${timestamp}` - Current timestamp
- `${clientIp}` - Client IP address
- `${route}` - Route ID
- `${method}` - HTTP method
- `${responseTime}` - Response time in ms

#### Authentication Section

Secure your route:

**Type Selection:**
- None (public route)
- JWT
- API Key
- OAuth 2.0
- Custom

**JWT Configuration:**
- **Secret:** Use environment variable
- **Algorithm:** HS256, RS256, etc.
- **Issuer Validation:** Enable/disable
- **Audience Validation:** Enable/disable
- **Expiration Check:** Enable/disable

**API Key Configuration:**
- **Header Name:** `X-API-Key`
- **Query Parameter:** `api_key`
- **Validation Source:** Database or config

**Test Authentication:**

Click **"Test Auth"** to validate:
- Paste a test token/key
- Click **"Validate"**
- See validation result

#### Caching Section

Enable response caching:

1. Toggle **"Enable Caching"**
2. Configure:

**Cache Settings:**
- **TTL:** `300000` ms (5 minutes)
- **Storage:** Redis or Memory
- **Max Size:** `10MB` per cache entry

**Cache Key:**

Select components to vary cache by:
- ☑ HTTP Method
- ☑ Path
- ☑ Query Parameters
- ☐ Headers (select specific)
- ☐ Body (hash)

**Cache Control:**
- ☑ Respect Cache-Control headers
- ☑ Respect Vary headers
- Cache only status codes: 200, 301, 404

**Cache Statistics:**

View cache performance:
- Hit Rate: 87%
- Hits: 1,234
- Misses: 182
- Size: 45MB

#### Timeouts Section

Configure connection and request timeouts:

**Timeout Settings:**
- **Connect Timeout:** `5000` ms
- **Request Timeout:** `30000` ms
- **Keep-Alive Timeout:** `60000` ms

**Visual Timeout Guide:**

```
Client ─[5s]─> FlexGate ─[5s]─> Upstream
         connect timeout   

FlexGate ──────[30s]──────> Upstream
         request timeout
```

#### Retry Logic Section

Automatically retry failed requests:

1. Toggle **"Enable Retry"**
2. Configure:

**Retry Settings:**
- **Max Attempts:** `3`
- **Backoff Strategy:** Exponential
- **Initial Delay:** `100` ms
- **Max Delay:** `10000` ms
- **Multiplier:** `2`

**Retry Conditions:**

Retry on these status codes:
- ☑ 502 (Bad Gateway)
- ☑ 503 (Service Unavailable)
- ☑ 504 (Gateway Timeout)

Do NOT retry on:
- ☑ 400 (Bad Request)
- ☑ 401 (Unauthorized)
- ☑ 404 (Not Found)

**Retry Visualization:**

```
Attempt 1: 100ms delay
Attempt 2: 200ms delay (×2)
Attempt 3: 400ms delay (×2)
```

### Form Validation

The form validates input in real-time:

**Validation States:**
- 🟢 **Valid** - Green checkmark
- 🔴 **Invalid** - Red error message
- 🟡 **Warning** - Yellow warning icon

**Common Validation Errors:**
- "Path must start with /"
- "Upstream URL is invalid"
- "Rate limit max must be > 0"
- "Timeout must be between 1000 and 300000"

### Configuration Preview

Before saving, preview your configuration:

1. Click **"Preview"** tab
2. See YAML representation
3. Validate configuration
4. Copy to clipboard

```yaml
id: api-users-v1
path: /api/v1/users/*
upstream: http://user-service:8080
methods: [GET, POST]
enabled: true
rateLimit:
  enabled: true
  max: 100
  windowMs: 60000
# ... full configuration
```

### Saving the Route

**Save Options:**
1. **Save** - Create/update route
2. **Save & Test** - Save and open test panel
3. **Save Draft** - Save as disabled route
4. **Schedule** - Schedule activation time

**After Saving:**
- Success notification appears
- Redirected to route details
- Route appears in routes list
- HAProxy configuration updated

## Editing Existing Routes

### Quick Edit

For simple changes:

1. Hover over route in table
2. Click **pencil icon** (edit)
3. Modify fields in inline editor
4. Click **"Save"** or press Enter
5. Changes applied immediately

**Quick Editable Fields:**
- Enabled/Disabled toggle
- Upstream URL
- Priority

### Full Edit

For comprehensive changes:

1. Click route row in table
2. Full edit form opens
3. Modify any section
4. Click **"Save Changes"**

**Edit History:**

The UI shows change history:
- Who made changes
- When changes were made
- What was changed (diff view)
- Rollback option

### Bulk Editing

Edit multiple routes at once:

1. Select routes (checkboxes)
2. Click **"Bulk Actions"**
3. Choose action:
   - Enable/Disable
   - Change priority
   - Add tags
   - Update headers
   - Export

## Testing Routes

### Built-in Test Panel

Test routes without leaving the Admin UI:

1. Open route details
2. Click **"Test"** tab
3. Configure test request:

**Request Configuration:**
- **Method:** GET, POST, PUT, DELETE
- **Path:** `/api/v1/users/123`
- **Headers:** Add custom headers
- **Body:** JSON, XML, or form data
- **Auth:** Include token/key

**Send Request:**

Click **"Send"** to test:

**Response Display:**
- Status code with color coding
- Response headers
- Response body (formatted)
- Response time
- Size

**Response Tabs:**
- Pretty (formatted JSON/XML)
- Raw (original response)
- Headers (all headers)
- Timeline (request lifecycle)

**Save Test:**

Save test for reuse:
- Name the test
- Save request configuration
- Run anytime with one click

### Request History

View recent test requests:
- Last 10 tests
- Status and response time
- Click to view details
- Rerun previous tests

## Monitoring Routes

### Route Metrics

Each route has detailed metrics:

**Traffic Metrics:**
- Requests per second (live)
- Total requests (24h, 7d, 30d)
- Success rate (2xx/total)
- Error rate (4xx, 5xx)

**Performance Metrics:**
- Average response time
- P50, P95, P99 latency
- Slowest requests
- Fastest requests

**Charts:**
- Request rate over time (line chart)
- Response time distribution (histogram)
- Status code breakdown (pie chart)
- Error rate trend (area chart)

### Live Traffic View

Watch requests in real-time:

1. Click **"Live Traffic"** button
2. See streaming requests:

```
10:30:15 GET /api/users/123 → 200 (45ms)
10:30:16 POST /api/users → 201 (123ms)
10:30:17 GET /api/users → 200 (12ms)
```

**Filters:**
- Filter by status code
- Filter by response time
- Filter by client IP
- Full-text search

### Alerts

Set up alerts for route issues:

**Alert Types:**
- High error rate (>5%)
- Slow response time (>1000ms)
- Circuit breaker opened
- Health check failing
- Rate limit frequently hit

**Notification Channels:**
- Email
- Slack
- Webhook
- SMS (via integration)

## Route Organization

### Tags

Organize routes with tags:

**Adding Tags:**
1. Edit route
2. Tags section
3. Type tag name
4. Press Enter
5. Save route

**Common Tags:**
- `production`
- `staging`
- `public`
- `internal`
- `v1`, `v2`
- `deprecated`

**Filter by Tags:**
- Click tag in route list
- See all routes with that tag
- Combine multiple tags

### Folders/Groups

Group related routes:

1. Click **"Create Group"**
2. Name the group (e.g., "User API")
3. Drag routes into group
4. Collapse/expand groups

**Group Actions:**
- Enable/disable all routes
- Export group
- Clone group
- Delete group

### Search & Filters

Powerful search capabilities:

**Quick Search:**
- Type in search bar
- Searches path, upstream, ID, description
- Real-time results

**Advanced Filters:**
- **Status:** Enabled, Disabled, All
- **Health:** Healthy, Unhealthy, Unknown
- **Tags:** Any, All, None
- **Traffic:** High, Medium, Low, None
- **Errors:** Has errors, No errors

**Saved Filters:**
- Save filter combinations
- Quick access from dropdown
- Share filters with team

## Import & Export

### Export Routes

Export routes for backup or migration:

**Export Options:**
1. Click **"Export"** button
2. Select routes (or all)
3. Choose format:
   - YAML
   - JSON
   - CSV (limited fields)
4. Download file

**Example Export (YAML):**
```yaml
routes:
  - id: api-users-v1
    path: /api/v1/users/*
    upstream: http://user-service:8080
    # ... full configuration
  - id: api-orders-v1
    # ...
```

### Import Routes

Import routes from file:

**Import Process:**
1. Click **"Import"** button
2. Upload file (YAML or JSON)
3. Review preview:
   - New routes (green)
   - Updated routes (yellow)
   - Conflicts (red)
4. Resolve conflicts:
   - Keep existing
   - Overwrite
   - Create new (rename)
5. Click **"Import"**

**Validation:**

The import validates:
- ✅ Valid YAML/JSON syntax
- ✅ Required fields present
- ✅ Valid configuration values
- ✅ No ID conflicts
- ✅ Upstream URLs reachable

**Dry Run:**

Test import without applying:
- Shows what would change
- Validates configuration
- No actual changes made

## Clone Route

Create a copy of existing route:

1. Click route **menu icon** (⋮)
2. Select **"Clone"**
3. New route created with:
   - Same configuration
   - New ID (with `-copy` suffix)
   - Disabled by default
4. Edit and enable when ready

**Use Cases:**
- Create staging version of production route
- Test configuration changes safely
- Create similar routes quickly

## Delete Routes

Remove routes safely:

**Delete Single Route:**
1. Click route menu icon (⋮)
2. Select **"Delete"**
3. Confirm deletion
4. Route removed immediately

**Soft Delete:**

Routes are soft-deleted by default:
- Marked as deleted
- Hidden from list
- Can be restored for 30 days
- Permanently deleted after 30 days

**Restore Deleted Route:**
1. Click **"Show Deleted"** toggle
2. Find deleted route
3. Click **"Restore"**
4. Route reactivated

**Bulk Delete:**
1. Select multiple routes
2. Click **"Bulk Actions"** → **"Delete"**
3. Confirm deletion
4. All selected routes deleted

## Troubleshooting

### Route Not Receiving Traffic

**Checklist:**
- ✅ Route is enabled
- ✅ Path pattern matches requests
- ✅ Priority is appropriate
- ✅ No higher-priority route intercepting
- ✅ HAProxy configuration updated

**Debug Steps:**
1. Check route in Admin UI
2. View "Live Traffic" - any requests?
3. Check HAProxy logs
4. Test with curl
5. Enable debug logging

### 502 Bad Gateway Errors

**Common Causes:**
- Upstream server down
- Upstream unreachable
- DNS resolution failure
- Connection timeout too low

**Solutions:**
1. Check upstream health status
2. Test upstream directly: `curl http://upstream:8080`
3. Increase connect timeout
4. Check network connectivity
5. Review upstream logs

### Rate Limiting Not Working

**Checklist:**
- ✅ Rate limiting enabled on route
- ✅ Redis connection healthy
- ✅ Correct scope configured
- ✅ TTL not too high

**Debug:**
1. Check Redis: `redis-cli KEYS "rate-limit:*"`
2. View rate limit counters
3. Test with curl loop
4. Check Admin UI metrics

### Circuit Breaker Stuck Open

**When This Happens:**
- Route returns 503 immediately
- No requests reach upstream
- "Circuit open" in logs

**Solutions:**
1. Check upstream health
2. Wait for reset timeout
3. Manually reset circuit breaker
4. Adjust thresholds if too sensitive

**Manual Reset:**
1. Route details → Circuit Breaker section
2. Click **"Reset Circuit Breaker"**
3. Confirm reset
4. Monitor status

## Best Practices

### Route Naming

Good route IDs:
- ✅ `api-users-v1`
- ✅ `internal-auth-service`
- ✅ `public-blog-posts`

Poor route IDs:
- ❌ `route1`
- ❌ `test`
- ❌ `my-route-123-temp`

### Path Organization

Organize paths logically:
```
/api/v1/users/*
/api/v1/posts/*
/api/v1/comments/*
/api/v2/users/*  ← New version
```

### Priority Strategy

Assign priorities systematically:
- 100-199: Exact matches
- 50-99: Prefix matches
- 0-49: Wildcard/catch-all

### Health Checks

Always enable health checks for:
- Production routes
- External upstreams
- Critical services

Skip for:
- Third-party APIs (use rate limit)
- Static content CDNs

### Documentation

Use description field:
```yaml
description: |
  User management API v1
  Owner: Platform Team
  SLA: 99.9% uptime
  Contact: platform@example.com
```

## Keyboard Shortcuts

Speed up route management:

| Shortcut | Action |
|----------|--------|
| `N` | New route |
| `E` | Edit selected route |
| `D` | Delete selected route |
| `T` | Test selected route |
| `Cmd/Ctrl + S` | Save current form |
| `Cmd/Ctrl + K` | Search routes |
| `/` | Focus search |
| `↑` `↓` | Navigate routes |
| `Space` | Select route |
| `Esc` | Close modal |

## Next Steps

- **[Monitoring Routes](./monitoring.md)** - Deep dive into metrics
- **[Settings](./settings.md)** - Configure global defaults
- **[API Reference](../../api/routes.md)** - Programmatic access

---

**Questions?** Visit our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions).
