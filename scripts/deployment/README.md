# FlexGate Cloud Deployment Scripts

Automated deployment scripts for FlexGate across major cloud providers.

## 🌐 Supported Cloud Providers

| Provider | Script | Status | Deployment Time |
|----------|--------|--------|-----------------|
| **AWS** | `deploy-aws.sh` | ✅ Ready | ~15 minutes |
| **Google Cloud** | `deploy-gcp.sh` | ✅ Ready | ~20 minutes |
| **DigitalOcean** | `deploy-digitalocean.sh` | ✅ Ready | ~20 minutes |

---

## 📋 Prerequisites

### All Providers

- ✅ FlexGate repository cloned
- ✅ SSH key pair generated
- ✅ Command-line experience
- ✅ Credit card/billing enabled on cloud provider

### AWS

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region, Output format

# Verify
aws sts get-caller-identity
```

### Google Cloud

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Authenticate
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Verify
gcloud config list
```

### DigitalOcean

```bash
# Install doctl
# macOS
brew install doctl

# Linux
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.98.1/doctl-1.98.1-linux-amd64.tar.gz
tar xf ~/doctl-1.98.1-linux-amd64.tar.gz
sudo mv ~/doctl /usr/local/bin

# Authenticate
doctl auth init
# Enter: API Token from DigitalOcean dashboard

# Verify
doctl account get
```

---

## 🚀 Quick Start

### AWS Deployment

```bash
# Make executable
chmod +x scripts/deployment/deploy-aws.sh

# Deploy to production
./scripts/deployment/deploy-aws.sh production

# Deploy to staging
./scripts/deployment/deploy-aws.sh staging
```

**What it creates:**
- ✅ VPC with public and private subnets
- ✅ EC2 instance (t3.medium)
- ✅ RDS PostgreSQL (db.t3.micro, Multi-AZ)
- ✅ ElastiCache Redis (cache.t3.micro)
- ✅ Security groups with proper rules
- ✅ Internet Gateway and route tables

**Estimated cost:** ~$50-100/month

---

### Google Cloud Deployment

```bash
# Make executable
chmod +x scripts/deployment/deploy-gcp.sh

# Deploy to production
./scripts/deployment/deploy-gcp.sh production my-gcp-project

# Deploy to staging
./scripts/deployment/deploy-gcp.sh staging my-gcp-project
```

**What it creates:**
- ✅ VPC network with custom subnet
- ✅ Compute Engine VM (e2-medium)
- ✅ Cloud SQL PostgreSQL (db-f1-micro)
- ✅ Cloud Memorystore Redis (1GB)
- ✅ Firewall rules
- ✅ Cloud SQL Proxy configuration

**Estimated cost:** ~$60-120/month

---

### DigitalOcean Deployment

```bash
# Make executable
chmod +x scripts/deployment/deploy-digitalocean.sh

# Deploy to production
./scripts/deployment/deploy-digitalocean.sh production

# Deploy to staging
./scripts/deployment/deploy-digitalocean.sh staging
```

**What it creates:**
- ✅ VPC network
- ✅ Droplet (2 vCPU, 2GB RAM)
- ✅ Managed PostgreSQL (1 vCPU, 1GB RAM)
- ✅ Managed Redis (1 vCPU, 1GB RAM)
- ✅ Firewall rules
- ✅ Private networking

**Estimated cost:** ~$40-80/month

---

## 📊 Comparison Matrix

| Feature | AWS | GCP | DigitalOcean |
|---------|-----|-----|--------------|
| **Ease of Setup** | Medium | Medium | Easy |
| **Cost** | $$$ | $$$ | $$ |
| **Scalability** | Excellent | Excellent | Good |
| **Global Reach** | Best | Best | Good |
| **Free Tier** | Yes (12 months) | Yes ($300 credit) | No |
| **Managed DB** | RDS | Cloud SQL | Managed DB |
| **Managed Redis** | ElastiCache | Memorystore | Managed Redis |
| **Auto-scaling** | Yes | Yes | Limited |
| **Load Balancer** | ALB/NLB | Cloud Load Balancing | Load Balancer |
| **Best For** | Enterprise | Enterprise | Startups/SMB |

---

## 🎯 Configuration Options

### AWS

```bash
# Environment variables
export AWS_REGION=us-east-1
export INSTANCE_TYPE=t3.medium
export VOLUME_SIZE=20
export KEY_NAME=my-ssh-key
export DB_INSTANCE_CLASS=db.t3.micro
export REDIS_NODE_TYPE=cache.t3.micro

# Run deployment
./scripts/deployment/deploy-aws.sh production
```

