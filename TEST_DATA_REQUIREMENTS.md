# Test Data Requirements & Generation Plan 📊

**Purpose**: Define and generate test data for all testing scenarios  
**Date**: February 16, 2026  
**Status**: Ready for Implementation

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Test Data Categories](#test-data-categories)
3. [Data Generation Scripts](#data-generation-scripts)
4. [Manual Test Data Setup](#manual-test-data-setup)
5. [Database Seed Files](#database-seed-files)
6. [API-Based Data Generation](#api-based-data-generation)
7. [Data Cleanup](#data-cleanup)

---

## Overview

### Test Data Needed

For comprehensive testing, we need:

1. **Routes** (10-15 test routes)
2. **API Keys** (5-10 keys with different permissions)
3. **Webhooks** (5-8 webhooks for different events)
4. **AI Incidents** (50-100 incidents with various states)
5. **AI Recommendations** (150-300 recommendations)
6. **AI Action Outcomes** (50-100 outcomes)
7. **Webhook Deliveries** (100-200 delivery records)
8. **Metrics Data** (Time-series data for charts)

---

## Test Data Categories

### 1. Routes (Core Proxy)

**Required Routes**:

| Route Path | Upstream | Methods | Purpose |
|------------|----------|---------|---------|
| `/httpbin/*` | httpbin.org | ALL | General testing |
| `/test-route` | httpbin.org | GET, POST | Basic proxying |
| `/limited-route` | httpbin.org | GET | Rate limit testing |
| `/slow-route` | httpbin.org | GET | Timeout testing |
| `/failing-route` | httpbin.org | GET | Circuit breaker testing |
| `/auth-route` | httpbin.org | GET | Authentication testing |
| `/api/users` | httpbin.org | GET, POST, PUT, DELETE | CRUD testing |
| `/api/products` | httpbin.org | GET, POST | Mock API testing |

**Special Configurations**:
- **Rate Limited Route**: 10 requests/minute
- **Slow Route**: 10s timeout
- **Circuit Breaker Route**: Enabled with low threshold

---

### 2. API Keys

**Required Keys**:

| Key Name | Prefix | Permissions | Status | Purpose |
|----------|--------|-------------|--------|---------|
| Admin Key | `admin_` | All | Active | Full access testing |
| Read-Only Key | `ro_` | Read | Active | Read-only testing |
| Test Key | `test_` | All | Active | General testing |
| Expired Key | `exp_` | All | Expired | Auth failure testing |
| Disabled Key | `dis_` | All | Disabled | Auth failure testing |
| Limited Key | `lim_` | Routes only | Active | Permission testing |

---

### 3. Webhooks

**Required Webhooks**:

| Name | URL | Events | Status | Purpose |
|------|-----|--------|--------|---------|
| Test Webhook | webhook.site | All | Active | General event testing |
| Circuit Breaker Hook | webhook.site | circuit_breaker.* | Active | CB event testing |
| Rate Limit Hook | webhook.site | rate_limit.* | Active | RL event testing |
| AI Incident Hook | webhook.site | ai_incident.* | Active | AI event testing |
| Failing Hook | invalid.example.com | All | Active | Retry testing |
| Disabled Hook | webhook.site | All | Disabled | Status testing |

---

### 4. AI Incidents

**Distribution Needed**:

**By Event Type** (Total: 100 incidents):
- LATENCY_ANOMALY: 25 incidents
- ERROR_SPIKE: 20 incidents
- MEMORY_LEAK: 15 incidents
- CPU_SPIKE: 12 incidents
- TRAFFIC_SURGE: 10 incidents
- DATABASE_SLOW: 8 incidents
- DEPLOYMENT_ISSUE: 5 incidents
- SECURITY_ALERT: 3 incidents
- CONFIG_DRIFT: 2 incidents

**By Severity**:
- CRITICAL: 15 incidents
- WARNING: 45 incidents
- INFO: 40 incidents

**By Status**:
- OPEN: 10 incidents
- INVESTIGATING: 8 incidents
- RESOLVED: 75 incidents
- FALSE_POSITIVE: 7 incidents

**Time Distribution**:
- Last 24 hours: 15 incidents
- Last 7 days: 35 incidents
- Last 30 days: 50 incidents
- Older: 0 incidents (for testing)

---

### 5. AI Recommendations

**Per Incident**: 3-5 recommendations
**Total**: ~350 recommendations

**Action Types Distribution**:
- RESTART_SERVICE: 100
- SCALE_UP: 80
- SCALE_DOWN: 30
- ADJUST_CONFIG: 60
- ROLLBACK_DEPLOYMENT: 40
- INVESTIGATE: 40

**Confidence Scores**:
- High (0.8-1.0): 150
- Medium (0.5-0.79): 150
- Low (0.0-0.49): 50

**User Decisions**:
- ACCEPTED: 210 (60%)
- REJECTED: 70 (20%)
- MODIFIED: 70 (20%)

---

### 6. AI Action Outcomes

**Per Resolved Incident**: 1-2 outcomes
**Total**: ~100 outcomes

**Outcome Status**:
- RESOLVED: 80
- FAILED: 10
- PARTIALLY_RESOLVED: 10

**Improvement Distribution**:
- 90-100%: 40 outcomes
- 70-89%: 30 outcomes
- 50-69%: 10 outcomes
- 0-49%: 10 outcomes (failed)
- NULL: 10 outcomes (in progress)

---

### 7. Webhook Deliveries

**Total**: 200 deliveries

**By Status**:
- SUCCESS (200-299): 160
- FAILURE (400-599): 30
- TIMEOUT: 10

**By Event Type**:
- request.success: 50
- request.error: 20
- circuit_breaker.opened: 15
- circuit_breaker.closed: 15
- rate_limit.exceeded: 25
- ai_incident.created: 30
- ai_incident.resolved: 25
- Other events: 20

---

## Data Generation Scripts

### Script 1: Complete Test Data Generator

**Location**: `scripts/testing/generate-test-data.js`

```javascript
#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const { faker } = require('@faker-js/faker');

const BASE_URL = 'http://localhost:8080';

// Configuration
const CONFIG = {
  routes: 8,
  apiKeys: 6,
  webhooks: 6,
  incidents: 100,
  recommendationsPerIncident: 3,
  outcomesPerResolvedIncident: 1,
};

async function generateRoutes() {
  console.log(chalk.blue('\n📍 Generating Routes...'));
  
  const routes = [
    {
      path: '/test-route',
      upstream: 'httpbin',
      methods: ['GET', 'POST'],
      enabled: true,
    },
    {
      path: '/limited-route',
      upstream: 'httpbin',
      methods: ['GET'],
      enabled: true,
      rateLimit: { enabled: true, max: 10, windowMs: 60000 },
    },
    {
      path: '/slow-route',
      upstream: 'httpbin',
      methods: ['GET'],
      enabled: true,
      timeout: 10000,
    },
    {
      path: '/failing-route',
      upstream: 'httpbin',
      methods: ['GET'],
      enabled: true,
      circuitBreaker: { 
        enabled: true, 
        failureThreshold: 30,
        volumeThreshold: 5,
      },
    },
    // Add more routes...
  ];

  for (const route of routes) {
    try {
      await axios.post(`${BASE_URL}/api/routes`, route);
      console.log(chalk.green(`  ✓ Created route: ${route.path}`));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Route exists: ${route.path}`));
    }
  }
}

async function generateAPIKeys() {
  console.log(chalk.blue('\n🔑 Generating API Keys...'));
  
  const keys = [
    { name: 'Admin Key', keyPrefix: 'admin_', enabled: true },
    { name: 'Test Key', keyPrefix: 'test_', enabled: true },
    { name: 'Read-Only Key', keyPrefix: 'ro_', enabled: true },
    { name: 'Disabled Key', keyPrefix: 'dis_', enabled: false },
    { name: 'Limited Key', keyPrefix: 'lim_', enabled: true },
  ];

  for (const key of keys) {
    try {
      const response = await axios.post(`${BASE_URL}/api/keys`, key);
      console.log(chalk.green(`  ✓ Created API key: ${key.name}`));
      console.log(chalk.gray(`    Key: ${response.data.apiKey}`));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Key exists: ${key.name}`));
    }
  }
}

async function generateWebhooks() {
  console.log(chalk.blue('\n🪝 Generating Webhooks...'));
  
  // Get webhook.site URL (you'll need to manually create one)
  const webhookSiteUrl = process.env.WEBHOOK_SITE_URL || 'https://webhook.site/unique-id';
  
  const webhooks = [
    {
      name: 'Test Webhook - All Events',
      url: webhookSiteUrl,
      events: ['*'],
      enabled: true,
    },
    {
      name: 'Circuit Breaker Events',
      url: webhookSiteUrl,
      events: ['circuit_breaker.opened', 'circuit_breaker.closed'],
      enabled: true,
    },
    {
      name: 'AI Incident Events',
      url: webhookSiteUrl,
      events: ['ai_incident.created', 'ai_incident.resolved'],
      enabled: true,
    },
    {
      name: 'Failing Webhook',
      url: 'https://invalid.example.com/webhook',
      events: ['request.error'],
      enabled: true,
    },
    {
      name: 'Disabled Webhook',
      url: webhookSiteUrl,
      events: ['*'],
      enabled: false,
    },
  ];

  for (const webhook of webhooks) {
    try {
      await axios.post(`${BASE_URL}/api/webhooks`, webhook);
      console.log(chalk.green(`  ✓ Created webhook: ${webhook.name}`));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Webhook error: ${webhook.name}`));
    }
  }
}

