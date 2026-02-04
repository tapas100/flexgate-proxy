# Multi-Channel Delivery Architecture

## Overview

FlexGate now supports **multi-channel delivery** for webhook events, enabling you to send notifications to various platforms beyond traditional HTTP webhooks.

## Supported Channels

- **Webhook** (HTTP/HTTPS) - Traditional webhook delivery
- **Slack** - Send messages to Slack channels (coming soon)
- **WhatsApp** - Send notifications via WhatsApp Business API (coming soon)
- **Webex Teams** - Post messages to Webex Teams rooms (coming soon)
- **Microsoft Teams** - Send notifications to Teams channels (coming soon)

## Database Schema

### webhook_deliveries Table

Stores all delivery attempts across all channels with comprehensive tracking:

```sql
CREATE TABLE webhook_deliveries (
    delivery_id VARCHAR(255) PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    attempts INTEGER DEFAULT 0,
    response_code INTEGER,
    response_body TEXT,
    error TEXT,
    delivery_channel VARCHAR(50) DEFAULT 'webhook',
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_webhook_deliveries_webhook_id
        FOREIGN KEY (webhook_id)
        REFERENCES webhooks(webhook_id)
        ON DELETE CASCADE
);
```

### Key Features

1. **Persistent Storage**: All delivery attempts are stored in PostgreSQL
2. **Multi-Channel Support**: Single table handles all delivery channels
3. **Retry Tracking**: Tracks number of attempts for each delivery
4. **Status Management**: Pending → Success/Failed state transitions
5. **Payload Storage**: Full event payload stored as JSONB
6. **Response Tracking**: HTTP response codes and bodies saved
7. **Error Logging**: Detailed error messages for failed deliveries

## Architecture Components

### 1. WebhookManager

**Location**: `src/webhooks/WebhookManager.ts`

**Key Methods**:
- `queueDelivery()` - Creates database record and queues delivery
- `attemptDelivery()` - Handles delivery with retry logic
- `getDeliveryLogs()` - Retrieves delivery history from database
- `getStats()` - Fetches delivery statistics

**Database Integration**:
```typescript
constructor(private deliveriesRepo?: WebhookDeliveriesRepository)
```

### 2. WebhookDeliveriesRepository

**Location**: `src/database/repositories/webhookDeliveriesRepository.ts`

**Key Methods**:
- `create()` - Create new delivery record
- `update()` - Update delivery status/attempts/response
- `findByWebhookId()` - Get deliveries for a webhook
- `findByStatus()` - Get deliveries by status (pending/success/failed)
- `findByChannel()` - Get deliveries by channel
- `getStats()` - Get comprehensive delivery statistics
- `findPendingForRetry()` - Find failed deliveries for retry

**Statistics**:
```typescript
interface DeliveryStats {
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  pending_deliveries: number;
  average_attempts: number;
  last_delivery?: Date;
  by_channel?: { [key: string]: number };
  by_event_type?: { [key: string]: number };
}
```

### 3. API Endpoints

**Location**: `routes/webhooks.ts`

