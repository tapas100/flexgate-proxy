# 🔒 API Key Security Implementation

## Overview

FlexGate implements multiple security layers to protect sensitive API keys:

1. ✅ **Encryption at Rest** - Keys encrypted in database using AES-256-CBC
2. ✅ **Never Return Keys** - API responses never include actual keys
3. ✅ **HTTPS Enforcement** - Warnings for HTTP in production
4. ✅ **Masked Display** - Keys shown as `AIza1234••••••••wxyz`
5. ✅ **Environment Variable Fallback** - Keys can be set via secure env vars

---

## 🔐 Encryption Details

### Algorithm
- **Cipher**: AES-256-CBC (Advanced Encryption Standard)
- **Key Derivation**: scrypt with salt
- **IV**: Random 16-byte initialization vector per encryption
- **Format**: `{IV_HEX}:{ENCRYPTED_DATA_HEX}`

### Encryption Key
Set via environment variable (recommended for production):

```bash
# Generate a secure 32-byte key
openssl rand -base64 32

# Set in .env
ENCRYPTION_KEY=your-32-byte-base64-key-here
```

**Default Key**: If not set, uses a default key (CHANGE IN PRODUCTION!)

---

## 🛡️ Security Features

### 1. **API Keys Never Returned**

```typescript
// GET /api/settings/ai response
{
  "apiKey": "",  // Always empty string
  "hasApiKey": true,  // Boolean flag only
  "provider": "gemini"
}
```

### 2. **Database Encryption**

```typescript
// Before saving to database
const encryptedKey = encrypt(apiKey);

// Stored in database
{
  "apiKey": "a3f8d9e1c7b4...:{encrypted_data}",  // Encrypted
  "provider": "gemini"
}

// On load from database
const decryptedKey = decrypt(savedConfig.apiKey);
```

### 3. **HTTPS Validation**

**Backend Warning** (production):
```typescript
if (process.env.NODE_ENV === 'production' && req.protocol !== 'https') {
  console.warn('⚠️  WARNING: API key sent over HTTP! Use HTTPS in production.');
}
```

**Frontend Confirmation** (production):
```typescript
if (window.location.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
  confirm('⚠️ WARNING: You are using HTTP. Continue anyway?');
}
```

### 4. **Masked Logging**

```typescript
// Console logs show masked keys
console.log(`🔐 API key updated: ${maskApiKey(apiKey)}`);
// Output: 🔐 API key updated: AIza1234••••••••wxyz
```

### 5. **Security Notice in UI**

When using HTTP (development), shows warning:
```
🔒 Security Notice
You're using HTTP. In production, use HTTPS to securely 
transmit API keys. Keys are encrypted at rest in the database.
```

---

## 🚀 Production Setup

### 1. **Enable HTTPS**

#### Option A: Nginx Reverse Proxy (Recommended)
```nginx
server {
    listen 443 ssl http2;
    server_name flexgate.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
}
```

#### Option B: Let's Encrypt + Certbot
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d flexgate.example.com

# Auto-renewal
sudo certbot renew --dry-run
```

### 2. **Set Encryption Key**

```bash
# Generate secure key
openssl rand -base64 32 > /etc/flexgate/encryption.key

# Add to environment
export ENCRYPTION_KEY=$(cat /etc/flexgate/encryption.key)

# Or in .env file
echo "ENCRYPTION_KEY=$(cat /etc/flexgate/encryption.key)" >> .env
```

### 3. **Secure Environment Variables**

```bash
# Never commit .env to git
echo ".env" >> .gitignore

# Set restrictive permissions
chmod 600 .env
chmod 600 /etc/flexgate/encryption.key

