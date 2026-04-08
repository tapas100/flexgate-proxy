# 🚀 FlexGate Monorepo Deployment Strategy

**Repository:** Single monorepo containing both backend API Gateway and Admin UI  
**Date:** January 28, 2026  
**Status:** Phase 2 Planning

---

## 📁 Repository Structure (Monorepo)

```
flexgate-proxy/
├── src/                    # Backend API Gateway (Node.js/TypeScript)
│   ├── circuitBreaker.ts
│   ├── rateLimiter.ts
│   ├── metrics/
│   ├── config/
│   └── admin/             # Admin API endpoints
├── admin-ui/              # Frontend Admin Dashboard (React/TypeScript)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── tsconfig.json
├── infra/                 # Infrastructure as Code
│   ├── kubernetes/
│   ├── docker/
│   ├── terraform/
│   └── prometheus/
├── app.ts                 # Main backend entry point
├── package.json           # Backend dependencies
└── Dockerfile             # Multi-stage build
```

---

## 🎯 Deployment Options

### **Option 1: Single Container (Recommended for Phase 2)**
**Best for:** Small teams, MVP, simple deployments

#### Architecture:
```
┌─────────────────────────────────────────┐
│         Docker Container                │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │   Nginx      │  │  Node.js        │ │
│  │ (Static UI)  │  │  (API Gateway)  │ │
│  │  Port 80     │  │  Port 3000      │ │
│  └──────────────┘  └─────────────────┘ │
│         └──────┬──────────┘            │
│                │                        │
└────────────────┼────────────────────────┘
                 │
         Port 80/443 (Public)
```

#### Build Process:
1. **Build Admin UI** → Static files (HTML/CSS/JS)
2. **Build Backend** → Compiled TypeScript
3. **Package both** → Single Docker image
4. **Deploy** → Single container/pod

#### Dockerfile (Multi-stage):
```dockerfile
# Stage 1: Build Admin UI
FROM node:20-alpine AS admin-builder
WORKDIR /app/admin-ui
COPY admin-ui/package*.json ./
RUN npm ci --production=false
COPY admin-ui/ ./
RUN npm run build
# Output: /app/admin-ui/build/

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm ci --production=false
COPY src/ ./src/
COPY app.ts bin/ routes/ ./
RUN npm run build
# Output: /app/dist/

# Stage 3: Production Runtime
FROM node:20-alpine AS production
WORKDIR /app

# Install nginx for serving static files
RUN apk add --no-cache nginx

# Copy backend
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY package.json ./
COPY config/ ./config/

# Copy admin UI static files
COPY --from=admin-builder /app/admin-ui/build ./admin-ui/build

# Nginx configuration
COPY infra/docker/nginx.conf /etc/nginx/nginx.conf

# Expose ports
EXPOSE 80 3000 9090

# Start script (nginx + node)
COPY infra/docker/start.sh ./
RUN chmod +x start.sh
CMD ["./start.sh"]
```

#### Start Script (`infra/docker/start.sh`):
```bash
#!/bin/sh
# Start nginx in background (serves admin UI)
nginx

# Start Node.js API Gateway (foreground)
exec node dist/bin/www
```

#### Nginx Config (`infra/docker/nginx.conf`):
```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name _;

        # Serve Admin UI
        location /admin {
            root /app/admin-ui/build;
            try_files $uri $uri/ /index.html;
        }

        # Proxy API requests to Node.js
        location /api {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # Proxy Gateway traffic to Node.js
        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

---

### **Option 2: Separate Containers (Recommended for Phase 3+)**
**Best for:** Scale, team autonomy, complex deployments

#### Architecture:
```
┌─────────────────────────────────────────────────────┐
│               Load Balancer / Ingress               │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
┌────────▼────────┐   ┌──────▼────────┐
│  Admin UI       │   │  API Gateway  │
│  (Nginx/React)  │   │  (Node.js)    │
│  Port 80        │   │  Port 3000    │
└─────────────────┘   └───────────────┘
  Container 1           Container 2
```

#### Docker Compose (`docker-compose.yml`):
```yaml
version: '3.8'

services:
  # Admin UI Frontend
  admin-ui:
    build:
      context: ./admin-ui
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    environment:
      - REACT_APP_API_URL=http://api-gateway:3000
    depends_on:
      - api-gateway
    networks:
      - flexgate

  # API Gateway Backend
  api-gateway:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "3000:3000"
      - "9090:9090"  # Prometheus metrics
    environment:
      - NODE_ENV=production
      - PORT=3000
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./config:/app/config:ro
    depends_on:
      - redis
      - prometheus
    networks:
      - flexgate

  # Redis for rate limiting
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - flexgate

  # Prometheus for metrics
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9091:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./infra/prometheus/alerts.yml:/etc/prometheus/alerts.yml
    networks:
      - flexgate

