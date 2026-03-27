#!/bin/bash

#################################################################################
# FlexGate AWS EC2 Deployment Script
#
# This script automates the deployment of FlexGate on AWS EC2 instances.
# It handles:
# - EC2 instance creation
# - Security group configuration
# - RDS PostgreSQL setup
# - ElastiCache Redis setup
# - FlexGate installation and configuration
#
# Prerequisites:
# - AWS CLI configured (aws configure)
# - SSH key pair created in AWS
# - IAM permissions for EC2, RDS, ElastiCache, VPC
#
# Usage:
#   ./deploy-aws.sh [environment]
#
# Example:
#   ./deploy-aws.sh production
#################################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_header() { echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Configuration
ENVIRONMENT="${1:-production}"
PROJECT_NAME="flexgate"
REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"
VOLUME_SIZE="${VOLUME_SIZE:-20}"
KEY_NAME="${KEY_NAME:-flexgate-${ENVIRONMENT}}"

# Database configuration
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t3.micro}"
DB_STORAGE="${DB_STORAGE:-20}"
DB_ENGINE_VERSION="${DB_ENGINE_VERSION:-15.3}"

# Redis configuration
REDIS_NODE_TYPE="${REDIS_NODE_TYPE:-cache.t3.micro}"
REDIS_ENGINE_VERSION="${REDIS_ENGINE_VERSION:-7.0}"

# Tags
TAG_ENV="Environment=${ENVIRONMENT}"
TAG_PROJECT="Project=${PROJECT_NAME}"

print_header "FlexGate AWS Deployment - ${ENVIRONMENT}"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS CLI is not configured. Run 'aws configure' first."
    exit 1
fi

print_success "Prerequisites check passed"

# Get or create VPC
print_header "Step 1: VPC Configuration"

VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=tag:Name,Values=${PROJECT_NAME}-vpc-${ENVIRONMENT}" \
    --query 'Vpcs[0].VpcId' \
    --output text 2>/dev/null)

if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
    print_info "Creating new VPC..."
    
    VPC_ID=$(aws ec2 create-vpc \
        --cidr-block 10.0.0.0/16 \
        --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${PROJECT_NAME}-vpc-${ENVIRONMENT}},{Key=${TAG_ENV}},{Key=${TAG_PROJECT}}]" \
        --query 'Vpc.VpcId' \
        --output text)
    
    # Enable DNS hostnames
    aws ec2 modify-vpc-attribute \
        --vpc-id "$VPC_ID" \
        --enable-dns-hostnames
    
    print_success "VPC created: $VPC_ID"
else
    print_success "Using existing VPC: $VPC_ID"
fi

# Create Internet Gateway
print_info "Setting up Internet Gateway..."

IGW_ID=$(aws ec2 describe-internet-gateways \
    --filters "Name=tag:Name,Values=${PROJECT_NAME}-igw-${ENVIRONMENT}" \
    --query 'InternetGateways[0].InternetGatewayId' \
    --output text 2>/dev/null)

if [ "$IGW_ID" = "None" ] || [ -z "$IGW_ID" ]; then
    IGW_ID=$(aws ec2 create-internet-gateway \
        --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${PROJECT_NAME}-igw-${ENVIRONMENT}}]" \
        --query 'InternetGateway.InternetGatewayId' \
        --output text)
    
    aws ec2 attach-internet-gateway \
        --vpc-id "$VPC_ID" \
        --internet-gateway-id "$IGW_ID"
    
    print_success "Internet Gateway created: $IGW_ID"
else
    print_success "Using existing Internet Gateway: $IGW_ID"
fi

# Create public subnet
print_info "Creating public subnet..."

PUBLIC_SUBNET_ID=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=${PROJECT_NAME}-public-subnet-${ENVIRONMENT}" \
    --query 'Subnets[0].SubnetId' \
    --output text 2>/dev/null)

if [ "$PUBLIC_SUBNET_ID" = "None" ] || [ -z "$PUBLIC_SUBNET_ID" ]; then
    PUBLIC_SUBNET_ID=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" \
        --cidr-block 10.0.1.0/24 \
        --availability-zone "${REGION}a" \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-public-subnet-${ENVIRONMENT}}]" \
        --query 'Subnet.SubnetId' \
        --output text)
    
    print_success "Public subnet created: $PUBLIC_SUBNET_ID"
