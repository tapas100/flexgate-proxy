# FlexGate CLI - Complete Documentation

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Configuration Guide](#configuration-guide)
- [Use Cases](#use-cases)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Overview

FlexGate CLI is a command-line tool for managing FlexGate configuration **without Admin UI**. Perfect for:

- 🖥️ **EC2/Cloud Instances** - Configure via SSH
- 🐳 **Docker/Containers** - Automated setup
- 🚀 **CI/CD Pipelines** - Scripted deployment
- 📝 **Infrastructure as Code** - JSON configuration files
- 🔧 **Headless Servers** - No browser needed

---

## Installation

### Global (Recommended)

```bash
npm install -g flexgate-proxy
```

**Verify:**
```bash
flexgate --version
# Output: 0.1.0-beta.1
```

### Local Project

```bash
npm install flexgate-proxy
npx flexgate --help
```

---

## Quick Start

### 1. Initialize Configuration

```bash
flexgate init --interactive
```

**Interactive Wizard:**
```
🚀 FlexGate Configuration Wizard

? Server port: 3000
? Environment: production
? Database host: localhost
? Database port: 5432
? Database name: flexgate
? Database user: flexgate
? Database password: ********
? Redis host: localhost
? Redis port: 6379
? Enable Prometheus metrics? Yes

✅ Configuration saved to: config/flexgate.json
✅ Environment file generated: .env
```

### 2. Verify Configuration

```bash
flexgate config show
```

### 3. Test Connections

```bash
flexgate db test
flexgate redis test
```

### 4. Start FlexGate

```bash
npm start
```

**Done! 🎉**

---

## Commands Reference

### `flexgate init`

Initialize FlexGate configuration.

**Syntax:**
```bash
flexgate init [options]
```

**Options:**
- `-i, --interactive` - Interactive configuration wizard
- `-f, --force` - Overwrite existing configuration

**Examples:**
```bash
# Interactive setup (recommended)
flexgate init --interactive

# Use defaults
flexgate init

# Force overwrite
flexgate init --force
```

---

### `flexgate config show`

Display current configuration.

**Syntax:**
```bash
flexgate config show [options]
```

**Options:**
- `--json` - Output as JSON

**Examples:**
```bash
# Human-readable format
flexgate config show

# JSON format
flexgate config show --json
```

**Output:**
```
📋 Current Configuration:

Server:
  Port: 3000
  Host: 0.0.0.0
  Environment: production

Database:
  Host: localhost:5432
  Name: flexgate
  User: flexgate
  SSL: false

Redis:
  Host: localhost:6379
  Database: 0

Security:
  CORS Enabled: true
  Rate Limiting: true

Logging:
  Level: info
  Format: json

Monitoring:
  Metrics: true
  Prometheus Port: 9090
```

---

### `flexgate config set`

Set a configuration value.

**Syntax:**
```bash
flexgate config set <key> <value>
```

**Examples:**
```bash
# Server
flexgate config set server.port 8080
flexgate config set server.host "0.0.0.0"
flexgate config set server.environment production

# Database
flexgate config set database.host db.example.com
flexgate config set database.port 5432
flexgate config set database.name flexgate_prod
flexgate config set database.user flexgate_user
flexgate config set database.password secret123
flexgate config set database.ssl true
flexgate config set database.poolMax 20

# Redis
flexgate config set redis.host redis.example.com
flexgate config set redis.port 6379
flexgate config set redis.password redissecret
flexgate config set redis.db 1

# Security
flexgate config set security.corsEnabled true
flexgate config set security.rateLimitEnabled true
flexgate config set security.rateLimitMaxRequests 1000

# Logging
flexgate config set logging.level debug
flexgate config set logging.format json
flexgate config set logging.destination both

# Monitoring
flexgate config set monitoring.metricsEnabled true
flexgate config set monitoring.prometheusPort 9090
```

**What It Does:**
1. Updates `config/flexgate.json`
2. Regenerates `.env` file
3. Validates the value
4. Confirms the change

---

### `flexgate config get`

Get a configuration value.

**Syntax:**
```bash
flexgate config get <key>
```

**Examples:**
```bash
flexgate config get server.port
# Output: 3000

flexgate config get database.host
# Output: localhost

flexgate config get logging.level
# Output: info
```

---

### `flexgate config import`

Import configuration from JSON file.

**Syntax:**
```bash
flexgate config import <file>
```

**Examples:**
```bash
# Import production config
flexgate config import config/flexgate.production.json.example

# Import from custom path
flexgate config import /opt/flexgate-config.json

# Import backup
flexgate config import /tmp/flexgate-backup.json
```

**What It Does:**
1. Reads JSON file
2. Validates against schema
3. Saves to `config/flexgate.json`
4. Regenerates `.env`
5. Displays imported configuration

---

### `flexgate config export`

Export configuration to JSON file.

**Syntax:**
```bash
flexgate config export <file>
```

**Examples:**
```bash
# Export to file
flexgate config export backup.json

# Export with timestamp
flexgate config export backup-$(date +%Y%m%d).json

# Export to specific path
flexgate config export /tmp/flexgate-backup.json
```

**Use Case:** Backup, share configs, version control

---

### `flexgate config reset`

Reset configuration to defaults.

**Syntax:**
```bash
flexgate config reset [options]
```

**Options:**
- `-f, --force` - Skip confirmation

**Examples:**
```bash
# With confirmation
flexgate config reset

# Skip confirmation
flexgate config reset --force
```

**Warning:** This will erase all custom configuration!

---

### `flexgate db test`

Test PostgreSQL database connection.

**Syntax:**
```bash
flexgate db test
```

**Example:**
```bash
flexgate db test
```

**Output (Success):**
```
Testing database connection...
✅ Database connection successful
   Host: localhost:5432
   Database: flexgate
   User: flexgate
   SSL: false
```

**Output (Failure):**
```
Testing database connection...
❌ Database connection failed
   Error: Connection timeout
   Host: localhost:5432
```

---

### `flexgate redis test`

Test Redis connection.

**Syntax:**
```bash
flexgate redis test
```

**Example:**
```bash
flexgate redis test
```

**Output (Success):**
```
Testing Redis connection...
✅ Redis connection successful
   Host: localhost:6379
   Database: 0
   Ping: PONG
```

**Output (Failure):**
```
Testing Redis connection...
❌ Redis connection failed
   Error: ECONNREFUSED
   Host: localhost:6379
```

---

### `flexgate health`

Check all services health.

**Syntax:**
```bash
flexgate health
```

**Example:**
```bash
flexgate health
```

**Output:**
```
🏥 Running health checks...

✅ FlexGate API: healthy
✅ PostgreSQL: healthy
✅ Redis: healthy
✅ Admin UI: healthy
```

---

## Configuration Guide

### Configuration File

**Location:** `config/flexgate.json`

**Structure:**
```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "environment": "production"
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "flexgate",
    "user": "flexgate",
    "password": "flexgate",
    "ssl": false,
    "poolMin": 2,
    "poolMax": 10
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "",
    "db": 0
  },
  "security": {
    "corsOrigins": ["http://localhost:3001"],
    "corsEnabled": true,
    "rateLimitEnabled": true,
    "rateLimitWindowMs": 60000,
    "rateLimitMaxRequests": 100
  },
  "logging": {
    "level": "info",
    "format": "json",
    "destination": "file",
    "maxFiles": 10,
    "maxSize": "10m"
  },
  "monitoring": {
    "metricsEnabled": true,
    "prometheusPort": 9090,
    "healthCheckInterval": 30000
  }
}
```

### Environment-Specific Configurations

Create separate configs for each environment:

```
config/
  flexgate.development.json
  flexgate.staging.json
  flexgate.production.json
```

**Load:**
```bash
NODE_ENV=production npm start
```

---

## Use Cases

### 1. EC2 Deployment

```bash
# 1. SSH into EC2
ssh -i key.pem ec2-user@ec2-instance

# 2. Install FlexGate
npm install -g flexgate-proxy

# 3. Configure
flexgate init --interactive

# 4. Test
flexgate db test
flexgate redis test

# 5. Start
npm start
```

---

### 2. Docker Container

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install FlexGate
RUN npm install -g flexgate-proxy

# Copy configuration
COPY config/flexgate.json /app/config/flexgate.json

# Generate .env
RUN flexgate config import /app/config/flexgate.json

EXPOSE 8080

CMD ["npm", "start"]
```

---

### 3. CI/CD Pipeline

**GitHub Actions:**
```yaml
- name: Configure FlexGate
  run: |
    npm install -g flexgate-proxy
    flexgate config import config/production.json
    flexgate db test
    flexgate redis test
```

---

### 4. GitOps Workflow

```bash
# 1. Edit configuration
vim config/flexgate.production.json

# 2. Commit to git
git add config/flexgate.production.json
git commit -m "Update production config"
git push

# 3. Deploy
flexgate config import config/flexgate.production.json
npm start
```

---

### 5. Batch Configuration

Configure multiple values at once:

```bash
#!/bin/bash
flexgate config set server.port 8080
flexgate config set database.host db-prod.internal
flexgate config set database.ssl true
flexgate config set redis.host redis-prod.internal
flexgate config set logging.level warn
flexgate config set monitoring.metricsEnabled true
```

---

## Examples

### Complete EC2 Setup Script

```bash
#!/bin/bash
set -e

echo "🚀 FlexGate EC2 Setup"

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install FlexGate
sudo npm install -g flexgate-proxy

# Configure
flexgate init --force <<EOF
8080
production
flexgate-db.xxxx.us-east-1.rds.amazonaws.com
5432
flexgate_prod
flexgate_user
SECURE_PASSWORD
flexgate-redis.xxxxx.cache.amazonaws.com
6379
REDIS_PASSWORD
0
yes
EOF

# Test connections
echo "Testing database..."
flexgate db test || exit 1

echo "Testing Redis..."
flexgate redis test || exit 1

# Health check
flexgate health

echo "✅ FlexGate setup complete!"
echo "Run: npm start"
```

---

### Production Configuration Template

**config/flexgate.production.json:**
```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "production"
  },
  "database": {
    "host": "flexgate-db.internal",
    "port": 5432,
    "name": "flexgate_prod",
    "user": "flexgate_user",
    "password": "${DB_PASSWORD}",
    "ssl": true,
    "poolMin": 5,
    "poolMax": 20
  },
  "redis": {
    "host": "flexgate-redis.internal",
    "port": 6379,
    "password": "${REDIS_PASSWORD}",
    "db": 0
  },
  "security": {
    "corsOrigins": ["https://admin.example.com"],
    "corsEnabled": true,
    "rateLimitEnabled": true,
    "rateLimitMaxRequests": 1000
  },
  "logging": {
    "level": "warn",
    "format": "json",
    "destination": "both",
    "maxFiles": 30,
    "maxSize": "100m"
  },
  "monitoring": {
    "metricsEnabled": true,
    "prometheusPort": 9090,
    "healthCheckInterval": 30000
  }
}
```

**Deploy:**
```bash
export DB_PASSWORD="secure_db_password"
export REDIS_PASSWORD="secure_redis_password"
flexgate config import config/flexgate.production.json
npm start
```

---

## Troubleshooting

### Configuration Not Found

**Error:**
```
Error: Configuration file not found: config/flexgate.json
```

**Solution:**
```bash
flexgate init --interactive
```

---

### Invalid Configuration Value

**Error:**
```
Error: Port must be between 1 and 65535
```

**Solution:**
```bash
# Check valid range
flexgate config set server.port 8080

