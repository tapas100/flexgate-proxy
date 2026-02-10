# Installation

Comprehensive guide for installing FlexGate across different platforms and deployment scenarios.

## System Requirements

### Minimum Requirements

- **CPU:** 1 core
- **RAM:** 2GB
- **Disk:** 1GB free space
- **OS:** Linux, macOS, or Windows (WSL2)
- **Node.js:** 18.0.0 or higher

### Recommended Requirements

- **CPU:** 4 cores
- **RAM:** 8GB
- **Disk:** 10GB SSD
- **OS:** Ubuntu 22.04 LTS or macOS 13+
- **Node.js:** 18.20.0 LTS

### Production Requirements

- **CPU:** 8+ cores
- **RAM:** 16GB+
- **Disk:** 50GB+ SSD
- **OS:** Ubuntu 22.04 LTS (recommended)
- **Node.js:** 18.20.0 LTS
- **Database:** PostgreSQL 15+
- **Cache:** Redis 7+
- **Load Balancer:** HAProxy 2.8+

## Platform-Specific Installation

### macOS

#### Using Homebrew (Recommended)

```bash
# Install Node.js (if not already installed)
brew install node@18

# Install PostgreSQL and Redis
brew install postgresql@15 redis

# Start services
brew services start postgresql@15
brew services start redis

# Install FlexGate
npm install -g flexgate-proxy

# Verify installation
flexgate --version
```

#### Using Podman

```bash
# Install Podman
brew install podman

# Initialize Podman machine
podman machine init
podman machine start

# Clone FlexGate repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start all services
make podman:start
```

### Ubuntu/Debian

#### APT Installation

```bash
# Update package index
sudo apt update

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 15
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-15

# Install Redis
sudo apt install -y redis-server

# Start services
sudo systemctl start postgresql
sudo systemctl start redis-server
sudo systemctl enable postgresql
sudo systemctl enable redis-server

# Install FlexGate
sudo npm install -g flexgate-proxy

# Create database user
sudo -u postgres psql -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
sudo -u postgres psql -c "CREATE DATABASE flexgate OWNER flexgate;"

# Initialize FlexGate
flexgate init

# Start FlexGate
flexgate start
```

#### Docker Installation

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Clone repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start services
docker-compose up -d

# Check status
docker-compose ps
```

### CentOS/RHEL/Fedora

#### YUM/DNF Installation

```bash
# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install PostgreSQL 15
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf install -y postgresql15-server

# Initialize and start PostgreSQL
sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
sudo systemctl enable postgresql-15
sudo systemctl start postgresql-15

# Install Redis
sudo dnf install -y redis
sudo systemctl enable redis
sudo systemctl start redis

# Install FlexGate
sudo npm install -g flexgate-proxy

# Configure database
sudo -u postgres psql -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
sudo -u postgres psql -c "CREATE DATABASE flexgate OWNER flexgate;"

# Initialize and start
flexgate init
flexgate start
```

#### Podman Installation (Recommended for RHEL/CentOS)

```bash
# Install Podman (usually pre-installed on RHEL 8+)
sudo dnf install -y podman podman-compose

# Clone repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start services with Podman
make podman:start
```

### Windows (WSL2)

#### Prerequisites

1. Install WSL2:

```powershell
# Run in PowerShell as Administrator
wsl --install
```

2. Install Ubuntu from Microsoft Store

3. Continue in Ubuntu terminal:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL and Redis
sudo apt install -y postgresql redis-server

# Start services
sudo service postgresql start
sudo service redis-server start

# Install FlexGate
npm install -g flexgate-proxy

# Configure database
sudo -u postgres psql -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
sudo -u postgres psql -c "CREATE DATABASE flexgate OWNER flexgate;"

# Initialize
flexgate init
flexgate start
```

## Container Deployment

### Docker

#### Quick Start

```bash
# Pull the latest image
docker pull flexgate/flexgate-proxy:latest

# Run with basic configuration
docker run -d \
  --name flexgate \
  -p 3000:3000 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=flexgate \
  -e DB_USER=flexgate \
  -e DB_PASSWORD=flexgate \
  flexgate/flexgate-proxy:latest
```

#### Docker Compose (Full Stack)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: flexgate
      POSTGRES_PASSWORD: flexgate
      POSTGRES_DB: flexgate
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  flexgate:
    image: flexgate/flexgate-proxy:latest
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: flexgate
      DB_USER: flexgate
      DB_PASSWORD: flexgate
      REDIS_HOST: redis
      REDIS_PORT: 6379
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3001:3000"

volumes:
  postgres-data:
  redis-data:
  prometheus-data:
  grafana-data:
```

Start the stack:

```bash
docker-compose up -d
```

### Podman

#### Rootless Podman (Recommended)

```bash
# Install Podman
# macOS
brew install podman

# Ubuntu/Debian
sudo apt install -y podman

# Fedora/RHEL/CentOS
sudo dnf install -y podman

# Initialize Podman machine (macOS only)
podman machine init
podman machine start

# Clone repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Build image
podman build -t localhost/flexgate-proxy:latest -f Containerfile .

# Start with podman-compose
pip3 install --user podman-compose
podman-compose -f podman-compose.yml up -d

# Check status
podman ps
```

#### Podman with systemd

Create systemd service file `/etc/systemd/system/flexgate.service`:

```ini
[Unit]
Description=FlexGate API Gateway
After=network.target postgresql.service redis.service

[Service]
Type=notify
ExecStartPre=-/usr/bin/podman pull flexgate/flexgate-proxy:latest
ExecStart=/usr/bin/podman run \
  --name flexgate \
  --network host \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  flexgate/flexgate-proxy:latest
