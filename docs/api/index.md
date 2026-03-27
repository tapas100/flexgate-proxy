# API Reference

Complete REST API reference for FlexGate Proxy.

**Base URL:** `http://localhost:3001`

---

## Authentication

All admin API endpoints require an API key in the `Authorization` header:

```
Authorization: Bearer <your-api-key>
```

---

## Rate Limits

| Endpoint Group | Limit |
|---------------|-------|
| All `/api/*` | 100 req / min |
| Admin APIs | 60 req / min |
| `/api/auth` | 5 req / 15 min |

---

## Endpoints

### Health

<span class="get">GET</span> `/health` — Basic health check  
<span class="get">GET</span> `/health/live` — Kubernetes liveness probe  
<span class="get">GET</span> `/health/ready` — Kubernetes readiness probe  
<span class="get">GET</span> `/health/deep` — Full dependency health (DB, Redis, NATS)

### Routes

<span class="get">GET</span> `/api/routes` — List all routes  
<span class="post">POST</span> `/api/routes` — Create a route  
<span class="put">PUT</span> `/api/routes/:id` — Update a route  
<span class="delete">DELETE</span> `/api/routes/:id` — Delete a route  

### Webhooks

<span class="get">GET</span> `/api/webhooks` — List subscriptions  
<span class="post">POST</span> `/api/webhooks` — Create subscription  
<span class="put">PUT</span> `/api/webhooks/:id` — Update subscription  
<span class="delete">DELETE</span> `/api/webhooks/:id` — Delete subscription  
<span class="post">POST</span> `/api/webhooks/:id/test` — Test delivery  

### Metrics & Logs

<span class="get">GET</span> `/api/metrics` — Current metrics snapshot  
<span class="get">GET</span> `/api/logs` — Audit logs (paginated)  
<span class="get">GET</span> `/api/stream/metrics` — SSE real-time metrics stream  
<span class="get">GET</span> `/api/stream/alerts` — SSE real-time alerts stream  
<span class="get">GET</span> `/prometheus/metrics` — Prometheus scrape endpoint  

### Settings

<span class="get">GET</span> `/api/settings` — Get current settings  
<span class="put">PUT</span> `/api/settings` — Update settings  
<span class="post">POST</span> `/api/settings/backup` — Create settings backup  
<span class="get">GET</span> `/api/settings/ai` — AI provider settings  
<span class="put">PUT</span> `/api/settings/ai` — Update AI provider settings  
<span class="get">GET</span> `/api/settings/claude` — Claude-specific settings  
<span class="put">PUT</span> `/api/settings/claude` — Update Claude settings  

### AI & Incidents

<span class="get">GET</span> `/api/ai/health` — AI service health  
<span class="get">GET</span> `/api/ai-incidents` — List AI incidents  
<span class="post">POST</span> `/api/ai-incidents` — Create incident  
<span class="get">GET</span> `/api/ai-incidents/:id` — Get incident detail  
<span class="put">PUT</span> `/api/ai-incidents/:id` — Update incident  
<span class="delete">DELETE</span> `/api/ai-incidents/:id` — Delete incident  

### Troubleshooting

<span class="get">GET</span> `/api/troubleshooting/health` — Full diagnostic report  
<span class="get">GET</span> `/api/troubleshooting/connections` — Check all service connections  
<span class="post">POST</span> `/api/troubleshooting/test-upstream` — Test upstream reachability  

---

For full request/response schemas see [api.md](../api.md).
