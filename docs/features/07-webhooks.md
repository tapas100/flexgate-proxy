# Feature 7: Webhook Notifications

## Overview
Event-driven webhook system for real-time notifications of proxy events.

## Status
✅ **Complete** (100%)

## Architecture

### Event Flow
```
┌─────────────┐
│ Event       │
│ Source      │ (Circuit Breaker, Rate Limiter, etc.)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ EventBus    │ Central event emitter
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Webhook     │ Delivery engine
│ Manager     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ HTTP POST   │ To registered webhooks
│ w/ HMAC     │
└─────────────┘
```

## Components

### 1. Event Bus
**Location**: `src/events/EventBus.ts` (270 LOC)

#### Features
- Central event emitter
- Event history tracking (last 1,000)
- Statistics by event type
- Wildcard subscriptions
- Unique event IDs

#### Event Types (10 total)
```typescript
enum EventType {
  // Circuit Breaker Events
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker.closed',
  CIRCUIT_BREAKER_HALF_OPEN = 'circuit_breaker.half_open',
  
  // Rate Limiting Events
  RATE_LIMIT_EXCEEDED = 'rate_limit.exceeded',
  RATE_LIMIT_APPROACHING = 'rate_limit.approaching',
  
  // Proxy Events
  PROXY_REQUEST_STARTED = 'proxy.request_started',
  PROXY_REQUEST_COMPLETED = 'proxy.request_completed',
  PROXY_REQUEST_FAILED = 'proxy.request_failed',
  
  // Health Events
  HEALTH_CHECK_FAILED = 'health.check_failed',
  HEALTH_CHECK_RECOVERED = 'health.check_recovered',
}
```

#### API
```typescript
class EventBus {
  // Emit event
  emitEvent(type: string, payload: any): void
  
  // Subscribe to events
  subscribe(eventType: string, handler: Function): string
  
  // Unsubscribe
  unsubscribe(subscriptionId: string): boolean
  
  // Get event history
  getHistory(limit?: number): Event[]
  
  // Get statistics
  getStats(): EventStats
}
```

### 2. Webhook Manager
**Location**: `src/webhooks/WebhookManager.ts` (550 LOC)

#### Features
- Webhook registration/management
- Event delivery with retry logic
- HMAC-SHA256 signature generation
- Async delivery queue
- Delivery history (last 10,000)
- Test webhook functionality

#### Retry Logic
```typescript
// Exponential backoff
delay = initialDelay × (backoffMultiplier ^ attempt)

// Example with defaults:
// Attempt 0: 1000ms × (2 ^ 0) = 1s
// Attempt 1: 1000ms × (2 ^ 1) = 2s
// Attempt 2: 1000ms × (2 ^ 2) = 4s
// Max retries: 3
```

#### API
```typescript
class WebhookManager {
  // Register webhook
  registerWebhook(config: WebhookConfig): WebhookConfig
  
  // Handle event
  handleEvent(event: Event): void
  
  // Attempt delivery
  attemptDelivery(webhook: Webhook, event: Event): Promise<void>
  
  // Generate HMAC signature
  generateSignature(payload: any, secret: string): string
  
  // Test webhook
  testWebhook(webhookId: string): Promise<void>
  
  // Get webhooks
  getAllWebhooks(): WebhookConfig[]
  getWebhook(id: string): WebhookConfig | undefined
  
  // Update/Delete
  updateWebhook(id: string, updates: Partial<WebhookConfig>): void
  deleteWebhook(id: string): boolean
  
  // Delivery logs
  getDeliveryLogs(webhookId: string): DeliveryLog[]
}
```

### 3. API Routes
**Location**: `routes/webhooks.ts` (240 LOC)

