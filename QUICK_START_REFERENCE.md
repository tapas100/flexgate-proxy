# FlexGate Quick Reference - Complete Startup Guide

## 🚀 Quick Start (First Time)

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# Step 1: Fix database configuration (one-time)
./scripts/quick-fix-database.sh
# Choose option 1 when prompted

# Step 2: Start everything with dependencies
./scripts/start-with-deps.sh
# Say 'y' to install PostgreSQL, Redis, NATS

# Step 3: Open Admin UI
open http://localhost:3001
```

**Time:** ~3 minutes first time (includes installations)

---

## ⚡ Quick Start (Subsequent Times)

```bash
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# Start everything
./scripts/start-with-deps.sh
```

**Time:** ~15 seconds

---

## 🛑 Stop Services

```bash
# Stop FlexGate and Admin UI (keep database running)
./scripts/stop-with-deps.sh
# Choose 'n' when asked about PostgreSQL/Redis

# OR stop everything including database
./scripts/stop-with-deps.sh  
# Choose 'y' to stop all services
```

---

## 📊 Check Status

```bash
# Check what's running
lsof -i :3000  # FlexGate API
lsof -i :3001  # Admin UI
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :4222  # NATS

# Check Homebrew services
brew services list

# Check PostgreSQL
pg_isready

# Check Redis
redis-cli ping

# View logs
tail -f logs/flexgate.log
tail -f logs/admin-ui.log
tail -f logs/nats.log
```

---

## 🔧 Troubleshooting

### Database Connection Errors

```bash
# Fix database user mismatch
./scripts/quick-fix-database.sh

# Manually check database
psql -U flexgate -d flexgate -c "SELECT version();"
```

### Port Already in Use

```bash
# Find what's using the port
lsof -ti :3000

# Kill the process
kill $(lsof -ti :3000)
```

### Reset Everything

```bash
# Stop all services
./scripts/stop-with-deps.sh
# Choose 'y' to stop database

# Clean up
rm -f .flexgate.pid .admin-ui.pid .nats.pid

# Restart
./scripts/start-with-deps.sh
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `scripts/start-with-deps.sh` | Start all services + dependencies |
| `scripts/stop-with-deps.sh` | Stop all services |
| `scripts/quick-fix-database.sh` | Fix database configuration |
| `config/flexgate.json` | Main configuration file |
| `logs/flexgate.log` | FlexGate API logs |
| `logs/admin-ui.log` | Admin UI logs |
| `logs/nats.log` | NATS server logs |

---

## 🌐 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| FlexGate API | http://localhost:3000 | Main proxy API |
| Admin UI | http://localhost:3001 | Web dashboard |
| Health Check | http://localhost:3000/health | API health |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |
| NATS | localhost:4222 | Streaming |

---

## 🔑 Default Credentials

| Service | Username | Password | Database |
|---------|----------|----------|----------|
| PostgreSQL | flexgate | flexgate | flexgate |
| Admin UI | (OAuth) | (OAuth) | - |

---

## 📖 Documentation Files

1. **AUTOMATIC_DEPENDENCY_STARTUP.md** - Complete startup guide
2. **DATABASE_SETUP_FIX.md** - Database configuration fixes
3. **FAILED_TASKS_ANALYSIS.md** - Analysis of connection errors
4. **DASHBOARD_RENDER_FIX.md** - Dashboard performance fixes

---

## ✅ Checklist - First Time Setup

- [ ] Run `./scripts/quick-fix-database.sh` (option 1)
- [ ] Run `./scripts/start-with-deps.sh`
- [ ] Install PostgreSQL when prompted (say 'y')
- [ ] Install Redis when prompted (say 'y')
- [ ] Install NATS when prompted (say 'y')
- [ ] Wait for all services to start (~2-3 min)
- [ ] Open http://localhost:3001
- [ ] Verify dashboard loads
- [ ] Test saving settings
- [ ] Check logs if any errors

---

## ✅ Checklist - Daily Use

- [ ] Run `./scripts/start-with-deps.sh`
- [ ] Wait 15 seconds for startup
- [ ] Open http://localhost:3001
- [ ] Verify "Live" indicator in dashboard
- [ ] Start working!

---

## 🆘 Common Issues & Fixes

### "role 'flexgate_user' does not exist"
```bash
./scripts/quick-fix-database.sh  # Choose option 1
```

### "CONNECTION_REFUSED: NATS"
```bash
# NATS not critical - app works with polling
# To fix: Install NATS
brew install nats-server
nats-server -js &
```

### "Admin UI won't start"
```bash
cd admin-ui
npm install
cd ..
./scripts/start-with-deps.sh
```

### "Dashboard shows 'Disconnected'"
```bash
# Check if NATS is running
lsof -i :4222

# If not, start it
nats-server -js &

# Or just use polling (works fine)
```

---

## 💡 Pro Tips

1. **Keep PostgreSQL running** - Faster startup between sessions
2. **Use `brew services start postgresql@16`** - Auto-start on boot
3. **Check logs first** - Most issues visible in `logs/*.log`
4. **NATS is optional** - App works fine with polling
5. **Redis is optional** - Not critical for basic operation

---

## 🎯 What's Running?

After successful startup, you should see:

```
✓ PostgreSQL:         Running (database: flexgate)
✓ Redis:              Running (localhost:6379)
✓ NATS/JetStream:     Running (localhost:4222)
✓ FlexGate API:       http://localhost:3000
✓ Admin UI:           http://localhost:3001
```

---

**Need help?** Check the full documentation in:
- `AUTOMATIC_DEPENDENCY_STARTUP.md`
- `DATABASE_SETUP_FIX.md`

**Ready to start?** Run: `./scripts/start-with-deps.sh` 🚀
