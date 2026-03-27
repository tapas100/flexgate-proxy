# Admin UI Overview

FlexGate includes a powerful web-based Admin UI for managing your API gateway visually. This guide covers all features and workflows.

## Accessing the Admin UI

### Default Access

The Admin UI is accessible at:

**URL:** http://localhost:3000/admin

**Default Credentials:**
- Username: `admin`
- Password: `admin`

⚠️ **Security Warning:** Change the default password immediately after first login!

### Configuration

The Admin UI is configured in `config/proxy.yml`:

```yaml
admin:
  enabled: true
  path: /admin
  username: admin
  password: admin  # Change this!
  sessionTimeout: 3600000  # 1 hour
  maxLoginAttempts: 5
  lockoutDuration: 900000  # 15 minutes
```

### Environment Variables

```bash
export ADMIN_ENABLED=true
export ADMIN_PATH=/admin
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your-secure-password
export ADMIN_SESSION_TIMEOUT=3600000
```

## Login and Authentication

### First Time Login

1. Navigate to http://localhost:3000/admin
2. You'll see the login page
3. Enter credentials:
   - Username: `admin`
   - Password: `admin`
4. Click **"Sign In"**
5. You'll be redirected to the dashboard


### Session Management

- Sessions expire after 1 hour of inactivity (configurable)
- Active sessions are preserved across page refreshes
- You'll be automatically logged out on session expiry
- Multiple concurrent sessions are supported

### Password Change

**Via Admin UI:**

1. Click your username (top right)
2. Select **"Account Settings"**
3. Enter current password
4. Enter new password (twice)
5. Click **"Update Password"**

**Via CLI:**

```bash
flexgate admin:password
# Enter current password
# Enter new password
# Confirm new password
```

**Via Configuration:**

```bash
# Generate bcrypt hash
node -e "console.log(require('bcrypt').hashSync('new-password', 10))"

# Update config/proxy.yml
admin:
  password: $2b$10$... # Paste hash here
```

## Dashboard Overview

The dashboard provides a real-time overview of your gateway:


### Key Metrics

**Traffic Overview (Last 24 Hours):**
- Total Requests
- Successful Requests (2xx)
- Client Errors (4xx)
- Server Errors (5xx)
- Average Response Time

**Current Status:**
- Active Routes
- Healthy Upstreams
- Rate Limited Requests
- Circuit Breakers Tripped

**Real-time Charts:**
- Requests per Second (line chart)
- Response Time Distribution (histogram)
- Status Code Distribution (pie chart)
- Top Routes by Traffic (bar chart)

### Quick Actions

Dashboard quick action buttons:
- **Add Route** - Create new route
- **View Metrics** - Detailed metrics page
- **View Logs** - Access logs viewer
- **System Health** - Infrastructure status

## Navigation

### Sidebar Menu

The left sidebar provides access to all sections:

| Icon | Section | Description |
|------|---------|-------------|
| 📊 | **Dashboard** | Overview and key metrics |
| 🛣️ | **Routes** | Manage API routes |
| 📈 | **Monitoring** | Real-time metrics and performance |
| 📝 | **Logs** | Access and error logs |
| 👥 | **Users** | User management (multi-tenant) |
| 🔑 | **API Keys** | Generate and manage API keys |
| ⚙️ | **Settings** | Global configuration |
| 🔔 | **Webhooks** | Event notifications |
| 📚 | **Documentation** | Link to docs |

### Top Navigation

**Search Bar:**
- Quick search for routes, logs, users
- Keyboard shortcut: `Cmd/Ctrl + K`

**User Menu:**
- Account settings
- Change password
- Logout

**Notifications:**
- System alerts
- Health check failures
- Rate limit warnings

## Key Features

### 1. Route Management

**Create, edit, and delete routes:**
- Visual form-based route creation
- Live validation
- Test routes before saving
- Bulk operations (enable/disable/delete)
- Import/export routes (JSON/YAML)

**Route List View:**
- Sortable and filterable table
- Search by path, upstream, or tags
- Quick enable/disable toggle
- Status indicators (healthy/unhealthy)
- Traffic stats per route


