# 🎯 Claude Integration - Quick Reference Card

**FlexGate → Claude AI in 3 Steps**

---

## 📝 Quick Commands

### Get Incidents
```bash
# List all incidents
curl http://localhost:8080/api/ai-incidents

# Get specific incident
curl http://localhost:8080/api/ai-incidents/{id}

# Get Claude-ready prompt
curl http://localhost:8080/api/ai-incidents/{id}/prompt
```

### Create Test Incident
```bash
curl -X POST http://localhost:8080/api/ai-incidents \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "event_id": "test_001",
      "event_type": "ERROR_RATE_SPIKE",
      "severity": "CRITICAL",
      "summary": "Payment API error rate at 35%",
      "data": {"metric": "error_rate", "current_value": 35}
    }
  }'
```

---

## 🎨 Event Types Reference

| Event Type | When to Use | Typical Cost |
|------------|-------------|--------------|
| `ERROR_RATE_SPIKE` | API errors jump suddenly | $0.012 |
| `LATENCY_ANOMALY` | Response times increase | $0.011 |
| `CIRCUIT_BREAKER_CANDIDATE` | Upstream failing | $0.015 |
| `RATE_LIMIT_BREACH` | Client hitting limits | $0.009 |
| `COST_ALERT` | AI costs spiking | $0.014 |
| `RETRY_STORM` | Excessive retries | $0.010 |
| `UPSTREAM_DEGRADATION` | Backend slow | $0.013 |
| `SECURITY_ANOMALY` | Unusual auth patterns | $0.016 |
| `CAPACITY_WARNING` | Resources near limits | $0.011 |
| `RECOVERY_SIGNAL` | Auto-resolved | $0.008 |

---

## 💰 Cost Quick Calc

```
Input Tokens Cost:  $3 per 1M tokens
Output Tokens Cost: $15 per 1M tokens

Example Analysis:
- Input:  400 tokens = $0.0012
- Output: 200 tokens = $0.0030
- Total:            = $0.0042

Typical Range: $0.008 - $0.016 per analysis
```

---

## 🔄 3-Step Workflow

### Step 1: Get Incident
```bash
# Via UI
http://localhost:3000/ai-incidents

# Via CLI
flexgate ai list

# Via API
curl http://localhost:8080/api/ai-incidents
```

### Step 2: Generate Prompt
```bash
# Click "Analyze with Claude" in UI
# OR
curl http://localhost:8080/api/ai-incidents/{id}/prompt | jq .prompt
```

### Step 3: Send to Claude
```bash
# Option A: Copy & paste into https://claude.ai
# Option B: Use API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model": "claude-3-5-sonnet-20241022", ...}'
```

---

## 📊 Expected Response Format

```json
{
  "error_category": "Database Connection Pool Exhausted",
  "likely_causes": [
    "Pool size too small (10 connections)",
    "No connection timeout",
    "Missing index causing slow queries"
  ],
  "actions": [
    "Increase pool to 50 connections",
    "Add connection timeout: 5000ms",
    "Create index on user_id column",
    "Enable query caching (TTL: 30s)"
  ],
  "confidence": 87,
  "estimated_fix_time": "15 minutes",
  "urgency": "immediate"
}
```

---

## 🎯 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| No incidents showing | Run `./scripts/testing/quick-test-data.sh` |
| Invalid event_type | Use one of 10 valid types from table above |
| Invalid severity | Must be INFO, WARNING, or CRITICAL |
| Blank event type in UI | Old data - delete or update it |
| Prompt not generating | Check incident has all required fields |
| Claude returns error | Verify API key and check token limits |

---

## 🚀 Pro Tips

### 1. Batch Analysis
```bash
# Get all open incidents
curl 'http://localhost:8080/api/ai-incidents?status=OPEN' | \
  jq -r '.incidents[].incident_id' | \
  xargs -I {} curl http://localhost:8080/api/ai-incidents/{}/prompt
```

### 2. Cost Tracking
```bash
# Via CLI (future)
flexgate ai costs

# Via API (future)
curl http://localhost:8080/api/ai/costs
```

### 3. Auto-Generate Events
```typescript
// config/ai-events.ts
aiEvents.on('ERROR_RATE_SPIKE', async (event) => {
  if (event.severity === 'CRITICAL') {
    const prompt = await getPrompt(event.incident_id);
    await sendToSlack(prompt);
  }
});
```

---

## 📚 Documentation Links

| Doc | Purpose | Time |
|-----|---------|------|
| [Quick Start](./CLAUDE_INTEGRATION_QUICK_START.md) | Setup guide | 10 min |
| [Checklist](./CLAUDE_READY_CHECKLIST.md) | Implementation roadmap | N/A |
| [Summary](./CLAUDE_READY_SUMMARY.md) | Overview | 5 min read |
| [Validation](./VALIDATION_TEST_COMPLETE.md) | Testing results | Reference |

---

## 🎓 Learning Path

1. **Beginner** (Day 1)
   - Read Quick Start guide
   - Get API key
   - Generate first prompt
   - Paste into Claude.ai

2. **Intermediate** (Week 1)
   - Use Admin UI
   - Understand all event types
   - Track costs
   - Apply recommendations

3. **Advanced** (Month 1)
   - Set up webhooks
   - Auto-analysis
   - Custom templates
   - Integration with Slack/Teams

---

**Print this card and keep it handy! 📄**

---

**Version:** 1.0  
**Last Updated:** Feb 16, 2026  
**Quick Help:** See CLAUDE_INTEGRATION_QUICK_START.md
