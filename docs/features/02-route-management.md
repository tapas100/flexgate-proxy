# Feature 2: Route Management

## Overview
CRUD operations for managing proxy routes with dynamic configuration.

## Status
✅ **Complete** (100%)

## Components

### Frontend
**Location**: `admin-ui/src/pages/Routes.tsx`

#### Features
- Route list table
- Create route dialog
- Edit route dialog
- Delete confirmation
- Enable/disable toggle
- Real-time validation

### Backend
**Location**: `routes/routes.js`

#### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/routes` | List all routes |
| POST | `/api/routes` | Create new route |
| GET | `/api/routes/:id` | Get route details |
| PUT | `/api/routes/:id` | Update route |
| DELETE | `/api/routes/:id` | Delete route |
| POST | `/api/routes/:id/toggle` | Enable/disable |

## Data Model

### Route Object
```typescript
interface Route {
  id: string;                    // Unique identifier
  path: string;                  // Incoming path (e.g., /api/users)
  target: string;                // Target URL (e.g., http://backend:8080)
  enabled: boolean;              // Active status
  description?: string;          // Optional description
  timeout?: number;              // Request timeout (ms)
  retryAttempts?: number;        // Retry count
  circuitBreaker?: {             // Circuit breaker config
    enabled: boolean;
    threshold: number;
    timeout: number;
  };
  rateLimiting?: {               // Rate limiting config
    enabled: boolean;
    requests: number;
    window: number;
  };
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

## User Interface

### Route List View
```
┌─────────────────────────────────────────────────────┐
│ Routes                              [+ Create Route]│
├─────────────────────────────────────────────────────┤
│ Path          │ Target          │ Status  │ Actions │
├───────────────┼─────────────────┼─────────┼─────────┤
│ /api/users    │ http://user:80  │ Enabled │ [E][D]  │
│ /api/products │ http://prod:80  │ Enabled │ [E][D]  │
│ /api/orders   │ http://ord:80   │ Disabled│ [E][D]  │
└─────────────────────────────────────────────────────┘
```

### Create/Edit Dialog
```
┌─────────────────────────────────────┐
│ Create Route                    [X] │
├─────────────────────────────────────┤
│ Path: ________________________      │
│       /api/example                  │
│                                     │
│ Target URL: ____________________    │
│       http://backend:8080           │
│                                     │
│ Description: ____________________   │
│       (Optional)                    │
│                                     │
│ Timeout (ms): _____ Default: 5000   │
│                                     │
│ Retry Attempts: ___ Default: 3      │
│                                     │
│ [x] Enable Circuit Breaker          │
│ [x] Enable Rate Limiting            │
│ [x] Enabled                         │
│                                     │
│        [Cancel]  [Save]             │
└─────────────────────────────────────┘
```

## Validation Rules

### Path Validation
- Must start with `/`
- No spaces allowed
- Alphanumeric, hyphens, underscores, slashes only
- Example: `/api/v1/users`

### Target URL Validation
- Must be valid URL format
- Must include protocol (http:// or https://)
- Must include host
- Example: `http://backend-service:8080`

### Timeout Validation
- Must be positive integer
- Range: 100ms - 60000ms (1 minute)
- Default: 5000ms

### Retry Validation
- Must be non-negative integer
- Range: 0 - 10
- Default: 3

## API Request/Response Examples

### Create Route
**Request**:
```bash
POST /api/routes
Content-Type: application/json

{
  "path": "/api/users",
  "target": "http://user-service:8080",
  "description": "User management service",
  "enabled": true,
  "timeout": 5000,
  "retryAttempts": 3
}
```

**Response**:
```json
{
  "success": true,
  "route": {
    "id": "route_abc123",
    "path": "/api/users",
    "target": "http://user-service:8080",
    "description": "User management service",
    "enabled": true,
    "timeout": 5000,
    "retryAttempts": 3,
    "createdAt": "2026-01-28T10:00:00Z",
    "updatedAt": "2026-01-28T10:00:00Z"
  }
}
```

### List Routes
**Request**:
```bash
GET /api/routes
```

**Response**:
```json
{
  "success": true,
  "routes": [
    {
      "id": "route_abc123",
      "path": "/api/users",
      "target": "http://user-service:8080",
      "enabled": true,
      "createdAt": "2026-01-28T10:00:00Z"
    },
    {
      "id": "route_def456",
      "path": "/api/products",
      "target": "http://product-service:8080",
      "enabled": true,
      "createdAt": "2026-01-28T10:00:00Z"
    }
  ],
  "total": 2
}
```

### Update Route
**Request**:
```bash
PUT /api/routes/route_abc123
Content-Type: application/json

{
  "target": "http://new-user-service:8080",
  "timeout": 10000
}
```

**Response**:
```json
{
  "success": true,
  "route": {
    "id": "route_abc123",
    "path": "/api/users",
    "target": "http://new-user-service:8080",
    "timeout": 10000,
    "updatedAt": "2026-01-28T11:00:00Z"
  }
}
```

### Delete Route
**Request**:
```bash
DELETE /api/routes/route_abc123
```

**Response**:
```json
{
  "success": true,
  "message": "Route deleted successfully"
}
```

## Testing Scenarios

### E2E Test Cases

