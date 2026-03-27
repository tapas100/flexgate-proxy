# FlexGate Security Fixes - Quick Start Guide

## ⚠️ CRITICAL: Required Before Starting

The application will **NOT start** without these environment variables:

### 1. Generate Encryption Key (Required)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Create .env File

```bash
cp .env.example .env
```

### 3. Set Environment Variables in .env

```bash
# REQUIRED - App won't start without this
ENCRYPTION_KEY=d3dd979a0a16ee18e965cacbb625dd179e4e2615e98d8b8ce2d8790f6f3447a6

# Demo mode for testing (disabled by default)
DEMO_MODE=true
DEMO_PASSWORD=TestPassword123!

# CORS - Allow admin UI
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000

# AI Provider (optional)
AI_PROVIDER=gemini
AI_API_KEY=
```

### 4. Start the Application

```bash
npm start
```

---

## 🧪 Testing the Security Fixes

### Test 1: Encryption Key Required

```bash
# Remove encryption key
unset ENCRYPTION_KEY

# Try to start
npm start

# Expected Output:
# ❌ CRITICAL: ENCRYPTION_KEY environment variable is required!
# Error: ENCRYPTION_KEY is required
```

### Test 2: Demo Mode Disabled by Default

```bash
# Set encryption key but no demo mode
export ENCRYPTION_KEY=d3dd979a0a16ee18e965cacbb625dd179e4e2615e98d8b8ce2d8790f6f3447a6
unset DEMO_MODE

npm start

# Try to login with hardcoded credentials
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flexgate.dev","password":"admin123"}'

# Expected:
# {
#   "error": "Unauthorized",
#   "message": "Please use SSO authentication via /api/auth/saml/initiate"
# }
```

### Test 3: Demo Mode with Custom Password

```bash
export ENCRYPTION_KEY=d3dd979a0a16ee18e965cacbb625dd179e4e2615e98d8b8ce2d8790f6f3447a6
export DEMO_MODE=true
export DEMO_PASSWORD=MyCustomPassword123

npm start

# Try login with custom password
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flexgate.dev","password":"MyCustomPassword123"}'

# Expected:
# {
#   "token": "demo-token-...",
#   "user": {...}
# }
```

### Test 4: CORS Protection

```bash
# Start server with allowed origins
export ALLOWED_ORIGINS=http://localhost:3000

# Try unauthorized origin (in browser console)
fetch('http://localhost:8080/api/webhooks', {
  headers: { 'Origin': 'https://evil.com' }
})

# Expected: CORS error, request blocked
```

### Test 5: Rate Limiting - Auth Endpoint

```bash
# Rapid-fire 10 login attempts
for i in {1..10}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test","password":"test"}'
  echo ""
done

# Expected:
# Attempts 1-5: 401 Unauthorized (normal)
# Attempts 6-10: 429 Too Many Requests
```

### Test 6: Rate Limiting - Webhook Creation

```bash
# Create 25 webhooks rapidly
for i in {1..25}; do
  echo "Creating webhook $i:"
  curl -X POST http://localhost:8080/api/webhooks \
    -H "Content-Type: application/json" \
    -d '{
      "name":"test-webhook-'$i'",
      "url":"http://test.com/webhook",
      "events":["*"]
    }'
  echo ""
done

# Expected:
# First 20: Success
# 21-25: 429 Too Many Requests
```

### Test 7: Rate Limiting - Delete Operations

```bash
# Try 15 delete operations
for i in {1..15}; do
  echo "Delete attempt $i:"
  curl -X DELETE http://localhost:8080/api/settings/ai/key
  echo ""
done

# Expected:
# First 10: Success
# 11-15: 429 Too Many Requests
```

### Test 8: Internal Traffic Exemption

```bash
# Simulate internal traffic (from proxy)
curl -H "X-Internal-Request: true" \
     http://localhost:8080/api/webhooks

# Expected: Rate limit NOT applied, normal response
```

