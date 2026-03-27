# Port Configuration - Single Source of Truth

**Version:** 1.0.0  
**Last Updated:** February 15, 2026  
**Purpose:** Prevent port misalignment across the application

---

## 🎯 Production Port Assignments

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| **FlexGate API Gateway** | `8080` | HTTP | Main API Gateway (proxy + admin API) |
| **Admin UI (Production)** | `3000` | HTTP | React Admin Dashboard |
| **Prometheus** | `9090` | HTTP | Metrics collection |
| **PostgreSQL** | `5432` | TCP | Database |
| **Redis** | `6379` | TCP | Cache & Rate Limiting |

---

## 🔧 Development Port Assignments

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| **FlexGate API Gateway** | `8080` | HTTP | Backend API (same as prod) |
| **Admin UI (Dev Server)** | `3000` | HTTP | React Dev Server (hot reload) |
| **PostgreSQL** | `5432` | TCP | Local database |
| **Redis** | `6379` | TCP | Local cache |

---

## 📁 Configuration Files - Mapping

### Backend API (FlexGate Gateway)

**File:** `/Users/tamahant/Documents/GitHub/flexgate-proxy/.env`
```bash
PORT=8080
HOST=0.0.0.0
```

**File:** `/Users/tamahant/Documents/GitHub/flexgate-proxy/bin/www`
```javascript
const port = normalizePort(process.env.PORT || '8080');
```

### Admin UI

**File:** `/Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui/.env`
```bash
# Admin UI runs on port 3000 (React dev server default)
PORT=3000

# Backend API URL (FlexGate Gateway)
REACT_APP_API_URL=http://localhost:8080
```

**File:** `/Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui/.env.development.local`
```bash
# Development override - points to backend on 8080
REACT_APP_API_URL=http://localhost:8080
```

**File:** `/Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui/src/services/api.ts`
```typescript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
```

**File:** `/Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui/package.json`
```json
{
  "proxy": "http://localhost:8080"
}
```
*Note: The proxy setting allows the React dev server to proxy API requests to the backend.*

---

## 🐛 Common Misalignment Issues

### ❌ Issue 1: Admin UI API calls fail with 404
**Symptom:** `http://localhost:3001/api/routes` returns 404  
**Root Cause:** Admin UI trying to call itself (port 3001) instead of backend (port 8080)  
**Fix:** Update `REACT_APP_API_URL=http://localhost:8080` in `.env.development.local`

### ❌ Issue 2: SSE stream not connecting
**Symptom:** `http://localhost:3001/api/stream/metrics` fails to connect  
**Root Cause:** Same as above - wrong port in env variable  
**Fix:** Ensure `REACT_APP_API_URL` points to backend port `8080`

### ❌ Issue 3: CORS errors in development
**Symptom:** Browser blocks API calls due to CORS  
**Root Cause:** Backend not allowing `http://localhost:3000` origin  
**Fix:** Update backend CORS config to allow dev server port

---

## ✅ Validation Checklist

Run these checks to verify correct port configuration:

### 1. Check Backend API Port
```bash
# Check .env file
grep "^PORT=" .env
# Expected: PORT=8080

# Verify server is running
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# Check API routes endpoint
curl http://localhost:8080/api/routes
# Expected: JSON array of routes
```

### 2. Check Admin UI Configuration
```bash
# Check .env file
grep "REACT_APP_API_URL" admin-ui/.env
# Expected: REACT_APP_API_URL=http://localhost:8080

# Check .env.development.local (overrides .env)
grep "REACT_APP_API_URL" admin-ui/.env.development.local
# Expected: REACT_APP_API_URL=http://localhost:8080

# Verify at runtime (in browser console)
console.log(process.env.REACT_APP_API_URL);
// Expected: "http://localhost:8080"
```

### 3. Test API Endpoints from Admin UI
```bash
# In browser console (while Admin UI is running)
fetch('http://localhost:8080/api/routes')
  .then(r => r.json())
  .then(console.log);
// Expected: Array of route objects

fetch('http://localhost:8080/api/stream/metrics')
  .then(r => console.log('SSE connected'));
// Expected: SSE connection established
```

---

## 🔒 Port Configuration Rules

### Rule 1: Single Source of Truth
**Backend Port:** Always defined in `/.env` (root)  
**Admin UI Backend URL:** Always references backend port via `REACT_APP_API_URL`

