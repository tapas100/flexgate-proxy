# 🎯 AI Incident Analysis - Quick Reference

## ✅ Status: COMPLETE & WORKING

**Current Provider**: Groq (llama-3.3-70b-versatile)  
**API Key**: Configured ✅  
**Demo Mode**: OFF ✅  

## 🚀 How to Use

### 1. From Admin UI
```
1. Open http://localhost:3000/ai-incidents
2. Click any incident
3. Click "🤖 Analyze with AI" button
4. Wait 1-2 seconds
5. See recommendations from Groq!
```

### 2. From API
```bash
# Create incident
curl -X POST http://localhost:8080/api/ai-incidents \
  -H "Content-Type: application/json" \
  -d '{"event": {
    "event_id": "test_123",
    "event_type": "CPU_SPIKE",
    "severity": "WARNING",
    "summary": "High CPU usage detected"
  }}'

# Analyze it
curl -X POST http://localhost:8080/api/ai-incidents/test_123/analyze

# Get recommendations
curl http://localhost:8080/api/ai-incidents/test_123
```

## 🔄 Switch Providers

### Groq (⚡ CURRENT - Fastest)
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "groq",
    "apiKey": "gsk_REDACTED_ROTATE_THIS_KEY",
    "model": "llama-3.3-70b-versatile"
  }'
```

### Gemini (✨ FREE - Recommended)
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "apiKey": "AIzaSy...",
    "model": "gemini-2.0-flash"
  }'
```

### Claude (🧠 Most Capable)
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "claude",
    "apiKey": "sk-ant-...",
    "model": "claude-3-5-sonnet-20241022"
  }'
```

### Demo Mode (🎭 No API Key)
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "demo",
    "demoMode": true
  }'
```

## 📊 Check Current Config

```bash
curl http://localhost:8080/api/settings/ai | jq '{provider, model, hasApiKey, demoMode}'
```

Output:
```json
{
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "hasApiKey": true,
  "demoMode": false
}
```

## 🧪 Test Analysis

```bash
# Quick test
curl -X POST http://localhost:8080/api/ai-incidents \
  -H "Content-Type: application/json" \
  -d '{"event": {
    "event_id": "quick_test",
    "event_type": "CPU_SPIKE",
    "severity": "WARNING",
    "summary": "Test incident for AI analysis"
  }}' && sleep 1 && \
curl -X POST http://localhost:8080/api/ai-incidents/quick_test/analyze | jq '{success, recommendations_created, metadata: {provider, model, response_time_ms, cost_usd}}'
```

Expected output:
```json
{
  "success": true,
  "recommendations_created": 3,
  "metadata": {
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "response_time_ms": 1200,
    "cost_usd": "0.000450"
  }
}
```

## 📂 Key Files

### Backend
- `src/routes/ai-incidents.ts` (line 660) - Analyze endpoint
- `src/services/aiProviders.ts` - Multi-provider support
- `src/routes/settings-ai.ts` - Configuration API

### Frontend
- `admin-ui/src/pages/AIIncidentDetail.tsx` - Incident detail page
  - Line 89: `aiProvider` state
  - Line 120: `loadAIProvider()` function
  - Line 466: Dynamic provider name display

## 🎨 UI Updates

The frontend now shows:
- ✅ **"Groq Recommendations"** (instead of "Claude")
- ✅ **"Gemini Analysis"** (when using Gemini)
- ✅ **Dynamic provider name** based on current config
- ✅ Automatic updates when provider changes

## 🔍 Troubleshooting

### Analysis returns "demo mode"
```bash
# Check if API key is set
curl http://localhost:8080/api/settings/ai | jq '.hasApiKey'

# If false, set API key
curl -X POST http://localhost:8080/api/settings/ai \
  -d '{"provider":"groq","apiKey":"gsk_..."}'
```

### "Provider API error"
```bash
# Test API key directly
curl -X POST https://api.groq.com/v1/chat/completions \
  -H "Authorization: Bearer gsk_..." \
  -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"test"}]}'
```

### UI still shows "Claude"
```bash
# Check if frontend is running
lsof -ti:3000

# Restart if needed
cd admin-ui && npm start
```

### Database permission error
```sql
GRANT ALL ON TABLE ai_incidents TO flexgate;
GRANT ALL ON TABLE ai_recommendations TO flexgate;
```

## 💰 Cost Tracking

```sql
-- View analysis costs
SELECT 
  incident_id,
  analysis_model,
  analysis_tokens,
  analysis_cost_usd,
  analyzed_at
FROM ai_incidents
WHERE analyzed_at IS NOT NULL
ORDER BY analyzed_at DESC
LIMIT 10;
```

## 🎉 Success Indicators

✅ When working correctly, you should see:
- Response in 1-2 seconds (Groq)
- 3-5 recommendations created
- Cost: $0.0004-0.0008 per analysis
- Provider name in UI matches config
- Tokens tracked in database
- No "demo mode" in response

## 📞 Support

If issues persist:
1. Check server logs: `tail -f server-output.log`
2. Check API config: `curl http://localhost:8080/api/settings/ai`
3. Test API key: Use provider's playground
4. Check database: `psql -U flexgate -d flexgate`

---

**Last Updated**: 2026-02-16  
**Status**: ✅ FULLY OPERATIONAL
