# FlexGate Webhook Receiver 📨

A simple, lightweight webhook receiver for testing FlexGate webhooks locally. No need for external services like webhook.site!

## Features

✅ **Beautiful Terminal UI** - Color-coded output with detailed webhook information  
✅ **Real-time Stats** - Track delivery counts, success rates, and event types  
✅ **Payload Inspection** - Pretty-printed JSON with syntax highlighting  
✅ **Header Display** - See all webhook headers including signatures and retry counts  
✅ **Failure Simulation** - Test retry logic by simulating random failures  
✅ **REST API** - Query received webhooks programmatically  
✅ **Zero Dependencies** - Just Express.js, runs anywhere Node.js runs

## Quick Start

### 1. Install Dependencies

```bash
cd webhook-receiver
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will start on `http://localhost:4000`

### 3. Update FlexGate Test Script

Use this URL in your webhook tests:

```bash
WEBHOOK_URL=http://localhost:4000/webhook node scripts/testing/test-webhooks.js
```

## Configuration

Configure via environment variables:

```bash
# Change port (default: 4000)
PORT=5000 npm start

# Enable failure simulation for testing retries
SIMULATE_FAILURES=true FAILURE_RATE=0.3 npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `SIMULATE_FAILURES` | `false` | Randomly fail some requests to test retry logic |
| `FAILURE_RATE` | `0.2` | Percentage of requests to fail (0.0-1.0) |

## Endpoints

### POST /webhook
Main endpoint for receiving webhooks from FlexGate.

**Response:**
```json
{
  "received": true,
  "webhookId": "webhook-123",
  "deliveryId": "delivery-456",
  "eventType": "circuit_breaker.opened",
  "processingTime": 5,
  "message": "Webhook received successfully"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime": "5.23s",
  "stats": {
    "total": 42,
    "byStatus": {
      "success": 40,
      "failed": 2
    }
  }
}
```

### GET /webhooks
List all received webhooks.

**Response:**
```json
{
  "total": 10,
  "webhooks": [...],
  "stats": {...}
}
```

### POST /clear
Clear all stored webhooks and reset statistics.

**Response:**
```json
{
  "cleared": 10,
  "message": "All webhooks cleared"
}
```

## Example Output

When a webhook is received, you'll see beautiful formatted output:

```
════════════════════════════════════════════════════════════════════════════════
📨 WEBHOOK RECEIVED
════════════════════════════════════════════════════════════════════════════════
Time: 2026-01-30T12:34:56.789Z
Method: POST
Path: /webhook
IP: ::1

📋 Headers:
────────────────────────────────────────────────────────────────────────────────
  content-type: application/json
  x-webhook-event: circuit_breaker.opened
  x-webhook-id: webhook-abc123
  x-retry-count: 0

📦 Payload:
────────────────────────────────────────────────────────────────────────────────
  {
    "event": "circuit_breaker.opened",
    "timestamp": "2026-01-30T12:34:56.789Z",
    "data": {
      "routeId": "route-123",
      "threshold": 5,
      "failures": 5
    }
  }

📊 Event Summary:
────────────────────────────────────────────────────────────────────────────────
  Event Type: circuit_breaker.opened
  Count: 3

📈 Statistics:
────────────────────────────────────────────────────────────────────────────────
  Total Webhooks: 15
  Successful: 14
  Failed: 1
  Uptime: 2.45s
  Rate: 6.12 webhooks/min

  By Event Type:
    circuit_breaker.opened: 5
    rate_limit.exceeded: 4
    proxy.request_completed: 6

✅ SUCCESS (5ms)
════════════════════════════════════════════════════════════════════════════════
```

## Testing Retry Logic

Enable failure simulation to test FlexGate's retry mechanism:

```bash
SIMULATE_FAILURES=true FAILURE_RATE=0.5 npm start
```

This will randomly fail 50% of webhook deliveries, causing FlexGate to retry with exponential backoff.

## Integration with FlexGate

### 1. Start the webhook receiver:
```bash
cd webhook-receiver
npm start
```

### 2. Run the webhook test script:
```bash
cd ..
WEBHOOK_URL=http://localhost:4000/webhook node scripts/testing/test-webhooks.js
```

### 3. Watch both terminals:
- **Webhook receiver** shows real-time webhook deliveries
- **Test script** shows delivery statistics and success rates

## Development

### Watch Mode
```bash
npm run dev
```

This uses Node.js `--watch` flag to auto-reload on file changes.

### Testing with cURL
```bash
# Send a test webhook
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: test.event" \
  -d '{"message": "Hello from cURL!"}'

# Check health
curl http://localhost:4000/health

# View all webhooks
curl http://localhost:4000/webhooks

# Clear webhooks
curl -X POST http://localhost:4000/clear
```

## Tips

💡 **Keep it running** - Leave the webhook receiver running in a terminal while you test FlexGate  
💡 **Use multiple terminals** - Split screen with webhook receiver on one side, test script on the other  
💡 **Check the logs** - All webhook details are logged to the console in real-time  
💡 **Test retries** - Enable failure simulation to verify FlexGate's retry logic works correctly  
💡 **Query programmatically** - Use the REST API to build automated tests  

## License

MIT
