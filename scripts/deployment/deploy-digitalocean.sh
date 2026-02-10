#!/bin/bash

#################################################################################
# FlexGate DigitalOcean Deployment Script
#
# This script automates the deployment of FlexGate on DigitalOcean.
# It handles:
# - Droplet creation
# - Managed PostgreSQL database setup
# - Managed Redis cluster setup
# - VPC network configuration
# - FlexGate installation and configuration
#
# Prerequisites:
# - doctl CLI installed and configured
# - DigitalOcean API token set
# - SSH key uploaded to DigitalOcean
#
# Usage:
#   ./deploy-digitalocean.sh [environment]
#
# Example:
#   ./deploy-digitalocean.sh production
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
PROJECT_NAME="flexgate"
REGION="${DO_REGION:-nyc3}"
DROPLET_SIZE="${DROPLET_SIZE:-s-2vcpu-2gb}"
IMAGE="${IMAGE:-ubuntu-22-04-x64}"

# Database configuration
DB_SIZE="${DB_SIZE:-db-s-1vcpu-1gb}"
DB_ENGINE="${DB_ENGINE:-pg}"
DB_VERSION="${DB_VERSION:-15}"

# Redis configuration
REDIS_SIZE="${REDIS_SIZE:-db-s-1vcpu-1gb}"

print_header "FlexGate DigitalOcean Deployment - ${ENVIRONMENT}"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v doctl &> /dev/null; then
    print_error "doctl CLI is not installed. Please install it first."
    exit 1
fi

if ! doctl auth list &> /dev/null; then
    print_error "doctl is not authenticated. Run 'doctl auth init' first."
    exit 1
fi

print_success "Prerequisites check passed"

# Get SSH key ID
print_info "Getting SSH key..."

SSH_KEY_ID=$(doctl compute ssh-key list --format ID --no-header | head -n 1)

if [ -z "$SSH_KEY_ID" ]; then
    print_error "No SSH keys found. Please add an SSH key to your DigitalOcean account."
    exit 1
fi

print_success "Using SSH key ID: $SSH_KEY_ID"

# Create VPC
print_header "Step 1: VPC Network Setup"

VPC_NAME="${PROJECT_NAME}-vpc-${ENVIRONMENT}"

VPC_ID=$(doctl vpcs list --format ID,Name --no-header | grep "$VPC_NAME" | awk '{print $1}')

if [ -z "$VPC_ID" ]; then
    print_info "Creating VPC..."
    
    VPC_ID=$(doctl vpcs create \
        --name "$VPC_NAME" \
        --region "$REGION" \
        --ip-range "10.0.0.0/16" \
        --format ID \
        --no-header)
    
    print_success "VPC created: $VPC_ID"
else
    print_success "Using existing VPC: $VPC_ID"
fi

# Create managed database (PostgreSQL)
print_header "Step 2: Managed PostgreSQL Setup"

DB_CLUSTER_NAME="${PROJECT_NAME}-db-${ENVIRONMENT}"
DB_NAME="flexgate_${ENVIRONMENT}"
DB_USER="flexgate_admin"

DB_CLUSTER_ID=$(doctl databases list --format ID,Name --no-header | grep "$DB_CLUSTER_NAME" | awk '{print $1}')

if [ -z "$DB_CLUSTER_ID" ]; then
    print_info "Creating PostgreSQL database cluster (this may take 10-15 minutes)..."
    
    DB_CLUSTER_ID=$(doctl databases create "$DB_CLUSTER_NAME" \
        --engine "$DB_ENGINE" \
        --version "$DB_VERSION" \
        --region "$REGION" \
        --size "$DB_SIZE" \
        --num-nodes 1 \
        --private-network-uuid "$VPC_ID" \
        --format ID \
        --no-header)
    
    print_info "Waiting for database to be ready..."
    sleep 300  # Wait 5 minutes for DB to initialize
    
    print_success "PostgreSQL cluster created: $DB_CLUSTER_ID"
else
    print_success "Using existing PostgreSQL cluster: $DB_CLUSTER_ID"
fi

# Create database
print_info "Creating database..."
doctl databases db create "$DB_CLUSTER_ID" "$DB_NAME" 2>/dev/null || print_warning "Database already exists"