#### TC2.1: Create Route
```
Precondition: User logged in as admin
Steps:
1. Navigate to /routes
2. Click "Create Route" button
3. Enter path: /api/test
4. Enter target: http://test-service:8080
5. Enter description: "Test service"
6. Set timeout: 5000
7. Set retry: 3
8. Check "Enabled"
9. Click "Save"
10. Verify route appears in list
11. Verify success message shown

Expected: Route created and visible in list
```

#### TC2.2: Create Route - Validation Errors
```
Precondition: User on create route dialog
Steps:
1. Leave path empty → Should show "Path required"
2. Enter invalid path "api/test" → Should show "Must start with /"
3. Leave target empty → Should show "Target required"
4. Enter invalid target "invalid-url" → Should show "Invalid URL"
5. Enter negative timeout → Should show "Must be positive"
6. Enter timeout > 60000 → Should show "Max 60000ms"
7. Fix all errors
8. Save successfully

Expected: All validation errors caught before submission
```

#### TC2.3: Edit Route
```
Precondition: Route exists with id route_abc123
Steps:
1. Navigate to /routes
2. Click edit icon on route
3. Edit dialog opens with current values
4. Change target: http://new-service:8080
5. Change timeout: 10000
6. Click "Save"
7. Verify route updated in list
8. Verify changes persisted

Expected: Route successfully updated
```

#### TC2.4: Delete Route
```
Precondition: Route exists
Steps:
1. Navigate to /routes
2. Click delete icon on route
3. Confirmation dialog appears
4. Click "Cancel" → Dialog closes, route remains
5. Click delete again
6. Click "Confirm" → Route deleted
7. Verify route removed from list
8. Verify success message

Expected: Route deleted with confirmation
```

#### TC2.5: Toggle Route
```
Precondition: Enabled route exists
Steps:
1. Navigate to /routes
2. Route shows "Enabled" status
3. Click toggle/disable button
4. Status changes to "Disabled"
5. Verify API called
6. Click toggle again
7. Status changes to "Enabled"

Expected: Route can be enabled/disabled
```

#### TC2.6: List Routes - Pagination
```
Precondition: More than 10 routes exist
Steps:
1. Navigate to /routes
2. First 10 routes displayed
3. Click "Next page"
4. Routes 11-20 displayed
5. Click "Previous page"
6. Back to routes 1-10
7. Click page 3 directly
8. Routes 21-30 displayed

Expected: Pagination works correctly
```

#### TC2.7: Search/Filter Routes
```
Precondition: Multiple routes exist
Steps:
1. Navigate to /routes
2. Enter search term: "users"
3. Only routes with "users" in path/description shown
4. Clear search
5. All routes shown again
6. Filter by status: "Enabled"
7. Only enabled routes shown

Expected: Search and filter work correctly
```

#### TC2.8: Duplicate Path Prevention
```
Precondition: Route with path /api/users exists
Steps:
1. Click "Create Route"
2. Enter path: /api/users
3. Enter target: http://another-service:8080
4. Click "Save"
5. Should show error: "Path already exists"
6. Cannot create duplicate

Expected: Duplicate paths prevented
```

#### TC2.9: Route with Circuit Breaker
```
Precondition: User creating new route
Steps:
1. Click "Create Route"
2. Enter basic route info
3. Check "Enable Circuit Breaker"
4. Set threshold: 0.5 (50% error rate)
5. Set timeout: 30000 (30 seconds)
6. Save route
7. Verify circuit breaker config saved

Expected: Circuit breaker configuration persisted
```

#### TC2.10: Route with Rate Limiting
```
Precondition: User creating new route
Steps:
1. Click "Create Route"
2. Enter basic route info
3. Check "Enable Rate Limiting"
4. Set requests: 100
5. Set window: 60 (60 seconds)
6. Save route
7. Verify rate limiting config saved

Expected: Rate limiting configuration persisted
```

## Integration Points

### With Feature 3 (Metrics)
- Route request counts tracked
- Route response times measured
- Route error rates monitored

### With Feature 4 (Logs)
- Route changes logged
- Route access logged
- Route errors logged

### With Circuit Breaker
- Routes can enable circuit breaker
- Circuit breaker state per route
- Auto-recovery after timeout

### With Rate Limiter
- Routes can enable rate limiting
- Per-route rate limits
- Configurable time windows

## Performance Considerations

- **Route Lookup**: O(1) with hash map
- **List Routes**: Paginated (10 per page default)
- **Validation**: Client-side + server-side
- **Caching**: Route config cached in memory

## Security

- **Authentication Required**: All endpoints protected
- **Authorization**: Admin role required
- **Input Validation**: All fields validated
- **SQL Injection**: Parameterized queries
- **XSS Protection**: Input sanitization

## Error Handling

### Common Errors

| Error Code | Message | Resolution |
|------------|---------|------------|
| 400 | Invalid path format | Fix path to start with / |
| 400 | Invalid URL | Provide valid http/https URL |
| 409 | Path already exists | Use different path |
| 404 | Route not found | Check route ID |
| 401 | Unauthorized | Login required |
| 403 | Forbidden | Admin access required |

## Monitoring

### Metrics to Track
- Total routes configured
- Active vs inactive routes
- Route creation rate
- Route modification frequency
- Most used routes
- Routes with errors

## Related Documentation

- [Feature 3: Metrics](./03-metrics-monitoring.md)
- [Feature 4: Logs](./04-logging-system.md)
- [API: Routes](../api/routes.md)
- [Testing: Route E2E](../testing/routes-e2e.md)
