# Write-Once API Key System

## Overview

FlexGate Proxy implements a **write-once** API key system for enhanced security. Once an API key is saved, it cannot be edited - only deleted and replaced with a new key.

## Why Write-Once?

1. **Prevent Accidental Updates**: Stops accidental overwriting of production keys
2. **Audit Trail**: Clear intent when changing keys (delete + add)
3. **Security**: Reduces attack surface for key manipulation
4. **CLI-Friendly**: External config file support for automated deployments

## Configuration Priority

FlexGate loads AI configuration in this order (first match wins):

```
1. Environment Variables (highest priority)
   ├─ AI_PROVIDER
   ├─ AI_API_KEY
   ├─ AI_MODEL
   └─ ENCRYPTION_KEY

2. External Config File (config.json)
   └─ Loaded from: CONFIG_FILE_PATH env var or ./config.json

3. Database (settings table)
   └─ Encrypted storage

4. Defaults (lowest priority)
   └─ provider: 'gemini', demoMode: true
```

## Usage Methods

### Method 1: Admin UI (Web Interface)

**Initial Setup:**
1. Navigate to Settings → AI Configuration
2. Select provider (e.g., "Gemini Flash - FREE")
3. Enter API key
4. Click "Save Settings"
5. ✅ **Key is now LOCKED** (write-once mode active)

**Changing the Key:**
1. Click "Delete API Key" button
2. Confirm deletion
3. Enter new API key
4. Click "Save Settings"
5. ✅ New key is locked

**What You'll See:**
```
🔒 API key is locked (write-once mode)
Cannot edit - delete to change
```

### Method 2: External Config File (CLI/DevOps)

**Step 1: Create config.json**
```bash
cp config.example.json config.json
```

**Step 2: Edit config.json**
```json
{
  "ai": {
    "provider": "gemini",
    "apiKey": "AIzaSyDemoKey1234567890",
    "model": "gemini-1.5-flash",
    "maxTokens": 2000,
    "temperature": 0
  },
  "security": {
    "encryptionKey": "your-32-byte-encryption-key-here",
    "allowApiKeyEdit": false
  }
}
```

**Step 3: Set config path (optional)**
```bash
export CONFIG_FILE_PATH=/etc/flexgate/config.json
```

**Step 4: Start FlexGate**
```bash
npm start
```

**Console Output:**
```
✅ Loaded config from: /path/to/config.json
🔐 API key loaded from config: AIza1234••••••••7890
🔒 API key is LOCKED (write-once mode - delete to change)
ℹ️  Using external config file, skipping database load
```

### Method 3: Environment Variables

**Set environment variables:**
```bash
export AI_PROVIDER=gemini
export AI_API_KEY=AIzaSyDemoKey1234567890
export AI_MODEL=gemini-1.5-flash
export ENCRYPTION_KEY=your-32-byte-key
```

**Start FlexGate:**
```bash
npm start
```

**Note:** Env vars have highest priority and bypass write-once enforcement (for production deployments).

### Method 4: REST API

**Check current config:**
```bash
curl http://localhost:8080/api/settings/ai | jq
```

**Response:**
```json
{
  "success": true,
  "provider": "gemini",
  "apiKey": "",
  "hasApiKey": true,
  "apiKeyLocked": true,
  "model": "gemini-1.5-flash",
  "demoMode": false
}
```

**Save new key (first time only):**
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "apiKey": "AIzaSyDemoKey1234567890"
  }'
```

**Try to update locked key (will fail):**
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "apiKey": "AIzaSyNewKey9876543210"
  }'
```

**Response:**
```json
{
  "success": false,
  "error": "API key already set and locked",
  "details": "Use DELETE /api/settings/ai/key to remove existing key before adding new one",
  "code": "KEY_ALREADY_EXISTS"
}
```

**Delete locked key:**
```bash
curl -X DELETE http://localhost:8080/api/settings/ai/key
```

**Response:**
```json
{
  "success": true,
  "message": "API key deleted successfully",
  "config": {
    "provider": "gemini",
    "hasApiKey": false,
    "demoMode": true
  }
}
```

**Now save new key:**
```bash
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "apiKey": "sk-proj-NewOpenAIKey123"
  }'
```

## Security Features

### 1. AES-256-CBC Encryption
All API keys stored in database are encrypted:
```typescript
encrypt(plaintext) → ciphertext
decrypt(ciphertext) → plaintext
```