# View current value
flexgate config get server.port
```

---

### Database Connection Failed

**Error:**
```
❌ Database connection failed
   Error: Connection timeout
```

**Solution:**
```bash
# Verify config
flexgate config get database.host
flexgate config get database.port

# Update if needed
flexgate config set database.host correct-host
flexgate db test
```

---

### Redis Connection Failed

**Error:**
```
❌ Redis connection failed
   Error: ECONNREFUSED
```

**Solution:**
```bash
# Check Redis config
flexgate config show

# Test connection
flexgate redis test

# Update if needed
flexgate config set redis.host correct-host
```

---

### Import Failed

**Error:**
```
Error: Invalid JSON in file
```

**Solution:**
```bash
# Validate JSON syntax
cat config/flexgate.json | jq .

# Or reset and reconfigure
flexgate config reset --force
flexgate init --interactive
```

---

## Configuration Precedence

FlexGate loads configuration in this order (later overrides earlier):

1. **Default values** (in code)
2. **JSON configuration** (`config/flexgate.json`)
3. **Environment variables** (`.env`)
4. **CLI arguments** (if provided)

**Example:**
```bash
# JSON: port = 3000
# ENV:  PORT=8080
# CLI:  --port 9000

# Result: 9000 (CLI wins)
```

---

## Tips & Best Practices

### 1. Always Test Connections

```bash
flexgate db test && flexgate redis test && echo "✅ Ready" || echo "❌ Not ready"
```

### 2. Backup Before Changes

```bash
flexgate config export backup-$(date +%Y%m%d).json
```

### 3. Version Control Configs

```bash
git add config/flexgate.production.json
git commit -m "Update production database host"
```

### 4. Use Environment Variables for Secrets

**Bad:**
```json
{"database": {"password": "plaintext_password"}}
```

**Good:**
```json
{"database": {"password": "${DB_PASSWORD}"}}
```

### 5. Validate After Import

```bash
flexgate config import production.json
flexgate config show
flexgate health
```

---

## Summary

FlexGate CLI provides **three configuration methods**:

1. **Admin UI** - Visual, localhost:3001
2. **CLI** - Terminal, this tool
3. **JSON** - Direct file editing

**Choose CLI for:**
- ✅ EC2/cloud instances
- ✅ Headless servers
- ✅ CI/CD automation
- ✅ Quick configuration changes
- ✅ Connection testing

**No browser needed! 🚀**

---

## Additional Resources

- **Full Guide:** `CLI_JSON_CONFIGURATION_GUIDE.md`
- **Quick Reference:** `CLI_QUICK_REFERENCE.md`
- **Troubleshooting:** `TROUBLESHOOTING_GUIDE.md`
- **API Documentation:** `docs/api.md`
