# 🧪 Webhook Testing Quick Start

This guide shows you how to test FlexGate webhooks end-to-end using the local webhook receiver.

## Setup (One-time)

### 1. Install webhook receiver dependencies
```bash
cd webhook-receiver
npm install
cd ..
```

## Testing Webhooks

### Terminal 1: Start the Webhook Receiver

```bash
cd webhook-receiver
npm start
```

You should see:
```
════════════════════════════════════════════════════════════════════════════════
🚀 FlexGate Webhook Receiver
════════════════════════════════════════════════════════════════════════════════

Server running on: http://localhost:4000
Webhook endpoint: http://localhost:4000/webhook
Health check: http://localhost:4000/health
View webhooks: http://localhost:4000/webhooks
Clear webhooks: POST http://localhost:4000/clear

════════════════════════════════════════════════════════════════════════════════
Waiting for webhooks...
════════════════════════════════════════════════════════════════════════════════
```

**Keep this terminal open!** It will display all incoming webhooks in real-time with beautiful formatting.

### Terminal 2: Run the Webhook Test Script

```bash
node scripts/testing/test-webhooks.js
```

This will:
1. ✅ Create test webhooks via FlexGate API
2. 🎯 Generate various events (circuit breaker, rate limit, proxy requests)
3. 📨 Send webhooks to the receiver on localhost:4000
4. 📊 Monitor delivery statistics
5. 🧹 Clean up test webhooks

### Watch Both Terminals

- **Terminal 1 (Webhook Receiver)**: Shows detailed webhook payloads and headers
- **Terminal 2 (Test Script)**: Shows delivery statistics and success rates

## Example Output

### Webhook Receiver Terminal

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

📈 Statistics:
────────────────────────────────────────────────────────────────────────────────
  Total Webhooks: 15
  Successful: 14
  Failed: 1
  Uptime: 2.45s
  Rate: 6.12 webhooks/min

✅ SUCCESS (5ms)
════════════════════════════════════════════════════════════════════════════════
```

### Test Script Terminal

```
🚀 FlexGate Webhook Testing Script
═══════════════════════════════════════════════════════════════════════════════
Base URL: http://localhost:3000
Webhook URL: http://localhost:4000/webhook
Generate Events: Yes
Cleanup: Yes
═══════════════════════════════════════════════════════════════════════════════

📋 Step 1: Checking existing webhooks...
📝 Step 2: Creating test webhooks...
✅ Created 4 webhooks

🎯 Step 3: Generating events...
⚡ Triggering circuit breaker event...
⚡ Triggering rate limit event...
⚡ Triggering proxy request events...

👀 Step 4: Monitoring webhook deliveries...

📊 Webhook Delivery Stats:
────────────────────────────────────────────────────────────────────────────────
Circuit Breaker Events:
   Total Deliveries: 5
   Successful: 5 ✅
   Failed: 0 ❌
   Success Rate: 100%
```

## Advanced Testing

### Test Retry Logic

Enable failure simulation in the webhook receiver:

```bash
# Terminal 1: Start with 30% failure rate
SIMULATE_FAILURES=true FAILURE_RATE=0.3 npm start
```

```bash
# Terminal 2: Run test script
node scripts/testing/test-webhooks.js
```

Watch as FlexGate automatically retries failed webhook deliveries with exponential backoff!

### Custom Webhook URL

Use any webhook URL you want:

```bash
# Use webhook.site
WEBHOOK_URL=https://webhook.site/your-unique-url node scripts/testing/test-webhooks.js

# Use ngrok tunnel
WEBHOOK_URL=https://your-tunnel.ngrok.io/webhook node scripts/testing/test-webhooks.js

# Use your own server
WEBHOOK_URL=https://your-domain.com/webhooks node scripts/testing/test-webhooks.js
```

### Manual Testing with cURL

Test individual webhook deliveries:

```bash
# Send a test webhook manually
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: test.event" \
  -H "X-Webhook-Id: test-123" \
  -d '{
    "event": "test.event",
    "timestamp": "2026-01-30T12:00:00Z",
    "data": {
      "message": "Hello from manual test!"
    }
  }'
```

### Query Webhook Statistics

```bash
# Get health and stats
curl http://localhost:4000/health

# List all received webhooks
curl http://localhost:4000/webhooks | jq

# Clear all webhooks
curl -X POST http://localhost:4000/clear
```

## Configuration

### Webhook Receiver

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `4000` | Server port |
| `SIMULATE_FAILURES` | `false` | Enable random failures |
| `FAILURE_RATE` | `0.2` | Failure percentage (0.0-1.0) |

### Test Script

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | FlexGate API URL |
| `WEBHOOK_URL` | `http://localhost:4000/webhook` | Webhook receiver URL |
| `GENERATE_EVENTS` | `true` | Generate test events |
| `EVENT_INTERVAL` | `3000` | Delay between events (ms) |
| `CLEANUP` | `true` | Delete webhooks after test |

## Troubleshooting

### "Connection refused" error

Make sure the webhook receiver is running:
```bash
cd webhook-receiver
npm start
```

### "Webhook creation failed"

Make sure FlexGate is running:
```bash
npm start
```

### No webhooks received

Check that the webhook URL is correct:
```bash
# Should point to receiver
echo $WEBHOOK_URL
# Should show: http://localhost:4000/webhook
```

### Want to see webhook payloads in browser?

The webhook receiver is terminal-only, but you can query the API:

```bash
# Open in browser
open http://localhost:4000/webhooks

# Or use curl with jq for pretty JSON
curl http://localhost:4000/webhooks | jq
```

## Next Steps

- ✅ Test different webhook events in the Admin UI
- ✅ Create webhooks with different retry configurations
- ✅ Monitor webhook delivery rates under load
- ✅ Test webhook signature validation (when implemented)
- ✅ Integrate webhooks with your own services

## Resources

- [Webhook Receiver README](webhook-receiver/README.md)
- [FlexGate API Documentation](docs/api.md)
- [Webhook Events Reference](docs/features/webhooks.md)

Happy testing! 🎉