### Google Cloud

```bash
# Environment variables
export GCP_REGION=us-central1
export GCP_ZONE=us-central1-a
export MACHINE_TYPE=e2-medium
export BOOT_DISK_SIZE=20GB
export DB_TIER=db-f1-micro
export REDIS_TIER=BASIC
export REDIS_MEMORY=1

# Run deployment
./scripts/deployment/deploy-gcp.sh production my-project-id
```

### DigitalOcean

```bash
# Environment variables
export DO_REGION=nyc3
export DROPLET_SIZE=s-2vcpu-2gb
export DB_SIZE=db-s-1vcpu-1gb
export REDIS_SIZE=db-s-1vcpu-1gb

# Run deployment
./scripts/deployment/deploy-digitalocean.sh production
```

---

## 📁 Generated Files

Each deployment script generates two files:

### 1. Configuration File

**Filename:** `flexgate-{provider}-{environment}.conf`

Contains all deployment details:
- Resource IDs
- IP addresses
- Database credentials
- Redis credentials
- SSH commands

**Example:**
```bash
# flexgate-aws-production.conf
VPC_ID=vpc-1234567890abcdef
INSTANCE_ID=i-0abcdef1234567890
PUBLIC_IP=54.123.45.67
DB_ENDPOINT=flexgate-db.xxxxx.us-east-1.rds.amazonaws.com
DB_PASSWORD=xxx...xxx
REDIS_ENDPOINT=flexgate-redis.xxxxx.cache.amazonaws.com
```

### 2. FlexGate Configuration

**Filename:** `flexgate-{provider}-{environment}.json`

Ready-to-use FlexGate configuration:
```json
{
  "server": {"port": 8080, "environment": "production"},
  "database": {
    "host": "db.example.com",
    "port": 5432,
    "name": "flexgate_prod",
    "user": "flexgate_admin",
    "password": "xxx",
    "ssl": true
  },
  "redis": {
    "host": "redis.example.com",
    "port": 6379,
    "password": "xxx"
  }
}
```

---

## 🔐 Security Best Practices

### 1. Secure Generated Files

```bash
# Restrict permissions
chmod 600 flexgate-*-*.conf
chmod 600 flexgate-*-*.json

# Add to .gitignore
echo "flexgate-*-*.conf" >> .gitignore
echo "flexgate-*-*.json" >> .gitignore
```

### 2. Use Secrets Manager

**AWS:**
```bash
# Store database password
aws secretsmanager create-secret \
  --name flexgate/production/db-password \
  --secret-string "$DB_PASSWORD"

# Update FlexGate config
"password": "${DB_PASSWORD}"

# Set environment variable before starting
export DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id flexgate/production/db-password \
  --query SecretString --output text)
```

**GCP:**
```bash
# Store secret
echo -n "$DB_PASSWORD" | gcloud secrets create db-password --data-file=-

# Access in application
gcloud secrets versions access latest --secret="db-password"
```

### 3. Rotate Credentials Regularly

```bash
# Every 90 days:
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update database
# AWS RDS
aws rds modify-db-instance \
  --db-instance-identifier flexgate-db-production \
  --master-user-password "$NEW_PASSWORD" \
  --apply-immediately

# 3. Update FlexGate config
flexgate config set database.password "$NEW_PASSWORD"

# 4. Restart FlexGate
systemctl restart flexgate
```

---

## 📈 Post-Deployment Steps

### 1. SSH into Instance

**AWS:**
```bash
ssh -i ~/.ssh/flexgate-production.pem ec2-user@54.123.45.67
```

**GCP:**
```bash
gcloud compute ssh flexgate-vm-production --zone=us-central1-a
```

**DigitalOcean:**
```bash
ssh root@143.198.123.45
```

### 2. Upload Configuration

```bash
# AWS
scp -i ~/.ssh/flexgate-production.pem \
  flexgate-aws-production.json \
  ec2-user@54.123.45.67:/tmp/

# GCP
gcloud compute scp flexgate-gcp-production.json \
  flexgate-vm-production:/tmp/ --zone=us-central1-a

# DigitalOcean
scp flexgate-do-production.json root@143.198.123.45:/tmp/
```

### 3. Configure FlexGate

```bash
# Import configuration
flexgate config import /tmp/flexgate-{provider}-production.json

# Test connections
flexgate db test
flexgate redis test

# Check health
flexgate health
```

### 4. Run Database Migrations

```bash
cd /opt/flexgate
npm run db:migrate
```

### 5. Start FlexGate