# Create user
print_info "Creating database user..."
DB_PASSWORD=$(openssl rand -base64 32)
doctl databases user create "$DB_CLUSTER_ID" "$DB_USER" 2>/dev/null || print_warning "User already exists"

# Get database connection info
DB_HOST=$(doctl databases get "$DB_CLUSTER_ID" --format PrivateHost --no-header)
DB_PORT=$(doctl databases get "$DB_CLUSTER_ID" --format Port --no-header)

print_success "PostgreSQL setup complete"
print_info "Database host: $DB_HOST:$DB_PORT"

# Create managed Redis
print_header "Step 3: Managed Redis Setup"

REDIS_CLUSTER_NAME="${PROJECT_NAME}-redis-${ENVIRONMENT}"

REDIS_CLUSTER_ID=$(doctl databases list --format ID,Name --no-header | grep "$REDIS_CLUSTER_NAME" | awk '{print $1}')

if [ -z "$REDIS_CLUSTER_ID" ]; then
    print_info "Creating Redis cluster (this may take 10-15 minutes)..."
    
    REDIS_CLUSTER_ID=$(doctl databases create "$REDIS_CLUSTER_NAME" \
        --engine redis \
        --version 7 \
        --region "$REGION" \
        --size "$REDIS_SIZE" \
        --num-nodes 1 \
        --private-network-uuid "$VPC_ID" \
        --format ID \
        --no-header)
    
    print_info "Waiting for Redis to be ready..."
    sleep 300  # Wait 5 minutes for Redis to initialize
    
    print_success "Redis cluster created: $REDIS_CLUSTER_ID"
else
    print_success "Using existing Redis cluster: $REDIS_CLUSTER_ID"
fi

# Get Redis connection info
REDIS_HOST=$(doctl databases get "$REDIS_CLUSTER_ID" --format PrivateHost --no-header)
REDIS_PORT=$(doctl databases get "$REDIS_CLUSTER_ID" --format Port --no-header)
REDIS_PASSWORD=$(doctl databases get "$REDIS_CLUSTER_ID" --format Password --no-header)

print_success "Redis setup complete"
print_info "Redis host: $REDIS_HOST:$REDIS_PORT"

# Create user data script
print_header "Step 4: Creating Droplet User Data"

cat > /tmp/flexgate-userdata.sh << 'USERDATA'
#!/bin/bash
set -e

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs git

# Install FlexGate
npm install -g flexgate-proxy

# Create FlexGate directory
mkdir -p /opt/flexgate
cd /opt/flexgate

# Clone repository
git clone https://github.com/your-org/flexgate-proxy.git . || true
npm install

# Create systemd service
cat > /etc/systemd/system/flexgate.service << 'SERVICE'
[Unit]
Description=FlexGate API Gateway
After=network.target

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
systemctl enable flexgate

echo "FlexGate installation complete"
USERDATA

# Create Droplet
print_header "Step 5: Creating Droplet"

DROPLET_NAME="${PROJECT_NAME}-droplet-${ENVIRONMENT}"

DROPLET_ID=$(doctl compute droplet list --format ID,Name --no-header | grep "$DROPLET_NAME" | awk '{print $1}')

if [ -z "$DROPLET_ID" ]; then
    print_info "Creating Droplet..."
    
    DROPLET_ID=$(doctl compute droplet create "$DROPLET_NAME" \
        --region "$REGION" \
        --size "$DROPLET_SIZE" \
        --image "$IMAGE" \
        --vpc-uuid "$VPC_ID" \
        --ssh-keys "$SSH_KEY_ID" \
        --user-data-file /tmp/flexgate-userdata.sh \
        --tag-names "${PROJECT_NAME},${ENVIRONMENT}" \
        --enable-monitoring \
        --enable-private-networking \
        --format ID \
        --no-header \
        --wait)
    
    print_success "Droplet created: $DROPLET_ID"
else
    print_success "Using existing Droplet: $DROPLET_ID"
fi

# Get Droplet IP
DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)
DROPLET_PRIVATE_IP=$(doctl compute droplet get "$DROPLET_ID" --format PrivateIPv4 --no-header)

print_success "Droplet is running at: $DROPLET_IP"

