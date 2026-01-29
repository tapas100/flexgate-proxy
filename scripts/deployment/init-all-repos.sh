#!/bin/bash

# FlexGate Multi-Repo Initialization Script
# This script initializes all FlexGate repositories with proper structure

set -e  # Exit on error

echo "🚀 FlexGate Multi-Repo Initialization"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="$HOME/Documents/GitHub"

# Check if GitHub CLI is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ GitHub CLI not authenticated. Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Function to initialize flexgate-admin
init_admin() {
    echo -e "${BLUE}📦 Initializing flexgate-admin...${NC}"
    
    cd "$BASE_DIR"
    
    # Clone if not exists
    if [ ! -d "flexgate-admin" ]; then
        gh repo clone tapas100/flexgate-admin
    fi
    
    cd flexgate-admin
    
    # Check if already initialized
    if [ -f "package.json" ]; then
        echo -e "${YELLOW}⚠️  flexgate-admin already initialized, skipping...${NC}"
        return
    fi
    
    # Create React TypeScript app
    echo "Creating React app..."
    npx create-react-app . --template typescript
    
    # Install dependencies
    echo "Installing dependencies..."
    npm install react-router-dom @types/react-router-dom
    npm install @mui/material @emotion/react @emotion/styled
    npm install @mui/icons-material
    npm install recharts
    npm install axios
    npm install react-query
    
    # Create basic structure
    mkdir -p src/components/Layout
    mkdir -p src/components/Auth
    mkdir -p src/pages
    mkdir -p src/services
    mkdir -p src/types
    mkdir -p src/hooks
    
    # Create README
    cat > README.md << 'EOF'
# FlexGate Admin Dashboard

Modern React TypeScript admin dashboard for FlexGate API Gateway.

## Features
- Real-time metrics visualization
- Visual route editor
- Log viewer
- User management
- Billing & subscription management

## Tech Stack
- React 18
- TypeScript
- Material-UI
- Recharts
- React Query
- React Router

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

## Build for Production

\`\`\`bash
npm run build
\`\`\`

## Deployment

Deploy to Vercel or Netlify:

\`\`\`bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod
\`\`\`
EOF

    # Commit and push
    git add .
    git commit -m "feat: Initial React TypeScript setup with dependencies"
    git push origin main
    
    echo -e "${GREEN}✅ flexgate-admin initialized!${NC}"
    echo ""
}

# Function to initialize flexgate-docs
init_docs() {
    echo -e "${BLUE}📚 Initializing flexgate-docs...${NC}"
    
    cd "$BASE_DIR"
    
    # Clone if not exists
    if [ ! -d "flexgate-docs" ]; then
        gh repo clone tapas100/flexgate-docs
    fi
    
    cd flexgate-docs
    
    # Check if already initialized
    if [ -f "docusaurus.config.js" ] || [ -f "docusaurus.config.ts" ]; then
        echo -e "${YELLOW}⚠️  flexgate-docs already initialized, skipping...${NC}"
        return
    fi
    
    # Create Docusaurus site
    echo "Creating Docusaurus site..."
    npx create-docusaurus@latest . classic --typescript
    
    # Create documentation structure
    mkdir -p docs/getting-started
    mkdir -p docs/api
    mkdir -p docs/guides
    mkdir -p docs/enterprise
    mkdir -p docs/tutorials
    
    # Create initial docs
    cat > docs/getting-started/installation.md << 'EOF'
---
sidebar_position: 1
---

# Installation

Get started with FlexGate in minutes.

## Prerequisites

- Node.js 18+
- Redis (optional, for rate limiting)

## Quick Install

\`\`\`bash
npm install -g flexgate-proxy
flexgate start
\`\`\`

## Docker

\`\`\`bash
docker run -p 8080:8080 flexgate/proxy:latest
\`\`\`

## Next Steps

- [Configuration](./configuration.md)
- [Quick Start Guide](./quick-start.md)
EOF

    cat > docs/getting-started/quick-start.md << 'EOF'
---
sidebar_position: 2
---

# Quick Start

Learn the basics of FlexGate in 5 minutes.

## Create Your First Route

\`\`\`yaml
routes:
  - path: /api/*
    upstream: https://api.example.com
    methods: [GET, POST]
    rateLimit:
      requests: 100
      window: 60s
\`\`\`

## Test It

\`\`\`bash
curl http://localhost:8080/api/users
\`\`\`

## View Metrics

Visit: http://localhost:8080/metrics
EOF

    # Update README
    cat > README.md << 'EOF'
# FlexGate Documentation

Official documentation for FlexGate API Gateway.

Built with [Docusaurus](https://docusaurus.io/).

## Development

\`\`\`bash
npm install
npm start
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Deployment

This site is deployed to Vercel/Netlify automatically on push to main.
EOF

    # Commit and push
    git add .
    git commit -m "docs: Initial Docusaurus setup with basic structure"
    git push origin main
    
    echo -e "${GREEN}✅ flexgate-docs initialized!${NC}"
    echo ""
}

# Function to initialize flexgate-marketplace
init_marketplace() {
    echo -e "${BLUE}🏪 Initializing flexgate-marketplace...${NC}"
    
    cd "$BASE_DIR"
    
    # Clone if not exists
    if [ ! -d "flexgate-marketplace" ]; then
        gh repo clone tapas100/flexgate-marketplace
    fi
    
    cd flexgate-marketplace
    
    # Create structure
    mkdir -p aws/cloudformation
    mkdir -p aws/ami
    mkdir -p azure/arm-templates
    mkdir -p digitalocean
    mkdir -p gcp/deployment-manager
    
    # Create placeholder files
    cat > README.md << 'EOF'
# FlexGate Marketplace Integrations

Cloud marketplace listings and deployment templates for FlexGate.

## Supported Platforms

- AWS Marketplace
- Azure Marketplace
- DigitalOcean Marketplace
- Google Cloud Marketplace

## Directory Structure

- `aws/` - AWS CloudFormation templates and AMI builds
- `azure/` - Azure ARM templates
- `digitalocean/` - DigitalOcean 1-Click App
- `gcp/` - Google Cloud Deployment Manager

## Status

🚧 Coming in Phase 3 (Q4 2026)
EOF

    cat > aws/README.md << 'EOF'
# AWS Marketplace Integration

FlexGate deployment on AWS Marketplace.

## Components

- CloudFormation templates
- AMI build scripts
- Lambda functions for auto-scaling

## Status

📋 Planned for Q4 2026
EOF

    # Only commit if there are changes
    if [[ -n $(git status -s) ]]; then
        git add .
        git commit -m "chore: Initial marketplace structure"
        git push origin main
        echo -e "${GREEN}✅ flexgate-marketplace initialized!${NC}"
    else
        echo -e "${YELLOW}⚠️  flexgate-marketplace already initialized${NC}"
    fi
    echo ""
}

# Function to initialize flexgate-agent
init_agent() {
    echo -e "${BLUE}🤖 Initializing flexgate-agent...${NC}"
    
    cd "$BASE_DIR"
    
    # Clone if not exists
    if [ ! -d "flexgate-agent" ]; then
        gh repo clone tapas100/flexgate-agent
    fi
    
    cd flexgate-agent
    
    # Check if Go module exists
    if [ -f "go.mod" ]; then
        echo -e "${YELLOW}⚠️  flexgate-agent already initialized, skipping...${NC}"
        return
    fi
    
    # Initialize Go module
    echo "Initializing Go module..."
    go mod init github.com/tapas100/flexgate-agent
    
    # Create structure
    mkdir -p cmd/agent
    mkdir -p internal/agent
    mkdir -p internal/config
    mkdir -p internal/metrics
    mkdir -p internal/sync
    mkdir -p pkg/api
    mkdir -p proto
    
    # Create main.go
    cat > cmd/agent/main.go << 'EOF'
package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	fmt.Println("FlexGate Agent v0.1.0")
	
	// TODO: Initialize agent
	
	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	
	log.Println("Shutting down agent...")
}
EOF

    # Create README
    cat > README.md << 'EOF'
# FlexGate Agent

Distributed edge agent for FlexGate API Gateway.

## Features

- Metrics collection and reporting
- Configuration synchronization
- Health checks
- Auto-update mechanism

## Tech Stack

- Go 1.21+
- gRPC
- Protocol Buffers

## Build

\`\`\`bash
go build -o bin/agent ./cmd/agent
\`\`\`

## Run

\`\`\`bash
./bin/agent --config config.yaml
\`\`\`

## Status

🚧 Coming in Phase 4 (Q1 2027)
EOF

    # Create .gitignore
    cat > .gitignore << 'EOF'
# Binaries
bin/
*.exe
*.dll
*.so
*.dylib

# Test coverage
*.out
coverage.txt

# Go workspace
go.work

# IDE
.idea/
.vscode/
EOF

    # Commit and push
    git add .
    git commit -m "feat: Initial Go project structure"
    git push origin main
    
    echo -e "${GREEN}✅ flexgate-agent initialized!${NC}"
    echo ""
}

# Function to initialize flexgate-ai
init_ai() {
    echo -e "${BLUE}🧠 Initializing flexgate-ai...${NC}"
    
    cd "$BASE_DIR"
    
    # Clone if not exists
    if [ ! -d "flexgate-ai" ]; then
        gh repo clone tapas100/flexgate-ai
    fi
    
    cd flexgate-ai
    
    # Check if already initialized
    if [ -f "requirements.txt" ]; then
        echo -e "${YELLOW}⚠️  flexgate-ai already initialized, skipping...${NC}"
        return
    fi
    
    # Create structure
    mkdir -p src/api
    mkdir -p src/models
    mkdir -p src/training
    mkdir -p src/inference
    mkdir -p data
    mkdir -p notebooks
    mkdir -p tests
    
    # Create requirements.txt
    cat > requirements.txt << 'EOF'
# FastAPI
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.0

# ML Libraries
scikit-learn==1.4.0
numpy==1.26.0
pandas==2.1.0
tensorflow==2.15.0

# Monitoring
prometheus-client==0.19.0

# Testing
pytest==7.4.0
pytest-cov==4.1.0
EOF

    # Create main.py
    cat > src/api/main.py << 'EOF'
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="FlexGate AI Services", version="0.1.0")

class PredictionRequest(BaseModel):
    data: dict

@app.get("/")
def read_root():
    return {"message": "FlexGate AI Services", "version": "0.1.0"}

@app.post("/predict/anomaly")
def predict_anomaly(request: PredictionRequest):
    # TODO: Implement anomaly detection
    return {"anomaly": False, "confidence": 0.0}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

    # Create README
    cat > README.md << 'EOF'
# FlexGate AI Services

ML-powered services for FlexGate API Gateway.

## Features

- Traffic anomaly detection
- Intelligent routing
- Predictive auto-scaling
- Security threat detection

## Tech Stack

- Python 3.11+
- FastAPI
- TensorFlow
- scikit-learn

## Setup

\`\`\`bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
\`\`\`

## Run

\`\`\`bash
python src/api/main.py
\`\`\`

## Test

\`\`\`bash
pytest
\`\`\`

## Status

🚧 Coming in Phase 4 (Q2 2027)
EOF

    # Create .gitignore
    cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
.Python
venv/
env/
*.egg-info/

# Jupyter
.ipynb_checkpoints

# Models
*.h5
*.pkl
*.joblib

# Data
data/*.csv
data/*.json
!data/.gitkeep

# IDE
.idea/
.vscode/
EOF

    # Create empty data directory
    touch data/.gitkeep
    
    # Commit and push
    git add .
    git commit -m "feat: Initial Python FastAPI structure"
    git push origin main
    
    echo -e "${GREEN}✅ flexgate-ai initialized!${NC}"
    echo ""
}

# Main execution
echo "This script will initialize the following repositories:"
echo "  1. flexgate-admin (React TypeScript)"
echo "  2. flexgate-docs (Docusaurus)"
echo "  3. flexgate-marketplace (Cloud integrations)"
echo "  4. flexgate-agent (Go)"
echo "  5. flexgate-ai (Python FastAPI)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Starting initialization..."
echo ""

# Initialize all repos
init_admin
init_docs
init_marketplace
init_agent
init_ai

echo ""
echo -e "${GREEN}🎉 All repositories initialized successfully!${NC}"
echo ""
echo "Repositories:"
echo "  - flexgate-proxy: $BASE_DIR/flexgate-proxy (already exists)"
echo "  - flexgate-admin: $BASE_DIR/flexgate-admin"
echo "  - flexgate-docs: $BASE_DIR/flexgate-docs"
echo "  - flexgate-marketplace: $BASE_DIR/flexgate-marketplace"
echo "  - flexgate-agent: $BASE_DIR/flexgate-agent"
echo "  - flexgate-ai: $BASE_DIR/flexgate-ai"
echo ""
echo "Next steps:"
echo "  1. cd $BASE_DIR/flexgate-proxy && git checkout feature/admin-ui-foundation"
echo "  2. Continue Phase 2 development"
echo ""