async function generateAIIncidents() {
  console.log(chalk.blue('\n🤖 Generating AI Incidents...'));
  
  const eventTypes = [
    'LATENCY_ANOMALY', 'ERROR_SPIKE', 'MEMORY_LEAK', 
    'CPU_SPIKE', 'TRAFFIC_SURGE', 'DATABASE_SLOW',
    'DEPLOYMENT_ISSUE', 'SECURITY_ALERT', 'CONFIG_DRIFT'
  ];
  
  const severities = ['CRITICAL', 'WARNING', 'INFO'];
  const statuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'];
  
  const incidents = [];
  
  for (let i = 0; i < CONFIG.incidents; i++) {
    const eventType = faker.helpers.arrayElement(eventTypes);
    const severity = faker.helpers.arrayElement(severities);
    const status = faker.helpers.weightedArrayElement([
      { weight: 10, value: 'OPEN' },
      { weight: 8, value: 'INVESTIGATING' },
      { weight: 75, value: 'RESOLVED' },
      { weight: 7, value: 'FALSE_POSITIVE' },
    ]);
    
    const daysAgo = faker.number.int({ min: 0, max: 30 });
    const detectedAt = new Date();
    detectedAt.setDate(detectedAt.getDate() - daysAgo);
    
    const incident = {
      event: {
        event_id: `evt_test_${Date.now()}_${i}`,
        event_type: eventType,
        severity: severity,
        summary: faker.lorem.sentence(),
        detected_at: detectedAt.toISOString(),
        metrics: generateMetrics(eventType),
        context: generateContext(eventType),
      }
    };
    
    try {
      const response = await axios.post(`${BASE_URL}/api/ai-incidents`, incident);
      const incidentId = response.data.data.incident_id;
      incidents.push({ id: incidentId, status });
      
      if (i % 10 === 0) {
        console.log(chalk.green(`  ✓ Created ${i + 1}/${CONFIG.incidents} incidents`));
      }
      
      // Add recommendations and outcomes
      if (status === 'RESOLVED' || faker.datatype.boolean()) {
        await generateRecommendations(incidentId, eventType);
      }
      
      if (status === 'RESOLVED') {
        await generateOutcome(incidentId, eventType);
        await updateIncidentStatus(incidentId, status);
      }
      
    } catch (error) {
      console.log(chalk.red(`  ✗ Failed to create incident ${i}`));
    }
    
    // Small delay to avoid overwhelming the server
    await sleep(100);
  }
  
  console.log(chalk.green(`\n  ✓ Created ${incidents.length} incidents total`));
  return incidents;
}