else
    print_success "Using existing public subnet: $PUBLIC_SUBNET_ID"
fi

# Create private subnets for RDS and Redis
print_info "Creating private subnets..."

PRIVATE_SUBNET_1_ID=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=${PROJECT_NAME}-private-subnet-1-${ENVIRONMENT}" \
    --query 'Subnets[0].SubnetId' \
    --output text 2>/dev/null)

if [ "$PRIVATE_SUBNET_1_ID" = "None" ] || [ -z "$PRIVATE_SUBNET_1_ID" ]; then
    PRIVATE_SUBNET_1_ID=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" \
        --cidr-block 10.0.2.0/24 \
        --availability-zone "${REGION}a" \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-private-subnet-1-${ENVIRONMENT}}]" \
        --query 'Subnet.SubnetId' \
        --output text)
    
    print_success "Private subnet 1 created: $PRIVATE_SUBNET_1_ID"
else
    print_success "Using existing private subnet 1: $PRIVATE_SUBNET_1_ID"
fi

PRIVATE_SUBNET_2_ID=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=${PROJECT_NAME}-private-subnet-2-${ENVIRONMENT}" \
    --query 'Subnets[0].SubnetId' \
    --output text 2>/dev/null)

if [ "$PRIVATE_SUBNET_2_ID" = "None" ] || [ -z "$PRIVATE_SUBNET_2_ID" ]; then
    PRIVATE_SUBNET_2_ID=$(aws ec2 create-subnet \
        --vpc-id "$VPC_ID" \
        --cidr-block 10.0.3.0/24 \
        --availability-zone "${REGION}b" \
        --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT_NAME}-private-subnet-2-${ENVIRONMENT}}]" \
        --query 'Subnet.SubnetId' \
        --output text)
    
    print_success "Private subnet 2 created: $PRIVATE_SUBNET_2_ID"
else
    print_success "Using existing private subnet 2: $PRIVATE_SUBNET_2_ID"
fi

# Create route table and associate with public subnet
print_info "Configuring route tables..."

ROUTE_TABLE_ID=$(aws ec2 create-route-table \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${PROJECT_NAME}-public-rt-${ENVIRONMENT}}]" \
    --query 'RouteTable.RouteTableId' \
    --output text 2>/dev/null || \
    aws ec2 describe-route-tables \
        --filters "Name=tag:Name,Values=${PROJECT_NAME}-public-rt-${ENVIRONMENT}" \
        --query 'RouteTables[0].RouteTableId' \
        --output text)

aws ec2 create-route \
    --route-table-id "$ROUTE_TABLE_ID" \
    --destination-cidr-block 0.0.0.0/0 \
    --gateway-id "$IGW_ID" 2>/dev/null || true

aws ec2 associate-route-table \
    --subnet-id "$PUBLIC_SUBNET_ID" \
    --route-table-id "$ROUTE_TABLE_ID" 2>/dev/null || true

print_success "Route table configured"

# Create security groups
print_header "Step 2: Security Groups"

# EC2 security group
print_info "Creating EC2 security group..."

EC2_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT_NAME}-ec2-sg-${ENVIRONMENT}" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null)

if [ "$EC2_SG_ID" = "None" ] || [ -z "$EC2_SG_ID" ]; then
    EC2_SG_ID=$(aws ec2 create-security-group \
        --group-name "${PROJECT_NAME}-ec2-sg-${ENVIRONMENT}" \
        --description "Security group for FlexGate EC2 instances" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' \
        --output text)
    
    # Allow SSH
    aws ec2 authorize-security-group-ingress \
        --group-id "$EC2_SG_ID" \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0
    
    # Allow HTTP
    aws ec2 authorize-security-group-ingress \
        --group-id "$EC2_SG_ID" \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0
    
    # Allow HTTPS
    aws ec2 authorize-security-group-ingress \
        --group-id "$EC2_SG_ID" \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0
    
    # Allow FlexGate API
    aws ec2 authorize-security-group-ingress \
        --group-id "$EC2_SG_ID" \
        --protocol tcp \
        --port 8080 \
        --cidr 0.0.0.0/0
    
    # Allow Prometheus metrics
    aws ec2 authorize-security-group-ingress \
        --group-id "$EC2_SG_ID" \
        --protocol tcp \
        --port 9090 \
        --cidr 0.0.0.0/0
    
    print_success "EC2 security group created: $EC2_SG_ID"
else
    print_success "Using existing EC2 security group: $EC2_SG_ID"
fi

# RDS security group
print_info "Creating RDS security group..."

RDS_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT_NAME}-rds-sg-${ENVIRONMENT}" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null)

