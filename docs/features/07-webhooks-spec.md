# Feature 7: Webhook Notifications

## Overview
Event-driven webhook system for real-time notifications about proxy events, circuit breaker state changes, rate limit violations, and system alerts.

## Architecture

### Event System
- **Event Emitter**: Central event bus for all webhook triggers
- **Event Types**:
  - `circuit_breaker.opened` - Circuit breaker opened
  - `circuit_breaker.closed` - Circuit breaker closed
  - `circuit_breaker.half_open` - Circuit breaker testing recovery
  - `rate_limit.exceeded` - Rate limit threshold exceeded
  - `rate_limit.warning` - Approaching rate limit (80% threshold)
  - `proxy.error` - Proxy request failed
  - `proxy.timeout` - Request timed out
  - `health.degraded` - Service health degraded
  - `health.recovered` - Service health recovered
  - `config.changed` - Configuration updated

### Webhook Delivery Engine
```typescript
interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret: string; // For HMAC signature
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  headers?: Record<string, string>;
  timeout: number;
}

interface WebhookPayload {
  id: string; // Unique delivery ID
  event: string;
  timestamp: string;
  data: any;
  signature: string; // HMAC-SHA256
}
```

### Retry Strategy
- **Exponential Backoff**: `initialDelay * (backoffMultiplier ^ attempt)`
- **Default Config**:
  - Max retries: 3
  - Initial delay: 1000ms
  - Backoff multiplier: 2
  - Delays: 1s → 2s → 4s
- **Failure Handling**: Log failed deliveries, mark webhook as unhealthy after consecutive failures

### Security
- **HMAC Signatures**: SHA-256 signature in `X-Webhook-Signature` header
- **TLS Required**: Only HTTPS URLs allowed in production
- **Secret Rotation**: Support for secret updates without downtime
- **IP Whitelisting**: Optional IP restrictions for webhook receivers

## API Endpoints

### Webhook Management
```typescript
POST   /api/webhooks          // Create webhook
GET    /api/webhooks          // List webhooks
GET    /api/webhooks/:id      // Get webhook details
PUT    /api/webhooks/:id      // Update webhook
DELETE /api/webhooks/:id      // Delete webhook
POST   /api/webhooks/:id/test // Test webhook delivery
GET    /api/webhooks/:id/logs // Get delivery logs
```

### Request/Response Examples

**Create Webhook**
```json
POST /api/webhooks
{
  "url": "https://api.slack.com/webhooks/xxx",
  "events": ["circuit_breaker.opened", "rate_limit.exceeded"],
  "enabled": true,
  "secret": "auto-generated-if-omitted",
  "headers": {
    "X-Custom-Header": "value"
  }
}

Response 201:
{
  "id": "wh_abc123",
  "url": "https://api.slack.com/webhooks/xxx",
  "events": ["circuit_breaker.opened", "rate_limit.exceeded"],
  "enabled": true,
  "secret": "wh_secret_xyz789",
  "createdAt": "2026-01-28T10:30:00Z"
}
```

**Webhook Payload Format**
```json
POST https://api.slack.com/webhooks/xxx
Headers:
  X-Webhook-Signature: sha256=abc123...
  X-Webhook-Event: circuit_breaker.opened
  X-Webhook-Delivery: delivery_xyz789

Body:
{
  "id": "delivery_xyz789",
  "event": "circuit_breaker.opened",
  "timestamp": "2026-01-28T10:35:00Z",
  "data": {
    "routeId": "route_api_backend",
    "routePath": "/api/*",
    "target": "https://api.example.com",
    "errorRate": 0.65,
    "threshold": 0.5,
    "failureCount": 13,
    "windowSize": 20
  },
  "signature": "sha256=abc123..."
}
```

## Database Schema

```sql
-- Webhook configurations
CREATE TABLE webhooks (
  id VARCHAR(255) PRIMARY KEY,
  url VARCHAR(2048) NOT NULL,
  events JSON NOT NULL,
  enabled BOOLEAN DEFAULT true,
  secret VARCHAR(255) NOT NULL,
  retry_max INT DEFAULT 3,
  retry_backoff FLOAT DEFAULT 2.0,
  retry_initial_delay INT DEFAULT 1000,
  headers JSON,
  timeout INT DEFAULT 5000,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Webhook delivery logs
CREATE TABLE webhook_deliveries (
  id VARCHAR(255) PRIMARY KEY,
  webhook_id VARCHAR(255) REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'pending'
  attempts INT DEFAULT 0,
  response_code INT,
  response_body TEXT,
  error TEXT,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_webhook_status (webhook_id, status),
  INDEX idx_event_time (event, created_at)
);
```

## Implementation Plan

### Phase 1: Core Event System (3 hours)
- [ ] Create `src/events/EventBus.ts` - Central event emitter
- [ ] Define event types and payload interfaces
- [ ] Integrate with existing circuit breaker
- [ ] Integrate with rate limiter
- [ ] Add event emission to proxy middleware
- [ ] Write unit tests for event system