### Rule 2: Environment-Specific Overrides
- **Production:** Use `.env` defaults
- **Development:** Use `.env.development.local` overrides
- **Testing:** Use `.env.test` with test ports

### Rule 3: No Hardcoded Ports
❌ **BAD:**
```typescript
const apiUrl = 'http://localhost:8080'; // Hardcoded!
```

✅ **GOOD:**
```typescript
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080';
```

### Rule 4: Port Validation on Startup
Add startup validation to catch misconfigurations early:

```typescript
// In admin-ui/src/index.tsx
if (!process.env.REACT_APP_API_URL) {
  console.error('REACT_APP_API_URL not configured!');
}

// In bin/www
if (!process.env.PORT) {
  console.warn('PORT not set, using default 8080');
}
```

---

## 🛠️ Fixing Port Misalignment

### Automated Fix Script

**File:** `/scripts/fix-ports.sh`
```bash
#!/bin/bash
set -e

echo "🔧 Fixing port configuration..."

# 1. Verify backend port
BACKEND_PORT=$(grep "^PORT=" .env | cut -d'=' -f2)
if [ "$BACKEND_PORT" != "8080" ]; then
  echo "⚠️  WARNING: Backend port is $BACKEND_PORT (expected 8080)"
fi

# 2. Fix Admin UI .env.development.local
echo "Updating admin-ui/.env.development.local..."
cat > admin-ui/.env.development.local <<EOF
# Admin UI dev setup
# Backend API base URL (used for axios + SSE hooks)
REACT_APP_API_URL=http://localhost:${BACKEND_PORT:-8080}
EOF

# 3. Verify Admin UI .env
if grep -q "REACT_APP_API_URL=http://localhost:$BACKEND_PORT" admin-ui/.env; then
  echo "✅ Admin UI .env is correct"
else
  echo "⚠️  Updating admin-ui/.env..."
  sed -i.bak "s|REACT_APP_API_URL=.*|REACT_APP_API_URL=http://localhost:${BACKEND_PORT:-8080}|" admin-ui/.env
fi

# 4. Test connectivity
echo "Testing backend API..."
if curl -sf http://localhost:${BACKEND_PORT:-8080}/health > /dev/null; then
  echo "✅ Backend API is reachable on port ${BACKEND_PORT:-8080}"
else
  echo "❌ Backend API is NOT reachable on port ${BACKEND_PORT:-8080}"
  echo "   Run: npm start (in root directory)"
fi

echo "✅ Port configuration fixed!"
echo ""
echo "Next steps:"
echo "1. Restart Admin UI: cd admin-ui && npm start"
echo "2. Verify in browser: http://localhost:3000"
echo "3. Check browser console for REACT_APP_API_URL value"
```

**Make executable:**
```bash
chmod +x scripts/fix-ports.sh
```

**Run:**
```bash
./scripts/fix-ports.sh
```

---

## 📊 Port Validation Test Suite

**File:** `__tests__/config/port-validation.test.ts`
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Port Configuration Validation', () => {
  const rootDir = path.join(__dirname, '../..');
  
  it('should have consistent backend port in root .env', () => {
    const envPath = path.join(rootDir, '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    const portMatch = envContent.match(/^PORT=(\d+)/m);
    expect(portMatch).toBeTruthy();
    expect(portMatch![1]).toBe('8080');
  });
  
  it('should have admin UI pointing to backend port', () => {
    const adminEnvPath = path.join(rootDir, 'admin-ui/.env');
    const envContent = fs.readFileSync(adminEnvPath, 'utf-8');
    
    expect(envContent).toContain('REACT_APP_API_URL=http://localhost:8080');
  });
  
  it('should have development local config pointing to backend', () => {
    const devEnvPath = path.join(rootDir, 'admin-ui/.env.development.local');
    
    if (fs.existsSync(devEnvPath)) {
      const envContent = fs.readFileSync(devEnvPath, 'utf-8');
      expect(envContent).toContain('REACT_APP_API_URL=http://localhost:8080');
    }
  });
  
  it('should have api.ts using env variable with correct fallback', () => {
    const apiPath = path.join(rootDir, 'admin-ui/src/services/api.ts');
    const apiContent = fs.readFileSync(apiPath, 'utf-8');
    
    expect(apiContent).toContain("process.env.REACT_APP_API_URL || 'http://localhost:8080'");
  });
  
  it('should not have hardcoded port 3001 in admin UI source', () => {
    const srcDir = path.join(rootDir, 'admin-ui/src');
    const files = getAllTsFiles(srcDir);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Check for hardcoded localhost:3001 (admin UI should not call itself)
      if (content.includes('localhost:3001') && !file.includes('.test.')) {
        fail(`Found hardcoded localhost:3001 in ${file}`);
      }
    });
  });
});

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  });
  
  return files;
}
```

**Run validation:**
```bash
npm test -- __tests__/config/port-validation.test.ts
```

---

## 🚀 Quick Fix Commands

### Reset to Correct Configuration
```bash
# 1. Fix backend .env
echo "PORT=8080" > .env.tmp
grep -v "^PORT=" .env >> .env.tmp
mv .env.tmp .env