networks:
  flexgate:
    driver: bridge
```

---

### **Option 3: Serverless/Edge (Future - Phase 3)**
**Best for:** Global distribution, auto-scaling, cost optimization

#### Architecture:
```
┌──────────────────────────────────────────┐
│         Cloudflare Workers / CDN         │
│          (Admin UI - Static)             │
└──────────────────┬───────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
┌────────▼────────┐   ┌──────▼────────┐
│  AWS Lambda     │   │  Cloud Run    │
│  (API Gateway)  │   │  (Alternative)│
│  Auto-scaling   │   │  Containers   │
└─────────────────┘   └───────────────┘
```

---

## 🔧 CI/CD Pipeline

FlexGate uses **Jenkins** for CI/CD (GitHub Actions have been removed). The full
pipeline is defined in `Jenkinsfile` at the repository root.

### Triggers
- Push to `main`
- Merge PR into `main` (via GitHub webhook → Jenkins)

### Pipeline Stages (`Jenkinsfile`)

```
1. Checkout
2. Setup Node.js    → node --version / npm --version
3. Install          → npm ci
4. Lint             → npm run lint
5. Type Check       → npm run typecheck
6. Test             → npm run test:ci  (JUnit + Coverage HTML published)
7. Build            → npm run build
8. Build Admin UI   → cd admin-ui && npm ci && npm run build
9. Publish to npm   → main branch only (see rules below)
```

**Publish rules (stage 9):**
- Only runs when `GIT_BRANCH == main`
- Reads version from `package.json` — bump the version before merging to trigger a new release
- **Version guard**: if `package.json` version is already on npm the stage is skipped, not failed — so repeated pushes to `main` are safe
- Publishes with `--access public` and immediately tags as `latest`
- `.npmrc` is written at publish time from the `NPM_TOKEN` credential and deleted immediately after — the token is never stored on disk

> ⚠️ **Never run `npm publish` manually.** All publishing goes through Jenkins.

### Jenkins Setup (one-time)
1. Add npm token as Jenkins credential → **ID must be exactly `registry-token`** (type: Secret text)
2. Install [NodeJS Plugin](https://plugins.jenkins.io/nodejs/) and configure a Node 20 installation
3. Install [GitHub Plugin](https://plugins.jenkins.io/github/) for webhook trigger
4. Create a **Pipeline** job pointing to this repository (`Jenkinsfile` at root)

### Deploying to Kubernetes after Jenkins build

```bash
kubectl set image deployment/flexgate-proxy \
  flexgate-proxy=tapas100/flexgate-proxy:latest \
  --namespace=production

kubectl rollout status deployment/flexgate-proxy -n production
```

---

## ☸️ Kubernetes Deployment

### Single Container Deployment (`infra/kubernetes/deployment.yaml`):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flexgate-proxy
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: flexgate-proxy
  template:
    metadata:
      labels:
        app: flexgate-proxy
        version: v1.1.0
    spec:
      containers:
      - name: flexgate-proxy
        image: tapas100/flexgate-proxy:latest
        ports:
        - containerPort: 80
          name: http
        - containerPort: 3000
          name: api
        - containerPort: 9090
          name: metrics
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: flexgate-secrets
              key: redis-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: config
          mountPath: /app/config
          readOnly: true
      volumes:
      - name: config
        configMap:
          name: flexgate-config

---
apiVersion: v1
kind: Service
metadata:
  name: flexgate-proxy
  namespace: production
spec:
  selector:
    app: flexgate-proxy
  ports:
  - name: http
    port: 80
    targetPort: 80
  - name: api
    port: 3000
    targetPort: 3000
  - name: metrics
    port: 9090
    targetPort: 9090
  type: LoadBalancer

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: flexgate-config
  namespace: production
data:
  proxy.yml: |
    # Your proxy config here
```

---

## 📦 Deployment Environments

### **Development**
- Local: `npm run dev` (backend) + `npm start` (admin UI in separate terminal)
- Docker: `docker-compose up` (all services)
- Hot reload enabled
- Mock data

### **Staging**
- Kubernetes cluster (1 replica)
- Connected to staging databases
- Feature flags enabled
- Test with real data

### **Production**
- Kubernetes cluster (3+ replicas)
- Multi-region deployment
- Auto-scaling enabled
- CDN for static assets
- Monitoring & alerting

---

## 🔄 Deployment Workflow

### **Phase 2 (Current - Single Container)**
```bash
# 1. Build locally
npm run build
cd admin-ui && npm run build && cd ..

# 2. Build Docker image
docker build -t tapas100/flexgate-proxy:v1.1.0 .

# 3. Test locally
docker run -p 80:80 -p 3000:3000 tapas100/flexgate-proxy:v1.1.0

# 4. Push to registry
docker push tapas100/flexgate-proxy:v1.1.0

# 5. Deploy to Kubernetes
kubectl set image deployment/flexgate-proxy \
  flexgate-proxy=tapas100/flexgate-proxy:v1.1.0
```

