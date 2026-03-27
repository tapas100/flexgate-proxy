# Write-Once API Key System - Quick Reference 🚀

## TL;DR

**What**: API keys can only be saved once, then must be deleted before changing  
**Why**: Security + Clear audit trail + CLI-friendly  
**How**: Save → Locked 🔒 → Delete → Save new

---

## Quick Start (3 Methods)

### 1️⃣ Admin UI (Web)
```
http://localhost:3000/settings
1. Select provider (e.g., Gemini)
2. Enter API key
3. Click "Save Settings"
4. ✅ LOCKED - cannot edit
5. To change: "Delete API Key" → enter new → save
```

### 2️⃣ Config File (CLI)
```bash
cp config.example.json config.json
vi config.json  # Add your API key
npm start
# ✅ Loaded config from: ./config.json
# 🔒 API key is LOCKED
```

### 3️⃣ Environment Variables (Production)
```bash
export AI_PROVIDER=gemini
export AI_API_KEY=AIzaSyYourKeyHere
npm start
```

---

## REST API Cheat Sheet

### Check Status
```bash
curl http://localhost:8080/api/settings/ai | jq '{hasApiKey, apiKeyLocked}'
# {"hasApiKey": true, "apiKeyLocked": true}
```

### Save Initial Key
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","apiKey":"AIza123"}'
# {"success": true}
```

### Try to Update (Will Fail)
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -d '{"apiKey":"AIza456"}'
# {"success": false, "code": "KEY_ALREADY_EXISTS"}
```

### Delete Key
```bash
curl -X DELETE http://localhost:8080/api/settings/ai/key
# {"success": true, "hasApiKey": false}
```

### Save New Key (After Delete)
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -d '{"provider":"openai","apiKey":"sk-proj-789"}'
# {"success": true}
```

---

## Configuration Priority

```
1. Environment Variables ⬅️ HIGHEST (overrides all)
   ├─ AI_PROVIDER=gemini
   ├─ AI_API_KEY=AIza...
   └─ ENCRYPTION_KEY=...

2. External Config File ⬅️ CLI/DevOps
   └─ CONFIG_FILE_PATH=./config.json

3. Database ⬅️ UI saves here
   └─ settings table (encrypted)

4. Defaults ⬅️ LOWEST
   └─ provider=gemini, demoMode=true
```

---

## config.json Structure

```json
{
  "ai": {
    "provider": "gemini",
    "apiKey": "AIzaSy...",
    "model": "gemini-1.5-flash",
    "maxTokens": 2000,
    "temperature": 0
  },
  "security": {
    "encryptionKey": "32-byte-key",
    "allowApiKeyEdit": false
  }
}
```

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Console Messages Explained

| Message | Meaning |
|---------|---------|
| `✅ Loaded config from: ./config.json` | External config loaded successfully |
| `🔐 API key loaded: AIza1234••••7890` | Key loaded and masked |
| `🔒 API key is now LOCKED` | Write-once protection active |
| `🔒 Blocked attempt to update` | Update rejected (key already exists) |
| `🗑️  Deleting API key...` | Delete operation started |
| `✅ API key deleted and unlocked` | Key removed, can add new |

---

## Security Features

| Feature | Status | Details |
|---------|--------|---------|
| **AES-256-CBC Encryption** | ✅ | All keys encrypted in database |
| **Key Masking** | ✅ | `AIza1234••••••••7890` in logs |
| **Never Exposed in API** | ✅ | GET returns `""` for apiKey |
| **HTTPS Warnings** | ✅ | Production requires HTTPS |
| **Write-Once** | ✅ | Cannot edit, only delete+add |

---

## Testing

### Automated Test
```bash
chmod +x test-write-once.sh
./test-write-once.sh
# ✅ ALL TESTS PASSED!
```

### Manual Test (4 commands)
```bash
# 1. Save
curl -X POST localhost:8080/api/settings/ai -d '{"apiKey":"test1"}'

# 2. Try update (fails)
curl -X POST localhost:8080/api/settings/ai -d '{"apiKey":"test2"}'

# 3. Delete
curl -X DELETE localhost:8080/api/settings/ai/key