function generateMetrics(eventType) {
  const metrics = {
    LATENCY_ANOMALY: {
      latency_p95: faker.number.int({ min: 2000, max: 5000 }),
      latency_p99: faker.number.int({ min: 3000, max: 10000 }),
      request_rate: faker.number.int({ min: 100, max: 1000 }),
    },
    ERROR_SPIKE: {
      error_rate: faker.number.float({ min: 0.05, max: 0.3, precision: 0.01 }),
      total_errors: faker.number.int({ min: 50, max: 500 }),
      error_types: ['500', '502', '503'],
    },
    MEMORY_LEAK: {
      memory_mb: faker.number.int({ min: 1500, max: 3500 }),
      memory_growth_rate: faker.number.float({ min: 0.02, max: 0.1, precision: 0.01 }),
    },
    CPU_SPIKE: {
      cpu_percent: faker.number.int({ min: 75, max: 99 }),
      duration_seconds: faker.number.int({ min: 60, max: 600 }),
    },
  };
  
  return metrics[eventType] || {
    value: faker.number.int({ min: 100, max: 1000 }),
  };
}

function generateContext(eventType) {
  const services = ['api-gateway', 'auth-service', 'user-service', 'payment-service'];
  const endpoints = ['/api/users', '/api/orders', '/api/payments', '/api/products'];
  const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1'];
  
  return {
    service: faker.helpers.arrayElement(services),
    endpoint: faker.helpers.arrayElement(endpoints),
    region: faker.helpers.arrayElement(regions),
    instance_id: faker.string.alphanumeric(10),
  };
}