### 2. Key Masking
API keys are masked in all logs:
```
Original: AIzaSyDemoKey1234567890abcdefghijklmnopqrs
Masked:   AIza1234••••••••••••••••••••••••••••opqrs
```

### 3. Never Exposed in API
GET endpoint always returns empty string:
```json
{
  "apiKey": "",
  "hasApiKey": true
}
```

### 4. HTTPS Warnings
Production deployments must use HTTPS:
```
⚠️  WARNING: API key sent over HTTP! Use HTTPS in production.
```

### 5. Write-Once Protection
```
🔒 API key already set and locked
Cannot edit - delete to change
```

## Configuration File Schema

**config.json structure:**
```json
{
  "ai": {
    "provider": "gemini|claude|openai|groq|demo",
    "apiKey": "string (will be encrypted in database)",
    "model": "string (provider-specific model ID)",
    "maxTokens": 2000,
    "temperature": 0
  },
  "security": {
    "encryptionKey": "32-byte random string",
    "allowApiKeyEdit": false
  }
}
```

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment Scenarios

### Scenario 1: Development (UI)
```
1. Start FlexGate: npm start
2. Open Admin UI: http://localhost:3000
3. Go to Settings → AI Configuration
4. Save API key via UI
5. Key stored encrypted in database
```

### Scenario 2: Staging (Config File)
```
1. Create config.json with staging API key
2. Set: export CONFIG_FILE_PATH=/etc/flexgate-staging/config.json
3. Start FlexGate: npm start
4. Key loaded from file on startup
5. UI shows "locked" status
```

### Scenario 3: Production (Env Vars)
```
1. Set environment variables in orchestrator:
   - AI_PROVIDER=gemini
   - AI_API_KEY=<secure-key>
   - ENCRYPTION_KEY=<secure-32-byte-key>
2. Deploy container/service
3. FlexGate loads from env vars
4. Highest priority - bypasses file/database
```

### Scenario 4: Docker/Kubernetes
```yaml
# docker-compose.yml
services:
  flexgate:
    environment:
      - AI_PROVIDER=gemini
      - AI_API_KEY=${GEMINI_API_KEY}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - ./config.json:/app/config.json:ro
```

```bash
# .env file (not committed to git)
GEMINI_API_KEY=AIzaSyDemoKey1234567890
ENCRYPTION_KEY=a1b2c3d4e5f6...
```

## Testing the Write-Once System

**Test Script:**
```bash
#!/bin/bash

# Test 1: Save initial key
echo "Test 1: Save initial key"
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","apiKey":"AIza_test_key_1"}' | jq

# Test 2: Try to update (should fail)
echo -e "\nTest 2: Try to update locked key"
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","apiKey":"AIza_test_key_2"}' | jq

# Test 3: Check status
echo -e "\nTest 3: Check status"
curl http://localhost:8080/api/settings/ai | jq '.hasApiKey, .apiKeyLocked'

# Test 4: Delete key
echo -e "\nTest 4: Delete key"
curl -X DELETE http://localhost:8080/api/settings/ai/key | jq

# Test 5: Save new key (should work)
echo -e "\nTest 5: Save new key"
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-proj-test_key_3"}' | jq
```

**Expected Output:**
```
Test 1: ✅ {"success": true}
Test 2: ❌ {"success": false, "code": "KEY_ALREADY_EXISTS"}
Test 3: true, true
Test 4: ✅ {"success": true, "hasApiKey": false}
Test 5: ✅ {"success": true}
```

## Console Messages

### When Key is Saved
```
🔐 API key updated for gemini: AIza1234••••••••7890
🔒 API key is now LOCKED (write-once mode)
```

### When Update is Blocked
```
🔒 Blocked attempt to update locked API key
```

### When Key is Deleted
```
🗑️  Deleting API key...
✅ API key deleted and unlocked
```

### When Config File is Loaded
```
✅ Loaded config from: /path/to/config.json
🔐 API key loaded from config: AIza1234••••••••7890
🔒 API key is LOCKED (write-once mode - delete to change)
ℹ️  Using external config file, skipping database load
```

## Troubleshooting

### Issue: "Cannot update API key"
**Solution:** Delete existing key first:
```bash
curl -X DELETE http://localhost:8080/api/settings/ai/key
```

### Issue: "Config file not loading"
**Check:**
1. File exists at path: `ls -la config.json`
2. Valid JSON: `jq . config.json`
3. Correct path: `echo $CONFIG_FILE_PATH`