# 4. Save new (works)
curl -X POST localhost:8080/api/settings/ai -d '{"apiKey":"test3"}'
```

---

## UI Features

### When Locked 🔒
```
┌─────────────────────────────────────┐
│ ⚠️  Write-Once Protection Active    │
│ API key is locked and cannot be    │
│ edited. To change:                 │
│ • Click "Delete API Key"           │
│ • Enter new API key                │
│ • Save settings                    │
└─────────────────────────────────────┘

API Key: [••••••••••••] 🔒 (disabled)
Helper: 🔒 API key is locked. Delete to change.

[Test API Key]  [Delete API Key]
```

### When Unlocked 🔓
```
API Key: [____________] 👁️
Helper: Get your API key from provider's console

[Test API Key]
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't update key | `curl -X DELETE /api/settings/ai/key` first |
| Config not loading | Check file exists: `ls config.json` |
| Key not persisting | Check priority: env vars override everything |
| HTTPS warning | Configure TLS or use reverse proxy |

---

## Deployment Examples

### Docker Compose
```yaml
services:
  flexgate:
    environment:
      - AI_PROVIDER=gemini
      - AI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - ./config.json:/app/config.json:ro
```

### Kubernetes Secret
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: flexgate-ai
stringData:
  provider: gemini
  apiKey: AIzaSy...
```

### Systemd Service
```ini
[Service]
Environment="AI_PROVIDER=gemini"
Environment="AI_API_KEY=AIzaSy..."
ExecStart=/usr/bin/npm start
```

---

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `config.schema.json` | JSON schema | 66 |
| `config.example.json` | Example config | 14 |
| `test-write-once.sh` | Test script | 150 |
| `WRITE_ONCE_API_KEYS.md` | Full guide | 800+ |
| `WRITE_ONCE_IMPLEMENTATION.md` | Summary | 400+ |

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/settings/ai` | Get config (key never returned) |
| `POST` | `/api/settings/ai` | Save/update (write-once enforced) |
| `DELETE` | `/api/settings/ai/key` | Delete locked key |
| `POST` | `/api/settings/ai/test` | Test key validity |

---

## Free AI Providers

| Provider | Rate Limit | Setup Guide |
|----------|------------|-------------|
| **Gemini** | 60 req/min | [GEMINI_SETUP_GUIDE.md](./GEMINI_SETUP_GUIDE.md) |
| **Groq** | 30 req/min | https://console.groq.com |
| **Demo** | Unlimited | No API key needed (mock responses) |

---

## Key Workflow

```
┌─────────────┐
│ 1. Save Key │
└─────┬───────┘
      ↓
┌─────────────┐
│ 2. Locked 🔒│ ← Cannot edit
└─────┬───────┘
      ↓
┌─────────────┐
│ 3. Delete   │ ← Only way to change
└─────┬───────┘
      ↓
┌─────────────┐
│ 4. Save New │
└─────┬───────┘
      ↓
┌─────────────┐
│ 5. Locked 🔒│ ← Re-locked
└─────────────┘
```

---

## Related Docs

- [WRITE_ONCE_API_KEYS.md](./WRITE_ONCE_API_KEYS.md) - Full guide (800+ lines)
- [API_KEY_SECURITY.md](./API_KEY_SECURITY.md) - Security details
- [FREE_AI_IMPLEMENTATION_COMPLETE.md](./FREE_AI_IMPLEMENTATION_COMPLETE.md) - Multi-provider
- [config.schema.json](./config.schema.json) - JSON schema

---

## Pro Tips 💡

1. **Development**: Use Admin UI (http://localhost:3000/settings)
2. **Staging**: Use config.json for reproducibility
3. **Production**: Use environment variables (most secure)
4. **Never commit config.json** to git: `echo "config.json" >> .gitignore`
5. **Rotate keys regularly**: Delete old → save new
6. **Use free tiers**: Gemini Flash = 60 req/min FREE!

---

## Need Help?

```bash
# Check if backend is running
curl http://localhost:8080/api/settings/ai

# Check logs
npm start  # Watch console for 🔒 and ✅ messages

# Run tests
./test-write-once.sh

# Read full guide
cat WRITE_ONCE_API_KEYS.md
```

---

**Status**: ✅ Fully implemented and tested  
**User Request**: ✅ Satisfied - "user can only once save the api key he can't edit it only save then delete then save again"  
**Ready**: 🚀 For testing and deployment