#### Endpoints (8 total)

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/webhooks` | Create webhook | Required |
| GET | `/api/webhooks` | List all webhooks | Required |
| GET | `/api/webhooks/:id` | Get webhook details | Required |
| PUT | `/api/webhooks/:id` | Update webhook | Required |
| DELETE | `/api/webhooks/:id` | Delete webhook | Required |
| POST | `/api/webhooks/:id/test` | Test delivery | Required |
| GET | `/api/webhooks/:id/logs` | Get delivery logs | Required |
| GET | `/api/webhooks/stats/all` | Get statistics | Required |

### 4. Admin UI
**Location**: `admin-ui/src/pages/Webhooks.tsx` (650 LOC)

#### Features
- Webhook list table
- Create/edit dialog
- Event subscription checkboxes (12 types)
- Delivery log viewer
- Real-time statistics
- Test webhook button
- Copy secret functionality
- Enable/disable toggle

#### UI Layout
```
┌────────────────────────────────────────────────────────┐
│ Webhooks                          [+ Create Webhook]  │
├────────────────────────────────────────────────────────┤
│ URL               │ Events  │ Status   │ Stats│Actions│
├───────────────────┼─────────┼──────────┼──────┼───────┤
│ https://app.com   │ CB, RL  │ Enabled  │ 10/12│ [▼ETD]│
│ /webhook          │ +2      │          │ 150ms│       │
├───────────────────┴─────────┴──────────┴──────┴───────┤
│ ▼ Delivery Logs                                       │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Time     │ Event  │ Attempt │ Status │ Duration │  │
│ ├──────────┼────────┼─────────┼────────┼──────────┤  │
│ │ 10:30:45 │ CB.O   │ 1       │ ✓ 200  │ 145ms    │  │
│ │ 10:25:12 │ RL.E   │ 1       │ ✓ 200  │ 152ms    │  │
│ │ 10:20:01 │ CB.O   │ 3       │ ✗ Fail │ -        │  │
│ └──────────┴────────┴─────────┴────────┴──────────┘  │
└────────────────────────────────────────────────────────┘
```

## Data Models

### Webhook Config
```typescript
interface WebhookConfig {
  id: string;                    // Unique identifier
  url: string;                   // Webhook URL (HTTPS)
  events: string[];              // Event types to subscribe
  enabled: boolean;              // Active status
  description?: string;          // Optional description
  secret: string;                // HMAC secret (auto-generated)
  retryConfig?: {
    maxRetries: number;          // Default: 3
    initialDelay: number;        // Default: 1000ms
    backoffMultiplier: number;   // Default: 2
  };
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

### Delivery Log
```typescript
interface DeliveryLog {
  id: string;                    // Log entry ID
  webhookId: string;             // Associated webhook
  eventType: string;             // Event that triggered
  payload: any;                  // Event payload
  responseStatus?: number;       // HTTP response code
  responseBody?: string;         // Response body
  attempt: number;               // Retry attempt (0-3)
  success: boolean;              // Delivery success
  error?: string;                // Error message if failed
  timestamp: string;             // ISO timestamp
  duration?: number;             // Request duration (ms)
}
```

### Event
```typescript
interface Event {
  id: string;                    // Unique event ID
  type: string;                  // Event type
  timestamp: string;             // ISO timestamp
  data: any;                     // Event-specific payload
}
```

## Webhook Payload Format

### Structure
```json
{
  "eventId": "evt_abc123def456",
  "eventType": "circuit_breaker.opened",
  "timestamp": "2026-01-28T10:30:45.123Z",
  "data": {
    "routeId": "api-service",
    "errorRate": 0.75,
    "threshold": 0.5,
    "failureCount": 15,
    "state": "open"
  }
}
```

### Headers
```http
POST /webhook HTTP/1.1
Host: your-server.com
Content-Type: application/json
X-Webhook-Signature: sha256=abc123def456...
User-Agent: FlexGate-Webhook/1.0
```

### Signature Verification
```javascript
// Node.js example
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature;
}

// Express middleware
app.post('/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your_webhook_secret';
  
  if (!verifyWebhook(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook
  console.log('Event:', req.body.eventType);
  res.json({ received: true });
});
```

## Testing Scenarios

### E2E Test Cases

#### TC7.1: Create Webhook
```
Precondition: User logged in, test endpoint ready
Steps:
1. Navigate to /webhooks
2. Click "Create Webhook"
3. Enter URL: https://webhook.site/your-unique-url
4. Enter description: "Test webhook"
5. Select events: circuit_breaker.opened, rate_limit.exceeded
6. Set max retries: 3
7. Set initial delay: 1000ms
8. Set backoff multiplier: 2
9. Check "Enabled"
10. Click "Create"
11. Verify webhook appears in list
12. Verify secret shown in notification (copy it!)

Expected: Webhook created successfully
```

#### TC7.2: Test Webhook Delivery
```
Precondition: Webhook created with test URL
Steps:
1. Navigate to /webhooks
2. Find webhook in list
3. Click "Test" button (send icon)
4. Wait for delivery
5. Check webhook.site for received payload
6. Verify payload structure correct
7. Verify signature header present
8. Expand delivery logs
9. Verify test delivery logged
10. Verify status shows success (200)

Expected: Test webhook delivered successfully
```

#### TC7.3: Webhook Signature Verification
```
Precondition: Webhook endpoint with verification code
Steps:
1. Create webhook pointing to your endpoint
2. Trigger event (e.g., circuit breaker opens)
3. Receive webhook POST at endpoint
4. Extract X-Webhook-Signature header
5. Extract payload body
6. Compute HMAC-SHA256(payload, secret)
7. Compare with signature header
8. Should match exactly
9. Respond with 200 OK
10. Check delivery log shows success

Expected: Signature verification passes
```

#### TC7.4: Webhook Retry Logic
```
Precondition: Webhook pointing to endpoint that returns 500
Steps:
1. Create webhook with maxRetries: 3
2. Configure endpoint to return 500 (error)
3. Trigger event
4. Observe delivery attempts:
   - Attempt 1: Immediate (0s delay)
   - Attempt 2: After 1s delay
   - Attempt 3: After 2s delay
   - Attempt 4: After 4s delay
5. All attempts should fail (500)
6. Check delivery logs
7. Verify 4 attempts logged (1 initial + 3 retries)
8. Verify increasing delays
9. Final status: Failed

Expected: Retry logic follows exponential backoff
```

#### TC7.5: Webhook Retry Success
```
Precondition: Webhook configured, endpoint fails then succeeds
Steps:
1. Create webhook
2. Configure endpoint to fail first 2 attempts, succeed on 3rd
3. Trigger event
4. Attempt 1: 500 error
5. Wait 1s
6. Attempt 2: 500 error
7. Wait 2s
8. Attempt 3: 200 success
9. Check delivery logs
10. Verify 3 attempts logged
11. Final status: Success
12. No attempt 4 (stopped after success)

Expected: Retry stops on first success
```

#### TC7.6: Multiple Event Subscriptions
```
Precondition: User creating webhook
Steps:
1. Click "Create Webhook"
2. Select multiple events:
   - circuit_breaker.opened
   - circuit_breaker.closed
   - rate_limit.exceeded
   - proxy.request_failed
3. Save webhook
4. Trigger circuit_breaker.opened event
5. Verify webhook received
6. Trigger rate_limit.exceeded event
7. Verify webhook received
8. Trigger proxy.request_completed (NOT subscribed)
9. Verify webhook NOT received
10. Check delivery logs show only subscribed events

Expected: Only subscribed events delivered
```

#### TC7.7: Edit Webhook
```
Precondition: Webhook exists
Steps:
1. Navigate to /webhooks
2. Click edit icon on webhook
3. Change URL to new endpoint
4. Add event: health.check_failed
5. Remove event: rate_limit.exceeded
6. Change retry config
7. Click "Update"
8. Verify changes saved
9. Trigger health.check_failed
10. Verify sent to new URL
11. Trigger rate_limit.exceeded
12. Verify NOT sent (unsubscribed)

Expected: Webhook updated successfully
```

#### TC7.8: Delete Webhook
```
Precondition: Webhook exists with deliveries
Steps:
1. Navigate to /webhooks
2. Click delete icon
3. Confirmation dialog appears
4. Click "Cancel" → webhook remains
5. Click delete again
6. Click "Confirm"
7. Webhook removed from list
8. Trigger event webhook was subscribed to
9. Verify no delivery attempted
10. Delivery logs for deleted webhook inaccessible

Expected: Webhook deleted, no further deliveries
```

#### TC7.9: Disable/Enable Webhook
```
Precondition: Enabled webhook exists
Steps:
1. Webhook shows "Enabled" status
2. Click toggle to disable
3. Status changes to "Disabled"
4. Trigger subscribed event
5. Verify NO delivery attempted
6. Click toggle to enable
7. Status changes to "Enabled"
8. Trigger event again
9. Verify delivery attempted

Expected: Disabled webhooks don't receive events
```

#### TC7.10: Delivery Log Viewer
```
Precondition: Webhook with delivery history
Steps:
1. Navigate to /webhooks
2. Click expand icon (▼) on webhook row
3. Delivery logs section expands
4. Verify logs show:
   - Timestamp
   - Event type
   - Attempt number
   - Success/failure status
   - Response code
   - Duration
5. Verify sorted by timestamp (newest first)
6. Verify success shown with green checkmark
7. Verify failures shown with red X
8. Verify error messages for failures
9. Click collapse icon (▲)
10. Logs section collapses

Expected: Delivery logs display correctly
```

#### TC7.11: Webhook Statistics
```
Precondition: Webhook with delivery history
Steps:
1. Navigate to /webhooks
2. Verify stats column shows:
   - Total deliveries
   - Successful deliveries
   - Failed deliveries
   - Average response time
3. Expand logs
4. Count actual successes/failures
5. Verify stats match actual counts
6. Verify average response time calculated correctly

Expected: Statistics accurate
```

#### TC7.12: Copy Webhook Secret
```
Precondition: Webhook exists
Steps:
1. Navigate to /webhooks
2. Click copy icon next to webhook
3. Verify "Secret copied" notification
4. Paste secret in text editor
5. Verify it's a long hex string (64 chars)
6. Use secret to verify webhook signature
7. Should successfully verify

Expected: Secret copied to clipboard
```

#### TC7.13: Webhook URL Validation
```
Precondition: Creating webhook
Steps:
1. Click "Create Webhook"
2. Enter URL: "invalid-url"
3. Should show validation error
4. Enter URL: "http://insecure.com" (HTTP in prod)
5. Should show "HTTPS required" error
6. Enter URL: "https://valid.com/webhook"
7. Validation passes
8. Can save successfully

Expected: URL validation prevents invalid URLs
```

#### TC7.14: Event Filtering
```
Precondition: Multiple webhooks with different event subscriptions
Steps:
1. Create webhook A: subscribed to circuit_breaker.*
2. Create webhook B: subscribed to rate_limit.*
3. Create webhook C: subscribed to all events
4. Trigger circuit_breaker.opened
5. Verify webhook A receives
6. Verify webhook B does NOT receive
7. Verify webhook C receives
8. Trigger rate_limit.exceeded
9. Verify webhook A does NOT receive
10. Verify webhook B receives
11. Verify webhook C receives

Expected: Events delivered only to subscribed webhooks
```

#### TC7.15: Concurrent Deliveries
```
Precondition: Multiple webhooks configured
Steps:
1. Create 5 webhooks all subscribed to same event
2. Trigger that event once
3. Observe delivery attempts
4. All 5 webhooks should receive concurrently
5. Check delivery logs for all webhooks
6. All should have same event ID
7. All should have similar timestamps
8. Verify no blocking (all async)

Expected: Deliveries happen concurrently
```

## Integration Examples

### Slack Integration
```javascript
// Webhook URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
// Events: circuit_breaker.opened, rate_limit.exceeded

// Transform FlexGate payload to Slack format
function formatSlackMessage(event) {
  return {
    text: `FlexGate Alert: ${event.eventType}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${event.eventType}*\n${JSON.stringify(event.data, null, 2)}`
        }
      }
    ]
  };
}
```

### PagerDuty Integration
```javascript
// Webhook URL: https://events.pagerduty.com/v2/enqueue
// Events: health.check_failed, circuit_breaker.opened

// Transform to PagerDuty Events API v2 format
function formatPagerDutyEvent(event) {
  return {
    routing_key: "YOUR_ROUTING_KEY",
    event_action: "trigger",
    payload: {
      summary: `FlexGate: ${event.eventType}`,
      severity: "error",
      source: "flexgate-proxy",
      custom_details: event.data
    }
  };
}
```

### Discord Integration
```javascript
// Webhook URL: https://discord.com/api/webhooks/ID/TOKEN
// Events: All events

// Transform to Discord webhook format
function formatDiscordMessage(event) {
  return {
    content: `**FlexGate Event:** ${event.eventType}`,
    embeds: [{
      title: event.eventType,
      description: JSON.stringify(event.data, null, 2),
      color: event.eventType.includes('failed') ? 0xFF0000 : 0x00FF00,
      timestamp: event.timestamp
    }]
  };
}
```

## Performance Considerations

- **Async Delivery**: All webhooks delivered asynchronously
- **Queue Processing**: Background queue for delivery attempts
- **Timeout**: 5 second timeout per delivery attempt
- **Concurrent Limit**: Up to 10 concurrent deliveries
- **Memory**: Delivery history limited to 10,000 entries
- **Event History**: Limited to 1,000 events

## Security

- **HTTPS Required**: Production webhooks must use HTTPS
- **HMAC Signatures**: All payloads signed with SHA-256
- **Secret Generation**: Cryptographically secure random secrets
- **Secret Storage**: Secrets stored securely (not displayed after creation)
- **Signature Verification**: Receivers should verify signatures
- **Timeout Protection**: 5s timeout prevents hanging
- **Rate Limiting**: Future: rate limit webhook deliveries

## Monitoring

### Metrics to Track
- Total webhooks configured
- Active vs inactive webhooks
- Delivery success rate
- Average delivery time
- Retry rate
- Failed delivery rate
- Events per minute
- Top event types

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook not receiving | Disabled | Enable webhook |
| Webhook not receiving | Wrong events | Check subscriptions |
| Signature verification fails | Wrong secret | Use correct secret from creation |
| All deliveries failing | Invalid URL | Update webhook URL |
| Timeout errors | Slow endpoint | Optimize endpoint response time |
| 401 Unauthorized | No signature check | Implement signature verification |

## Related Documentation

- [Feature 3: Metrics](./03-metrics-monitoring.md)
- [API: Webhooks](../api/webhooks.md)
- [Testing: Webhook E2E](../testing/webhooks-e2e.md)
- [WEBHOOKS_SPEC.md](../../WEBHOOKS_SPEC.md)
- [WEBHOOKS_PROGRESS.md](../../WEBHOOKS_PROGRESS.md)
