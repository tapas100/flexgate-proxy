# 🚀 Claude Integration - Quick Start (5 Minutes)

## What You Get

**Before:** Click → Manual copy/paste → Open browser → Wait → Copy response  
**After:** Click → ✅ Automatic analysis in 3 seconds

---

## Setup (One-Time)

### Step 1: Get Claude API Key (2 minutes)

1. Go to: https://console.anthropic.com/
2. Sign up / Login
3. Click "API Keys" in sidebar
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-api03-...`)

### Step 2: Configure FlexGate (1 minute)

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# Add to .env file
echo "ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE" >> .env

# Or edit .env manually and add:
# ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE
```

### Step 3: Restart Backend (2 minutes)

```bash
# Rebuild
npm run build

# Restart server
pkill -f "node.*bin/www"
NODE_ENV=production node dist/bin/www &
```

---

## Usage

### From Admin UI (Recommended)

1. **Navigate to incident:**
   ```
   http://localhost:3000/ai-incidents
   Click any incident
   ```

2. **Click "🤖 Analyze with Claude"**
   - Shows "⏳ Analyzing..." (3-5 seconds)
   - Dialog appears with full analysis

3. **View results:**
   - ✅ Complete Claude analysis
   - 💰 Actual cost ($0.004 typical)
   - ⏱️ Response time
   - 📊 Token usage

### From Terminal (For Testing)

```bash
# Test API endpoint
curl -X POST http://localhost:8080/api/ai-incidents/INCIDENT_ID/analyze

# Example
curl -X POST http://localhost:8080/api/ai-incidents/test_validation_005/analyze
```

**Expected Response:**
```json
{
  "success": true,
  "analysis": "INCIDENT ANALYSIS\n\nROOT CAUSE:\n...",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "cost_usd": "0.004284",
    "response_time_ms": 1234
  }
}
```

---

## Cost Estimates

| Usage | Daily Cost | Monthly Cost |
|-------|-----------|--------------|
| 10 incidents/day | $0.04 | $1.28 |
| 50 incidents/day | $0.21 | $6.40 |
| 100 incidents/day | $0.43 | $12.80 |
| 1000 incidents/day | $4.28 | $128.00 |

**Note:** Costs shown are estimates. Actual cost displayed in UI after analysis.

---

## Troubleshooting

### "Claude API key not configured"

**Solution:**
```bash
# Check if key is set
echo $ANTHROPIC_API_KEY

# If empty, add to .env
echo "ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY" >> .env

# Restart backend
pkill -f "node.*bin/www"
NODE_ENV=production node dist/bin/www &
```

### "Failed to analyze incident"

**Check logs:**
```bash
tail -f debug-server.log | grep -i claude
```

**Common issues:**
- Invalid API key
- Network connectivity
- API rate limits

### Analysis not showing in UI

**Verify backend:**
```bash
curl -X POST http://localhost:8080/api/ai-incidents/test_validation_005/analyze
```

**Check database:**
```sql
SELECT incident_id, ai_analysis, analysis_cost_usd 
FROM ai_incidents 
WHERE ai_analysis IS NOT NULL
LIMIT 5;
```

---

## What's Integrated

### Backend ✅
- `POST /api/ai-incidents/:id/analyze` - Real API call to Claude
- Stores analysis in database
- Tracks costs and token usage
- Returns formatted analysis

### Frontend ✅
- "🤖 Analyze with Claude" button
- Automatic API call (no manual steps)
- Dialog shows complete analysis
- Cost transparency

### Database ✅
- `ai_analysis` column (stores Claude response)
- `analyzed_at` timestamp
- `analysis_cost_usd` actual cost
- `analysis_model` model used

---

## Next Steps

### Immediate
- [x] Set up API key
- [x] Test on one incident
- [ ] Verify cost tracking works

### This Week
- [ ] Analyze 10+ incidents
- [ ] Review analysis quality
- [ ] Set up cost alerts

### Future
- [ ] Auto-analyze CRITICAL incidents
- [ ] Batch processing
- [ ] Custom prompts per team

---

## Key Files

```
Backend:
  src/routes/ai-incidents.ts         ← POST /:id/analyze endpoint
  
Frontend:
  admin-ui/src/pages/AIIncidentDetail.tsx  ← analyzeWithClaude()
  
Config:
  .env                               ← ANTHROPIC_API_KEY=...
  
Database:
  ai_incidents table                 ← ai_analysis column
```

---

## Support

**Questions?** Check: `REAL_CLAUDE_INTEGRATION.md` for complete details

**Issues?** Run:
```bash
curl -X POST http://localhost:8080/api/ai-incidents/:id/analyze
tail -f debug-server.log
```

---

**Status:** ✅ Production Ready  
**Last Updated:** February 16, 2026
