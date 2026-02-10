#!/bin/bash

#################################################################################
# FlexGate Google Cloud Platform (GCP) Deployment Script
#
# This script automates the deployment of FlexGate on Google Cloud Platform.
# It handles:
# - Compute Engine VM creation
# - Cloud SQL PostgreSQL setup
# - Cloud Memorystore Redis setup
# - VPC network configuration
# - FlexGate installation and configuration
#
# Prerequisites:
# - gcloud CLI installed and configured (gcloud auth login)
# - Project created in GCP
# - Billing enabled
# - Required APIs enabled (compute, sqladmin, redis)
#
# Usage:
#   ./deploy-gcp.sh [environment] [project-id]
#
# Example:
#   ./deploy-gcp.sh production my-gcp-project
#################################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Print functions
print_header() { echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Configuration
ENVIRONMENT="${1:-production}"
PROJECT_ID="${2:-$(gcloud config get-value project)}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
PROJECT_NAME="flexgate"

# VM configuration
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
BOOT_DISK_SIZE="${BOOT_DISK_SIZE:-20GB}"
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"

# Cloud SQL configuration
DB_TIER="${DB_TIER:-db-f1-micro}"
DB_VERSION="${DB_VERSION:-POSTGRES_15}"

# Redis configuration
REDIS_TIER="${REDIS_TIER:-BASIC}"
REDIS_MEMORY="${REDIS_MEMORY:-1}"

print_header "FlexGate GCP Deployment - ${ENVIRONMENT}"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed. Please install it first."
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    print_error "Project ID not set. Please provide it as second argument or set default project."
    exit 1
fi

gcloud config set project "$PROJECT_ID"

print_success "Using project: $PROJECT_ID"

# Enable required APIs
print_header "Step 1: Enabling Required APIs"

print_info "Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com

print_info "Enabling Cloud SQL Admin API..."
gcloud services enable sqladmin.googleapis.com

print_info "Enabling Cloud Memorystore for Redis API..."
gcloud services enable redis.googleapis.com

print_info "Enabling Cloud Resource Manager API..."
gcloud services enable cloudresourcemanager.googleapis.com

print_success "APIs enabled"

# Create VPC network
print_header "Step 2: Network Configuration"

NETWORK_NAME="${PROJECT_NAME}-network-${ENVIRONMENT}"

if ! gcloud compute networks describe "$NETWORK_NAME" &>/dev/null; then
    print_info "Creating VPC network..."
    
    gcloud compute networks create "$NETWORK_NAME" \
        --subnet-mode=custom \
        --bgp-routing-mode=regional
    
    print_success "VPC network created: $NETWORK_NAME"
else
    print_success "Using existing VPC network: $NETWORK_NAME"
fi

# Create subnet
SUBNET_NAME="${PROJECT_NAME}-subnet-${ENVIRONMENT}"

if ! gcloud compute networks subnets describe "$SUBNET_NAME" --region="$REGION" &>/dev/null; then
    print_info "Creating subnet..."
    
    gcloud compute networks subnets create "$SUBNET_NAME" \
        --network="$NETWORK_NAME" \
        --region="$REGION" \
        --range=10.0.0.0/24
    
    print_success "Subnet created: $SUBNET_NAME"
else
    print_success "Using existing subnet: $SUBNET_NAME"
fi

# Create firewall rules
print_header "Step 3: Firewall Rules"

# Allow SSH
FIREWALL_SSH="${PROJECT_NAME}-allow-ssh-${ENVIRONMENT}"
if ! gcloud compute firewall-rules describe "$FIREWALL_SSH" &>/dev/null; then
    print_info "Creating SSH firewall rule..."
    
    gcloud compute firewall-rules create "$FIREWALL_SSH" \
        --network="$NETWORK_NAME" \
        --allow=tcp:22 \
        --source-ranges=0.0.0.0/0 \
        --target-tags="${PROJECT_NAME}-${ENVIRONMENT}"
    
    print_success "SSH firewall rule created"
fi

# Allow HTTP/HTTPS
FIREWALL_WEB="${PROJECT_NAME}-allow-web-${ENVIRONMENT}"
if ! gcloud compute firewall-rules describe "$FIREWALL_WEB" &>/dev/null; then
    print_info "Creating web firewall rule..."
    
    gcloud compute firewall-rules create "$FIREWALL_WEB" \
        --network="$NETWORK_NAME" \
        --allow=tcp:80,tcp:443,tcp:8080,tcp:9090 \
        --source-ranges=0.0.0.0/0 \
        --target-tags="${PROJECT_NAME}-${ENVIRONMENT}"
    
    print_success "Web firewall rule created"
fi

# Create Cloud SQL instance
print_header "Step 4: Cloud SQL PostgreSQL Setup"

DB_INSTANCE_NAME="${PROJECT_NAME}-db-${ENVIRONMENT}"
DB_NAME="flexgate_${ENVIRONMENT}"
DB_USER="flexgate_admin"
DB_PASSWORD=$(openssl rand -base64 32)

if ! gcloud sql instances describe "$DB_INSTANCE_NAME" &>/dev/null; then
    print_info "Creating Cloud SQL PostgreSQL instance (this may take 10-15 minutes)..."
    
    gcloud sql instances create "$DB_INSTANCE_NAME" \
        --database-version="$DB_VERSION" \
        --tier="$DB_TIER" \
        --region="$REGION" \
        --network="projects/${PROJECT_ID}/global/networks/${NETWORK_NAME}" \
        --no-assign-ip \
        --backup \
        --backup-start-time=03:00 \
        --maintenance-window-day=SUN \
        --maintenance-window-hour=04 \
        --labels="environment=${ENVIRONMENT},project=${PROJECT_NAME}"
    
    print_success "Cloud SQL instance created: $DB_INSTANCE_NAME"
else
    print_success "Using existing Cloud SQL instance: $DB_INSTANCE_NAME"
fi

# Set root password
print_info "Setting root password..."
gcloud sql users set-password postgres \
    --instance="$DB_INSTANCE_NAME" \
    --password="$DB_PASSWORD"

# Create database
print_info "Creating database..."
gcloud sql databases create "$DB_NAME" \
    --instance="$DB_INSTANCE_NAME" 2>/dev/null || print_warning "Database already exists"

# Create user
print_info "Creating database user..."
gcloud sql users create "$DB_USER" \
    --instance="$DB_INSTANCE_NAME" \
    --password="$DB_PASSWORD" 2>/dev/null || print_warning "User already exists"

# Get connection name
DB_CONNECTION_NAME=$(gcloud sql instances describe "$DB_INSTANCE_NAME" \
    --format="value(connectionName)")

DB_PRIVATE_IP=$(gcloud sql instances describe "$DB_INSTANCE_NAME" \
    --format="value(ipAddresses[0].ipAddress)")

print_success "Cloud SQL setup complete"
print_info "Connection name: $DB_CONNECTION_NAME"
print_info "Private IP: $DB_PRIVATE_IP"

# Create Redis instance
print_header "Step 5: Cloud Memorystore Redis Setup"

REDIS_INSTANCE_NAME="${PROJECT_NAME}-redis-${ENVIRONMENT}"
REDIS_PASSWORD=$(openssl rand -base64 32)

if ! gcloud redis instances describe "$REDIS_INSTANCE_NAME" --region="$REGION" &>/dev/null; then
    print_info "Creating Cloud Memorystore Redis instance (this may take 5-10 minutes)..."
    
    gcloud redis instances create "$REDIS_INSTANCE_NAME" \
        --region="$REGION" \
        --network="projects/${PROJECT_ID}/global/networks/${NETWORK_NAME}" \
        --tier="$REDIS_TIER" \
        --size="$REDIS_MEMORY" \
        --redis-version=redis_7_0 \
        --labels="environment=${ENVIRONMENT},project=${PROJECT_NAME}"
    
    print_success "Redis instance created: $REDIS_INSTANCE_NAME"
else
    print_success "Using existing Redis instance: $REDIS_INSTANCE_NAME"
fi

REDIS_HOST=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
    --region="$REGION" \
    --format="value(host)")

