# 🚀 FlexGate Monorepo - Docker-Free Deployment Strategy

**Repository:** Single monorepo (Backend + Admin UI)  
**Date:** January 28, 2026  
**Approach:** Native deployment without Docker containers

---

## 🎯 Recommended Platforms (No Docker Required)

### **Option 1: DigitalOcean App Platform** ⭐ RECOMMENDED
**Cost:** $12-24/mo | **Difficulty:** Easy | **Best for:** Phase 2

#### Why App Platform?
- ✅ Detects Node.js automatically
- ✅ Auto-builds from Git (no Docker needed)
- ✅ Auto-scaling included
- ✅ SSL certificates automatic
- ✅ Zero DevOps knowledge required
- ✅ Built-in monitoring
- ✅ One-click rollbacks

#### Architecture:
```
┌─────────────────────────────────────────────┐
│     DigitalOcean App Platform               │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │  Static Site │    │  Web Service     │  │
│  │  (Admin UI)  │    │  (API Gateway)   │  │
│  │  Auto-build  │    │  Node.js 20      │  │
│  │  from React  │    │  Auto-scaling    │  │
│  └──────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────┘
         ↓                      ↓
    CDN (Auto)          Load Balancer (Auto)
```

#### Setup Steps:

**1. Create `app.yaml` in root:**
```yaml
name: flexgate-proxy
region: nyc

# Static Site for Admin UI
static_sites:
  - name: admin-ui
    github:
      repo: tapas100/flexgate-proxy
      branch: main
      deploy_on_push: true
    source_dir: /admin-ui
    build_command: npm ci && npm run build
    output_dir: build
    routes:
      - path: /admin
    environment_slug: node-js
    envs:
      - key: REACT_APP_API_URL
        value: ${api-gateway.PUBLIC_URL}

# Web Service for API Gateway
services:
  - name: api-gateway
    github:
      repo: tapas100/flexgate-proxy
      branch: main
      deploy_on_push: true
    build_command: npm ci && npm run build
    run_command: npm start
    environment_slug: node-js
    instance_count: 2
    instance_size_slug: basic-xs
    http_port: 3000
    health_check:
      http_path: /health/live
      initial_delay_seconds: 30
      period_seconds: 10
    routes:
      - path: /
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: REDIS_URL
        scope: RUN_AND_BUILD_TIME
        value: ${redis.PRIVATE_URL}
      - key: JWT_SECRET
        scope: RUN_AND_BUILD_TIME
        type: SECRET
        value: ${JWT_SECRET}

# Database (Redis for rate limiting)
databases:
  - name: redis
    engine: REDIS
    production: true
    cluster_name: flexgate-redis
```

**2. Deploy:**
```bash
# Install doctl CLI
brew install doctl

# Authenticate
doctl auth init

# Create app
doctl apps create --spec app.yaml

# Or use web UI:
# 1. Go to DigitalOcean → Apps
# 2. Connect GitHub repo
# 3. Auto-detects Node.js
# 4. Click "Deploy"
```

**3. Update package.json scripts:**
```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node ./dist/bin/www",
    "postinstall": "cd admin-ui && npm ci && npm run build && cd .."
  }
}
```

**Cost Breakdown:**
- Basic App: $12/mo (2 containers, 1GB RAM)
- Redis: $15/mo (managed)
- **Total: $27/mo** (scales automatically)

---

### **Option 2: Render** ⭐ EXCELLENT
**Cost:** Free tier available | **Difficulty:** Easy | **Best for:** MVP/Testing

#### Why Render?
- ✅ Generous free tier
- ✅ Auto-deploy from Git
- ✅ Native monorepo support
- ✅ Zero configuration
- ✅ Preview environments
- ✅ Automatic SSL

#### Setup:

**1. Create `render.yaml`:**
```yaml
services:
  # Backend API Gateway
  - type: web
    name: flexgate-api
    env: node
    region: oregon
    plan: starter
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /health/live
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: REDIS_URL
        fromDatabase:
          name: flexgate-redis
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
        sync: false
    autoDeploy: true
    
  # Frontend Admin UI
  - type: web
    name: flexgate-admin
    env: static
    buildCommand: cd admin-ui && npm ci && npm run build
    staticPublishPath: admin-ui/build
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: REACT_APP_API_URL
        value: https://flexgate-api.onrender.com
    autoDeploy: true

databases:
  - name: flexgate-redis
    databaseName: flexgate
    plan: starter
```

