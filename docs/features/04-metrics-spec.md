# Feature 4: Log Viewer - Specification

## Overview
Real-time log viewer with filtering, search, and export capabilities for monitoring proxy traffic, errors, and system events.

## Functional Requirements

### 1. Log Display
- Real-time log streaming
- Virtual scrolling for performance (handle 10,000+ logs)
- Log level color coding (DEBUG, INFO, WARN, ERROR, FATAL)
- Timestamp formatting
- JSON payload expansion
- Auto-scroll toggle
- Line numbers

### 2. Filtering & Search
- Filter by log level (multi-select)
- Filter by time range (last 5m, 15m, 1h, 6h, 24h, custom)
- Filter by source (proxy, auth, metrics, admin)
- Full-text search across log messages
- Regex search support
- Search highlighting

### 3. Log Details
- Click to expand log entry
- View full JSON payload
- Copy log to clipboard
- View request/response details (for proxy logs)
- Stack trace viewer (for errors)
- Correlation ID tracking

### 4. Export & Actions
- Export filtered logs to JSON
- Export to CSV
- Download logs as file
- Clear current view
- Pause/Resume log streaming

### 5. Advanced Features
- Log aggregation (group by error type)
- Live tail (WebSocket streaming)
- Log statistics (error rate, log count by level)
- Bookmark interesting logs
- Share log view (generate URL with filters)

## Technical Stack

### Frontend
- **React** with TypeScript
- **Material-UI** - Table, Chip, Select components
- **react-virtualized** or **react-window** - Virtual scrolling
- **date-fns** - Timestamp formatting (already installed)
- **prism-react-renderer** - Syntax highlighting for JSON

### Backend Integration
- WebSocket for real-time streaming
- REST API for historical logs
- Pagination for large datasets

## Data Types

```typescript
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export type LogSource = 'proxy' | 'auth' | 'metrics' | 'admin' | 'system';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  metadata?: Record<string, any>;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  error?: {
    stack?: string;
    code?: string;
    details?: any;
  };
  request?: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
  response?: {
    statusCode: number;
    latency: number;
    size?: number;
  };
}

export interface LogFilter {
  levels: LogLevel[];
  sources: LogSource[];
  timeRange: TimeRange;
  searchQuery: string;
  isRegex: boolean;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  bySource: Record<LogSource, number>;
  errorRate: number;
  avgLatency: number;
}
```

## API Endpoints

```typescript
// REST API
GET  /api/logs?limit=100&offset=0&level=ERROR&source=proxy&from=timestamp&to=timestamp
GET  /api/logs/:id
POST /api/logs/export (returns download URL)
GET  /api/logs/stats

// WebSocket
WS   /api/logs/stream
```

## Components Structure

```
src/pages/
  Logs.tsx                    # Main log viewer page
src/components/Logs/
  LogTable.tsx                # Virtual scrolling log table
  LogRow.tsx                  # Individual log row
  LogDetails.tsx              # Expandable log details
  LogFilters.tsx              # Filter controls
  LogStats.tsx                # Statistics panel
  LogExport.tsx               # Export dialog
src/services/
  logs.ts                     # Log service (API + WebSocket)
src/utils/
  logHelpers.ts               # Log formatting utilities
```

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Log Viewer                    [Pause] [Export] [Clear]     │
├─────────────────────────────────────────────────────────────┤
│  Filters: [Levels ▼] [Sources ▼] [Time Range ▼] [Search 🔍]│
│  Stats: 1,234 logs | 12 errors | Avg latency: 45ms          │
├─────────────────────────────────────────────────────────────┤
│  Time       Level  Source  Message                          │
│  ──────────────────────────────────────────────────────────│
│  10:30:45   INFO   proxy   Request to /api/users           │
│  10:30:46   ERROR  auth    Invalid token                   │
│  10:30:47   DEBUG  proxy   Cache hit for /api/products     │
│  10:30:48   WARN   metrics Slow query detected             │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
admin-ui/src/
├── components/
│   └── Logs/
│       ├── LogTable.tsx                (Main table component)
│       ├── LogRow.tsx                  (Virtual row)
│       ├── LogDetails.tsx              (Expandable details)
│       ├── LogFilters.tsx              (Filter controls)
│       ├── LogStats.tsx                (Statistics)
│       ├── LogExport.tsx               (Export dialog)
│       └── __tests__/
│           ├── LogTable.test.tsx
│           ├── LogRow.test.tsx
│           ├── LogDetails.test.tsx
│           ├── LogFilters.test.tsx
│           └── LogExport.test.tsx
├── pages/
│   ├── Logs.tsx                        (Main page - orchestration)
│   └── __tests__/
│       └── Logs.test.tsx
├── services/
│   ├── logs.ts                         (API + WebSocket service)
│   └── __tests__/
│       └── logs.test.ts
├── utils/
│   ├── logHelpers.ts                   (Formatting, filtering)
│   └── __tests__/
│       └── logHelpers.test.ts
└── types/
    └── index.ts                        (Updated with log types)