# 2. Fix admin UI .env
cat > admin-ui/.env.development.local <<EOF
# Admin UI dev setup
REACT_APP_API_URL=http://localhost:8080
EOF

# 3. Restart services
pkill -f "node.*dist/bin/www"  # Stop backend
npm start &                     # Start backend

cd admin-ui
npm start                       # Start admin UI
```

### Verify Configuration
```bash
# Check all port configurations
echo "=== Backend Port ==="
grep "^PORT=" .env

echo ""
echo "=== Admin UI Backend URL ==="
grep "REACT_APP_API_URL" admin-ui/.env
grep "REACT_APP_API_URL" admin-ui/.env.development.local

echo ""
echo "=== Test Connectivity ==="
curl -I http://localhost:8080/health
```

---

## 📝 Environment File Templates

### `/Users/tamahant/Documents/GitHub/flexgate-proxy/.env`
```bash
# FlexGate Backend API
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://flexgate_user:password@localhost:5432/flexgate_prod

# Redis
REDIS_URL=redis://localhost:6379/0

# CORS (allow Admin UI)
CORS_ORIGIN=http://localhost:3000,https://admin.example.com
CORS_ENABLED=true
```

### `/Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui/.env`
```bash
# FlexGate Admin UI Environment Configuration

# Port Configuration
PORT=3000

# API Base URL (FlexGate Backend)
REACT_APP_API_URL=http://localhost:8080

# App Configuration
REACT_APP_NAME=FlexGate Admin
REACT_APP_VERSION=1.0.0
```

### `/Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui/.env.development.local`
```bash
# Admin UI dev setup
# Backend API base URL (used for axios + SSE hooks)
REACT_APP_API_URL=http://localhost:8080
```

---

## 🔍 Troubleshooting

### Problem: API calls return 404
**Check:**
```bash
echo $REACT_APP_API_URL  # Should be http://localhost:8080
```

**Fix:**
```bash
export REACT_APP_API_URL=http://localhost:8080
cd admin-ui && npm start
```

### Problem: SSE streams not connecting
**Check backend logs:**
```bash
tail -f server.log | grep "stream/metrics"
```

**Verify route exists:**
```bash
curl http://localhost:8080/api/stream/metrics
```

### Problem: SSE streams not connecting
**Check backend logs:**
```bash
tail -f server.log | grep "stream/metrics"
```

**Verify route exists:**
```bash
curl http://localhost:8080/api/stream/metrics
```

**Restart Admin UI** (proxy config only loads on startup):
```bash
cd admin-ui && npm start
```

---

## ✅ Future-Proofing

### 1. Use Environment Variables Everywhere
- Never hardcode ports
- Always use `process.env.PORT` and `process.env.REACT_APP_API_URL`

### 2. Add Startup Validation
- Check port availability before starting
- Validate env vars on startup
- Log actual ports in use

### 3. Document Port Changes
- Update this file when ports change
- Run validation tests before committing
- Add port info to README.md

### 4. Automated Testing
- Add port validation to CI/CD
- Test API connectivity in integration tests
- Verify SSE streams work in E2E tests

---

**Single Source of Truth:** This document  
**Backup Source:** Environment files (`.env`, `admin-ui/.env`)  
**Validation:** Run `./scripts/fix-ports.sh` and `npm test -- port-validation`
