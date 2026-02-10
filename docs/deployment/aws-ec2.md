# FlexGate EC2 Deployment Guide

Complete guide for deploying FlexGate on AWS EC2 instances **without Admin UI access**.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Method 1: Interactive Setup](#method-1-interactive-setup-recommended)
- [Method 2: Automated Script](#method-2-automated-script)
- [Method 3: JSON Configuration](#method-3-json-configuration)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)
- [Production Checklist](#production-checklist)

---

## Prerequisites

### AWS Resources

- ✅ EC2 instance (t3.medium or larger recommended)
- ✅ Amazon Linux 2 or Ubuntu 20.04+
- ✅ Security Group allowing:
  - Port 22 (SSH)
  - Port 8080 (FlexGate API)
  - Port 9090 (Prometheus metrics, optional)
- ✅ RDS PostgreSQL instance
- ✅ ElastiCache Redis instance
- ✅ SSH key pair

### Network Configuration

```
VPC: 10.0.0.0/16
  ├── Public Subnet: 10.0.1.0/24
  │   └── EC2 Instance (FlexGate)
  └── Private Subnet: 10.0.2.0/24
      ├── RDS PostgreSQL
      └── ElastiCache Redis
```

---

## Method 1: Interactive Setup (Recommended)

### Step 1: SSH into EC2

```bash
# SSH into your instance
ssh -i ~/.ssh/your-key.pem ec2-user@ec2-xx-xxx-xxx-xxx.compute.amazonaws.com
```

---

### Step 2: Install Node.js

**Amazon Linux 2:**
```bash
# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node --version  # Should be v18.x or higher
npm --version
```

**Ubuntu:**
```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

---

### Step 3: Install FlexGate

```bash
# Install globally
sudo npm install -g flexgate-proxy

# Verify installation
flexgate --version
# Output: 0.1.0-beta.1
```

---

### Step 4: Interactive Configuration

```bash
# Run interactive wizard
flexgate init --interactive
```

**Follow the prompts:**

```
🚀 FlexGate Configuration Wizard

? Server port: 8080
? Environment (development/production/staging/test): production

Database Configuration:
? Database host: flexgate-db.xxxxx.us-east-1.rds.amazonaws.com
? Database port: 5432
? Database name: flexgate_prod
? Database user: flexgate_admin
? Database password: ****************

Redis Configuration:
? Redis host: flexgate-redis.xxxxx.cache.amazonaws.com
? Redis port: 6379
? Redis password: ****************
? Redis database number (0-15): 0

Security:
? Enable CORS? Yes
? Enable rate limiting? Yes
? Rate limit (requests per minute): 1000

Logging:
? Log level (error/warn/info/debug): info
? Log format (json/simple): json

Monitoring:
? Enable Prometheus metrics? Yes
? Prometheus port: 9090

✅ Configuration saved to: /home/ec2-user/.flexgate/config/flexgate.json
✅ Environment file generated: /home/ec2-user/.flexgate/.env

✅ FlexGate initialized successfully!
```

---

### Step 5: Test Connections

```bash
# Test database connection
flexgate db test

# Expected output:
# Testing database connection...
# ✅ Database connection successful
#    Host: flexgate-db.xxxxx.us-east-1.rds.amazonaws.com:5432
#    Database: flexgate_prod
#    User: flexgate_admin

# Test Redis connection
flexgate redis test

# Expected output:
# Testing Redis connection...
# ✅ Redis connection successful
#    Host: flexgate-redis.xxxxx.cache.amazonaws.com:6379
#    Database: 0
#    Ping: PONG
```

---

### Step 6: Run Database Migrations

```bash
# Clone FlexGate repository (if not already)
git clone https://github.com/your-org/flexgate-proxy.git
cd flexgate-proxy

# Install dependencies
npm install

# Run migrations
npm run db:migrate
```

---

### Step 7: Start FlexGate

```bash
# Start in production mode
NODE_ENV=production npm start

# Expected output:
# FlexGate starting...
# ✅ Database connected
# ✅ Redis connected
# ✅ Server listening on port 8080
# ✅ Metrics available at http://localhost:9090/metrics
```

---

### Step 8: Verify Deployment

```bash
# From another terminal (or use curl from EC2)
curl http://localhost:8080/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-15T10:30:00Z",
#   "checks": {
#     "database": "healthy",
#     "redis": "healthy"
#   }
# }
```

---

## Method 2: Automated Script

### One-Command Deployment

```bash
# Run this entire script
curl -fsSL https://raw.githubusercontent.com/your-org/flexgate-proxy/main/scripts/deploy-ec2.sh | bash
```

### Complete Deployment Script

**Save as `deploy-ec2.sh`:**

```bash
#!/bin/bash
set -e

echo "================================================="
echo "FlexGate EC2 Automated Deployment"
echo "================================================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    print_error "Cannot detect OS"
    exit 1
fi

# Step 1: Install Node.js
print_info "Installing Node.js..."
if [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    # Amazon Linux / RHEL
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    # Ubuntu / Debian
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    print_error "Unsupported OS: $OS"
    exit 1
fi

print_success "Node.js installed: $(node --version)"

# Step 2: Install FlexGate
print_info "Installing FlexGate..."
sudo npm install -g flexgate-proxy
print_success "FlexGate installed: $(flexgate --version)"

# Step 3: Configure FlexGate
print_info "Configuring FlexGate..."

# Read configuration from environment variables or prompt
DB_HOST=${DB_HOST:-$(read -p "Database host: " val && echo $val)}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-flexgate_prod}
DB_USER=${DB_USER:-$(read -p "Database user: " val && echo $val)}
DB_PASSWORD=${DB_PASSWORD:-$(read -sp "Database password: " val && echo $val && echo)}

REDIS_HOST=${REDIS_HOST:-$(read -p "Redis host: " val && echo $val)}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-$(read -sp "Redis password: " val && echo $val && echo)}

# Create JSON configuration
cat > /tmp/flexgate-config.json << EOF
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "production"
  },
  "database": {
    "host": "$DB_HOST",
    "port": $DB_PORT,
    "name": "$DB_NAME",
    "user": "$DB_USER",
    "password": "$DB_PASSWORD",
    "ssl": true,
    "poolMin": 5,
    "poolMax": 20
  },
  "redis": {
    "host": "$REDIS_HOST",
    "port": $REDIS_PORT,
    "password": "$REDIS_PASSWORD",
    "db": 0
  },
  "security": {
    "corsOrigins": ["*"],
    "corsEnabled": true,
    "rateLimitEnabled": true,
    "rateLimitMaxRequests": 1000
  },
  "logging": {
    "level": "info",
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
EOF

# Import configuration
flexgate config import /tmp/flexgate-config.json
rm /tmp/flexgate-config.json

print_success "Configuration imported"

# Step 4: Test connections
print_info "Testing database connection..."
if flexgate db test; then
    print_success "Database connection successful"
else
    print_error "Database connection failed"
    exit 1
fi

print_info "Testing Redis connection..."
if flexgate redis test; then
    print_success "Redis connection successful"
else
    print_error "Redis connection failed"
    exit 1
fi

# Step 5: Clone repository and run migrations
print_info "Cloning FlexGate repository..."
cd /opt
sudo git clone https://github.com/your-org/flexgate-proxy.git
cd flexgate-proxy
sudo npm install

print_info "Running database migrations..."
sudo npm run db:migrate

print_success "Migrations complete"

# Step 6: Setup systemd service
print_info "Setting up systemd service..."
sudo tee /etc/systemd/system/flexgate.service > /dev/null << EOF
[Unit]
Description=FlexGate API Gateway
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/flexgate-proxy
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable flexgate
sudo systemctl start flexgate

print_success "FlexGate service started"

# Step 7: Verify deployment
print_info "Waiting for FlexGate to start..."
sleep 5

if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    print_success "FlexGate is healthy!"
else
    print_error "Health check failed"
    sudo systemctl status flexgate
    exit 1
fi

echo ""
echo "================================================="
print_success "FlexGate deployment complete!"
echo "================================================="
echo ""
echo "Service status: sudo systemctl status flexgate"
echo "View logs:      sudo journalctl -u flexgate -f"
echo "Configuration:  flexgate config show"
echo ""
```

---

## Method 3: JSON Configuration

### Step 1: Prepare Configuration Locally

**On your local machine:**

```bash
# Create production config
cat > flexgate.production.json << EOF
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "production"
  },
  "database": {
    "host": "flexgate-db.xxxxx.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "name": "flexgate_prod",
    "user": "flexgate_admin",
    "password": "REPLACE_WITH_SECURE_PASSWORD",
    "ssl": true,
    "poolMin": 5,
    "poolMax": 20
  },
  "redis": {
    "host": "flexgate-redis.xxxxx.cache.amazonaws.com",
    "port": 6379,
    "password": "REPLACE_WITH_REDIS_PASSWORD",
    "db": 0
  },
  "security": {
    "corsOrigins": ["https://admin.example.com"],
    "corsEnabled": true,
    "rateLimitEnabled": true,
    "rateLimitMaxRequests": 1000
  },
  "logging": {
    "level": "info",
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
EOF
```

---

### Step 2: Copy to EC2

```bash
# SCP the config file to EC2
scp -i ~/.ssh/your-key.pem \
    flexgate.production.json \
    ec2-user@ec2-instance:/tmp/
```

---

### Step 3: Import on EC2

```bash
# SSH into EC2
ssh -i ~/.ssh/your-key.pem ec2-user@ec2-instance

# Import configuration
flexgate config import /tmp/flexgate.production.json

# Remove temp file
rm /tmp/flexgate.production.json

# Verify
flexgate config show
```

---

## Post-Deployment

### Setup Systemd Service

```bash
# Create systemd service file
sudo tee /etc/systemd/system/flexgate.service > /dev/null << EOF
[Unit]
Description=FlexGate API Gateway
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/flexgate-proxy
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable flexgate

# Start service
sudo systemctl start flexgate

# Check status
sudo systemctl status flexgate
```

---

### View Logs

```bash
# Real-time logs
sudo journalctl -u flexgate -f

# Last 100 lines
sudo journalctl -u flexgate -n 100

# Logs since today
sudo journalctl -u flexgate --since today
```

---

### Setup Nginx Reverse Proxy (Optional)

```bash
# Install Nginx
sudo yum install -y nginx  # Amazon Linux
# OR
sudo apt install -y nginx  # Ubuntu

# Configure Nginx
sudo tee /etc/nginx/conf.d/flexgate.conf > /dev/null << EOF
upstream flexgate {
    server localhost:8080;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://flexgate;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

# Test configuration
sudo nginx -t

# Start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

### Setup SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx  # Amazon Linux
# OR
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu

# Get certificate
sudo certbot --nginx -d api.example.com

# Auto-renewal is configured automatically
```

---

## Troubleshooting

### Connection Refused

**Symptom:**
```
Error: connect ECONNREFUSED
```

**Solution:**
```bash
# Check if database is accessible
telnet flexgate-db.xxxxx.us-east-1.rds.amazonaws.com 5432

# Check security group rules
# Ensure EC2 security group can access RDS security group on port 5432

# Update database host
flexgate config set database.host correct-hostname
flexgate db test
```

---

### Authentication Failed

**Symptom:**
```
Error: password authentication failed for user "flexgate_admin"
```

**Solution:**
```bash
# Verify credentials
flexgate config get database.user
flexgate config get database.password

# Update password
flexgate config set database.password correct_password
flexgate db test
```

---

### Port Already in Use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solution:**
```bash
# Find process using port
sudo lsof -i :8080

# Kill process
sudo kill -9 <PID>

# Or use different port
flexgate config set server.port 8081
sudo systemctl restart flexgate
```

---

### Service Won't Start

```bash
# Check service status
sudo systemctl status flexgate

# View detailed logs
sudo journalctl -u flexgate -n 50

# Check configuration
flexgate config show

# Test manually
cd /opt/flexgate-proxy
NODE_ENV=production npm start
```

---

## Production Checklist

### Security

- [ ] SSL enabled for database connection
- [ ] Strong passwords for database and Redis
- [ ] CORS restricted to specific origins
- [ ] Rate limiting enabled
- [ ] SSH key-based authentication only
- [ ] Security group rules minimized
- [ ] Firewall configured (ufw/firewalld)
- [ ] Secrets stored in AWS Secrets Manager

---

### High Availability

- [ ] Multi-AZ RDS deployment
- [ ] Redis cluster mode enabled
- [ ] Auto Scaling Group for EC2
- [ ] Application Load Balancer
- [ ] Health checks configured
- [ ] Auto-restart on failure (systemd)

---

### Monitoring

- [ ] Prometheus metrics enabled
- [ ] CloudWatch logs configured
- [ ] CloudWatch alarms set up
- [ ] Health check endpoint monitored
- [ ] Log aggregation (CloudWatch Logs)
- [ ] Performance monitoring (CloudWatch Metrics)

---

### Backup & Recovery

- [ ] RDS automated backups enabled
- [ ] Redis snapshots configured
- [ ] Configuration backed up to S3
- [ ] Disaster recovery plan documented
- [ ] Regular backup testing

---

### Performance

- [ ] Connection pooling optimized
- [ ] Redis cache configured
- [ ] Instance size appropriate (t3.medium+)
- [ ] Database indexed
- [ ] Slow query logging enabled

---

## Summary

You now have **three methods** to deploy FlexGate on EC2:

1. **Interactive** - Best for one-off deployments
2. **Automated Script** - Best for repeatable deployments
3. **JSON Config** - Best for GitOps/IaC

**No Admin UI needed! 🚀**

---

## Additional Resources

- **CLI Guide:** `CLI_JSON_CONFIGURATION_GUIDE.md`
- **Quick Reference:** `CLI_QUICK_REFERENCE.md`
- **Troubleshooting:** `TROUBLESHOOTING_GUIDE.md`
- **Architecture:** `docs/architecture.md`

---

**Questions?** Open an issue on GitHub or consult the documentation.
