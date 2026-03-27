# Automatic Dependency Startup

## 🎯 Problem Solved

Previously, **PostgreSQL, Redis, and NATS had to be started manually** before running FlexGate. This caused connection errors:
- ❌ PostgreSQL: `role "flexgate_user" does not exist`
- ❌ NATS: `CONNECTION_REFUSED on port 4222`

Now these dependencies **start automatically** with FlexGate!

---

## ✅ New Startup Scripts

### **`scripts/start-with-deps.sh`** - Complete Startup

Automatically starts ALL required services in the correct order:

**What it does:**

1. **Checks Prerequisites**
   - Verifies Node.js and npm installed
   - Checks for Homebrew (macOS package manager)

2. **Starts PostgreSQL** 
   - Installs if not present (asks permission)
   - Starts PostgreSQL service via Homebrew
   - Creates `flexgate` database and user if missing
   - Grants proper permissions

3. **Starts Redis** (optional)
   - Installs if not present (asks permission)
   - Starts Redis service for caching

4. **Starts NATS Server** (for JetStream)
   - Installs if not present (asks permission)
   - Starts NATS with JetStream enabled
   - Enables real-time SSE streaming

5. **Configures FlexGate**
   - Checks config file for database settings
   - Warns if config needs fixing

6. **Builds Applications**
   - Builds FlexGate API
   - Installs Admin UI dependencies

7. **Starts FlexGate Services**
   - Starts FlexGate API on port 3000
   - Starts Admin UI on port 3001

8. **Verifies Everything**
   - Tests all service connections
   - Displays status report

### **`scripts/stop-with-deps.sh`** - Complete Shutdown

Stops all FlexGate services and optionally stops dependencies:

**What it does:**

1. Stops FlexGate API
2. Stops Admin UI  
3. Stops NATS
4. Optionally stops PostgreSQL and Redis (asks permission)

---

## 🚀 Usage

### Start Everything (Recommended)

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# Start with all dependencies
./scripts/start-with-deps.sh
```

**First Run:**
- Will prompt to install PostgreSQL, Redis, NATS if missing
- Creates database and user automatically
- Takes ~2-3 minutes with installations

**Subsequent Runs:**
- Just starts existing services
- Takes ~10-15 seconds

### Stop Everything

```bash
# Stop FlexGate services (keeps DB running)
./scripts/stop-with-deps.sh
(choose 'n' when asked about stopping PostgreSQL/Redis)

# OR stop everything including database
./scripts/stop-with-deps.sh
(choose 'y' to also stop PostgreSQL/Redis)
```

---

## 📊 Service Architecture

```
┌─────────────────────────────────────────────────┐
│             FlexGate Application Stack          │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐      ┌──────────────┐        │
│  │  Admin UI   │      │ FlexGate API │        │
│  │ Port: 3001  │────▶ │ Port: 3000   │        │
│  └─────────────┘      └──────┬───────┘        │
│                               │                 │
│  ┌─────────────────────────────────────────┐  │
│  │         Infrastructure Layer             │  │
│  │                                          │  │
│  │  PostgreSQL     Redis       NATS        │  │
│  │  Port: 5432     Port: 6379  Port: 4222  │  │
│  │  (Database)     (Cache)     (Streaming) │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🔧 What Gets Installed

### PostgreSQL
- **Purpose**: Database for routes, webhooks, settings, metrics
- **Version**: 15 or 16 (via Homebrew)
- **Database**: `flexgate`
- **User**: `flexgate` / Password: `flexgate`
- **Status**: Required for persistence

### Redis
- **Purpose**: Caching, session storage, rate limiting
- **Version**: 7.x (via Homebrew)
- **Status**: Optional but recommended

### NATS Server
- **Purpose**: Real-time event streaming (JetStream)
- **Version**: Latest (via Homebrew)
- **Status**: Optional - falls back to polling if not available
- **Benefit**: Real-time dashboard updates via SSE

---

## 📝 Configuration Auto-Detection

The script automatically:

1. **Checks if database exists**
   - Creates `flexgate` database if missing
   - Creates `flexgate` user if missing
   - Grants all necessary permissions

2. **Validates config file**
   - Warns if `flexgate_user` is configured (should be `flexgate`)
   - Suggests running `./scripts/quick-fix-database.sh`

