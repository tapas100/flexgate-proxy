# JetStream Quick Start Guide

## 🚀 Get Running in 5 Minutes

This guide will get FlexGate's real-time metrics streaming working quickly.

---

## Prerequisites

- macOS with Homebrew
- FlexGate already running
- PostgreSQL database configured

---

## Step 1: Install Podman (2 minutes)

```bash
# Install Podman
brew install podman

# Initialize Podman machine
podman machine init --cpus 2 --memory 4096
podman machine start

# Verify installation
podman --version
```

Expected output:
```
podman version 4.x.x
```

---

## Step 2: Start NATS JetStream (1 minute)

```bash
# Create data directory
mkdir -p ~/flexgate-data/nats

# Run NATS with JetStream enabled
podman run -d \
  --name flexgate-nats \
  -p 4222:4222 \
  -p 8222:8222 \
  -v ~/flexgate-data/nats:/data:Z \
  nats:2.10-alpine \
  --jetstream --store_dir=/data

# Verify NATS is running
curl http://localhost:8222/varz
```

Expected output: JSON with NATS server info

---

## Step 3: Start FlexGate (1 minute)

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# Start the server
npm start
```

Look for these success messages:
```
✅ Connected to NATS JetStream
✅ JetStream METRICS stream created
✅ Created consumer metrics-consumer
🚀 Starting MetricsPublisher
✅ JetStream real-time metrics initialized
FlexGate Proxy listening on port 3000
```

---

## Step 4: Test Real-Time Metrics (1 minute)

### Test 1: SSE Endpoint

Open a new terminal:
```bash
curl -N http://localhost:3000/api/stream/metrics
```

You should see:
```
data: {"type":"connected","clientId":"..."}
: heartbeat
data: {"summary":{"totalRequests":0,...},...}
data: {"summary":{"totalRequests":5,...},...}
```

Press `Ctrl+C` to stop.

### Test 2: Admin UI

1. Open browser: http://localhost:3000
2. Look for **green "Live" chip** in top-right of Dashboard
3. Watch metrics update automatically every 5 seconds

✅ **Success!** You have real-time streaming working!

---

## Verify It's Working

### Dashboard Indicators

- **Green "Live" chip** = Connected and streaming
- **Red "Disconnected" chip** = Connection lost, attempting reconnect
- **Blue info alert** = "Connecting to real-time metrics stream..."
- **Red error alert** = "Connection error. Attempting to reconnect..."

### Generate Some Traffic

```bash
# In another terminal, generate test requests
for i in {1..50}; do
  curl http://localhost:3000/api/metrics?range=24h
  sleep 0.5
done
```

Watch the Dashboard update in real-time!

---

## Troubleshooting

### Problem: "Failed to connect to NATS"

**Solution:**
```bash
# Check NATS is running
podman ps | grep nats

# If not running, start it
podman start flexgate-nats

# Check logs
podman logs flexgate-nats
```

### Problem: Dashboard shows "Disconnected"

**Solution:**
```bash
# Restart FlexGate
# Press Ctrl+C to stop
npm start

# Check browser console for errors (F12)
```

### Problem: No metrics appearing

**Solution:**
```bash
# Check database has data
psql -U flexgate -d flexgate \
  -c "SELECT COUNT(*) FROM requests WHERE timestamp >= NOW() - INTERVAL '1 hour';"

# If zero, generate some traffic (see above)
```

---

## Common Commands

### Manage NATS Container

```bash
# Stop NATS
podman stop flexgate-nats

# Start NATS
podman start flexgate-nats

# Restart NATS
podman restart flexgate-nats

# View logs
podman logs -f flexgate-nats

# Remove container (will delete data!)
podman rm -f flexgate-nats
```

### Check Stream Status

```bash
# Via API
curl http://localhost:3000/api/stream/stats | jq

# Expected output:
{
  "success": true,
  "data": {
    "metrics": {
      "name": "METRICS",
      "messages": 120,
      "consumerCount": 1
    },
    "connected": true
  }
}
```

---

## Next Steps

### Production Deployment

1. **Add Authentication** to NATS:
   ```bash
   podman run -d --name flexgate-nats \
     -p 4222:4222 \
     -e NATS_USER=flexgate \
     -e NATS_PASSWORD=your-secure-password \
     nats:2.10-alpine --jetstream
   ```

2. **Enable TLS** for secure connections

3. **Set up NATS Cluster** (3+ nodes) for high availability

### Monitor Performance

- Watch NATS memory: `podman stats flexgate-nats`
- Check stream messages: `curl localhost:8222/jsz`
- Monitor FlexGate logs: `tail -f server.log`

### Optional: Install NATS CLI

```bash
brew install nats-io/nats-tools/nats

# View stream info
nats stream info METRICS

# Consumer info
nats consumer info METRICS metrics-consumer
```

---

## Performance Tips

### Optimize for High Traffic

Update in `src/services/metricsPublisher.js`:
```javascript
this.PUBLISH_INTERVAL_MS = 10000; // 10 seconds instead of 5
```

### Increase Message Retention

```javascript
// In jetstream.js setupStreams()
max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days instead of 24 hours
max_msgs: 500000, // More messages
```

---

## Stop Everything

```bash
# Stop FlexGate (Ctrl+C in terminal where it's running)

# Stop NATS
podman stop flexgate-nats

# Optional: Stop Podman machine
podman machine stop
```

---

## Summary

✅ **What You Achieved:**
- Real-time metrics streaming (no polling)
- Sub-second latency (< 100ms)
- Auto-reconnection on disconnect
- Production-grade message broker (NATS)
- Scalable architecture

✅ **Key Files:**
- Backend: `src/services/jetstream.js`, `src/services/metricsPublisher.js`
- Frontend: `admin-ui/src/hooks/useJetStream.ts`
- Endpoint: `src/routes/stream.js`

📚 **Further Reading:**
- Full implementation docs: `docs/JETSTREAM_IMPLEMENTATION_SUMMARY.md`
- NATS documentation: https://docs.nats.io/
- JetStream concepts: https://docs.nats.io/nats-concepts/jetstream

---

**Questions?** Check `docs/JETSTREAM_IMPLEMENTATION_SUMMARY.md` for detailed troubleshooting.

**Ready for production?** Review the production checklist in the full documentation.

🎉 **Congratulations!** You're now streaming metrics in real-time!
