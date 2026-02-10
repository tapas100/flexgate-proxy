# FlexGate Deployment - Quick Reference Card

**One-page reference for deploying FlexGate to production.**

---

## ⚡ Quick Deploy

```bash
# AWS (free tier available - 12 months)
./scripts/deployment/deploy-aws.sh production

# Google Cloud ($300 credit available - 90 days)
./scripts/deployment/deploy-gcp.sh production my-project-id

# DigitalOcean (lowest cost - $48/month)
./scripts/deployment/deploy-digitalocean.sh production
```

**Deployment time:** 15-20 minutes per provider

---

## 📋 Prerequisites Checklist

### AWS
- [ ] AWS CLI installed (`aws --version`)
- [ ] AWS credentials configured (`aws configure`)
- [ ] SSH key pair created
- [ ] IAM permissions (EC2, RDS, ElastiCache, VPC)

### Google Cloud
- [ ] gcloud CLI installed (`gcloud --version`)
- [ ] Authenticated (`gcloud auth login`)
- [ ] Project created (`gcloud projects list`)
- [ ] Billing enabled

### DigitalOcean
- [ ] doctl installed (`doctl version`)
- [ ] API token configured (`doctl auth init`)
- [ ] SSH key uploaded to DigitalOcean

---

## 💰 Cost Comparison

| Provider | Startup | Production | Free Tier |
|----------|---------|------------|-----------|
| **AWS** | $35/mo | $120/mo | ✅ 12 months |
| **GCP** | $45/mo | $172/mo | ✅ $300 credit |
| **DigitalOcean** | $48/mo | $90/mo | ❌ None |

---

## 📂 Generated Files

After deployment, you'll have:

1. **`flexgate-{provider}-{env}.conf`** - All credentials, IPs, resource IDs
2. **`flexgate-{provider}-{env}.json`** - Ready-to-use FlexGate configuration

**⚠️ IMPORTANT:** Store these files securely! They contain passwords.

---

## 🚀 Post-Deployment Steps

### 1. SSH into Instance

**AWS:**
```bash
ssh -i ~/.ssh/flexgate-production.pem ec2-user@YOUR_PUBLIC_IP
```

**GCP:**
```bash
gcloud compute ssh flexgate-vm-production --zone=us-central1-a
```

**DigitalOcean:**
```bash
ssh root@YOUR_DROPLET_IP
```

### 2. Upload Configuration

```bash
# AWS
scp -i ~/.ssh/key.pem flexgate-aws-production.json ec2-user@IP:/tmp/

# GCP
gcloud compute scp flexgate-gcp-production.json flexgate-vm:/tmp/ --zone=us-central1-a

# DigitalOcean
scp flexgate-do-production.json root@IP:/tmp/
```

### 3. Configure FlexGate

```bash
# Import config
flexgate config import /tmp/flexgate-{provider}-production.json

# Test connections
flexgate db test
flexgate redis test

# Check health
flexgate health
```

### 4. Run Migrations

```bash
cd /opt/flexgate
npm run db:migrate
```

### 5. Start FlexGate

```bash
systemctl start flexgate
systemctl enable flexgate
systemctl status flexgate
```

### 6. Verify

```bash
# Health check
curl http://localhost:8080/health

# Metrics
curl http://localhost:9090/metrics

# Logs
journalctl -u flexgate -f
```

---

## 🔧 Common Issues

### Can't SSH into instance

**Problem:** Connection refused or timeout

**Solutions:**
1. Check security group allows SSH (port 22) from your IP
2. Verify you're using correct key file
3. Check instance is running

### Database connection failed

**Problem:** `ECONNREFUSED` or authentication error

**Solutions:**
1. Run `flexgate config show` to verify credentials
2. Check database security group allows connections
3. Verify database is running (check cloud console)

### FlexGate won't start

**Problem:** Service fails to start

**Solutions:**
1. Check logs: `journalctl -u flexgate -n 50`
2. Verify config: `flexgate config show`
3. Test manually: `cd /opt/flexgate && npm start`

---

## 📖 Full Documentation

| Guide | Location | Purpose |
|-------|----------|---------|
| **Deployment Guide** | `scripts/deployment/README.md` | Complete deployment instructions |
| **Cloud Comparison** | `scripts/deployment/CLOUD_COMPARISON.md` | Choose the right provider |
| **Master Index** | `DEPLOYMENT_CONFIGURATION_INDEX.md` | All documentation links |
| **CLI Guide** | `CLI_JSON_CONFIGURATION_GUIDE.md` | Configure via CLI |
| **EC2 Manual** | `EC2_DEPLOYMENT_GUIDE.md` | Manual deployment steps |

---

## 🎯 Provider Selection Guide