if [ "$RDS_SG_ID" = "None" ] || [ -z "$RDS_SG_ID" ]; then
    RDS_SG_ID=$(aws ec2 create-security-group \
        --group-name "${PROJECT_NAME}-rds-sg-${ENVIRONMENT}" \
        --description "Security group for FlexGate RDS" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' \
        --output text)
    
    # Allow PostgreSQL from EC2
    aws ec2 authorize-security-group-ingress \
        --group-id "$RDS_SG_ID" \
        --protocol tcp \
        --port 5432 \
        --source-group "$EC2_SG_ID"
    
    print_success "RDS security group created: $RDS_SG_ID"
else
    print_success "Using existing RDS security group: $RDS_SG_ID"
fi

# Redis security group
print_info "Creating Redis security group..."

REDIS_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT_NAME}-redis-sg-${ENVIRONMENT}" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null)

if [ "$REDIS_SG_ID" = "None" ] || [ -z "$REDIS_SG_ID" ]; then
    REDIS_SG_ID=$(aws ec2 create-security-group \
        --group-name "${PROJECT_NAME}-redis-sg-${ENVIRONMENT}" \
        --description "Security group for FlexGate Redis" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' \
        --output text)
    
    # Allow Redis from EC2
    aws ec2 authorize-security-group-ingress \
        --group-id "$REDIS_SG_ID" \
        --protocol tcp \
        --port 6379 \
        --source-group "$EC2_SG_ID"
    
    print_success "Redis security group created: $REDIS_SG_ID"
else
    print_success "Using existing Redis security group: $REDIS_SG_ID"
fi

# Create RDS subnet group
print_header "Step 3: RDS PostgreSQL Setup"

print_info "Creating RDS subnet group..."

aws rds create-db-subnet-group \
    --db-subnet-group-name "${PROJECT_NAME}-subnet-group-${ENVIRONMENT}" \
    --db-subnet-group-description "Subnet group for FlexGate RDS" \
    --subnet-ids "$PRIVATE_SUBNET_1_ID" "$PRIVATE_SUBNET_2_ID" \
    --tags "Key=Name,Value=${PROJECT_NAME}-subnet-group-${ENVIRONMENT}" 2>/dev/null || \
    print_warning "RDS subnet group already exists"

# Generate database password
DB_PASSWORD=$(openssl rand -base64 32)
DB_NAME="flexgate_${ENVIRONMENT}"
DB_USERNAME="flexgate_admin"

print_info "Creating RDS PostgreSQL instance..."

RDS_IDENTIFIER="${PROJECT_NAME}-db-${ENVIRONMENT}"

aws rds create-db-instance \
    --db-instance-identifier "$RDS_IDENTIFIER" \
    --db-instance-class "$DB_INSTANCE_CLASS" \
    --engine postgres \
    --engine-version "$DB_ENGINE_VERSION" \
    --master-username "$DB_USERNAME" \
    --master-user-password "$DB_PASSWORD" \
    --allocated-storage "$DB_STORAGE" \
    --db-name "$DB_NAME" \
    --vpc-security-group-ids "$RDS_SG_ID" \
    --db-subnet-group-name "${PROJECT_NAME}-subnet-group-${ENVIRONMENT}" \
    --backup-retention-period 7 \
    --multi-az \
    --storage-encrypted \
    --tags "Key=${TAG_ENV}" "Key=${TAG_PROJECT}" 2>/dev/null || \
    print_warning "RDS instance already exists or creation failed"

print_info "Waiting for RDS instance to be available (this may take 5-10 minutes)..."

aws rds wait db-instance-available --db-instance-identifier "$RDS_IDENTIFIER"

DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_IDENTIFIER" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

print_success "RDS PostgreSQL created: $DB_ENDPOINT"

# Create ElastiCache Redis
print_header "Step 4: ElastiCache Redis Setup"

print_info "Creating ElastiCache subnet group..."

aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name "${PROJECT_NAME}-cache-subnet-group-${ENVIRONMENT}" \
    --cache-subnet-group-description "Subnet group for FlexGate Redis" \
    --subnet-ids "$PRIVATE_SUBNET_1_ID" "$PRIVATE_SUBNET_2_ID" 2>/dev/null || \
    print_warning "ElastiCache subnet group already exists"

# Generate Redis password
REDIS_PASSWORD=$(openssl rand -base64 32)

print_info "Creating ElastiCache Redis cluster..."

REDIS_CLUSTER_ID="${PROJECT_NAME}-redis-${ENVIRONMENT}"

aws elasticache create-cache-cluster \
    --cache-cluster-id "$REDIS_CLUSTER_ID" \
    --cache-node-type "$REDIS_NODE_TYPE" \
    --engine redis \
    --engine-version "$REDIS_ENGINE_VERSION" \
    --num-cache-nodes 1 \
    --cache-subnet-group-name "${PROJECT_NAME}-cache-subnet-group-${ENVIRONMENT}" \
    --security-group-ids "$REDIS_SG_ID" \
    --auth-token "$REDIS_PASSWORD" \
    --transit-encryption-enabled \
    --tags "Key=${TAG_ENV}" "Key=${TAG_PROJECT}" 2>/dev/null || \
    print_warning "Redis cluster already exists or creation failed"

print_info "Waiting for Redis cluster to be available..."

aws elasticache wait cache-cluster-available --cache-cluster-id "$REDIS_CLUSTER_ID"

REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
    --cache-cluster-id "$REDIS_CLUSTER_ID" \
    --show-cache-node-info \
    --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
    --output text)