**2. Deploy:**
```bash
# Just push to GitHub
git push origin main

# Render auto-detects render.yaml and deploys
```

**Cost:**
- Free tier: $0/mo (includes SSL, auto-deploy)
- Starter: $7/mo (better performance)
- Redis: $7/mo (managed)

---

### **Option 3: Railway** ⭐ MODERN
**Cost:** $5/mo credit (pay-as-you-go) | **Best for:** Simplicity

#### Setup:

**1. Create `railway.json`:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health/live",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**2. Deploy:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize
railway init

# Deploy
railway up
```

**Cost:**
- $5/mo credit included
- Pay only for what you use (~$10-20/mo for small app)

---

### **Option 4: Vercel + Serverless** ⭐ SCALABLE
**Cost:** Free tier generous | **Best for:** Global scale

#### Architecture:
```
Admin UI (Vercel Edge) → CDN → Users
    ↓
API Routes (Serverless Functions)
    ↓
Backend Logic
```

#### Setup:

**1. Create `vercel.json`:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "admin-ui/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "build"
      }
    },
    {
      "src": "app.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/admin/(.*)",
      "dest": "/admin-ui/$1"
    },
    {
      "src": "/api/(.*)",
      "dest": "/app.ts"
    },
    {
      "src": "/(.*)",
      "dest": "/app.ts"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

**2. Deploy:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production
vercel --prod
```

**Cost:**
- Hobby: Free (perfect for small projects)
- Pro: $20/mo (team features)

---

### **Option 5: Netlify + Serverless Functions**
**Cost:** Free tier | **Best for:** Jamstack approach

---

### **Option 6: Fly.io** ⭐ DOCKER-FREE
**Cost:** Free tier 3 apps | **Best for:** Global deployment

#### Why Fly.io?
- ✅ No Docker required (uses Buildpacks)
- ✅ Global deployment
- ✅ Free tier includes 3 apps
- ✅ Scales to zero
- ✅ Anycast networking

#### Setup:

**1. Create `fly.toml`:**
```toml
app = "flexgate-proxy"
primary_region = "lax"

[build]
  builder = "paketobuildpacks/builder:base"
  buildpacks = ["gcr.io/paketo-buildpacks/nodejs"]

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[services]]
  http_checks = []
  internal_port = 8080
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [services.concurrency]
    hard_limit = 25
    soft_limit = 20
    type = "connections"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "1s"
    interval = "15s"
    restart_limit = 0
    timeout = "2s"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
```

**2. Deploy:**
```bash
# Install flyctl
brew install flyctl

# Login
fly auth login

# Launch app
fly launch

# Deploy
fly deploy

# Scale
fly scale count 3
```

**Cost:**
- Free: 3 apps, 256MB RAM
- Paid: $1.94/mo per 256MB

---

## 📊 Comparison Table

| Platform | Cost/Month | Setup Time | Auto-Scale | Free Tier | Best For |
|----------|-----------|------------|------------|-----------|----------|
| **DigitalOcean App** | $27 | 10 min | ✅ | ❌ | Production |
| **Render** | $14 | 5 min | ✅ | ✅ | MVP |
| **Railway** | $15 | 3 min | ✅ | $5 credit | Simplicity |
| **Vercel** | Free-$20 | 2 min | ✅ | ✅ | Global CDN |
| **Netlify** | Free | 5 min | ✅ | ✅ | Jamstack |
| **Fly.io** | Free-$10 | 5 min | ✅ | ✅ | Edge compute |

---

## 🎯 Recommended Path for FlexGate

### **Phase 2 (MVP - Now):**
```
Platform: Render (Free tier)
Why: Zero cost, auto-deploy, preview environments
Setup: 5 minutes
```

**Deploy to Render:**
```bash
# 1. Create render.yaml (already shown above)
git add render.yaml
git commit -m "feat: Add Render deployment config"
git push origin main

# 2. Go to render.com
# 3. Connect GitHub repo
# 4. Render auto-detects and deploys
# 5. Done!

# URLs:
# - API: https://flexgate-api.onrender.com
# - Admin: https://flexgate-admin.onrender.com
```