#### GET /api/webhooks/:id/logs
Fetch delivery logs for a specific webhook

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "delivery_1769759739565_aftuv59",
      "webhookId": "webhook-1769757610588-cisy36i",
      "event": "proxy.request_completed",
      "payload": { /* event data */ },
      "status": "success",
      "attempts": 1,
      "responseCode": 200,
      "responseBody": "...",
      "error": null,
      "deliveryChannel": "webhook",
      "deliveredAt": "2026-01-30T07:55:39.642Z",
      "createdAt": "2026-01-30T07:55:39.569Z"
    }
  ]
}
```

#### GET /api/webhooks/:id/stats
Fetch delivery statistics for a webhook

**Response**:
```json
{
  "success": true,
  "data": {
    "totalWebhooks": 8,
    "enabledWebhooks": 8,
    "totalDeliveries": 156,
    "successfulDeliveries": 152,
    "failedDeliveries": 4,
    "pendingDeliveries": 2
  }
}
```

### 4. Admin UI Integration

**Location**: `admin-ui/src/pages/Webhooks.tsx`

**Features**:
- Expandable webhook rows show delivery logs
- Real-time status updates
- Delivery attempt tracking
- Error message display
- Response code/body inspection

## Delivery Flow

```
┌─────────────────┐
│  Event Occurs   │
│ (Circuit Break, │
│  Rate Limit,    │
│  Proxy Request) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   EventBus.emit(event, data)    │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ WebhookManager.handleEvent()    │
│ - Find subscribed webhooks      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ queueDelivery()                 │
│ 1. Generate delivery_id         │
│ 2. Create DB record (pending)   │
│ 3. Add to in-memory queue       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ processQueue()                  │
│ - Process deliveries one by one │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ attemptDelivery()               │
│ FOR attempt 0 TO maxRetries:    │
│   1. Update attempts in DB      │
│   2. Send HTTP request          │
│   3. Update status in DB        │
│   4. If success: DONE           │
│   5. If fail: exponential       │
│      backoff and retry          │
└─────────────────────────────────┘
```

## Migrations

### 004_webhook_deliveries.sql
Creates initial table structure with all columns and indexes

### 005_update_webhook_deliveries_schema.sql
Updates existing table schema to match new requirements

### 006_fix_webhook_deliveries_fk.sql
Fixes foreign key constraint to reference `webhook_id` (VARCHAR)

## Benefits

### 1. Persistence
- Deliveries survive server restarts
- Historical data for analytics
- Audit trail for compliance

### 2. Scalability
- Database-backed queue
- Handles large volumes
- Indexed for fast queries

### 3. Observability
- Track success/failure rates
- Monitor delivery latency
- Debug failed deliveries

### 4. Multi-Channel Ready
- Single table for all channels
- Easy to add new channels
- Consistent interface

### 5. Retry Management
- Automatic retry with backoff
- Track retry attempts
- Identify problematic deliveries

## Future Enhancements

### Slack Integration
```typescript
class SlackDeliveryChannel {
  async send(webhook: WebhookConfig, payload: any) {
    const slackMessage = {
      text: `Event: ${payload.event}`,
      blocks: [/* formatted blocks */]
    };
    await axios.post(webhook.url, slackMessage);
  }
}
```

### WhatsApp Integration
```typescript
class WhatsAppDeliveryChannel {
  async send(webhook: WebhookConfig, payload: any) {
    const message = {
      to: webhook.phoneNumber,
      type: 'text',
      text: { body: JSON.stringify(payload) }
    };
    await whatsappClient.sendMessage(message);
  }
}
```

### Channel Factory
```typescript
class DeliveryChannelFactory {
  static create(channel: DeliveryChannel) {
    switch (channel) {
      case 'webhook': return new WebhookDeliveryChannel();
      case 'slack': return new SlackDeliveryChannel();
      case 'whatsapp': return new WhatsAppDeliveryChannel();
      case 'webex': return new WebexDeliveryChannel();
      case 'teams': return new TeamsDeliveryChannel();
    }
  }
}
```

## Usage Examples

### Query Recent Deliveries
```sql
SELECT delivery_id, event_type, status, attempts, delivery_channel, created_at
FROM webhook_deliveries
WHERE webhook_id = 'webhook-123'
ORDER BY created_at DESC
LIMIT 50;
```

### Find Failed Deliveries
```sql
SELECT delivery_id, event_type, attempts, error, created_at
FROM webhook_deliveries
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Delivery Success Rate by Channel
```sql
SELECT 
  delivery_channel,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM webhook_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY delivery_channel;
```

### Average Retry Attempts
```sql
SELECT 
  webhook_id,
  AVG(attempts) as avg_attempts,
  MAX(attempts) as max_attempts,
  COUNT(*) as total_deliveries
FROM webhook_deliveries
WHERE status IN ('success', 'failed')
GROUP BY webhook_id;
```

## Performance Considerations

### Indexes
- `webhook_id` - Fast lookup by webhook
- `status` - Filter by pending/success/failed
- `event_type` - Filter by event type
- `created_at DESC` - Chronological ordering
- `delivery_channel` - Filter by channel
- Composite `(webhook_id, status, created_at DESC)` - Common query pattern

### Data Retention
Consider implementing automatic cleanup:
```sql
DELETE FROM webhook_deliveries
WHERE created_at < NOW() - INTERVAL '90 days'
  AND status = 'success';
```

### Partitioning (Future)
For high-volume systems, consider table partitioning by:
- Date range (monthly/weekly)
- Delivery channel
- Status

## Monitoring

### Key Metrics
1. **Delivery Success Rate**: `successful_deliveries / total_deliveries`
2. **Average Retry Attempts**: `AVG(attempts) WHERE status != 'pending'`
3. **Pending Queue Size**: `COUNT(*) WHERE status = 'pending'`
4. **Failed Delivery Rate**: `failed_deliveries / total_deliveries`
5. **Average Delivery Time**: `delivered_at - created_at`

### Alerts
- Success rate drops below 95%
- Pending queue grows beyond threshold
- Specific webhook has high failure rate
- Average retry attempts exceed 2

## Conclusion

The multi-channel delivery architecture provides a robust, scalable foundation for sending webhook events to various platforms. The database-backed approach ensures reliability, observability, and easy extensibility for future channels.