```

## Test Plan (20+ tests)

### Service Tests (8 tests)
1. LogService.fetchLogs() returns paginated logs
2. LogService.fetchLogs() handles filters correctly
3. LogService.fetchLogById() returns single log
4. LogService.connectWebSocket() establishes connection
5. LogService.disconnectWebSocket() closes connection
6. WebSocket message handling
7. LogService.exportLogs() generates export
8. Error handling for failed requests

### Helper Tests (6 tests)
1. formatLogLevel() returns correct color/icon
2. formatTimestamp() formats correctly
3. filterLogs() applies filters correctly
4. searchLogs() supports regex
5. parseLogMessage() extracts metadata
6. formatLogSize() formats bytes

### Component Tests (8 tests)
1. LogTable renders with virtual scrolling
2. LogRow displays log entry correctly
3. LogRow expands on click
4. LogDetails shows full payload
5. LogFilters updates filter state
6. LogStats displays correct counts
7. LogExport generates download
8. Copy to clipboard works

### Integration Tests (4 tests)
1. Logs page loads and displays logs
2. Filtering updates displayed logs
3. Search highlights results
4. Real-time logs stream correctly

## Implementation Steps

### Phase 1: Basic Log Display (2-3 hours)
1. Create log types in `types/index.ts`
2. Create `LogService` with mock data
3. Create `LogTable` component with basic rendering
4. Create `LogRow` component
5. Create basic `Logs.tsx` page
6. Write basic tests

### Phase 2: Filtering & Search (2 hours)
1. Create `LogFilters` component
2. Implement filter logic in service
3. Add search functionality
4. Add time range filtering
5. Write filter tests

### Phase 3: Virtual Scrolling (1-2 hours)
1. Integrate react-window
2. Optimize LogRow rendering
3. Test with large datasets (10k+ logs)
4. Performance testing

### Phase 4: Log Details (1 hour)
1. Create `LogDetails` component
2. Add expand/collapse functionality
3. JSON syntax highlighting
4. Copy to clipboard
5. Test detail view

### Phase 5: Export & Stats (1 hour)
1. Create `LogExport` component
2. Implement CSV/JSON export
3. Create `LogStats` component
4. Add statistics calculations
5. Test export functionality

### Phase 6: Real-time Streaming (1-2 hours)
1. WebSocket integration
2. Auto-scroll implementation
3. Pause/Resume controls
4. Connection management
5. Test WebSocket connection

## Dependencies to Add

```json
{
  "react-window": "^1.8.10",
  "prism-react-renderer": "^2.3.1"
}
```

## Success Criteria

- [x] Display logs with virtual scrolling
- [x] Filter by level, source, time range
- [x] Full-text search with regex support
- [x] Real-time log streaming via WebSocket
- [x] Expandable log details
- [x] Export to JSON/CSV
- [x] Log statistics display
- [x] 20+ comprehensive tests
- [x] Handle 10,000+ logs smoothly
- [x] TypeScript strict mode
- [x] Responsive design

## Estimated Time
**Total: 8-12 hours**

## Priority
**HIGH** - Critical for debugging and monitoring

## Notes
- Use mock data initially, WebSocket can be added later
- Virtual scrolling is crucial for performance
- Consider pagination for historical logs
- Log correlation ID tracking for distributed tracing
- Consider adding log export scheduling (future)

---

**Ready to implement!**
