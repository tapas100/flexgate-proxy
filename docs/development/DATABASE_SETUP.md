# FlexGate Database Setup Guide

## Quick Start (Docker)

### 1. Start PostgreSQL with Docker Compose

```bash
# Start database only
docker-compose -f docker-compose.dev.yml up -d postgres

# Or start all services (Postgres + Redis + pgAdmin)
docker-compose -f docker-compose.dev.yml up -d
```

### 2. Run Migrations

```bash
# Copy .env.example to .env
cp .env.example .env

# Run migrations
npm run db:migrate
```

### 3. Verify Database

```bash
# Connect to database
docker exec -it flexgate-postgres psql -U flexgate -d flexgate

# List tables
\dt

# Check routes table
SELECT * FROM routes;

# Exit
\q
```

---

## Manual Setup (Without Docker)

### 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-16
sudo systemctl start postgresql
```

**Windows:**
Download from: https://www.postgresql.org/download/windows/

### 2. Create Database

```bash
# Login as postgres user
psql -U postgres

# Create database and user
CREATE DATABASE flexgate;
CREATE USER flexgate WITH ENCRYPTED PASSWORD 'flexgate';
GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;
ALTER DATABASE flexgate OWNER TO flexgate;

# Exit
\q
```

### 3. Run Migrations

```bash
# Set environment variables
cp .env.example .env

# Edit .env with your database credentials
# Then run migrations
npm run db:migrate
```

---

## Database Schema

### Tables Created:

1. **routes** - Proxy route configurations
2. **webhooks** - Webhook subscriptions
3. **webhook_deliveries** - Webhook delivery audit log
4. **users** - Application users and SSO integration
5. **audit_logs** - System-wide audit trail
6. **api_keys** - API keys for programmatic access

### Default Admin User:

```
Email: admin@flexgate.dev
Username: admin
Password: admin123
```

**⚠️ Change this in production!**

---

## Database Management

### Backup Database

```bash
# Using Docker
docker exec flexgate-postgres pg_dump -U flexgate flexgate > backup.sql

# Without Docker
pg_dump -U flexgate flexgate > backup.sql
```

### Restore Database

```bash
# Using Docker
docker exec -i flexgate-postgres psql -U flexgate flexgate < backup.sql

# Without Docker
psql -U flexgate flexgate < backup.sql
```

### Reset Database

```bash
# Drop and recreate (⚠️ destroys all data!)
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d postgres
npm run db:migrate
```

---

## pgAdmin Access (Optional)

If you started with `--profile tools`:

```bash
docker-compose -f docker-compose.dev.yml --profile tools up -d
```

Access pgAdmin at: http://localhost:5050

**Credentials:**
- Email: admin@flexgate.dev
- Password: admin

**Connect to Database:**
- Host: postgres (or localhost if connecting from host machine)
- Port: 5432
- Database: flexgate
- Username: flexgate
- Password: flexgate

---

## NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "db:migrate": "node -r ts-node/register migrations/run.ts",
    "db:reset": "docker-compose -f docker-compose.dev.yml down -v && docker-compose -f docker-compose.dev.yml up -d postgres && npm run db:migrate",
    "db:seed": "node -r ts-node/register migrations/seed.ts"
  }
}
```

---

## Environment Variables

Create `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flexgate
DB_USER=flexgate
DB_PASSWORD=flexgate
DB_POOL_SIZE=20
```

For Docker: Use `DB_HOST=postgres` instead of `localhost`

---

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
docker ps | grep flexgate-postgres

# View logs
docker logs flexgate-postgres

# Restart
docker-compose -f docker-compose.dev.yml restart postgres
```

### Permission Denied

```bash
# Grant privileges
docker exec -it flexgate-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;"
```

### Migration Failed

```bash
# Check migration status
docker exec -it flexgate-postgres psql -U flexgate -d flexgate -c "\dt"

# Manually run migration
docker exec -i flexgate-postgres psql -U flexgate flexgate < migrations/001_initial_schema.sql
```

---

## Production Considerations

1. **Use strong passwords:**
   ```bash
   openssl rand -base64 32
   ```

2. **Enable SSL/TLS:**
   ```env
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=true
   ```

3. **Configure connection pooling:**
   ```env
   DB_POOL_SIZE=50
   DB_POOL_IDLE_TIMEOUT=30000
   ```

4. **Set up regular backups:**
   - Use `pg_dump` with cron
   - Consider AWS RDS automated backups
   - Test restore procedures

5. **Monitor database:**
   - Use pgBadger for log analysis
   - Monitor slow queries
   - Track connection pool stats

---

## Next Steps

1. ✅ Database running
2. ✅ Migrations applied
3. ⏭️  Start FlexGate: `npm start`
4. ⏭️  Test API: `curl http://localhost:3000/api/routes`
5. ⏭️  Access Admin UI: `http://localhost:3001`