### 2. Real-time Monitoring

**Live Metrics Dashboard:**
- Auto-refreshing charts (configurable interval)
- Custom time ranges (last hour, 24h, 7d, 30d, custom)
- Per-route drill-down
- Export data (CSV, JSON)

**Metrics Available:**
- Request rate (req/sec)
- Response times (p50, p90, p95, p99)
- Error rates (4xx, 5xx)
- Throughput (bytes/sec)
- Active connections
- Circuit breaker status


### 3. Log Viewer

**Advanced log filtering:**
- Filter by level (debug, info, warn, error)
- Filter by route, user, IP
- Time range selection
- Full-text search
- Export logs

**Log Features:**
- Syntax highlighting
- Collapsible JSON objects
- Copy to clipboard
- Share log permalink
- Live tail mode


### 4. User Management

**For multi-tenant deployments:**
- Create organizations
- Add users to organizations
- Assign roles (admin, developer, viewer)
- Set quotas per user/org
- View user activity


### 5. API Key Management

**Generate and manage API keys:**
- Create keys with expiration
- Set rate limits per key
- Restrict to specific routes
- Revoke keys
- View key usage statistics


### 6. Settings Panel

**Global Configuration:**
- Server settings (port, host)
- Database connection
- Redis configuration
- Security settings (CORS, SSL)
- Rate limit defaults
- Health check defaults
- Logging configuration


## Keyboard Shortcuts

Boost productivity with keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Quick search |
| `Cmd/Ctrl + N` | New route |
| `Cmd/Ctrl + S` | Save current form |
| `Cmd/Ctrl + /` | Show shortcuts |
| `G → D` | Go to Dashboard |
| `G → R` | Go to Routes |
| `G → M` | Go to Monitoring |
| `G → L` | Go to Logs |
| `?` | Help |
| `Esc` | Close modal/dropdown |

## Responsive Design

The Admin UI works on all screen sizes:

**Desktop (1024px+):**
- Full sidebar navigation
- Multi-column layouts
- Detailed charts and tables

**Tablet (768px - 1023px):**
- Collapsible sidebar
- Stacked layouts
- Simplified charts

**Mobile (< 768px):**
- Bottom navigation
- Mobile-optimized forms
- Swipeable tabs


## Dark Mode

Toggle between light and dark themes:

1. Click theme toggle (top right, moon/sun icon)
2. OR press `Cmd/Ctrl + Shift + D`
3. Preference is saved in localStorage


## Accessibility

The Admin UI follows WCAG 2.1 AA standards:

- ✅ Keyboard navigation
- ✅ Screen reader support (ARIA labels)
- ✅ High contrast mode
- ✅ Scalable fonts
- ✅ Focus indicators
- ✅ Alternative text for images

## Browser Support

**Fully Supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Partially Supported:**
- IE 11 (basic functionality only)

**Recommended:** Use the latest version of Chrome, Firefox, or Safari for best experience.

## Security Features

### Authentication

- **Session-based auth** with secure cookies
- **JWT tokens** for API access
- **CSRF protection** on all mutations
- **Rate limiting** on login attempts (5 attempts, 15-minute lockout)

### Authorization

- **Role-based access control (RBAC)**
- **Granular permissions** per feature
- **Audit logging** of all admin actions

### Data Protection

- **HTTPS-only** in production (recommended)
- **Content Security Policy (CSP)** headers
- **XSS protection** via input sanitization
- **No sensitive data** in URLs or logs

## Customization

### Branding

Customize the Admin UI to match your brand:

**Configuration:**

```yaml
admin:
  branding:
    logo: /path/to/logo.svg
    favicon: /path/to/favicon.ico
    title: "My Company API Gateway"
    primaryColor: "#007bff"
    headerColor: "#343a40"
```

**Example:**

```javascript
// config/admin-branding.js
module.exports = {
  logo: '/assets/company-logo.svg',
  title: 'Acme Corp Gateway',
  colors: {
    primary: '#ff6b6b',
    secondary: '#4ecdc4',
    success: '#95e1d3',
    danger: '#f38181'
  }
}
```