### Issue: "Key not persisting after restart"
**Check priority order:**
1. Env vars override everything
2. Config file overrides database
3. Check which source is being used in console logs

### Issue: "HTTPS warning in production"
**Solution:** Configure TLS/SSL or use reverse proxy:
```nginx
# nginx.conf
server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/flexgate.crt;
    ssl_certificate_key /etc/ssl/private/flexgate.key;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## Best Practices

1. **Never commit config.json to git**
   ```bash
   echo "config.json" >> .gitignore
   ```

2. **Use environment variables in production**
   - Most secure
   - Integrates with secret managers (AWS Secrets Manager, HashiCorp Vault)

3. **Rotate keys regularly**
   ```bash
   # Delete old key
   curl -X DELETE /api/settings/ai/key
   
   # Add new key
   curl -X POST /api/settings/ai -d '{"apiKey":"new-key"}'
   ```

4. **Use different keys per environment**
   - dev-api-key → Development
   - staging-api-key → Staging
   - prod-api-key → Production

5. **Monitor key usage**
   - Check provider dashboards for usage
   - Set up billing alerts
   - Use free tiers (Gemini: 60 req/min, Groq: 30 req/min)

## Related Documentation

- [API_KEY_SECURITY.md](./API_KEY_SECURITY.md) - Security implementation details
- [SECURE_API_KEY_COMPLETE.md](./SECURE_API_KEY_COMPLETE.md) - Encryption summary
- [FREE_AI_IMPLEMENTATION_COMPLETE.md](./FREE_AI_IMPLEMENTATION_COMPLETE.md) - Multi-provider setup
- [GEMINI_SETUP_GUIDE.md](./GEMINI_SETUP_GUIDE.md) - Get free Gemini API key
- [config.schema.json](./config.schema.json) - JSON schema
- [config.example.json](./config.example.json) - Example configuration

## API Reference

### GET /api/settings/ai
Get current configuration (never returns actual key)

**Response:**
```json
{
  "success": true,
  "provider": "gemini",
  "apiKey": "",
  "hasApiKey": true,
  "apiKeyLocked": true,
  "model": "gemini-1.5-flash",
  "maxTokens": 2000,
  "temperature": 0,
  "demoMode": false
}
```

### POST /api/settings/ai
Save or update configuration (write-once enforced)

**Request:**
```json
{
  "provider": "gemini",
  "apiKey": "AIzaSyDemoKey1234567890",
  "model": "gemini-1.5-flash",
  "maxTokens": 2000,
  "temperature": 0
}
```

**Success Response:**
```json
{
  "success": true,
  "provider": "gemini",
  "hasApiKey": true,
  "model": "gemini-1.5-flash",
  "demoMode": false
}
```

**Error Response (key locked):**
```json
{
  "success": false,
  "error": "API key already set and locked",
  "details": "Use DELETE /api/settings/ai/key to remove existing key before adding new one",
  "code": "KEY_ALREADY_EXISTS"
}
```

### DELETE /api/settings/ai/key
Delete locked API key (allows setting new key)

**Response:**
```json
{
  "success": true,
  "message": "API key deleted successfully",
  "config": {
    "provider": "gemini",
    "hasApiKey": false,
    "demoMode": true
  }
}
```

### POST /api/settings/ai/test
Test API key validity (doesn't affect lock state)

**Request:**
```json
{
  "provider": "gemini",
  "apiKey": "AIzaSyDemoKey1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "message": "API key is valid"
}
```

## Summary

The write-once API key system provides:

- ✅ **Security**: Keys cannot be accidentally overwritten
- ✅ **Flexibility**: Multiple configuration methods (UI, file, env vars)
- ✅ **Audit Trail**: Clear delete → add workflow for key changes
- ✅ **CLI-Friendly**: External config file for automated deployments
- ✅ **Encryption**: AES-256-CBC at rest, never exposed in logs/API
- ✅ **Priority**: Env vars → config.json → database → defaults

**Quick Start:**
```bash
# 1. Create config file
cp config.example.json config.json

# 2. Add your API key
vi config.json

# 3. Start FlexGate
npm start

# 4. Verify
curl http://localhost:8080/api/settings/ai | jq
```

**Need help?** See [GEMINI_SETUP_GUIDE.md](./GEMINI_SETUP_GUIDE.md) for getting a free API key.
