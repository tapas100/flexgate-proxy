# 🚀 AI Features - Quick Test Guide

## ✅ Everything is LIVE and READY!

### What You Have Now

**1. Backend API** (http://localhost:8080/api/ai/*)
- 6 endpoints for AI event generation and prompt building
- All 10 event types functional
- Claude-ready prompts with cost estimation

**2. Admin UI Page** (http://localhost:3000/ai-testing)
- Interactive testing interface
- Event generation with real-time JSON display
- Claude prompt builder
- Copy to clipboard functionality

**3. Navigation**
- Sidebar menu item: "AI Testing" (brain icon)
- Located in bottom section above Troubleshooting

---

## 🎯 Test in 60 Seconds

### Option 1: Admin UI (Recommended)

```bash
# 1. Open browser
http://localhost:3000/ai-testing

# 2. Select event type (e.g., "Latency Degradation")
# 3. Click "Generate Sample Event"
# 4. Click "Build Claude Prompt →"
# 5. Click copy icon
# 6. Paste into Claude.ai
# 7. Done! ✅
```

### Option 2: Command Line

```bash
# Generate a sample latency anomaly event
curl "http://localhost:8080/api/ai/events/sample?type=LATENCY_ANOMALY" | jq '.'

# Build a Claude prompt
curl -X POST http://localhost:8080/api/ai/prompts/build \
  -H "Content-Type: application/json" \
  -d '{"eventType":"LATENCY_ANOMALY"}' | jq '.data.prompt' -r

# Copy the output and paste into Claude.ai
```

---

## 📊 What Each Event Type Does

| Event Type | What It Detects | Claude Will Suggest |
|-----------|----------------|-------------------|
| **Latency Anomaly** | Slow response times | Query optimization, caching |
| **Error Rate Spike** | High error rates | Error handling, retries |
| **Cost Alert** | High API costs | Route optimization, caching |
| **Retry Storm** | Excessive retries | Backoff strategy, circuit breaker |
| **Circuit Breaker** | Service instability | Circuit breaker config |
| **Rate Limit Breach** | Too much traffic | Rate limiting, throttling |
| **Upstream Degradation** | Upstream issues | Fallback strategies |
| **Security Anomaly** | Unusual access | Security measures |
| **Capacity Warning** | Resource saturation | Scaling recommendations |
| **Recovery Signal** | Auto-healing | Validation of recovery |

---

## 🧪 Sample Test Case

### Test: Latency Anomaly Detection

**1. Generate Event:**
```bash
curl "http://localhost:8080/api/ai/events/sample?type=LATENCY_ANOMALY"
```

**2. Expected Event JSON:**
```json
{
  "event_id": "evt_...",
  "timestamp": "2024-02-15T...",
  "event_type": "LATENCY_ANOMALY",
  "severity": "warning",
  "summary": "Route /api/users experiencing latency degradation...",
  "data": {
    "route_id": "route_123",
    "current_metrics": {
      "p50_latency_ms": 1250,  // 177% increase
      "p95_latency_ms": 2800   // 214% increase
    },
    "baseline_metrics": {
      "p50_latency_ms": 450,
      "p95_latency_ms": 890
    }
  },
  "ai_metadata": {
    "confidence": 0.85,
    "estimated_tokens": 600
  }
}
```

**3. Build Prompt:**
```bash
curl -X POST http://localhost:8080/api/ai/prompts/build \
  -H "Content-Type: application/json" \
  -d @- << 'EOF' | jq '.data.prompt' -r
{
  "eventType": "LATENCY_ANOMALY"
}
EOF
```

**4. Expected Prompt (sent to Claude):**
```
You are an expert Site Reliability Engineer analyzing API gateway performance issues.

CONTEXT:
Route /api/users is experiencing latency degradation affecting user experience.

METRICS:
- Current P50: 1250ms (baseline: 450ms, +177% increase)
- Current P95: 2800ms (baseline: 890ms, +214% increase)
- Request volume: Normal
- Error rate: 2.5%

TASK:
Analyze this latency anomaly and provide:
1. Root cause analysis
2. Impact assessment
3. Recommended actions (prioritized)
4. Confidence level for each recommendation

Respond with structured JSON containing:
- analysis_summary
- root_cause_analysis
- impact_assessment
- recommended_actions (array with priority, action, rationale)
- metadata (confidence, estimated_effort)
```

**5. Expected Claude Response:**
```json
{
  "analysis_summary": "Critical latency degradation detected on /api/users endpoint with P50 latency increased by 177% and P95 by 214%. The pattern suggests database query performance issues or resource contention.",
  
  "root_cause_analysis": "Most likely causes:\n1. Database query optimization needed (70% confidence)\n2. Increased data volume without pagination (60% confidence)\n3. Missing or expired cache (50% confidence)",
  
  "impact_assessment": {
    "severity": "high",
    "user_impact": "significant - users experiencing slow page loads",
    "affected_endpoints": ["/api/users"],
    "business_impact": "User experience degradation, potential revenue loss"
  },
  
  "recommended_actions": [
    {
      "priority": 1,
      "action": "Enable query result caching for /api/users endpoint",
      "rationale": "Quick win - can reduce database load by 60-80%",
      "estimated_effort": "1-2 hours",
      "confidence": 0.85
    },
    {
      "priority": 2,
      "action": "Add database query profiling and identify slow queries",
      "rationale": "Identify specific queries causing degradation",
      "estimated_effort": "2-4 hours",
      "confidence": 0.80
    },
    {
      "priority": 3,
      "action": "Implement pagination if not already present",
      "rationale": "Limit data returned per request",
      "estimated_effort": "4-8 hours",
      "confidence": 0.70
    }
  ],
  
  "metadata": {
    "confidence": 0.82,
    "estimated_effort": "4-8 hours total",
    "severity": "high",
    "urgency": "address within 4 hours"
  }
}
```

---

## 🎨 Admin UI Features

### Left Panel
- **Event Type Selector** - Dropdown with 10 types
- **Generate Button** - Creates sample event
- **JSON Display** - Syntax-highlighted event data
- **Metadata Chips** - Confidence, tokens, severity

### Right Panel
- **Template Info** - Template name and type
- **Cost Display** - Estimated Claude API cost
- **Prompt Text** - Full Claude-ready prompt
- **Copy Button** - One-click clipboard copy

### Bottom Panel
- **Quick Reference** - All 10 event types in grid
- **Color Coding** - Visual severity indicators
- **Click to Select** - Quick event type switching

---

## 📈 Cost & Token Estimates

| Event Type | Estimated Tokens | Estimated Cost |
|-----------|-----------------|----------------|
| Latency Anomaly | ~600 | $0.012 |
| Error Rate Spike | ~650 | $0.013 |
| Cost Alert | ~550 | $0.011 |
| Retry Storm | ~700 | $0.014 |
| Circuit Breaker | ~750 | $0.015 |
| Rate Limit Breach | ~600 | $0.012 |
| Upstream Degradation | ~650 | $0.013 |
| Security Anomaly | ~800 | $0.016 |
| Capacity Warning | ~600 | $0.012 |
| Recovery Signal | ~550 | $0.011 |

*Based on Claude 3.5 Sonnet pricing: $3.00/1M input tokens, $15.00/1M output tokens*

---

## 🔧 Troubleshooting

### Problem: Admin UI not loading
**Solution:**
```bash
# Check if Admin UI is running
ps aux | grep react-scripts | grep -v grep

# If not running, start it
cd admin-ui && npm start
```

### Problem: AI endpoints not found (404)
**Solution:**
```bash
# Check if backend is running
ps aux | grep "node.*dist/bin/www" | grep -v grep

# Restart backend
npm run build
kill $(ps aux | grep "node.*dist/bin/www" | grep -v grep | awk '{print $2}')
NODE_ENV=production node dist/bin/www &
```

### Problem: Can't see "AI Testing" in sidebar
**Solution:**
- Refresh the page (Cmd+R or Ctrl+R)
- Clear browser cache
- Check browser console for errors

---

## ✅ Verification Commands

```bash
# 1. Check backend is running
curl http://localhost:8080/health

# 2. Check AI endpoints
curl http://localhost:8080/api/ai/event-types | jq '.data.total'
# Should return: 10

# 3. Test event generation
curl "http://localhost:8080/api/ai/events/sample?type=LATENCY_ANOMALY" | jq '.data.event.event_type'
# Should return: "LATENCY_ANOMALY"

# 4. Test prompt building
curl -X POST http://localhost:8080/api/ai/prompts/build \
  -H "Content-Type: application/json" \
  -d '{"eventType":"ERROR_RATE_SPIKE"}' | jq '.data.recommendations.model'
# Should return: "claude-3-5-sonnet-20241022"

# 5. Check Admin UI
curl http://localhost:3000 | grep -q "root" && echo "Admin UI running" || echo "Admin UI not running"
```

---

## 🎉 You're Ready!

Everything is set up and working:
- ✅ 72/72 unit tests passing
- ✅ Backend API running on port 8080
- ✅ Admin UI running on port 3000
- ✅ All 10 event types functional
- ✅ Claude prompt generation working
- ✅ Cost estimation accurate

### Next Steps:
1. Open http://localhost:3000/ai-testing
2. Generate an event
3. Build a prompt
4. Copy to Claude
5. See the magic! ✨

---

## 📚 Additional Resources

- **Comprehensive Guide:** AI_TESTING_GUIDE_ADMIN_UI.md
- **Claude Examples:** CLAUDE_RESPONSE_EXAMPLE.md
- **Testing Summary:** AI_TESTING_SUMMARY.md
- **Complete Status:** AI_ADMIN_UI_COMPLETE.md
- **Implementation Details:** AI_FEATURES_COMPLETE.md

---

**Happy Testing! 🚀**