---

## 🚀 Quick Production Setup

### 1. Generate Secure Keys

```bash
# Encryption key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"

# Demo password (if needed)
DEMO_PASSWORD=$(openssl rand -base64 24)
echo "DEMO_PASSWORD=$DEMO_PASSWORD"
```

### 2. Production .env

```bash
# Copy example
cp .env.example .env

# Edit with production values
vi .env
```

```bash
# Required
ENCRYPTION_KEY=<your-generated-key>

# Security
DEMO_MODE=false
ALLOWED_ORIGINS=https://flexgate.prod.com,https://admin.prod.com

# Database
DB_PASSWORD=<strong-password>

# AI
AI_API_KEY=<real-key>

# Environment
NODE_ENV=production
```

### 3. Start Production

```bash
npm run build
NODE_ENV=production node dist/bin/www
```

---

## 📋 Verification Checklist

After starting the server, verify these:

- [ ] Server starts successfully with `ENCRYPTION_KEY` set
- [ ] Server fails to start without `ENCRYPTION_KEY`
- [ ] Demo login works only when `DEMO_MODE=true` and `DEMO_PASSWORD` set
- [ ] CORS blocks unauthorized origins
- [ ] Rate limiting kicks in after threshold
- [ ] Internal traffic bypasses rate limits
- [ ] Logs show CORS configuration: `CORS configured with allowed origins`
- [ ] Logs show rate limiting: `Rate limiting enabled for API endpoints`

---

## 🐛 Troubleshooting

### Error: "ENCRYPTION_KEY is required"

**Solution:**
```bash
# Generate key
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Or set in .env
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
```

### Error: "Demo login will be disabled for security"

**Cause:** `DEMO_MODE=true` but `DEMO_PASSWORD` not set

**Solution:**
```bash
export DEMO_PASSWORD=YourCustomPassword123
```

### CORS errors in browser

**Check:**
```bash
# Verify allowed origins in logs
grep "CORS configured" logs/server.log

# Set your frontend origin
export ALLOWED_ORIGINS=http://localhost:3000
```

### Rate limit triggered too fast

**Cause:** Testing from same IP

**Solutions:**
1. Wait for rate limit window to expire
2. Restart server to reset counters
3. Use `X-Internal-Request: true` header for testing

---

## 📊 Rate Limit Summary

| Endpoint | Window | Max Requests | Applies To |
|----------|--------|--------------|------------|
| `/api/auth/login` | 15 min | 5 | All IPs |
| `/api/*` (admin) | 1 min | 60 | External IPs |
| POST `/api/webhooks` | 1 hour | 20 | External IPs |
| POST `/api/routes` | 1 hour | 30 | External IPs |
| DELETE operations | 5 min | 10 | External IPs |
| `/api/*` (global) | 1 min | 100 | External IPs |

**Internal traffic (proxy):** NOT rate limited

---

## 🔐 Security Status

### Fixed ✅
- ✅ Hardcoded encryption key removed
- ✅ Hardcoded demo credentials removed
- ✅ CORS properly configured
- ✅ Rate limiting on all critical endpoints
- ✅ Environment-based configuration

### Pending ⏳
- ⏳ Authentication middleware (waiting for AI testing)
- ⏳ Demo mode removal (post-testing)
- ⏳ Full production deployment

---

## 📞 Support

**Issues?** Check:
1. `.env` file exists and has `ENCRYPTION_KEY`
2. `ENCRYPTION_KEY` is at least 32 characters
3. `DEMO_MODE` and `DEMO_PASSWORD` match your needs
4. `ALLOWED_ORIGINS` includes your frontend URL
5. Server logs for specific errors

**Logs:**
```bash
# Check startup logs
npm start | grep -E "ENCRYPTION_KEY|CORS|Rate limiting"

# Check rate limit violations
grep "Too Many Requests" logs/server.log

# Check CORS violations
grep "Blocked request" logs/server.log
```