3. **Tests connectivity**
   - PostgreSQL: `pg_isready`
   - Redis: `redis-cli ping`
   - NATS: Port 4222 check
   - FlexGate: HTTP health check

---

## 🎯 Before vs After

### **Before (Old `start-all.sh`):**

```
❌ Manual steps required:
1. brew services start postgresql
2. brew services start redis  
3. nats-server &
4. ./scripts/setup-database-native.sh
5. ./scripts/start-all.sh

Result: 5 manual commands, 5+ minutes
```

### **After (New `start-with-deps.sh`):**

```
✅ Single command:
./scripts/start-with-deps.sh

Result: 1 command, fully automated, 10-15 seconds
```

---

## 🔍 Verification

After running `./scripts/start-with-deps.sh`, you should see:

```
╔══════════════════════════════════════════════════════════════════════╗
║                    ✅ All Services Started! ✅                       ║
╚══════════════════════════════════════════════════════════════════════╝

🗄️  Infrastructure:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ PostgreSQL:         Running (database: flexgate)
  ✓ Redis:              Running (localhost:6379)
  ✓ NATS/JetStream:     Running (localhost:4222)

🌐 Applications:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ FlexGate API:       http://localhost:3000
  ✓ Admin UI:           http://localhost:3001
  ✓ Health Check:       http://localhost:3000/health
```

---

## 🐛 Troubleshooting

### PostgreSQL Won't Start

```bash
# Check if already running on different port
lsof -i :5432

# Check Homebrew services
brew services list

# Manually start
brew services start postgresql@16

# Check logs
tail -f /opt/homebrew/var/log/postgresql@16.log
```

### NATS Won't Start

```bash
# Check if port 4222 is in use
lsof -i :4222

# Check NATS logs
tail -f logs/nats.log

# Manually start
nats-server -js
```

### Database User Still Wrong

If you see "role 'flexgate_user' does not exist":

```bash
# Run the database fix script first
./scripts/quick-fix-database.sh

# Then start services
./scripts/start-with-deps.sh
```

---

## 🎓 For Development

### Keep Services Running Between Restarts

```bash
# First time setup
./scripts/start-with-deps.sh

# Stop just FlexGate (keep DB/Redis/NATS running)
kill $(cat .flexgate.pid)
kill $(cat .admin-ui.pid)

# Restart just FlexGate quickly
npm start &
cd admin-ui && npm start &
```

### Manual Service Control

```bash
# Start PostgreSQL permanently
brew services start postgresql@16

# Start Redis permanently  
brew services start redis

# NATS needs manual start each time (or use script)
nats-server -js &

# Then just run FlexGate
npm start
```

---

## 📂 Files Created

- **`scripts/start-with-deps.sh`** - Complete automated startup
- **`scripts/stop-with-deps.sh`** - Complete shutdown
- **`logs/nats.log`** - NATS server logs
- **`.nats.pid`** - NATS process ID

---

## ✅ Checklist - What You Get

After running `start-with-deps.sh`:

- [x] PostgreSQL running with `flexgate` database
- [x] Redis running for caching
- [x] NATS running for real-time streaming
- [x] FlexGate API running on port 3000
- [x] Admin UI running on port 3001
- [x] All connections working
- [x] No more "CONNECTION_REFUSED" errors
- [x] Settings can be saved to database
- [x] Webhooks work properly
- [x] Real-time dashboard metrics (via JetStream)

---

## 🚀 Quick Start

**Never used FlexGate before?**

```bash
# 1. Clone repository (if you haven't)
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# 2. Install dependencies
npm install
cd admin-ui && npm install && cd ..

# 3. Start everything (installs services if needed)
./scripts/start-with-deps.sh

# 4. Open Admin UI
open http://localhost:3001

# 5. That's it! Everything is running.
```

---

## 💡 Pro Tips

1. **Keep database running** - Don't stop PostgreSQL between sessions, it's fast to keep it running
2. **Redis is optional** - FlexGate works without Redis, but it's faster with it
3. **NATS is optional** - Without NATS, metrics use polling (still works fine)
4. **First startup is slow** - Takes 2-3 minutes if installing services
5. **Subsequent startups are fast** - Only 10-15 seconds

---

**Status:** Ready to use! Run `./scripts/start-with-deps.sh` to start everything automatically! 🎉