### Choose AWS if:
- ✅ Need maximum scalability
- ✅ Want free tier (12 months)
- ✅ Building enterprise product
- ✅ Need most services/integrations

### Choose GCP if:
- ✅ Data/ML is important
- ✅ Want best Kubernetes
- ✅ Need global load balancing
- ✅ Building data pipelines

### Choose DigitalOcean if:
- ✅ MVP/startup phase
- ✅ Cost is top priority
- ✅ Want simplicity
- ✅ Small team

---

## 📊 What Gets Created

### AWS
- VPC (10.0.0.0/16)
- EC2 instance (t3.medium)
- RDS PostgreSQL (db.t3.micro, Multi-AZ)
- ElastiCache Redis (cache.t3.micro)
- 3 Security groups
- Internet Gateway

### Google Cloud
- VPC network
- Compute Engine VM (e2-medium)
- Cloud SQL PostgreSQL (db-f1-micro)
- Cloud Memorystore Redis (1GB)
- Firewall rules
- Cloud SQL Proxy

### DigitalOcean
- VPC network
- Droplet (s-2vcpu-2gb)
- Managed PostgreSQL (db-s-1vcpu-1gb)
- Managed Redis (db-s-1vcpu-1gb)
- Cloud Firewall

---

## 🔐 Security Checklist

After deployment:

- [ ] Change default passwords
- [ ] Restrict security groups to your IP
- [ ] Enable MFA on cloud account
- [ ] Set up backup alerts
- [ ] Configure monitoring
- [ ] Review IAM permissions
- [ ] Enable audit logging
- [ ] Set up SSL certificate

---

## 📞 Getting Help

1. **Check troubleshooting:** `scripts/troubleshooting/README.md`
2. **Run health check:** `flexgate health`
3. **Check logs:** `journalctl -u flexgate -f`
4. **Review docs:** `DEPLOYMENT_CONFIGURATION_INDEX.md`
5. **Open GitHub issue**

---

## ⚙️ Environment Variables (Optional)

Override defaults before deployment:

```bash
# AWS
export AWS_REGION=us-west-2
export INSTANCE_TYPE=t3.large
export DB_INSTANCE_CLASS=db.t3.small

# GCP
export GCP_REGION=europe-west1
export MACHINE_TYPE=e2-standard-2
export DB_TIER=db-g1-small

# DigitalOcean
export DO_REGION=lon1
export DROPLET_SIZE=s-4vcpu-8gb
export DB_SIZE=db-s-2vcpu-4gb
```

---

## 🔄 Scaling

### Vertical (Bigger instance)

**AWS:**
```bash
aws ec2 modify-instance-attribute \
  --instance-id i-xxx --instance-type t3.large
```

**GCP:**
```bash
gcloud compute instances set-machine-type \
  flexgate-vm --machine-type e2-standard-2
```

**DigitalOcean:**
```bash
doctl compute droplet-action resize DROPLET_ID \
  --size s-4vcpu-8gb
```

### Horizontal (More instances)

Deploy multiple instances and add load balancer:

**AWS:** Use Auto Scaling Groups + ALB  
**GCP:** Use Managed Instance Groups + Cloud Load Balancing  
**DigitalOcean:** Create multiple droplets + Load Balancer  

---

## 💾 Backup

### Database Backups

**AWS RDS:** Automatic daily backups (7-day retention)  
**GCP Cloud SQL:** Automatic daily backups (configurable)  
**DigitalOcean:** Automatic daily backups (7 days)  

### Manual Backup

```bash
# PostgreSQL dump
pg_dump -h DB_HOST -U DB_USER -d DB_NAME > backup.sql

# Upload to S3/GCS/Spaces
aws s3 cp backup.sql s3://my-backups/
```

---

## 📈 Monitoring

### CloudWatch (AWS)
- EC2 metrics (CPU, memory, network)
- RDS metrics (connections, queries)
- ElastiCache metrics

### Cloud Monitoring (GCP)
- VM metrics
- Cloud SQL metrics
- Memorystore metrics

### DigitalOcean Monitoring
- Droplet metrics
- Database metrics
- Basic alerting

---

## ✅ Production Checklist

Before going live:

- [ ] Deployed to production environment
- [ ] Configuration verified
- [ ] Database migrations run
- [ ] SSL certificate configured
- [ ] Domain name pointed to instance
- [ ] Monitoring enabled
- [ ] Backups verified
- [ ] Security hardened
- [ ] Load testing completed
- [ ] Documentation updated

---

**🚀 You're ready to deploy! Choose a provider above and run the script. 🚀**

**Questions?** See `DEPLOYMENT_CONFIGURATION_INDEX.md` for complete documentation.

---

**Last Updated:** February 9, 2024  
**Version:** 1.0.0