### **Phase 2 (10+ Customers):**
```
Platform: DigitalOcean App Platform
Why: Reliable, affordable, scales well
Cost: $27/mo
Setup: 10 minutes with app.yaml
```

### **Phase 3 (100+ Customers):**
```
Platform: Fly.io (multi-region)
Why: Global edge deployment
Cost: ~$50/mo (3 regions)
```

### **Phase 3 (500+ Customers):**
```
Platform: Vercel (Admin UI) + Railway (API)
Why: Best of both worlds
Cost: $20 (Vercel) + $30 (Railway) = $50/mo
```

---

## 🚀 Quick Start Guide (Render - 5 Minutes)

### Step 1: Create `render.yaml`

```bash
cat > render.yaml << 'EOF'
services:
  - type: web
    name: flexgate-api
    env: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /health/live
    envVars:
      - key: NODE_ENV
        value: production

  - type: web
    name: flexgate-admin
    env: static
    buildCommand: cd admin-ui && npm ci && npm run build
    staticPublishPath: admin-ui/build
    envVars:
      - key: REACT_APP_API_URL
        value: https://flexgate-api.onrender.com
EOF
```

### Step 2: Update package.json

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node ./dist/bin/www",
    "deploy": "git push origin main"
  },
  "engines": {
    "node": "20.x",
    "npm": "10.x"
  }
}
```

### Step 3: Deploy

```bash
git add render.yaml package.json
git commit -m "feat: Add Render deployment configuration"
git push origin main

# Then:
# 1. Go to https://render.com
# 2. Sign up with GitHub
# 3. Click "New" → "Blueprint"
# 4. Select your repo
# 5. Render auto-deploys!
```

### Step 4: Configure Environment Variables

```bash
# In Render dashboard:
# - Add JWT_SECRET
# - Add any other secrets
# - Click "Deploy"
```

---

## 📁 Required Files for Each Platform

### For Render:
```bash
✅ render.yaml
✅ package.json (with engines)
```

### For DigitalOcean:
```bash
✅ app.yaml
✅ package.json
```

### For Railway:
```bash
✅ railway.json (optional - auto-detects)
✅ package.json
```

### For Vercel:
```bash
✅ vercel.json
✅ package.json
```

### For Fly.io:
```bash
✅ fly.toml
✅ Procfile (optional)
```

---

## 🔄 CI/CD with GitHub Actions (Docker-Free)

```yaml
name: Deploy to Render

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Render
        env:
          RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
        run: |
          curl -X POST \
            https://api.render.com/deploy/srv-xxxxx?key=$RENDER_API_KEY
```

---

## 💡 Best Practices

### 1. **Build Command Optimization**
```json
{
  "scripts": {
    "build": "npm ci && tsc && cd admin-ui && npm ci && npm run build",
    "start": "node dist/bin/www"
  }
}
```

### 2. **Environment Variables**
```bash
# .env.example
NODE_ENV=production
PORT=3000
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-here
ADMIN_JWT_SECRET=your-admin-secret
```

### 3. **Health Checks**
```typescript
// Already in app.ts:
app.get('/health/live', (req, res) => {
  res.json({ status: 'UP' });
});
```

### 4. **Graceful Shutdown**
```typescript
// Add to bin/www.ts
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

---

## 🎯 My Recommendation

**Start with Render (Free):**
1. ✅ Zero cost to start
2. ✅ Auto-deploy from Git
3. ✅ Preview environments for PRs
4. ✅ Easy scaling when you grow
5. ✅ 5-minute setup

**Migrate to DigitalOcean App Platform when:**
- You have 10+ paying customers
- Need better performance
- Want managed Redis
- Budget allows $27/mo

**Scale to Fly.io when:**
- 100+ customers globally
- Need edge deployment
- Want multi-region
- Need <100ms latency worldwide

---

## 📝 Next Steps

1. **Create render.yaml** (I'll create this for you)
2. **Update package.json** (add engines)
3. **Push to GitHub**
4. **Connect Render**
5. **Deploy automatically**

Want me to create the Render configuration files now?