ExecStop=/usr/bin/podman stop -t 10 flexgate
ExecStopPost=/usr/bin/podman rm -f flexgate
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable flexgate
sudo systemctl start flexgate
sudo systemctl status flexgate
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.24+
- kubectl configured
- Helm 3+ (optional)

### Using kubectl

#### 1. Create namespace

```bash
kubectl create namespace flexgate
```

#### 2. Deploy PostgreSQL

```yaml
# postgres.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: flexgate
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: flexgate
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_USER
          value: flexgate
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: flexgate-secrets
              key: db-password
        - name: POSTGRES_DB
          value: flexgate
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: flexgate
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
```

#### 3. Deploy Redis

```yaml
# redis.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: flexgate
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: flexgate
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

#### 4. Create secrets

```bash
kubectl create secret generic flexgate-secrets \
  --from-literal=db-password=your-secure-password \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --from-literal=session-secret=$(openssl rand -base64 32) \
  -n flexgate
```

#### 5. Deploy FlexGate

```yaml
# flexgate.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flexgate
  namespace: flexgate
spec:
  replicas: 3
  selector:
    matchLabels:
      app: flexgate
  template:
    metadata:
      labels:
        app: flexgate
    spec:
      containers:
      - name: flexgate
        image: flexgate/flexgate-proxy:latest
        env:
        - name: DB_HOST
          value: postgres
        - name: DB_PORT
          value: "5432"
        - name: DB_NAME
          value: flexgate
        - name: DB_USER
          value: flexgate
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: flexgate-secrets
              key: db-password
        - name: REDIS_HOST
          value: redis
        - name: REDIS_PORT
          value: "6379"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: flexgate-secrets
              key: jwt-secret
        ports:
        - containerPort: 3000
          name: http
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: flexgate
  namespace: flexgate
spec:
  type: LoadBalancer
  selector:
    app: flexgate
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
```

#### 6. Deploy all resources

```bash
kubectl apply -f postgres.yaml
kubectl apply -f redis.yaml
kubectl apply -f flexgate.yaml

# Check status
kubectl get pods -n flexgate
kubectl get svc -n flexgate
```

### Using Helm

```bash
# Add FlexGate Helm repository
helm repo add flexgate https://charts.flexgate.io
helm repo update

# Install FlexGate
helm install flexgate flexgate/flexgate \
  --namespace flexgate \
  --create-namespace \
  --set postgresql.enabled=true \
  --set redis.enabled=true \
  --set replicaCount=3 \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=api.yourdomain.com

# Check status
helm status flexgate -n flexgate
```

## Cloud Platform Deployment

### AWS

#### ECS Fargate

See [Cloud Deployment Guide](../deployment/cloud.md#aws-ecs-fargate)

#### EKS

See [Kubernetes Deployment Guide](../deployment/kubernetes.md)

### Azure

#### Azure Container Instances

See [Cloud Deployment Guide](../deployment/cloud.md#azure-container-instances)

### Google Cloud

#### Cloud Run

See [Cloud Deployment Guide](../deployment/cloud.md#google-cloud-run)

## Build from Source

### Clone Repository

```bash
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy
```

### Install Dependencies

```bash
npm install
```

### Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### Build TypeScript

```bash
npm run build
```

### Run Database Migrations

```bash
# Start database
npm run db:start

# Run migrations
npm run migrate
```

### Start Development Server

```bash
npm run start:dev
```

### Build Container Image

```bash
# Using Docker
docker build -t flexgate-proxy:local .

# Using Podman
podman build -t flexgate-proxy:local -f Containerfile .
```

## Post-Installation Steps

### 1. Verify Installation

```bash
# Check version
flexgate --version

# Check health
curl http://localhost:3000/health
```

### 2. Change Default Credentials

```bash
# Using CLI
flexgate admin:password

# Or edit config
vim ~/.flexgate/config/proxy.yml
```

### 3. Configure TLS/SSL

See [SSL/TLS Configuration](../security/ssl.md)

### 4. Set Up Monitoring

See [Observability Guide](../observability/metrics.md)

### 5. Create Backups

See [Backup Guide](../deployment/production.md#backups)

## Troubleshooting

### Installation Failed

**Error:** `npm install -g flexgate-proxy` fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Try with sudo (not recommended for global installs)
sudo npm install -g flexgate-proxy --unsafe-perm=true

# Or use nvm for local installation
nvm install 18
nvm use 18
npm install -g flexgate-proxy
```

### Database Connection Issues

**Error:** `ECONNREFUSED 127.0.0.1:5432`

**Solution:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Start if not running
sudo systemctl start postgresql

# Check connection
psql -U flexgate -d flexgate -h localhost
```

### Port Conflicts

**Error:** `EADDRINUSE :::3000`

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
export FLEXGATE_PORT=3001
flexgate start
```

## Uninstallation

### NPM Global

```bash
npm uninstall -g flexgate-proxy
```

### Container

```bash
# Docker
docker-compose down -v

# Podman
podman-compose down
podman system prune -af
```

### Source Build

```bash
# Stop service
flexgate stop

# Remove installation
rm -rf ~/.flexgate
npm uninstall -g flexgate-proxy
```

## Next Steps

- **[Getting Started Guide](./getting-started.md)** - Initial setup
- **[Configuration Reference](../config/routes.md)** - Configure routes
- **[Production Deployment](../deployment/production.md)** - Deploy to production

---

Need help? Check our [GitHub Discussions](https://github.com/tapas100/flexgate-proxy/discussions) or [open an issue](https://github.com/tapas100/flexgate-proxy/issues).