### Phase 2: Webhook Engine (4 hours)
- [ ] Create `src/webhooks/WebhookManager.ts` - Delivery engine
- [ ] Implement retry logic with exponential backoff
- [ ] Create HMAC signature generation
- [ ] Build webhook delivery queue
- [ ] Add timeout handling
- [ ] Write tests for delivery engine

### Phase 3: Storage Layer (2 hours)
- [ ] Create database schema/migrations
- [ ] Build webhook configuration model
- [ ] Build delivery log model
- [ ] Implement CRUD operations
- [ ] Add indexing for performance

### Phase 4: API Routes (3 hours)
- [ ] Create `routes/webhooks.ts`
- [ ] Implement all 7 endpoints
- [ ] Add authentication middleware
- [ ] Add input validation
- [ ] Write integration tests

### Phase 5: Admin UI (3 hours)
- [ ] Create Webhooks page component
- [ ] Build webhook creation form
- [ ] Create webhook list with status indicators
- [ ] Add delivery log viewer
- [ ] Implement test webhook button
- [ ] Add real-time status updates (optional)

### Phase 6: Integration & Testing (2 hours)
- [ ] End-to-end testing with real webhooks
- [ ] Test retry logic
- [ ] Test signature verification
- [ ] Load testing (100+ webhooks)
- [ ] Documentation updates

## Integration Examples

### Slack Integration
```typescript
// Slack webhook formatter
function formatSlackMessage(event: string, data: any): object {
  return {
    text: `🚨 FlexGate Alert: ${event}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Event:* ${event}\n*Time:* ${new Date().toISOString()}`
        }
      },
      {
        type: "section",
        fields: Object.entries(data).map(([key, value]) => ({
          type: "mrkdwn",
          text: `*${key}:*\n${value}`
        }))
      }
    ]
  };
}
```

### PagerDuty Integration
```typescript
// PagerDuty event formatter
function formatPagerDutyEvent(event: string, data: any): object {
  return {
    routing_key: process.env.PAGERDUTY_KEY,
    event_action: "trigger",
    payload: {
      summary: `FlexGate: ${event}`,
      severity: event.includes('circuit_breaker') ? 'critical' : 'warning',
      source: 'flexgate-proxy',
      custom_details: data
    }
  };
}
```

### Discord Integration
```typescript
// Discord webhook formatter
function formatDiscordMessage(event: string, data: any): object {
  return {
    username: "FlexGate",
    avatar_url: "https://example.com/flexgate-icon.png",
    embeds: [{
      title: `🔔 ${event}`,
      color: event.includes('error') ? 0xFF0000 : 0xFFA500,
      fields: Object.entries(data).map(([key, value]) => ({
        name: key,
        value: String(value),
        inline: true
      })),
      timestamp: new Date().toISOString()
    }]
  };
}
```

## Security Considerations

1. **Signature Verification**:
   ```typescript
   function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
     const expectedSignature = crypto
       .createHmac('sha256', secret)
       .update(payload)
       .digest('hex');
     return crypto.timingSafeEqual(
       Buffer.from(signature),
       Buffer.from(`sha256=${expectedSignature}`)
     );
   }
   ```

2. **HTTPS Enforcement**: Reject HTTP URLs in production
3. **Rate Limiting**: Limit webhook deliveries per second to prevent abuse
4. **Secret Storage**: Encrypt secrets at rest in database
5. **IP Filtering**: Optional whitelist for webhook receivers

## Metrics & Monitoring

- **Delivery Success Rate**: Percentage of successful deliveries
- **Average Latency**: Time to deliver webhooks
- **Retry Rate**: Percentage requiring retries
- **Failed Webhooks**: Count of permanently failed deliveries
- **Event Volume**: Webhooks triggered per minute

## Testing Strategy

1. **Unit Tests**:
   - Event emission
   - Signature generation
   - Retry logic
   - Payload formatting

2. **Integration Tests**:
   - Full delivery cycle
   - Database operations
   - API endpoints

3. **E2E Tests**:
   - Mock webhook receiver
   - Test all event types
   - Verify retry behavior

4. **Performance Tests**:
   - 1000 webhooks/minute
   - Concurrent deliveries
   - Memory usage under load

## Documentation

- [ ] API documentation with examples
- [ ] Webhook setup guide
- [ ] Integration tutorials (Slack, PagerDuty, Discord)
- [ ] Signature verification examples in multiple languages
- [ ] Troubleshooting guide

## Success Criteria

✅ All event types trigger webhooks correctly
✅ Retry logic works with exponential backoff
✅ HMAC signatures verified successfully
✅ Admin UI allows full webhook management
✅ Delivery logs retained for 30 days
✅ 99.9% delivery success rate
✅ < 500ms average delivery latency
✅ No memory leaks under sustained load

## Future Enhancements

- **Webhook Templates**: Pre-configured for popular services
- **Filtering Rules**: Only trigger on specific conditions
- **Batching**: Group multiple events into single delivery
- **Dead Letter Queue**: Capture permanently failed deliveries
- **Webhook Analytics**: Detailed delivery metrics dashboard
- **Custom Transformations**: JavaScript functions to transform payloads
- **Circuit Breaker for Webhooks**: Disable failing webhooks automatically
