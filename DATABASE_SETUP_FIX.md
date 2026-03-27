# Database Setup Fix

## 🔍 Issues Identified

### **Issue 1: NATS/JetStream Not Running**
```
❌ Failed to connect to NATS: CONNECTION_REFUSED (port 4222)
❌ Failed to initialize JetStream
```

**Status:** Non-critical - App continues with polling fallback for metrics  
**Solution:** Optional - Install NATS server if you want real-time streaming

### **Issue 2: PostgreSQL User Missing** ⚠️ **CRITICAL**
```
❌ Database connection failed
Error: role "flexgate_user" does not exist
```

**Status:** Critical - No database persistence  
**Impact:**
- ✗ Cannot save settings
- ✗ Cannot save routes to database
- ✗ Webhooks won't work
- ✗ No metrics persistence

**Root Cause:** Your config file (`config/flexgate.json`) is configured for production with user `flexgate_user`, but the database setup script creates user `flexgate` for development.

---

## ✅ Quick Fix (Recommended)

You have **3 options**:

### **Option 1: Use Development Config (Easiest)** ⭐

Run with development configuration that uses the correct database user:

```bash
# Stop current server
./scripts/stop-all.sh

# Copy development config
cp config/flexgate.development.json.example config/flexgate.development.json

# Run database setup
./scripts/setup-database-native.sh

# Start with development config
NODE_ENV=development ./scripts/start-all.sh
```

### **Option 2: Create Missing Production User**

If you want to keep using production config:

```bash
# Create the flexgate_user role
psql -d postgres -c "CREATE USER flexgate_user WITH PASSWORD 'your-secure-password';"

# Create production database
createdb -O flexgate_user flexgate_prod

# Grant privileges
psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE flexgate_prod TO flexgate_user;"

# Update config/flexgate.json with the password
# Then run migrations
npm run db:migrate
```

### **Option 3: Fix Current Config to Use Existing User**

Update `config/flexgate.json` to use the `flexgate` user that already exists:

```bash
# I can update the config file for you (see below)
```

---

## 📝 Config Mismatch Details

**Current Config** (`config/flexgate.json`):
```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "flexgate_prod",
    "user": "flexgate_user",  ← This user doesn't exist!
    "password": "${DB_PASSWORD}",
    "ssl": true
  }
}
```

**Setup Script Creates** (`scripts/setup-database-native.sh`):
```bash
Database: flexgate (not flexgate_prod)
User: flexgate (not flexgate_user)
Password: flexgate
```

---

## 🚀 Recommended Solution

I recommend **Option 1** (use development config) for local development:

1. Development config is already set up correctly
2. Matches what the setup script creates
3. Less strict security (good for local dev)
4. No SSL required

For production deployment, you'd use Option 2 with proper credentials.

---

## 📊 NATS/JetStream (Optional)

If you want real-time streaming instead of polling:

```bash
# Install NATS server via Homebrew
brew install nats-server

# Start NATS server
nats-server &

# OR install as a service
brew services start nats-server
```

**Note:** The app works fine WITHOUT NATS - it just uses polling for metrics instead of real-time streaming.

---

## 🔧 Next Steps

Would you like me to:
1. ✅ Update `config/flexgate.json` to use the `flexgate` user?
2. ✅ Create a development config file for you?
3. ✅ Generate a script to create the `flexgate_user` role?

Let me know which option you prefer!
