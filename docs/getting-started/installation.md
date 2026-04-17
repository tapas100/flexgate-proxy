# Installation

## Requirements

| Dependency | Version | Required |
|------------|---------|----------|
| Node.js | `>=18.0.0` | ✅ Yes |
| npm | `>=9.0.0` | ✅ Yes |
| PostgreSQL | `>=15` | ✅ Yes |
| Redis | `>=7` | ⚠️ Optional (rate limiting) |
| NATS Server | `>=2.9` | ⚠️ Optional (real-time streaming) |

---

## Option 1 — npm (Recommended)

```bash
# Install globally
npm install -g flexgate-proxy

# Verify install
flexgate --help
```

Then initialise a new gateway:

```bash
mkdir my-gateway && cd my-gateway
flexgate init        # generates config/flexgate.json
flexgate migrate     # runs DB migrations
flexgate start       # starts the gateway on :3001
```

---

## Option 2 — From Source

```bash
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run database migrations
npm run db:migrate

# Start
npm start
```

---

## Option 3 — Podman / Docker

```bash
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start everything (PostgreSQL + Redis + FlexGate)
make start
# or
podman-compose up -d
```

---

## Database Setup

### macOS (Homebrew)

```bash
brew install postgresql@15
brew services start postgresql@15

createdb flexgate
psql flexgate -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
psql flexgate -c "GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;"
```

### Ubuntu / Debian

```bash
sudo apt install postgresql-15
sudo -u postgres createdb flexgate
sudo -u postgres psql -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;"
```

Then run migrations:

```bash
npm run db:migrate
```

---

## Verify Installation

```bash
# Health check
curl http://localhost:3001/health

# Expected response
{"status":"healthy","uptime":12.3,"version":"0.1.0-beta.2"}
```

> **💡 Admin UI:** Open **http://localhost:3000** in your browser to access the Admin UI dashboard.
