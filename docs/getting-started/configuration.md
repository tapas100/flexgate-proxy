# Configuration

FlexGate is configured via **`config/flexgate.json`** and **environment variables**.  
Run `flexgate init` to generate a starter config file.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API gateway port |
| `ADMIN_UI_PORT` | `3000` | Admin UI port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL (optional) |
| `NATS_URL` | `nats://localhost:4222` | NATS URL (optional) |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS allowlist |
| `NODE_ENV` | `development` | `development` \| `production` |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `ANTHROPIC_API_KEY` | — | Claude API key for AI features |

> **💡 Tip:** Copy `.env.example` to `.env` and fill in your values:
> ```bash
> cp .env.example .env
> ```

---

## Config File Reference (`config/flexgate.json`)

```json
{
  "proxy": {
    "port": 3001,
    "maxBodySize": "10mb",
    "trustProxy": true
  },
  "upstreams": [
    {
      "name": "my-api",
      "url": "http://localhost:8080",
      "timeout": 30000,
      "healthCheck": {
        "path": "/health",
        "interval": 30000
      }
    }
  ],
  "routes": [
    {
      "path": "/api/v1/*",
      "upstream": "my-api",
      "methods": ["GET", "POST", "PUT", "DELETE"],
      "rateLimit": {
        "windowMs": 60000,
        "max": 100
      }
    }
  ],
  "database": {
    "url": "${DATABASE_URL}",
    "pool": { "min": 2, "max": 10 }
  },
  "redis": {
    "url": "${REDIS_URL}"
  },
  "timeouts": {
    "request": 30000,
    "upstream": 25000
  }
}
```

---

## CORS Configuration

Set allowed origins via the `ALLOWED_ORIGINS` environment variable:

**Development:**
```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

**Production:**
```bash
ALLOWED_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
```

> **⚠️ Warning:** Do **not** leave `ALLOWED_ORIGINS` unset in production — it defaults to localhost origins only.

---

## Rate Limiting Tiers

| Tier | Applies to | Limit |
|------|-----------|-------|
| `globalApiRateLimiter` | All `/api/*` | 100 req / min |
| `adminApiRateLimiter` | Routes, settings, webhooks, AI, logs | 60 req / min |
| `authRateLimiter` | `/api/auth` | 5 req / 15 min |