### **Phase 3 (Separate Containers)**
```bash
# 1. Deploy with Docker Compose
docker-compose up -d

# 2. Or Kubernetes with Helm
helm upgrade --install flexgate ./infra/helm \
  --namespace production \
  --set image.tag=v1.2.0
```

---

## 🌐 CDN Strategy (Phase 3)

### Admin UI Static Assets:
```yaml
# Cloudflare / AWS CloudFront
Origin: S3 bucket (admin-ui/build/)
Cache: 1 year for assets with hash
Cache: 5 minutes for index.html
Gzip: Enabled
Brotli: Enabled
```

### API Gateway:
```yaml
# Origin servers
Regions: us-east-1, eu-west-1, ap-southeast-1
Load Balancer: Round-robin with health checks
Cache: None (dynamic content)
```

---

## 📊 Monitoring & Observability

### Metrics Collection:
```yaml
Prometheus:
  - Scrapes: http://flexgate-proxy:9090/metrics
  - Interval: 15s
  - Retention: 30 days

Grafana:
  - Dashboards: API performance, Admin UI usage
  - Alerts: Error rate, latency, availability

Logs:
  - Backend: JSON to stdout → CloudWatch/ELK
  - Admin UI: Browser errors → Sentry
  - Nginx: Access logs → CloudWatch
```

---

## 🔐 Security Considerations

### Secrets Management:
```yaml
# Kubernetes Secrets
kubectl create secret generic flexgate-secrets \
  --from-literal=jwt-secret=$JWT_SECRET \
  --from-literal=redis-url=$REDIS_URL \
  --from-literal=db-password=$DB_PASSWORD

# Or use External Secrets Operator
# AWS Secrets Manager / HashiCorp Vault
```

### Network Policies:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: flexgate-network-policy
spec:
  podSelector:
    matchLabels:
      app: flexgate-proxy
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: ingress-nginx
    ports:
    - protocol: TCP
      port: 80
    - protocol: TCP
      port: 3000
```

---

## 📝 Rollback Strategy

### Kubernetes Rollback:
```bash
# View deployment history
kubectl rollout history deployment/flexgate-proxy -n production

# Rollback to previous version
kubectl rollout undo deployment/flexgate-proxy -n production

# Rollback to specific revision
kubectl rollout undo deployment/flexgate-proxy --to-revision=3 -n production
```

### Blue-Green Deployment:
```yaml
# Deploy new version (green)
kubectl apply -f infra/kubernetes/deployment-green.yaml

# Switch traffic
kubectl patch service flexgate-proxy -p '{"spec":{"selector":{"version":"green"}}}'

# If issues, switch back to blue
kubectl patch service flexgate-proxy -p '{"spec":{"selector":{"version":"blue"}}}'
```

---

## 🎯 Recommended Strategy for FlexGate

### **Phase 2 (Now - April 2026):**
✅ **Single Container Deployment**
- Simplest to manage
- One Dockerfile, one image
- Perfect for 10-50 customers
- Easy debugging
- Lower infrastructure costs

### **Phase 3 (May 2026+):**
✅ **Separate Containers + CDN**
- Scale admin UI independently
- CDN for global performance
- Better caching strategy
- Team can work independently
- Prepare for 500+ customers

### **Long-term (2027+):**
✅ **Microservices + Edge**
- Edge functions for admin UI
- Serverless API Gateway
- Multi-region deployment
- Auto-scaling everything

---

## 📋 Next Steps

1. **Create Docker multi-stage build** (this week)
2. **Configure Jenkins pipeline** (see `Jenkinsfile` in repo root)
3. **Deploy to staging** (next week)
4. **Deploy to production** (end of Phase 2)
5. **Add CDN** (Phase 3)
6. **Separate containers** (Phase 3 - when scaling)

---

**Deployment Checklist:**
- [ ] Create Dockerfile (multi-stage)
- [ ] Create nginx.conf
- [ ] Create start.sh script
- [ ] Update docker-compose.yml
- [ ] Create Kubernetes manifests
- [x] Configure Jenkins CI/CD (`Jenkinsfile`)
- [ ] Configure secrets management
- [ ] Setup monitoring
- [ ] Test rollback procedures
- [ ] Document deployment process

**Cost Estimate (Phase 2):**
- DigitalOcean: $24/mo (4GB Droplet)
- AWS ECS: $30-50/mo (Fargate)
- Kubernetes: $100/mo (managed cluster)
- **Recommended:** DigitalOcean App Platform ($12/mo starter)
