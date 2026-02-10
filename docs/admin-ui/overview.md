# Admin UI Overview

The FlexGate Admin UI provides a powerful web-based interface to configure and monitor your API gateway without writing code.

## Accessing the Admin UI

### Local Development

After starting FlexGate, navigate to:

```
http://localhost:3000/admin
```

**Default Login:**
- Username: `admin`
- Password: `admin`

⚠️ **Security:** Change the default password immediately in production!

### Production

For production deployments, access via your domain:

```
https://gateway.yourdomain.com/admin
```

Enable HTTPS in production (see [SSL/TLS Configuration](../security/ssl.md))

## Dashboard Overview

![Admin UI Dashboard](../images/admin-dashboard.png)

The dashboard provides at-a-glance insights:

### Key Metrics

- **Requests/sec** - Real-time request rate
- **Success Rate** - Percentage of successful requests (2xx, 3xx)
- **Avg Response Time** - Average latency across all routes
- **Active Routes** - Number of enabled routes
- **Error Rate** - Failed requests (4xx, 5xx)
- **Uptime** - Gateway uptime since last restart

### Live Activity

- Real-time request log (last 100 requests)
- Route-level traffic breakdown
- Error alerts and warnings
- Health check status for backends

## Main Sections

### 1. Routes Management

Create, edit, and manage API routes.

**Features:**
- Visual route editor
- Path pattern matching
- HTTP method selection
- Rate limiting configuration
- Circuit breaker settings
- Health check configuration

[→ Routes Guide](./routes.md)

### 2. Monitoring & Metrics

Visualize gateway performance.

**Features:**
- Request rate charts
- Latency histograms
- Error rate tracking
- Route-specific metrics
- Export metrics to Prometheus

[→ Monitoring Guide](./monitoring.md)

### 3. Settings

Configure global gateway settings.

**Features:**
- CORS configuration
- Authentication settings
- Logging levels
- Rate limit defaults
- Circuit breaker defaults
- Webhook configurations

[→ Settings Guide](./settings.md)

### 4. Users & Security

Manage admin users and access control.

**Features:**
- User management
- Role-based access control (RBAC)
- API key management
- Audit logs
- Session management

[→ Security Guide](./security.md)

## Quick Actions

### Create a New Route

1. Click **"Routes"** in the sidebar
2. Click **"+ New Route"** button
3. Fill in the form:
   ```
   Path:     /api/products
   Upstream: https://api.yourservice.com/products
   Methods:  GET, POST, PUT, DELETE
   ```
4. Enable **Rate Limiting** (optional)
5. Click **"Save Route"**

### Enable Rate Limiting

1. Navigate to **Routes**
2. Select a route
3. Scroll to **"Rate Limiting"** section
4. Toggle **"Enabled"**
5. Set limits:
   ```
   Max Requests: 1000
   Window: 60 seconds
   Message: "Rate limit exceeded. Try again later."
   ```
6. Click **"Update"**

### View Real-Time Metrics

1. Click **"Monitoring"** in the sidebar
2. Select time range (Last 5 min, 1 hour, 24 hours, 7 days)
3. View:
   - Request rate graph
   - Response time distribution
   - Top routes by traffic
   - Error breakdown

### Export Configuration

1. Navigate to **Settings** → **Export/Import**
2. Click **"Export Configuration"**
3. Save the JSON file
4. Use for:
   - Backup
   - Version control
   - Migration to another instance

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + K` or `Cmd + K` | Quick search routes |
| `Ctrl + N` | New route |
| `Ctrl + S` | Save current form |
| `Esc` | Close modal/dialog |
| `?` | Show keyboard shortcuts |

## Mobile Access

The Admin UI is responsive and works on tablets and smartphones.

**Recommended:**
- Tablet: Full features available
- Mobile: View metrics, basic route management

For complex configuration, use desktop browser.

## API Access (Programmatic)

The Admin UI is built on REST APIs. You can also manage FlexGate programmatically:

```bash
# List all routes
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/routes

# Create a new route
curl -X POST http://localhost:3000/api/routes \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/orders",
    "upstream": "https://api.example.com/orders",
    "methods": ["GET", "POST"],
    "enabled": true
  }'
```

[→ API Reference](../api/routes.md)

## Browser Support

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

## Troubleshooting

### Admin UI Not Loading

**Problem:** White screen or infinite loading

**Solutions:**
1. Check browser console (F12) for errors
2. Verify FlexGate is running: `curl http://localhost:3000/health`
3. Clear browser cache and cookies
4. Try incognito/private mode
5. Check `ADMIN_ENABLED=true` in environment

### Can't Login

**Problem:** Invalid credentials

**Solutions:**
1. Reset admin password:
   ```bash
   flexgate admin:reset-password
   ```
2. Check environment variables:
   ```bash
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your-secure-password
   ```
3. View users:
   ```bash
   flexgate admin:list-users
   ```

### Routes Not Saving

**Problem:** Changes don't persist

**Solutions:**
1. Check database connection
2. Verify permissions
3. Check browser network tab (F12) for API errors
4. Review FlexGate logs:
   ```bash
   flexgate logs --level=error
   ```

### Slow Dashboard

**Problem:** Dashboard takes long to load

**Solutions:**
1. Reduce metrics retention period
2. Archive old logs
3. Use time-range filters
4. Check database performance
5. Consider read replicas for high-traffic gateways

## Security Best Practices

### Production Checklist

- [ ] Change default admin password
- [ ] Enable HTTPS/TLS
- [ ] Restrict admin UI access by IP
- [ ] Enable 2FA for admin accounts
- [ ] Use strong API keys
- [ ] Regular security audits
- [ ] Monitor access logs
- [ ] Set session timeouts
- [ ] Enable CSRF protection

### Restrict Access by IP

Update `config/proxy.yml`:

```yaml
admin:
  enabled: true
  allowedIPs:
    - 192.168.1.0/24
    - 10.0.0.0/8
  denyByDefault: true
```

Or use environment variable:

```bash
ADMIN_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

## What's Next?

- [Create Your First Route →](./routes.md)
- [Set Up Monitoring →](./monitoring.md)
- [Configure Authentication →](./security.md)
- [Production Deployment →](../deployment/production.md)

---

**Need Help?** [Join our Community](https://github.com/tapas100/flexgate-proxy/discussions)