```bash
# AWS/DigitalOcean
systemctl start flexgate
systemctl enable flexgate
systemctl status flexgate

# GCP (also start Cloud SQL Proxy)
systemctl start cloud-sql-proxy
systemctl start flexgate
```

### 6. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:8080/health

# Check metrics
curl http://localhost:9090/metrics

# View logs
journalctl -u flexgate -f
```

---

## 🛠️ Troubleshooting

### Connection Refused

**Problem:**
```
Error: connect ECONNREFUSED
```

**Solutions:**

1. **Check security groups/firewall:**
```bash
# AWS - Allow your IP
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 8080 \
  --cidr YOUR_IP/32

# GCP - Allow your IP
gcloud compute firewall-rules create allow-my-ip \
  --network=flexgate-network-production \
  --allow=tcp:8080 \
  --source-ranges=YOUR_IP/32
```

2. **Check if service is running:**
```bash
systemctl status flexgate
journalctl -u flexgate -n 50
```

3. **Test locally first:**
```bash
curl http://localhost:8080/health
```

### Database Connection Failed

**Problem:**
```
Error: password authentication failed
```

**Solutions:**

1. **Verify credentials:**
```bash
flexgate config get database.host
flexgate config get database.user
flexgate config get database.password

# Test manually
psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

2. **Check database firewall:**
```bash
# AWS - Check security group
aws ec2 describe-security-groups --group-ids sg-xxx

# GCP - Check if VM can reach Cloud SQL
gcloud sql connect flexgate-db-production

# DigitalOcean - Check trusted sources
doctl databases firewalls list DB_CLUSTER_ID
```

3. **Enable SSL if required:**
```bash
flexgate config set database.ssl true
```

### Service Won't Start

**Problem:**
```
Failed to start FlexGate
```

**Solutions:**

1. **Check logs:**
```bash
journalctl -u flexgate -n 100 --no-pager
```

2. **Run manually for debugging:**
```bash
cd /opt/flexgate
NODE_ENV=production npm start
```

3. **Check dependencies:**
```bash
cd /opt/flexgate
npm install
```

---

## 🔄 Updating FlexGate

### Rolling Update

```bash
# SSH into instance
ssh user@instance

# Pull latest code
cd /opt/flexgate
git pull origin main

# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Restart service
systemctl restart flexgate

# Verify
curl http://localhost:8080/health
```

### Blue-Green Deployment

```bash
# 1. Deploy new instance
./scripts/deployment/deploy-aws.sh production-v2

# 2. Test new instance
curl http://NEW_IP:8080/health

# 3. Update load balancer
# Point traffic to new instance

# 4. Monitor
# Watch logs and metrics

# 5. Rollback if needed
# Point traffic back to old instance
```

---

## 💰 Cost Estimation

### AWS (Monthly)

| Resource | Type | Cost |
|----------|------|------|
| EC2 | t3.medium | $30 |
| RDS | db.t3.micro (Multi-AZ) | $30 |
| ElastiCache | cache.t3.micro | $12 |
| Data Transfer | 100GB | $9 |
| **Total** | | **~$81/month** |

### Google Cloud (Monthly)

| Resource | Type | Cost |
|----------|------|------|
| Compute Engine | e2-medium | $24 |
| Cloud SQL | db-f1-micro | $15 |
| Memorystore | 1GB Basic | $30 |
| Network Egress | 100GB | $12 |
| **Total** | | **~$81/month** |

### DigitalOcean (Monthly)

| Resource | Type | Cost |
|----------|------|------|
| Droplet | 2 vCPU, 2GB | $18 |
| Managed DB | 1 vCPU, 1GB | $15 |
| Managed Redis | 1 vCPU, 1GB | $15 |
| Bandwidth | 2TB (included) | $0 |
| **Total** | | **~$48/month** |

---

## 📚 Additional Resources

- **AWS Documentation:** https://docs.aws.amazon.com/
- **GCP Documentation:** https://cloud.google.com/docs
- **DigitalOcean Docs:** https://docs.digitalocean.com/

- **FlexGate CLI Guide:** `../CLI_JSON_CONFIGURATION_GUIDE.md`
- **EC2 Deployment Guide:** `../EC2_DEPLOYMENT_GUIDE.md`
- **Architecture Docs:** `../docs/architecture.md`

---

## 🆘 Support

- **Issues:** Open an issue on GitHub
- **Discussions:** GitHub Discussions
- **Email:** support@flexgate.io

---

## 📝 License

MIT License - see LICENSE file

---

**Happy deploying! 🚀**
