# FlexGate Server Management - Quick Start

## 🚀 Starting the Server

**Use the startup script (recommended):**
```bash
./start-server.sh
```

This will:
- Kill any existing process on port 8080
- Start server in background with nohup
- Log output to `server-output.log`
- Confirm server is running

**Manual start:**
```bash
npm run dev
```

## 🛑 Stopping the Server

```bash
lsof -ti:8080 | xargs kill -9
```

## 📋 Viewing Logs

```bash
tail -f server-output.log
```

## 🌐 Local Domain Setup

Added to `/etc/hosts`:
```
127.0.0.1 local.flexgate.io
```

**Access URLs:**
- Admin UI: http://local.flexgate.io:3000
- Backend API: http://local.flexgate.io:8080
- Health Check: http://localhost:8080/health

## 🔐 CORS Configuration

**Whitelisted Origins:**
- `http://localhost:3000`
- `http://localhost:3001`  
- `http://127.0.0.1:3000`
- `http://local.flexgate.io:3000` ⭐ NEW
- `http://local.flexgate.io:8080` ⭐ NEW

## 🤖 Dynamic Gemini Models

**Fetch latest models from Google:**
```bash
curl "http://localhost:8080/api/settings/ai/providers/gemini/models" \
  -H "x-api-key: YOUR_GEMINI_API_KEY"
```

**Features:**
- ✅ 30+ models auto-discovered
- ✅ 24-hour cache
- ✅ Auto-sorts by version (2.0+ first)
- ✅ Falls back to static list on error

## 🔍 Health Check

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "UP",
  "timestamp": "2026-02-16T19:48:09.449Z",
  "version": "1.0.0"
}
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
lsof -ti:8080 | xargs kill -9
./start-server.sh
```

### CORS Errors
Verify CORS headers:
```bash
curl -I -H "Origin: http://local.flexgate.io:3000" http://localhost:8080/health
```

Should return:
```
Access-Control-Allow-Origin: http://local.flexgate.io:3000
Access-Control-Allow-Credentials: true
```

### Server Not Responding
Check if process is running:
```bash
lsof -i:8080
```

Check logs for errors:
```bash
tail -50 server-output.log
```

---

**Created:** February 17, 2026  
**Server:** FlexGate Proxy v0.1.0-beta.1
