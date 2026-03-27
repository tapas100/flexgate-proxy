# 🚀 Google Gemini Setup Guide (FREE)

## Why Gemini Flash?

✅ **100% FREE** - No credit card required  
✅ **60 requests/minute** - More than enough for incident analysis  
✅ **1 million tokens/day** - Generous daily quota  
✅ **Fast responses** - ~500ms average  
✅ **Great quality** - Perfect for structured output (recommendations)  

**Cost Comparison (1000 analyses):**
- Gemini Flash: **$0.00** (FREE tier)
- Claude Sonnet: **$3.00**
- Claude Opus: **$15.00**

---

## 📝 Step-by-Step Setup (2 minutes)

### 1. Get Your Free API Key

1. Go to: **https://aistudio.google.com/app/apikey**
2. Click **"Get API Key"** or **"Create API Key"**
3. Select **"Create API key in new project"**
4. Copy your API key (starts with `AIza...`)

**No credit card needed!** ✨

---

### 2. Configure FlexGate

#### Option A: Via Admin UI (Recommended)

1. Open FlexGate Admin UI: http://localhost:3000
2. Go to **Settings** → **AI Configuration**
3. Select **"Google Gemini"** from provider dropdown
4. Paste your API key
5. Keep model as **"Gemini 1.5 Flash"** (fastest & free)
6. Click **"Save Settings"**
7. *(Optional)* Click **"Test API Key"** to verify

#### Option B: Via Environment Variables

```bash
# Edit .env file
AI_PROVIDER=gemini
AI_API_KEY=AIza...your-key-here...
AI_MODEL=gemini-1.5-flash
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0
```

```bash
# Restart FlexGate
npm run build
npm start
```

---

## ✅ Verify It's Working

### Test 1: Analyze an Incident

1. Go to **AI Incidents** page
2. Click **"Analyze with AI"** on any incident
3. You should see:
   - ✅ Analysis appears in ~500ms
   - ✅ Recommendations auto-created (5 action items)
   - ✅ Metadata shows: `"provider": "gemini"`

### Test 2: Check Logs

```bash
# Look for Gemini API calls in logs
tail -f server.log | grep -i gemini
```

You should see:
```
✅ Loaded AI config from database: gemini
🤖 Calling Gemini API...
✨ Total recommendations parsed: 5
```

---

## 🎯 Rate Limits (FREE Tier)

| Limit | Gemini Flash (FREE) |
|-------|---------------------|
| Requests/min | **60** |
| Requests/day | **1,500** |
| Tokens/day | **1 million** |

**For FlexGate incident analysis:**
- Average tokens per analysis: ~1,000
- You can analyze **1,000 incidents/day** for FREE! 🎉

---

## 💰 Cost Calculator

### FREE Tier (What you get)
```
60 req/min × 60 min = 3,600 requests/hour
× 24 hours = 86,400 requests/day (capped at 1,500)

Cost: $0.00/month
```

### If You Exceed (Paid Tier)
```
Gemini Flash pricing:
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

For 10,000 analyses/month:
~$0.38/month (vs $30 with Claude)
```

**95% cheaper than Claude!** 💸

---

## 🔧 Advanced Configuration

### Optimize for Speed
```typescript
{
  "provider": "gemini",
  "model": "gemini-1.5-flash",
  "temperature": 0,        // Deterministic output
  "maxTokens": 1000        // Faster responses
}
```

### Optimize for Quality
```typescript
{
  "provider": "gemini",
  "model": "gemini-1.5-pro",  // More capable (2 req/min free)
  "temperature": 0.3,         // Slightly creative
  "maxTokens": 2000
}
```

---

## 🆚 When to Use Other Providers

| Use Case | Recommended Provider |
|----------|---------------------|
| **Production (default)** | **Gemini Flash** (FREE, fast) |
| Ultra-fast responses | **Groq** (500+ tok/s, 30 req/min FREE) |
| Complex reasoning | **Claude Sonnet** (paid, $3/1M tokens) |
| Budget-conscious paid | **OpenAI GPT-4o-mini** ($0.15/1M) |
| Testing/offline | **Demo mode** (mock responses) |

---

## 🐛 Troubleshooting

### "Invalid API Key" Error
```bash
# Check your key format
echo $AI_API_KEY | head -c 20
# Should show: AIza...

# Regenerate key at:
# https://aistudio.google.com/app/apikey
```

### "Rate Limit Exceeded"
```bash
# You hit 60 req/min limit
# Wait 1 minute or switch to demo mode temporarily
```

### "Demo mode still active"
```bash
# Make sure you clicked "Save Settings"
# Check backend received the config:
curl http://localhost:8080/api/settings/ai | jq '.config.provider'
# Should show: "gemini"
```

---

## 📚 Resources

- **Get API Key**: https://aistudio.google.com/app/apikey
- **Gemini Docs**: https://ai.google.dev/gemini-api/docs
- **Pricing**: https://ai.google.dev/pricing
- **Rate Limits**: https://ai.google.dev/gemini-api/docs/quota

---

## ✨ Pro Tips

1. **Keep Flash as default** - Pro model is only needed for edge cases
2. **Monitor usage** - Check Google AI Studio dashboard
3. **Cache common patterns** - FlexGate auto-caches similar incidents
4. **Batch analyze** - Analyze multiple incidents at once
5. **Set alerts** - Get notified when approaching limits

---

**Need help?** Check our [Multi-Provider AI Documentation](./MULTI_PROVIDER_AI_COMPLETE.md)

**Ready to upgrade?** See [Groq Setup](https://console.groq.com/keys) for even faster inference!