async function generateRecommendations(incidentId, eventType) {
  const actionTypes = {
    LATENCY_ANOMALY: ['SCALE_UP', 'RESTART_SERVICE', 'ADJUST_CONFIG'],
    ERROR_SPIKE: ['ROLLBACK_DEPLOYMENT', 'RESTART_SERVICE', 'INVESTIGATE'],
    MEMORY_LEAK: ['RESTART_SERVICE', 'SCALE_UP', 'INVESTIGATE'],
    CPU_SPIKE: ['SCALE_UP', 'ADJUST_CONFIG', 'INVESTIGATE'],
  };
  
  const actions = actionTypes[eventType] || ['INVESTIGATE', 'ADJUST_CONFIG', 'RESTART_SERVICE'];
  const recommendations = [];
  
  for (let i = 0; i < CONFIG.recommendationsPerIncident; i++) {
    recommendations.push({
      action_type: actions[i] || faker.helpers.arrayElement(actions),
      reasoning: faker.lorem.paragraph(),
      confidence: faker.number.float({ min: 0.5, max: 0.99, precision: 0.01 }),
      priority: i + 1,
      estimated_impact: faker.lorem.sentence(),
      risk_assessment: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
    });
  }
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/ai-incidents/${incidentId}/recommendations`,
      {
        recommendations,
        prompt: 'AI-generated recommendations',
        model: 'claude-3-5-sonnet-20241022',
      }
    );
    
    // Record decisions for some recommendations
    const recs = response.data.data.recommendations;
    if (recs && recs.length > 0) {
      const recId = recs[0].recommendation_id;
      const decision = faker.helpers.arrayElement(['ACCEPTED', 'REJECTED', 'MODIFIED']);
      
      await axios.post(
        `${BASE_URL}/api/ai-incidents/${incidentId}/recommendations/${recId}/decision`,
        {
          decision,
          reason: faker.lorem.sentence(),
          actual_action: decision === 'ACCEPTED' ? recs[0].action_type : 'INVESTIGATE',
        }
      );
    }
  } catch (error) {
    // Silently fail for recommendations
  }
}

async function generateOutcome(incidentId, eventType) {
  const actionTypes = ['RESTART_SERVICE', 'SCALE_UP', 'ROLLBACK_DEPLOYMENT', 'ADJUST_CONFIG'];
  const isResolved = faker.datatype.boolean({ probability: 0.8 });
  
  const outcome = {
    action_type: faker.helpers.arrayElement(actionTypes),
    outcome_status: isResolved ? 'RESOLVED' : 'FAILED',
    improvement_percentage: isResolved ? faker.number.int({ min: 70, max: 99 }) : 0,
    metrics_before: generateMetrics(eventType),
    metrics_after: isResolved ? generateImprovedMetrics(eventType) : generateMetrics(eventType),
    outcome_notes: faker.lorem.sentence(),
    execution_time_seconds: faker.number.int({ min: 30, max: 600 }),
  };
  
  try {
    await axios.post(`${BASE_URL}/api/ai-incidents/${incidentId}/outcomes`, outcome);
  } catch (error) {
    // Silently fail for outcomes
  }
}

function generateImprovedMetrics(eventType) {
  const metrics = {
    LATENCY_ANOMALY: {
      latency_p95: faker.number.int({ min: 100, max: 500 }),
      latency_p99: faker.number.int({ min: 200, max: 800 }),
    },
    ERROR_SPIKE: {
      error_rate: faker.number.float({ min: 0.001, max: 0.01, precision: 0.001 }),
      total_errors: faker.number.int({ min: 1, max: 10 }),
    },
    MEMORY_LEAK: {
      memory_mb: faker.number.int({ min: 500, max: 1000 }),
    },
    CPU_SPIKE: {
      cpu_percent: faker.number.int({ min: 20, max: 50 }),
    },
  };
  
  return metrics[eventType] || { value: faker.number.int({ min: 10, max: 100 }) };
}

async function updateIncidentStatus(incidentId, status) {
  try {
    await axios.patch(`${BASE_URL}/api/ai-incidents/${incidentId}`, {
      status,
      user_rating: status === 'RESOLVED' ? faker.number.int({ min: 3, max: 5 }) : null,
      user_feedback: status === 'RESOLVED' ? faker.lorem.sentence() : null,
    });
  } catch (error) {
    // Silently fail
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          FlexGate Test Data Generator                     ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
  
  console.log(chalk.gray('This will generate test data for all FlexGate features\n'));
  
  try {
    // Check if server is running
    await axios.get(`${BASE_URL}/health`);
    console.log(chalk.green('✓ Server is running\n'));
    
    // Generate data
    await generateRoutes();
    await generateAPIKeys();
    await generateWebhooks();
    await generateAIIncidents();
    
    console.log(chalk.bold.green('\n✓ Test data generation complete!\n'));
    console.log(chalk.gray('You can now run tests with realistic data\n'));
    
  } catch (error) {
    console.error(chalk.red('\n✗ Error: Server is not running'));
    console.error(chalk.yellow('Please start the server first: npm start\n'));
    process.exit(1);
  }
}

main();
```

---

### Script 2: SQL Seed File

**Location**: `scripts/testing/seed-test-data.sql`

```sql
-- FlexGate Test Data Seed File
-- Run with: psql -U flexgate -d flexgate_proxy -f scripts/testing/seed-test-data.sql

-- Clean existing test data
DELETE FROM ai_action_outcomes WHERE incident_id LIKE 'evt_test_%';
DELETE FROM ai_recommendations WHERE incident_id LIKE 'evt_test_%';
DELETE FROM ai_incidents WHERE incident_id LIKE 'evt_test_%';
DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT webhook_id FROM webhooks WHERE name LIKE 'Test%');
DELETE FROM webhooks WHERE name LIKE 'Test%';
DELETE FROM api_keys WHERE name LIKE 'Test%';
DELETE FROM routes WHERE path LIKE '/test%';

-- Insert test routes
INSERT INTO routes (path, upstream, methods, enabled, created_at, updated_at) VALUES
('/test-route', 'httpbin', ARRAY['GET', 'POST'], true, NOW(), NOW()),
('/test-slow-route', 'httpbin', ARRAY['GET'], true, NOW(), NOW()),
('/test-limited-route', 'httpbin', ARRAY['GET'], true, NOW(), NOW());

-- Insert test API keys
INSERT INTO api_keys (api_key, name, enabled, created_at, updated_at) VALUES
('test_' || encode(gen_random_bytes(32), 'hex'), 'Test Key - Active', true, NOW(), NOW()),
('test_' || encode(gen_random_bytes(32), 'hex'), 'Test Key - Disabled', false, NOW(), NOW()),
('admin_' || encode(gen_random_bytes(32), 'hex'), 'Test Admin Key', true, NOW(), NOW());

-- Insert test webhooks
INSERT INTO webhooks (webhook_id, name, url, events, enabled, created_at, updated_at) VALUES
(gen_random_uuid(), 'Test Webhook - All Events', 'https://webhook.site/test', ARRAY['*'], true, NOW(), NOW()),
(gen_random_uuid(), 'Test Webhook - AI Events', 'https://webhook.site/test-ai', ARRAY['ai_incident.created', 'ai_incident.resolved'], true, NOW(), NOW()),
(gen_random_uuid(), 'Test Webhook - Disabled', 'https://webhook.site/test-disabled', ARRAY['*'], false, NOW(), NOW());

-- Insert test AI incidents (sample - use script for bulk generation)
DO $$
DECLARE
  incident_id TEXT;
  event_types TEXT[] := ARRAY['LATENCY_ANOMALY', 'ERROR_SPIKE', 'MEMORY_LEAK', 'CPU_SPIKE'];
  severities TEXT[] := ARRAY['CRITICAL', 'WARNING', 'INFO'];
  statuses TEXT[] := ARRAY['OPEN', 'RESOLVED', 'FALSE_POSITIVE'];
  i INT;
BEGIN
  FOR i IN 1..20 LOOP
    incident_id := 'evt_test_' || gen_random_uuid();
    
    INSERT INTO ai_incidents (
      incident_id,
      event_id,
      event_type,
      severity,
      summary,
      detected_at,
      status,
      metrics,
      context,
      created_at,
      updated_at
    ) VALUES (
      incident_id,
      'event_' || gen_random_uuid(),
      event_types[1 + floor(random() * 4)::int],
      severities[1 + floor(random() * 3)::int],
      'Test incident ' || i,
      NOW() - (random() * interval '30 days'),
      statuses[1 + floor(random() * 3)::int],
      '{"test_metric": 100}'::jsonb,
      '{"service": "test-service"}'::jsonb,
      NOW(),
      NOW()
    );
  END LOOP;
END $$;

-- Verify data
SELECT 'Routes:', COUNT(*) FROM routes WHERE path LIKE '/test%';
SELECT 'API Keys:', COUNT(*) FROM api_keys WHERE name LIKE 'Test%';
SELECT 'Webhooks:', COUNT(*) FROM webhooks WHERE name LIKE 'Test%';
SELECT 'AI Incidents:', COUNT(*) FROM ai_incidents WHERE incident_id LIKE 'evt_test_%';
```

---

### Script 3: Quick Test Data Generator (Minimal)

**Location**: `scripts/testing/quick-test-data.sh`

```bash
#!/bin/bash

# Quick Test Data Generator
# Generates minimal test data for quick testing

BASE_URL="http://localhost:8080"

echo "🚀 Quick Test Data Generator"
echo ""

# Create test route
echo "Creating test route..."
curl -s -X POST "$BASE_URL/api/routes" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/test-route",
    "upstream": "httpbin",
    "methods": ["GET", "POST"],
    "enabled": true
  }' > /dev/null
echo "✓ Route created"

# Create test incidents
echo ""
echo "Creating 10 test incidents..."
for i in {1..10}; do
  curl -s -X POST "$BASE_URL/api/ai-incidents" \
    -H "Content-Type: application/json" \
    -d '{
      "event": {
        "event_id": "evt_quick_test_'$i'",
        "event_type": "LATENCY_ANOMALY",
        "severity": "WARNING",
        "summary": "Quick test incident '$i'",
        "detected_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
        "metrics": {"latency": 2000},
        "context": {"test": true}
      }
    }' > /dev/null
  echo "  ✓ Incident $i created"
  sleep 0.2
done

echo ""
echo "✓ Quick test data generation complete!"
echo ""
echo "You can now:"
echo "  - View incidents: flexgate ai incidents"
echo "  - Test route: curl $BASE_URL/test-route"
echo ""
```

---

## Manual Test Data Setup

### Step-by-Step Manual Setup

#### 1. Create Routes
```bash
# Basic test route
curl -X POST http://localhost:8080/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/test-route",
    "upstream": "httpbin",
    "methods": ["GET", "POST"],
    "enabled": true
  }'

# Rate limited route
curl -X POST http://localhost:8080/api/routes \
  -d '{
    "path": "/limited-route",
    "upstream": "httpbin",
    "methods": ["GET"],
    "enabled": true,
    "rateLimit": {
      "enabled": true,
      "max": 10,
      "windowMs": 60000
    }
  }'
```

#### 2. Create API Keys
```bash
curl -X POST http://localhost:8080/api/keys \
  -d '{"name": "Test Key", "keyPrefix": "test_", "enabled": true}'

curl -X POST http://localhost:8080/api/keys \
  -d '{"name": "Admin Key", "keyPrefix": "admin_", "enabled": true}'
```

#### 3. Create Webhooks
```bash
# Get your webhook.site URL first
# Visit: https://webhook.site

curl -X POST http://localhost:8080/api/webhooks \
  -d '{
    "name": "Test Webhook",
    "url": "https://webhook.site/YOUR-UNIQUE-ID",
    "events": ["ai_incident.created", "circuit_breaker.opened"],
    "enabled": true
  }'
```

#### 4. Create AI Incidents
```bash
# Method 1: Via CLI
flexgate ai create --type LATENCY_ANOMALY --severity WARNING
flexgate ai create --type ERROR_SPIKE --severity CRITICAL
flexgate ai create --type MEMORY_LEAK --severity WARNING

# Method 2: Via API
for i in {1..20}; do
  curl -X POST http://localhost:8080/api/ai-incidents \
    -d '{
      "event": {
        "event_id": "evt_manual_'$i'",
        "event_type": "LATENCY_ANOMALY",
        "severity": "WARNING",
        "summary": "Manual test incident '$i'",
        "detected_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
        "metrics": {"latency_p95": 2500},
        "context": {"service": "api-gateway"}
      }
    }'
  sleep 0.5
done
```

---

## Database Seed Files

### Comprehensive Seed File

**Location**: `database/seeds/test-data.sql`

See Script 2 above for the SQL seed file.

**Usage**:
```bash
# From project root
psql -U flexgate -d flexgate_proxy -f database/seeds/test-data.sql

# Or with environment variables
DATABASE_URL="postgresql://flexgate:password@localhost:5432/flexgate_proxy"
psql $DATABASE_URL -f database/seeds/test-data.sql
```

---

## API-Based Data Generation

### Using the Admin UI

1. **Navigate to AI Testing Page**:
   - http://localhost:3000/ai-testing
   - Click "Generate Event" (repeat 10-20 times)
   - Each generates an incident

2. **Create Routes via UI**:
   - http://localhost:3000/routes
   - Click "Add Route"
   - Fill form and submit

3. **Create Webhooks via UI**:
   - http://localhost:3000/webhooks
   - Click "Add Webhook"
   - Fill form and submit

---

## Data Cleanup

### Clean All Test Data

**Script**: `scripts/testing/cleanup-test-data.sh`

```bash
#!/bin/bash

echo "🧹 Cleaning test data..."

# Clean database
psql -U flexgate -d flexgate_proxy << EOF
DELETE FROM ai_action_outcomes WHERE incident_id LIKE 'evt_test_%' OR incident_id LIKE 'evt_quick_%' OR incident_id LIKE 'evt_manual_%';
DELETE FROM ai_recommendations WHERE incident_id LIKE 'evt_test_%' OR incident_id LIKE 'evt_quick_%' OR incident_id LIKE 'evt_manual_%';
DELETE FROM ai_incidents WHERE incident_id LIKE 'evt_test_%' OR incident_id LIKE 'evt_quick_%' OR incident_id LIKE 'evt_manual_%';
DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '7 days';
DELETE FROM webhooks WHERE name LIKE 'Test%';
DELETE FROM api_keys WHERE name LIKE 'Test%';
DELETE FROM routes WHERE path LIKE '/test%';

SELECT 'Cleanup complete';
SELECT 'Remaining incidents:', COUNT(*) FROM ai_incidents;
SELECT 'Remaining webhooks:', COUNT(*) FROM webhooks;
SELECT 'Remaining routes:', COUNT(*) FROM routes;
EOF

echo "✓ Cleanup complete"
```

### Clean Specific Data

```bash
# Clean only AI incidents
psql -U flexgate -d flexgate_proxy -c \
  "DELETE FROM ai_incidents WHERE incident_id LIKE 'evt_test_%';"

# Clean only webhook deliveries older than 1 day
psql -U flexgate -d flexgate_proxy -c \
  "DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '1 day';"

# Clean only test routes
psql -U flexgate -d flexgate_proxy -c \
  "DELETE FROM routes WHERE path LIKE '/test%';"
```

---

## Summary

### Quick Setup (5 minutes)

```bash
# 1. Start services
./scripts/start-all-with-deps.sh

# 2. Generate test data
chmod +x scripts/testing/quick-test-data.sh
./scripts/testing/quick-test-data.sh

# 3. Verify
flexgate ai incidents
curl http://localhost:8080/api/routes
```

### Full Setup (30 minutes)

```bash
# 1. Install dependencies
npm install @faker-js/faker

# 2. Run generator script
node scripts/testing/generate-test-data.js

# 3. Verify
psql -U flexgate -d flexgate_proxy -c \
  "SELECT COUNT(*) FROM ai_incidents;"
```

### Cleanup

```bash
# Clean all test data
chmod +x scripts/testing/cleanup-test-data.sh
./scripts/testing/cleanup-test-data.sh
```

---

**Next Steps**:

1. Create the generator scripts
2. Test data generation
3. Verify test scenarios work with generated data
4. Document any additional data needs

---

**Last Updated**: February 16, 2026