REDIS_PORT=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
    --region="$REGION" \
    --format="value(port)")

print_success "Redis setup complete"
print_info "Redis host: $REDIS_HOST:$REDIS_PORT"

# Create startup script
print_header "Step 6: Creating VM Startup Script"

cat > /tmp/flexgate-startup.sh << 'STARTUP'
#!/bin/bash
set -e

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs git

# Install Cloud SQL Proxy
wget https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 -O /usr/local/bin/cloud_sql_proxy
chmod +x /usr/local/bin/cloud_sql_proxy

# Install FlexGate
npm install -g flexgate-proxy

# Create FlexGate directory
mkdir -p /opt/flexgate
cd /opt/flexgate

# Clone repository
git clone https://github.com/your-org/flexgate-proxy.git . || true
npm install

# Create systemd service for Cloud SQL Proxy
cat > /etc/systemd/system/cloud-sql-proxy.service << 'SERVICE'
[Unit]
Description=Cloud SQL Proxy
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloud_sql_proxy -instances=INSTANCE_CONNECTION_NAME=tcp:5432
Restart=always

[Install]
WantedBy=multi-user.target
SERVICE

# Create systemd service for FlexGate
cat > /etc/systemd/system/flexgate.service << 'SERVICE'
[Unit]
Description=FlexGate API Gateway
After=network.target cloud-sql-proxy.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/flexgate
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable cloud-sql-proxy
systemctl enable flexgate

echo "FlexGate installation complete"
STARTUP

# Replace placeholder in startup script
sed -i "s|INSTANCE_CONNECTION_NAME|${DB_CONNECTION_NAME}|g" /tmp/flexgate-startup.sh

# Create VM instance
print_header "Step 7: Creating Compute Engine VM"

INSTANCE_NAME="${PROJECT_NAME}-vm-${ENVIRONMENT}"

if ! gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" &>/dev/null; then
    print_info "Creating VM instance..."
    
    gcloud compute instances create "$INSTANCE_NAME" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --subnet="$SUBNET_NAME" \
        --network-tier=PREMIUM \
        --maintenance-policy=MIGRATE \
        --image-family="$IMAGE_FAMILY" \
        --image-project="$IMAGE_PROJECT" \
        --boot-disk-size="$BOOT_DISK_SIZE" \
        --boot-disk-type=pd-standard \
        --scopes=https://www.googleapis.com/auth/cloud-platform \
        --tags="${PROJECT_NAME}-${ENVIRONMENT}" \
        --metadata-from-file=startup-script=/tmp/flexgate-startup.sh \
        --labels="environment=${ENVIRONMENT},project=${PROJECT_NAME}"
    
    print_success "VM instance created: $INSTANCE_NAME"
else
    print_success "Using existing VM instance: $INSTANCE_NAME"
fi

# Get external IP
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

print_success "VM is running at: $EXTERNAL_IP"

# Save configuration
print_header "Step 8: Saving Configuration"

CONFIG_FILE="flexgate-gcp-${ENVIRONMENT}.conf"

cat > "$CONFIG_FILE" << EOF
# FlexGate GCP Deployment Configuration
# Environment: ${ENVIRONMENT}
# Created: $(date)

# GCP Project
PROJECT_ID=$PROJECT_ID
REGION=$REGION
ZONE=$ZONE

# Network
NETWORK_NAME=$NETWORK_NAME
SUBNET_NAME=$SUBNET_NAME

# VM Instance
INSTANCE_NAME=$INSTANCE_NAME
EXTERNAL_IP=$EXTERNAL_IP

# Cloud SQL
DB_INSTANCE_NAME=$DB_INSTANCE_NAME
DB_CONNECTION_NAME=$DB_CONNECTION_NAME
DB_PRIVATE_IP=$DB_PRIVATE_IP
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Redis
REDIS_INSTANCE_NAME=$REDIS_INSTANCE_NAME
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT

# SSH Access
SSH_COMMAND="gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE}"
EOF

print_success "Configuration saved to: $CONFIG_FILE"

# Generate FlexGate configuration
cat > "flexgate-gcp-${ENVIRONMENT}.json" << EOF
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "${ENVIRONMENT}"
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "${DB_NAME}",
    "user": "${DB_USER}",
    "password": "${DB_PASSWORD}",
    "ssl": false,
    "poolMin": 5,
    "poolMax": 20
  },
  "redis": {
    "host": "${REDIS_HOST}",
    "port": ${REDIS_PORT},
    "password": "",
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

print_success "FlexGate configuration saved to: flexgate-gcp-${ENVIRONMENT}.json"

# Print summary
print_header "Deployment Complete! 🎉"

cat << SUMMARY

${GREEN}✅ FlexGate has been successfully deployed to Google Cloud Platform!${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}DEPLOYMENT SUMMARY${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Environment:     ${YELLOW}${ENVIRONMENT}${NC}
Project:         ${YELLOW}${PROJECT_ID}${NC}
Region:          ${YELLOW}${REGION}${NC}

VM Instance:     ${YELLOW}${INSTANCE_NAME}${NC}
External IP:     ${YELLOW}${EXTERNAL_IP}${NC}

Database:        ${YELLOW}${DB_PRIVATE_IP}${NC} (via Cloud SQL Proxy)
Redis:           ${YELLOW}${REDIS_HOST}:${REDIS_PORT}${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}NEXT STEPS${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

1. SSH into the instance:
   ${GREEN}gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE}${NC}

2. Upload FlexGate configuration:
   ${GREEN}gcloud compute scp flexgate-gcp-${ENVIRONMENT}.json ${INSTANCE_NAME}:/tmp/ --zone=${ZONE}${NC}

3. Configure FlexGate:
   ${GREEN}sudo flexgate config import /tmp/flexgate-gcp-${ENVIRONMENT}.json${NC}

4. Test connections:
   ${GREEN}sudo flexgate db test${NC}
   ${GREEN}sudo flexgate redis test${NC}

5. Start Cloud SQL Proxy:
   ${GREEN}sudo systemctl start cloud-sql-proxy${NC}

6. Run migrations:
   ${GREEN}cd /opt/flexgate${NC}
   ${GREEN}sudo npm run db:migrate${NC}

7. Start FlexGate:
   ${GREEN}sudo systemctl start flexgate${NC}

8. Check status:
   ${GREEN}sudo systemctl status flexgate${NC}

9. View logs:
   ${GREEN}sudo journalctl -u flexgate -f${NC}

10. Access FlexGate:
    ${GREEN}http://${EXTERNAL_IP}:8080/health${NC}
    ${GREEN}http://${EXTERNAL_IP}:9090/metrics${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}IMPORTANT FILES${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Configuration:   ${YELLOW}${CONFIG_FILE}${NC}
FlexGate Config: ${YELLOW}flexgate-gcp-${ENVIRONMENT}.json${NC}

${YELLOW}⚠️  IMPORTANT: Keep these files secure! They contain sensitive credentials.${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${GREEN}Deployment completed successfully!${NC} 🚀

SUMMARY

print_info "Cleaning up temporary files..."
rm -f /tmp/flexgate-startup.sh

print_success "All done!"