# Add Droplet to database trusted sources
print_info "Adding Droplet to database trusted sources..."
doctl databases firewalls append "$DB_CLUSTER_ID" --rule "droplet:$DROPLET_ID"
doctl databases firewalls append "$REDIS_CLUSTER_ID" --rule "droplet:$DROPLET_ID"

# Save configuration
print_header "Step 6: Saving Configuration"

CONFIG_FILE="flexgate-do-${ENVIRONMENT}.conf"

cat > "$CONFIG_FILE" << EOF
# FlexGate DigitalOcean Deployment Configuration
# Environment: ${ENVIRONMENT}
# Created: $(date)

# DigitalOcean Resources
REGION=$REGION
VPC_ID=$VPC_ID

# Droplet
DROPLET_ID=$DROPLET_ID
DROPLET_NAME=$DROPLET_NAME
DROPLET_IP=$DROPLET_IP
DROPLET_PRIVATE_IP=$DROPLET_PRIVATE_IP

# PostgreSQL
DB_CLUSTER_ID=$DB_CLUSTER_ID
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Redis
REDIS_CLUSTER_ID=$REDIS_CLUSTER_ID
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASSWORD

# SSH Access
SSH_COMMAND="ssh root@${DROPLET_IP}"
EOF

print_success "Configuration saved to: $CONFIG_FILE"

# Generate FlexGate configuration
cat > "flexgate-do-${ENVIRONMENT}.json" << EOF
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "${ENVIRONMENT}"
  },
  "database": {
    "host": "${DB_HOST}",
    "port": ${DB_PORT},
    "name": "${DB_NAME}",
    "user": "${DB_USER}",
    "password": "${DB_PASSWORD}",
    "ssl": true,
    "poolMin": 5,
    "poolMax": 20
  },
  "redis": {
    "host": "${REDIS_HOST}",
    "port": ${REDIS_PORT},
    "password": "${REDIS_PASSWORD}",
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

print_success "FlexGate configuration saved to: flexgate-do-${ENVIRONMENT}.json"

# Print summary
print_header "Deployment Complete! 🎉"

cat << SUMMARY

${GREEN}✅ FlexGate has been successfully deployed to DigitalOcean!${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}DEPLOYMENT SUMMARY${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Environment:     ${YELLOW}${ENVIRONMENT}${NC}
Region:          ${YELLOW}${REGION}${NC}

Droplet:         ${YELLOW}${DROPLET_NAME}${NC}
Public IP:       ${YELLOW}${DROPLET_IP}${NC}
Private IP:      ${YELLOW}${DROPLET_PRIVATE_IP}${NC}

Database:        ${YELLOW}${DB_HOST}:${DB_PORT}${NC}
Redis:           ${YELLOW}${REDIS_HOST}:${REDIS_PORT}${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}NEXT STEPS${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

1. SSH into the Droplet:
   ${GREEN}ssh root@${DROPLET_IP}${NC}

2. Upload FlexGate configuration:
   ${GREEN}scp flexgate-do-${ENVIRONMENT}.json root@${DROPLET_IP}:/tmp/${NC}

3. Configure FlexGate:
   ${GREEN}flexgate config import /tmp/flexgate-do-${ENVIRONMENT}.json${NC}

4. Test connections:
   ${GREEN}flexgate db test${NC}
   ${GREEN}flexgate redis test${NC}

5. Run migrations:
   ${GREEN}cd /opt/flexgate${NC}
   ${GREEN}npm run db:migrate${NC}

6. Start FlexGate:
   ${GREEN}systemctl start flexgate${NC}

7. Check status:
   ${GREEN}systemctl status flexgate${NC}

8. View logs:
   ${GREEN}journalctl -u flexgate -f${NC}

9. Access FlexGate:
   ${GREEN}http://${DROPLET_IP}:8080/health${NC}
   ${GREEN}http://${DROPLET_IP}:9090/metrics${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}IMPORTANT FILES${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Configuration:   ${YELLOW}${CONFIG_FILE}${NC}
FlexGate Config: ${YELLOW}flexgate-do-${ENVIRONMENT}.json${NC}

${YELLOW}⚠️  IMPORTANT: Keep these files secure! They contain sensitive credentials.${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${GREEN}Deployment completed successfully!${NC} 🚀

SUMMARY

print_info "Cleaning up temporary files..."
rm -f /tmp/flexgate-userdata.sh

print_success "All done!"
