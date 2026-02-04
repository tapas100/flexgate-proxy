# 🚀 Open Source Deployment Platforms (Self-Hosted)

**Last Updated:** January 28, 2026  
**Goal:** Deploy FlexGate without Docker using open-source platforms

---

## 🎯 Top Open Source Alternatives to Render

### **Option 1: Coolify** ⭐ HIGHLY RECOMMENDED
**License:** Apache 2.0 (Open Source)  
**Best for:** Self-hosting with Docker-like simplicity

#### What is Coolify?
- 🔥 Open-source Heroku/Netlify/Vercel alternative
- ✅ One-click deployment from Git
- ✅ Built-in SSL certificates (Let's Encrypt)
- ✅ Automatic deployments on push
- ✅ Beautiful web UI
- ✅ Database management (Redis, PostgreSQL, MongoDB)
- ✅ Preview deployments for PRs
- ✅ Zero-downtime deployments

#### Architecture:
```
┌──────────────────────────────────────────┐
│      Coolify Dashboard (Port 8000)       │
│  ┌────────────────────────────────────┐  │
│  │  Git Integration (GitHub/GitLab)   │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   FlexGate API + Admin UI          │  │
│  │   Auto-deployed on push            │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   Redis + Other Services           │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

#### Setup (5 minutes):

**1. Install Coolify on your server:**
```bash
# On a fresh Ubuntu/Debian server (1GB RAM minimum)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Or via Docker
docker run -d \
  --name coolify \
  -p 8000:8000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v coolify-data:/data \
  coollabsio/coolify:latest
```

**2. Access dashboard:**
```
Open: http://your-server-ip:8000
Create admin account
```

**3. Deploy FlexGate:**
```
1. Click "New Resource" → "Public Repository"
2. Paste: https://github.com/tapas100/flexgate-proxy
3. Select branch: main
4. Build Command: npm ci && npm run build
5. Start Command: npm start
6. Port: 3000
7. Click "Deploy"
```

**4. Add Admin UI:**
```
1. Click "New Resource" → "Static Site"
2. Repository: (same)
3. Build Command: cd admin-ui && npm ci && npm run build
4. Publish Directory: admin-ui/build
5. Click "Deploy"
```

**Cost:**
- Self-hosted: $5-12/mo (VPS: Hetzner, DigitalOcean)
- Coolify Cloud: Coming soon (managed option)

**Documentation:** https://coolify.io/docs

---

### **Option 2: CapRover** ⭐ EXCELLENT
**License:** Apache 2.0 (Open Source)  
**Best for:** Simple PaaS on your own server

#### What is CapRover?
- ✅ Self-hosted Heroku alternative
- ✅ One-click apps (PostgreSQL, Redis, etc.)
- ✅ Auto SSL (Let's Encrypt)
- ✅ CLI deployment
- ✅ Web UI dashboard
- ✅ No Docker knowledge needed

#### Setup:

**1. Install CapRover:**
```bash
# On your server (Ubuntu/Debian)
docker run -p 80:80 -p 443:443 -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /captain:/captain \
  caprover/caprover
```

**2. Setup domain:**
```bash
# Install CLI
npm install -g caprover

# Setup
caprover serversetup
```

**3. Deploy FlexGate:**
```bash
# In your project root
cat > captain-definition << 'EOF'
{
  "schemaVersion": 2,
  "templateId": "node/20",
  "dockerfilePath": null,
  "imageName": null
}
EOF

# Deploy
caprover deploy
```

**Cost:** $5-10/mo (VPS hosting)

**Documentation:** https://caprover.com/docs

---

### **Option 3: Dokku** ⭐ CLASSIC
**License:** MIT (Open Source)  
**Best for:** Heroku-like experience, self-hosted

#### What is Dokku?
- 🐳 Docker-powered mini-Heroku
- ✅ Git push to deploy
- ✅ Buildpacks (no Dockerfile needed)
- ✅ Plugin ecosystem
- ✅ CLI-focused (minimal UI)

#### Setup:

**1. Install Dokku:**
```bash
# On Ubuntu 22.04+
wget -NP . https://dokku.com/install/v0.32.0/bootstrap.sh
sudo DOKKU_TAG=v0.32.0 bash bootstrap.sh
```

**2. Create app:**
```bash
# On server
dokku apps:create flexgate-api
dokku apps:create flexgate-admin

# Set buildpack
dokku buildpacks:set flexgate-api https://github.com/heroku/heroku-buildpack-nodejs
```

**3. Deploy:**
```bash
# On local machine
git remote add dokku dokku@your-server:flexgate-api
git push dokku main
```

**Cost:** $5-10/mo (VPS)

**Documentation:** https://dokku.com/docs

---

### **Option 4: Easypanel** ⭐ MODERN
**License:** Open Source  
**Best for:** Visual deployment management

#### What is Easypanel?
- ✅ Modern UI (similar to Vercel/Netlify)
- ✅ Built on Docker
- ✅ Template marketplace
- ✅ Easy database management
- ✅ GitHub integration

#### Setup:

**1. Install:**
```bash
curl -sSL https://get.easypanel.io | sh
```

**2. Access:**
```
Open: http://your-server-ip:3000
```

**3. Deploy:**
```
1. Connect GitHub
2. Select flexgate-proxy repo
3. Auto-detects Node.js
4. Click Deploy
```

**Cost:** Free (self-hosted) or $20/mo (managed)

**Documentation:** https://easypanel.io/docs

---

### **Option 5: Piku** ⭐ MINIMALIST
**License:** MIT (Open Source)  
**Best for:** Simple, Heroku-like, single file

#### What is Piku?
- 🎯 Minimal (single Python file!)
- ✅ Git push to deploy
- ✅ No Docker required
- ✅ Runs on Raspberry Pi
- ✅ Super lightweight

#### Setup:

**1. Install:**
```bash
curl https://piku.github.io/get | sh
```

**2. Deploy:**
```bash
git remote add piku piku@your-server:flexgate
git push piku main
```

**Cost:** $5/mo (tiny VPS works)

**Documentation:** https://piku.github.io

---

### **Option 6: Kamal (by 37signals/Basecamp)** ⭐ NEW
**License:** MIT (Open Source)  
**Best for:** Zero-downtime deployments

#### What is Kamal?
- 🚀 Created by Ruby on Rails team
- ✅ Deploy to any server
- ✅ Zero-downtime deployments
- ✅ Secrets management
- ✅ Health checks built-in

#### Setup:

**1. Install:**
```bash
gem install kamal
```

**2. Initialize:**
```bash
kamal init
```

**3. Deploy:**
```bash
kamal deploy
```

**Documentation:** https://kamal-deploy.org

---

### **Option 7: Porter** ⭐ KUBERNETES
**License:** MIT (Open Source)  
**Best for:** If you need Kubernetes

#### What is Porter?
- ☸️ Kubernetes made simple
- ✅ Heroku-like experience on K8s
- ✅ Auto-scaling
- ✅ Multi-cloud (AWS, GCP, Azure, DO)

**Cost:** Self-hosted free, or Porter Cloud

**Documentation:** https://porter.run/docs

---

## 📊 Comparison Table

| Platform | License | Complexity | UI | Database Support | Best For |
|----------|---------|------------|-----|------------------|----------|
| **Coolify** | Apache 2.0 | Low | ⭐⭐⭐⭐⭐ | ✅ Built-in | Modern PaaS |
| **CapRover** | Apache 2.0 | Low | ⭐⭐⭐⭐ | ✅ One-click | Simple hosting |
| **Dokku** | MIT | Medium | ⭐⭐ | ✅ Plugins | Heroku clone |
| **Easypanel** | Open | Low | ⭐⭐⭐⭐⭐ | ✅ Built-in | Visual UI |
| **Piku** | MIT | Low | ⭐ | ⚠️ Manual | Minimal |
| **Kamal** | MIT | Medium | ⭐ | ⚠️ Manual | Zero-downtime |
| **Porter** | MIT | High | ⭐⭐⭐ | ✅ K8s | Enterprise |

---

## 🎯 Recommended for FlexGate

### **Best Overall: Coolify** 🏆

**Why?**
1. ✅ Beautiful modern UI
2. ✅ Git push auto-deploy
3. ✅ Built-in Redis, PostgreSQL
4. ✅ Free SSL certificates
5. ✅ Active development
6. ✅ Great documentation
7. ✅ Preview deployments
8. ✅ Easy backup/restore

**Setup Time:** 10 minutes  
**Cost:** $6/mo (Hetzner CX11) or $12/mo (DigitalOcean)

---

## 🚀 Quick Start with Coolify (Recommended)

### Step 1: Get a Server

**Providers (cheapest to most expensive):**
```
Hetzner Cloud: €4.15/mo (CX11 - 2GB RAM)
Vultr: $6/mo (1GB RAM)
DigitalOcean: $12/mo (2GB RAM)
Linode: $12/mo (2GB RAM)
```

### Step 2: Install Coolify

```bash
# SSH into your server
ssh root@your-server-ip

# Install Coolify (one command!)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Wait 2-3 minutes for installation
```

### Step 3: Access Dashboard

```bash
# Open in browser
http://your-server-ip:8000

# Create admin account
# Username: admin
# Password: (choose strong password)
```

### Step 4: Deploy FlexGate

**In Coolify Dashboard:**
```
1. Click "+" → "New Resource" → "Public Repository"

2. Git Settings:
   - Repository: https://github.com/tapas100/flexgate-proxy
   - Branch: main
   - Auto Deploy: ON

3. Build Settings:
   - Type: NodeJS
   - Build Command: npm ci && npm run build
   - Start Command: npm start
   - Port: 3000

4. Environment Variables:
   - NODE_ENV=production
   - PORT=3000
   - JWT_SECRET=<auto-generated>

5. Click "Deploy"
```

### Step 5: Add Redis

```
1. Click "+" → "New Database" → "Redis"
2. Name: flexgate-redis
3. Version: 7
4. Click "Deploy"
5. Copy connection string
6. Add to FlexGate env vars: REDIS_URL
```

### Step 6: Deploy Admin UI

```
1. Click "+" → "New Resource" → "Public Repository"
2. Same repo: https://github.com/tapas100/flexgate-proxy
3. Build Settings:
   - Type: Static Site
   - Build Command: cd admin-ui && npm ci && npm run build
   - Publish Directory: admin-ui/build
   - Base Directory: admin-ui
4. Environment Variables:
   - REACT_APP_API_URL=<flexgate-api-url>
5. Click "Deploy"
```

### Step 7: Setup Custom Domain (Optional)

```
1. In Coolify Dashboard → Your App
2. Click "Domains"
3. Add: api.flexgate.io
4. SSL: Auto (Let's Encrypt)
5. Point your DNS:
   - Type: A
   - Name: api
   - Value: your-server-ip
```

---

## 💰 Cost Comparison

### Open Source (Self-Hosted):
```
Server (Hetzner): €4.15/mo
Domain: $12/year = $1/mo
SSL: Free (Let's Encrypt)
─────────────────────────
Total: ~$6/mo
```

### Render (Managed):
```
Web Service: $7/mo
Redis: $7/mo
Static Site: Free
─────────────────────────
Total: $14/mo
```

### DigitalOcean App Platform (Managed):
```
Basic App: $12/mo
Redis: $15/mo
─────────────────────────
Total: $27/mo
```

**Savings with self-hosting: $8-21/mo** 💰

---

## 🔧 Required Changes for Coolify

### Update package.json:

```json
{
  "engines": {
    "node": "20.x",
    "npm": "10.x"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node ./dist/bin/www",
    "deploy": "echo 'Deploy via Coolify dashboard'"
  }
}
```

### Add `.coolify/deploy.sh` (optional):

```bash
#!/bin/bash
set -e

echo "🚀 Building FlexGate..."
npm ci
npm run build

echo "✅ Build complete!"
```

---

## 📝 Next Steps

**I recommend Coolify because:**
1. ✅ **Open source** (Apache 2.0)
2. ✅ **Modern UI** (better than Render)
3. ✅ **Self-hosted** (you own your data)
4. ✅ **Cost-effective** ($6/mo vs $27/mo)
5. ✅ **Easy to use** (no Docker knowledge needed)
6. ✅ **Active community** (growing fast)

**Want me to:**
1. Create Coolify deployment configuration?
2. Set up a Hetzner server for you?
3. Show alternative like CapRover or Dokku?

Let me know which platform you prefer! 🚀