print_success "Redis cluster created: $REDIS_ENDPOINT"

# Launch EC2 instance
print_header "Step 5: EC2 Instance Setup"

print_info "Getting latest Amazon Linux 2 AMI..."

AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" "Name=state,Values=available" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text)

print_info "Using AMI: $AMI_ID"

# Create user data script
cat > /tmp/flexgate-userdata.sh << 'EOF'
#!/bin/bash
set -e

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs git

# Install FlexGate
npm install -g flexgate-proxy

# Create systemd service
cat > /etc/systemd/system/flexgate.service << 'SERVICE'
[Unit]
Description=FlexGate API Gateway
After=network.target

[Service]
Type=simple
User=ec2-user
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

# Clone repository
cd /opt
git clone https://github.com/your-org/flexgate-proxy.git flexgate || true
cd flexgate
npm install

echo "FlexGate installation complete"
EOF

print_info "Launching EC2 instance..."

INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$EC2_SG_ID" \
    --subnet-id "$PUBLIC_SUBNET_ID" \
    --associate-public-ip-address \
    --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=${VOLUME_SIZE},VolumeType=gp3,DeleteOnTermination=true}" \
    --user-data file:///tmp/flexgate-userdata.sh \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT_NAME}-${ENVIRONMENT}},{Key=${TAG_ENV}},{Key=${TAG_PROJECT}}]" \
    --query 'Instances[0].InstanceId' \
    --output text)

print_success "EC2 instance launched: $INSTANCE_ID"

print_info "Waiting for instance to be running..."

aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

print_success "Instance is running at: $PUBLIC_IP"

# Save configuration
print_header "Step 6: Saving Configuration"

CONFIG_FILE="flexgate-aws-${ENVIRONMENT}.conf"

cat > "$CONFIG_FILE" << EOF
# FlexGate AWS Deployment Configuration
# Environment: ${ENVIRONMENT}
# Created: $(date)

# AWS Resources
VPC_ID=$VPC_ID
PUBLIC_SUBNET_ID=$PUBLIC_SUBNET_ID
PRIVATE_SUBNET_1_ID=$PRIVATE_SUBNET_1_ID
PRIVATE_SUBNET_2_ID=$PRIVATE_SUBNET_2_ID
EC2_SG_ID=$EC2_SG_ID
RDS_SG_ID=$RDS_SG_ID
REDIS_SG_ID=$REDIS_SG_ID

