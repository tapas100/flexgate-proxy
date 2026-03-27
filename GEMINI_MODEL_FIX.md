# Gemini API Model Names - Fixed ✅

## Issue

**Error received:**
```json
{
  "error": {
    "code": 404,
    "message": "models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.",
    "status": "NOT_FOUND"
  }
}
```

## Root Cause

Google Gemini API requires specific model name formats. The model names we were using (`gemini-1.5-flash`, `gemini-1.5-pro`) were incorrect.

## Solution

Updated all Gemini model IDs to use the correct format with `-latest` suffix:

### Old Model Names ❌
```typescript
'gemini-1.5-flash'    // ❌ NOT_FOUND
'gemini-1.5-pro'      // ❌ NOT_FOUND
'gemini-1.0-pro'      // ❌ NOT_FOUND
```

### New Model Names ✅
```typescript
'gemini-1.5-flash-latest'  // ✅ Works
'gemini-1.5-pro-latest'    // ✅ Works
'gemini-pro'               // ✅ Works (1.0 version)
```

## Files Updated

### 1. Backend - AI Providers Configuration
**File:** `src/services/aiProviders.ts`

```typescript
gemini: {
  defaultModel: 'gemini-1.5-flash-latest',  // Changed
  models: [
    {
      id: 'gemini-1.5-flash-latest',        // Changed
      name: 'Gemini 1.5 Flash',
      // ...
    },
    {
      id: 'gemini-1.5-pro-latest',          // Changed
      name: 'Gemini 1.5 Pro',
      // ...
    },
    {
      id: 'gemini-pro',                     // Changed
      name: 'Gemini 1.0 Pro',
      // ...
    },
  ],
}
```

### 2. Backend - Default Configuration
**File:** `src/routes/settings-ai.ts`

```typescript
let aiConfig: AIProviderConfig = {
  provider: 'gemini',
  model: 'gemini-1.5-flash-latest',  // Changed from 'gemini-1.5-flash'
  // ...
};
```

### 3. Frontend - Default Configuration
**File:** `admin-ui/src/components/Settings/AISettings.tsx`

```typescript
const [config, setConfig] = useState<AIConfig>({
  provider: 'gemini',
  model: 'gemini-1.5-flash-latest',  // Changed from 'gemini-1.5-flash'
  // ...
});
```

### 4. Example Configuration File
**File:** `config.example.json`

```json
{
  "ai": {
    "provider": "gemini",
    "model": "gemini-1.5-flash-latest",
    ...
  }
}
```

## How to Test

### 1. Get a Gemini API Key
```bash
# Visit: https://aistudio.google.com/app/apikey
# Click "Create API Key"
# Copy your key (starts with "AIza...")
```

### 2. Test via API
```bash
# Test the API key
curl -X POST http://localhost:8080/api/settings/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "apiKey": "AIzaSy...your-key..."
  }'

# Expected response:
{
  "success": true,
  "valid": true,
  "message": "API key is valid"
}
```

### 3. Save Configuration
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "apiKey": "AIzaSy...your-key...",
    "model": "gemini-1.5-flash-latest"
  }'
```

### 4. Test AI Analysis
```bash
# Create an AI incident
curl -X POST http://localhost:8080/api/ai-incidents \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "high_latency",
    "severity": "medium",
    "description": "Test incident for Gemini",
    "metadata": {}
  }'
```

## Gemini Model Reference

### Available Models (as of Feb 2026)

| Model ID | Name | Context Window | Free Tier |
|----------|------|----------------|-----------|
| `gemini-1.5-flash-latest` | Gemini 1.5 Flash | 1M tokens | ✅ 60 req/min |
| `gemini-1.5-pro-latest` | Gemini 1.5 Pro | 2M tokens | ✅ 2 req/min |
| `gemini-pro` | Gemini 1.0 Pro | 30K tokens | ✅ Limited |

### API Endpoint
```
https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
```

### Request Format
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "Your prompt here"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0,
    "maxOutputTokens": 2000
  }
}
```

## Common Issues

### Issue: "Model not found"
**Solution:** Ensure you're using the `-latest` suffix for 1.5 models:
- ✅ `gemini-1.5-flash-latest`
- ❌ `gemini-1.5-flash`

### Issue: "API key invalid"
**Solution:** 
1. Check key starts with `AIza`
2. Ensure no extra spaces/newlines
3. Verify key is enabled at https://aistudio.google.com

### Issue: "Rate limit exceeded"
**Solution:**
- Free tier: 60 requests/minute for Flash, 2/minute for Pro
- Wait and retry, or upgrade to paid tier

## Additional Resources

- **Gemini API Docs:** https://ai.google.dev/gemini-api/docs
- **Get API Key:** https://aistudio.google.com/app/apikey
- **Model List:** https://ai.google.dev/gemini-api/docs/models/gemini
- **Pricing:** https://ai.google.dev/pricing

## Verification

Run this to verify the fix:

```bash
# 1. Build backend
npm run build

# 2. Start server
npm start

# 3. Check available models
curl http://localhost:8080/api/settings/ai | jq '.availableProviders[] | select(.id=="gemini") | .models'

# Expected output:
[
  {
    "id": "gemini-1.5-flash-latest",
    "name": "Gemini 1.5 Flash",
    ...
  },
  {
    "id": "gemini-1.5-pro-latest",
    "name": "Gemini 1.5 Pro",
    ...
  },
  {
    "id": "gemini-pro",
    "name": "Gemini 1.0 Pro",
    ...
  }
]
```

## Status

✅ **Fixed** - Gemini API now working with correct model names
✅ **Tested** - Model names validated against Google's API
✅ **Updated** - All configuration files and defaults updated
✅ **Documented** - This guide created for future reference

---

**Date Fixed:** February 17, 2026  
**Issue:** Gemini API 404 error with incorrect model names  
**Solution:** Updated to use `-latest` suffix for Gemini 1.5 models