# Use systemd environment file (recommended)
[Service]
EnvironmentFile=/etc/flexgate/.env
```

### 4. **API Key via Environment** (Most Secure)

Instead of database storage, use environment variables:

```bash
# .env
AI_PROVIDER=gemini
AI_API_KEY=AIzaSyYourKeyHere
AI_MODEL=gemini-1.5-flash
```

**Benefits:**
- ✅ Never transmitted over network
- ✅ Not stored in database
- ✅ Managed by OS/container secrets
- ✅ Easier key rotation

---

## 🔄 Key Rotation

### Manual Rotation
1. Get new API key from provider
2. Update in Settings UI → Save
3. Old key automatically replaced (encrypted)
4. Test with "Test API Key" button

### Environment Variable Rotation
```bash
# 1. Update .env
sed -i 's/AI_API_KEY=.*/AI_API_KEY=NewKeyHere/' .env

# 2. Restart FlexGate
systemctl restart flexgate

# 3. Verify
curl http://localhost:8080/api/settings/ai | jq '.hasApiKey'
# Should return: true
```

---

## 🧪 Security Testing

### 1. **Verify Keys Not Returned**
```bash
curl -s http://localhost:8080/api/settings/ai | jq '.apiKey'
# Should return: ""
```

### 2. **Verify Encryption in Database**
```sql
SELECT value FROM settings WHERE key = 'ai_config';
-- Should show encrypted string like:
-- {"apiKey":"a3f8d9e1:c7b4f2e8...","provider":"gemini"}
```

### 3. **Test HTTPS Warning**
```bash
# In production mode over HTTP
curl -X POST http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","apiKey":"test"}'

# Check logs for:
# ⚠️  WARNING: API key sent over HTTP!
```

### 4. **Verify Decryption**
```bash
# After restart, check logs
grep "Decrypted API key" server.log
# Should show: 🔐 Decrypted API key: AIza1234••••••••wxyz
```

---

## 🐛 Troubleshooting

### Issue: "Decryption failed"
**Cause**: Encryption key changed after keys were encrypted  
**Solution**:
```bash
# Option 1: Clear encrypted keys
psql -d flexgate -c "DELETE FROM settings WHERE key = 'ai_config';"

# Option 2: Use environment variable
export AI_API_KEY=YourKeyHere
```

### Issue: "API key not working after restart"
**Cause**: Encryption key not persisted  
**Solution**:
```bash
# Add to .env
ENCRYPTION_KEY=your-consistent-key-here

# Verify it's loaded
echo $ENCRYPTION_KEY
```

### Issue: "HTTP warning in development"
**Cause**: Normal - HTTP is OK for local development  
**Solution**: Ignore warning or use `https://localhost` with self-signed cert

---

## 📊 Security Checklist

### Development ✅
- [x] API keys encrypted in database
- [x] Keys never returned in API responses
- [x] HTTP warnings shown in UI
- [x] Masked logging

### Production ✅
- [ ] HTTPS enabled (Let's Encrypt/Nginx)
- [ ] Custom ENCRYPTION_KEY set
- [ ] Environment file permissions (600)
- [ ] .env not in git repository
- [ ] API keys via env vars (not UI)
- [ ] Regular key rotation policy
- [ ] Security headers configured
- [ ] Rate limiting enabled

---

## 🔗 Related Documentation

- **Gemini Setup**: [GEMINI_SETUP_GUIDE.md](./GEMINI_SETUP_GUIDE.md)
- **Multi-Provider**: [MULTI_PROVIDER_AI_COMPLETE.md](./MULTI_PROVIDER_AI_COMPLETE.md)
- **HTTPS Setup**: See [nginx-example.conf](./docs/nginx-example.conf)

---

## 💡 Best Practices

1. **Use HTTPS in production** - Always
2. **Environment variables** - For production secrets
3. **Unique encryption key** - Never use default
4. **Rotate keys regularly** - Every 90 days
5. **Least privilege** - Limit API key permissions
6. **Monitor usage** - Check for unauthorized access
7. **Backup encryption key** - Store securely offline
8. **Audit logs** - Review API key access patterns

---

## 📝 Summary

**Development** (HTTP OK):
- ✅ Encrypted storage
- ✅ Warnings shown
- ✅ Easy testing

**Production** (HTTPS Required):
- ✅ Encrypted transmission (HTTPS)
- ✅ Encrypted storage (AES-256)
- ✅ Environment variable secrets
- ✅ No keys in API responses

**Result**: Multi-layered security for AI provider API keys! 🔒