# EC2 Instance
INSTANCE_ID=$INSTANCE_ID
PUBLIC_IP=$PUBLIC_IP
AMI_ID=$AMI_ID

# RDS PostgreSQL
RDS_IDENTIFIER=$RDS_IDENTIFIER
DB_ENDPOINT=$DB_ENDPOINT
DB_NAME=$DB_NAME
DB_USERNAME=$DB_USERNAME
DB_PASSWORD=$DB_PASSWORD

# ElastiCache Redis
REDIS_CLUSTER_ID=$REDIS_CLUSTER_ID
REDIS_ENDPOINT=$REDIS_ENDPOINT
REDIS_PASSWORD=$REDIS_PASSWORD

# SSH Access
SSH_COMMAND="ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_IP}"

# Configuration Commands
CONFIGURE_COMMAND="flexgate config import flexgate-${ENVIRONMENT}.json"
EOF

print_success "Configuration saved to: $CONFIG_FILE"

# Generate FlexGate configuration
print_info "Generating FlexGate configuration..."

cat > "flexgate-${ENVIRONMENT}.json" << EOF
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "${ENVIRONMENT}"
  },
  "database": {
    "host": "${DB_ENDPOINT}",
    "port": 5432,
    "name": "${DB_NAME}",
    "user": "${DB_USERNAME}",
    "password": "${DB_PASSWORD}",
    "ssl": true,
    "poolMin": 5,
    "poolMax": 20
  },
  "redis": {
    "host": "${REDIS_ENDPOINT}",
    "port": 6379,
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

print_success "FlexGate configuration saved to: flexgate-${ENVIRONMENT}.json"

# Print deployment summary
print_header "Deployment Complete! 🎉"

cat << SUMMARY

${GREEN}✅ FlexGate has been successfully deployed to AWS!${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}DEPLOYMENT SUMMARY${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Environment:     ${YELLOW}${ENVIRONMENT}${NC}
Region:          ${YELLOW}${REGION}${NC}

EC2 Instance:    ${YELLOW}${INSTANCE_ID}${NC}
Public IP:       ${YELLOW}${PUBLIC_IP}${NC}

Database:        ${YELLOW}${DB_ENDPOINT}${NC}
Redis:           ${YELLOW}${REDIS_ENDPOINT}${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}NEXT STEPS${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

1. SSH into the instance:
   ${GREEN}ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_IP}${NC}

2. Upload FlexGate configuration:
   ${GREEN}scp -i ~/.ssh/${KEY_NAME}.pem flexgate-${ENVIRONMENT}.json ec2-user@${PUBLIC_IP}:/tmp/${NC}

3. Configure FlexGate:
   ${GREEN}sudo su - ec2-user${NC}
   ${GREEN}flexgate config import /tmp/flexgate-${ENVIRONMENT}.json${NC}

4. Test connections:
   ${GREEN}flexgate db test${NC}
   ${GREEN}flexgate redis test${NC}

5. Start FlexGate:
   ${GREEN}cd /opt/flexgate${NC}
   ${GREEN}npm run db:migrate${NC}
   ${GREEN}sudo systemctl start flexgate${NC}

6. Check status:
   ${GREEN}sudo systemctl status flexgate${NC}

7. View logs:
   ${GREEN}sudo journalctl -u flexgate -f${NC}

8. Access FlexGate:
   ${GREEN}http://${PUBLIC_IP}:8080/health${NC}
   ${GREEN}http://${PUBLIC_IP}:9090/metrics${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}IMPORTANT FILES${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Configuration:   ${YELLOW}${CONFIG_FILE}${NC}
FlexGate Config: ${YELLOW}flexgate-${ENVIRONMENT}.json${NC}

${YELLOW}⚠️  IMPORTANT: Keep these files secure! They contain sensitive credentials.${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${GREEN}Deployment completed successfully!${NC} 🚀

SUMMARY

print_info "Cleaning up temporary files..."
rm -f /tmp/flexgate-userdata.sh

print_success "All done!"