### Custom Dashboards

Create custom dashboards with your metrics:

```javascript
// config/custom-dashboard.js
module.exports = {
  widgets: [
    {
      type: 'metric',
      title: 'Custom KPI',
      query: 'SELECT COUNT(*) FROM routes WHERE enabled = true'
    },
    {
      type: 'chart',
      title: 'Traffic by Region',
      query: 'SELECT region, COUNT(*) FROM requests GROUP BY region'
    }
  ]
}
```

## API Access

All Admin UI features are available via REST API:

### Authentication

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'

# Response
{
  "token": "eyJhbGc...",
  "expiresIn": 3600
}
```

### Routes API

```bash
# List routes
curl http://localhost:3000/api/routes \
  -H "Authorization: Bearer $TOKEN"

# Create route
curl -X POST http://localhost:3000/api/routes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "/api/test", "upstream": "http://backend:8080"}'

# Update route
curl -X PATCH http://localhost:3000/api/routes/route-id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Delete route
curl -X DELETE http://localhost:3000/api/routes/route-id \
  -H "Authorization: Bearer $TOKEN"
```

### Metrics API

```bash
# Get metrics
curl http://localhost:3000/api/metrics?range=24h \
  -H "Authorization: Bearer $TOKEN"

# Get per-route metrics
curl http://localhost:3000/api/metrics/routes/route-id \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

### Cannot Access Admin UI

**Problem:** 404 error when accessing /admin

**Solutions:**

1. Check admin is enabled:
```yaml
# config/proxy.yml
admin:
  enabled: true
```

2. Verify path configuration:
```bash
# Check logs
flexgate logs | grep admin
```

3. Check port and host:
```bash
# Verify gateway is running
curl http://localhost:3000/health
```

### Login Fails

**Problem:** "Invalid credentials" error

**Solutions:**

1. Verify credentials in config:
```yaml
admin:
  username: admin
  password: admin
```

2. Check for account lockout:
```bash
# View logs
flexgate logs | grep "login attempt"

# Reset lockout
redis-cli DEL "login-attempts:admin"
```

3. Reset password:
```bash
flexgate admin:password --reset
```

### Metrics Not Loading

**Problem:** Empty charts in monitoring dashboard

**Solutions:**

1. Check Prometheus is running:
```bash
curl http://localhost:9090
```

2. Verify metrics endpoint:
```bash
curl http://localhost:3000/metrics
```

3. Check time range selection (expand to 24h)

### Slow Performance

**Problem:** Admin UI is slow or unresponsive

**Solutions:**

1. Reduce auto-refresh interval:
   - Settings → Monitoring → Refresh Interval: 30s

2. Limit log entries:
   - Logs → Settings → Max Entries: 100

3. Clear browser cache:
   - Hard refresh: `Cmd/Ctrl + Shift + R`

4. Check server resources:
```bash
# Monitor CPU/memory
top -p $(pidof node)
```

## Best Practices

### Security

1. **Change default password** immediately
2. **Use HTTPS** in production
3. **Enable CSRF protection**
4. **Limit IP access** if possible
5. **Regular security audits**

### Performance

1. **Use pagination** for large datasets
2. **Set reasonable auto-refresh intervals**
3. **Export large logs** instead of viewing in browser
4. **Use filters** to reduce data load

### Workflow

1. **Use search** (Cmd/Ctrl + K) for quick navigation
2. **Learn keyboard shortcuts** for efficiency
3. **Create bookmarks** for frequently used views
4. **Use dark mode** to reduce eye strain
5. **Enable notifications** for important events

## Next Steps

Explore specific Admin UI features:

- **[Route Management](./routes.md)** - Detailed route CRUD operations
- **[Monitoring & Metrics](./monitoring.md)** - Advanced monitoring features
- **[Settings & Configuration](./settings.md)** - Configure global settings
- **[User Management](./users.md)** - Multi-tenancy setup

---

**Questions?** Check our [FAQ](../faq.md) or [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions).
