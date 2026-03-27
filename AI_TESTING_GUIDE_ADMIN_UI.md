# AI Features Testing Guide - Admin UI & API

## Overview

This guide explains how to test the AI features you implemented, including:
- ✅ **AI Event Factory** - Generates structured events for Claude/GPT
- ✅ **Prompt Template Library** - Converts events into Claude-ready prompts
- ✅ **10 Event Types** - Optimized for infrastructure reasoning

---

## What Gets Sent to Claude?

When an AI event is triggered, FlexGate sends a **structured JSON prompt** to Claude that includes:

### 1. **Event Data** (AI Event)
```json
{
  "event_id": "evt_abc123...",
  "timestamp": "2026-02-15T10:30:00Z",
  "event_type": "LATENCY_ANOMALY",
  "summary": "Response time increased to 2.5s on /api/users",
  "severity": "warning",
  
  "data": {
    "metric": "response_time_ms",
    "current_value": 2500,
    "threshold": 1000,
    "window": "5m",
    "trend": "RISING",
    "unit": "ms"
  },
  
  "context": {
    "route": "/api/users",
    "upstream": "users-service",
    "method": "GET",
    "recent_samples": [
      { "timestamp": "2026-02-15T10:25:00Z", "value": 850 },
      { "timestamp": "2026-02-15T10:26:00Z", "value": 920 },
      { "timestamp": "2026-02-15T10:27:00Z", "value": 1500 },
      { "timestamp": "2026-02-15T10:28:00Z", "value": 2100 },
      { "timestamp": "2026-02-15T10:29:00Z", "value": 2500 }
    ]
  },
  
  "ai_metadata": {
    "confidence": 0.92,
    "estimated_tokens": 420,
    "reasoning_hints": [
      "Analyze trend: RISING",
      "Threshold breached by 2.5x",
      "5 samples show consistent degradation"
    ]
  }
}
```

### 2. **Claude Prompt** (Built from Template)
```
You are an expert infrastructure engineer analyzing a FlexGate API Gateway alert.

## 🔴 ALERT: Latency Degradation Analysis

**Event ID:** evt_abc123...
**Severity:** WARNING
**Time:** 2026-02-15T10:30:00Z

### Current Situation

Response time on route `/api/users` has degraded to **2500ms**, exceeding the threshold of **1000ms** (2.5x breach).

**Metric Details:**
- Current Value: 2500 ms
- Threshold: 1000 ms
- Window: 5m
- Trend: RISING ⬆️
- Confidence: 92%

**Recent Samples (last 5m):**
```
10:25:00Z -> 850ms
10:26:00Z -> 920ms
10:27:00Z -> 1500ms
10:28:00Z -> 2100ms
10:29:00Z -> 2500ms  ← Current
```

**Context:**
- Route: /api/users
- Upstream: users-service
- Method: GET

### Your Task

Analyze this latency degradation and provide:

1. **Root Cause Analysis**
   - What is likely causing the 2500ms response time?
   - Is this a sudden spike or gradual degradation?
   - Are there patterns in the sample data?

2. **Impact Assessment**
   - Which users/services are affected?
   - What is the business impact?
   - Should we trigger a circuit breaker?

3. **Immediate Actions**
   - What should be done in the next 5 minutes?
   - Should we shed load? Scale up? Roll back?
   - Any emergency mitigation steps?

4. **Long-term Recommendations**
   - How to prevent this in the future?
   - Monitoring improvements?
   - Infrastructure changes?

5. **Confidence & Uncertainty**
   - How certain are you about each recommendation?
   - What additional data would help?

**Response Format:** JSON
```json
{
  "root_cause": "string",
  "impact": "string",
  "immediate_actions": ["action1", "action2"],
  "long_term_recommendations": ["rec1", "rec2"],
  "confidence_score": 0.0-1.0,
  "additional_data_needed": ["data1", "data2"]
}
```

---

## Testing Methods

### Method 1: Unit Tests (Already Passing!)

**Status:** ✅ **72/72 tests passing**

```bash
npm test -- __tests__/ai/
```

**Test Coverage:**
- ✅ Event Factory: 39 tests
- ✅ Prompt Templates: 33 tests
- ✅ All 10 event types covered
- ✅ Token estimation verified
- ✅ Cost calculation verified

**What the tests validate:**
1. Event creation with all required fields
2. Automatic confidence calculation
3. Token estimation accuracy
4. Prompt template completeness
5. JSON response formatting
6. All event types have prompts

---

### Method 2: API Endpoints (Backend Testing)

#### **A. Get All Event Types**
```bash
curl http://localhost:8080/api/ai/event-types | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "total": 10,
    "event_types": [
      {
        "type": "CIRCUIT_BREAKER_CANDIDATE",
        "name": "Circuit Breaker Analysis",
        "description": "Service instability requiring circuit breaker activation"
      },
      {
        "type": "RATE_LIMIT_BREACH",
        "name": "Rate Limit Investigation",
        "description": "Traffic exceeding configured rate limits"
      },
      // ... 8 more types
    ]
  }
}
```

#### **B. Generate Sample Event**
```bash
# Generate a sample latency anomaly event
curl http://localhost:8080/api/ai/events/sample?type=LATENCY_ANOMALY | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "event": {
      "event_id": "evt_...",
      "timestamp": "2026-02-15T...",
      "event_type": "LATENCY_ANOMALY",
      "summary": "Response time increased to 2.5s on /api/users",
      "severity": "warning",
      "data": { /* metric data */ },
      "context": { /* route context */ },
      "ai_metadata": {
        "confidence": 0.92,
        "estimated_tokens": 420,
        "reasoning_hints": [...]
      }
    },
    "event_type": "LATENCY_ANOMALY"
  }
}
```

#### **C. Build Claude Prompt**
```bash
# Build a Claude-ready prompt from an event
curl -X POST http://localhost:8080/api/ai/prompts/build \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "LATENCY_ANOMALY"
  }' | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "event": { /* full event object */ },
    "prompt": "You are an expert infrastructure engineer...\n\n## 🔴 ALERT: Latency Degradation Analysis\n\n...",
    "template": {
      "name": "Latency Degradation Analysis",
      "event_type": "LATENCY_ANOMALY",
      "max_tokens": 600
    },
    "recommendations": {
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 600,
      "estimated_cost_usd": 0.00252
    }
  }
}
```

#### **D. Get All Templates**
```bash
curl http://localhost:8080/api/ai/templates | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "event_type": "LATENCY_ANOMALY",
        "name": "Latency Degradation Analysis",
        "max_tokens": 600,
        "template_length": 1234
      },
      // ... 9 more templates
    ],
    "stats": {
      "total_templates": 10,
      "avg_max_tokens": 550,
      "avg_estimated_cost": 0.00231
    },
    "coverage": {
      "covered_types": 10,
      "total_types": 10,
      "coverage_percent": 100
    }
  }
}
```

---

### Method 3: Direct Code Testing (TypeScript)

Create a test file to see exactly what gets sent to Claude:

```typescript
// test-ai-features.ts
import { AIEventFactory } from './src/ai/utils/eventFactory';
import { PromptTemplateLibrary } from './src/ai/prompts/templates';
import { AIEventType } from './src/ai/types/events';

// Generate a sample latency event
const event = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);

console.log('============= AI EVENT =============');
console.log(JSON.stringify(event, null, 2));

// Build the Claude prompt
const prompt = PromptTemplateLibrary.buildPrompt(event);
const cost = PromptTemplateLibrary.estimateCost(event);
const model = PromptTemplateLibrary.getRecommendedModel(event);

console.log('\n============= CLAUDE PROMPT =============');
console.log(prompt);

console.log('\n============= RECOMMENDATIONS =============');
console.log(`Model: ${model}`);
console.log(`Estimated Cost: $${cost}`);
console.log(`Event Confidence: ${event.ai_metadata.confidence}`);
```

Run it:
```bash
npx ts-node test-ai-features.ts
```

---

### Method 4: Admin UI Testing Page (TO BE CREATED)

**What you need:** A new page in Admin UI to visually test AI features

**Recommended UI: `/ai-testing`**

Features needed:
1. **Event Type Selector** - Dropdown with all 10 types
2. **Generate Event Button** - Creates sample event
3. **Event JSON Display** - Shows the generated event
4. **Build Prompt Button** - Converts event to Claude prompt
5. **Prompt Display** - Shows the full prompt text
6. **Cost Estimator** - Shows token count and cost
7. **Copy to Clipboard** - Easy copying for Claude testing
8. **Send to Claude Button** - (Optional) Direct Claude API call

---

## What Each Event Type Does

### 1. CIRCUIT_BREAKER_CANDIDATE
**When triggered:** Service failure rate exceeds threshold  
**What Claude gets:** Failure patterns, error samples, recovery metrics  
**Claude's job:** Recommend if circuit breaker should open  
**Example prompt snippet:**
```
Service 'payment-api' showing 45% error rate over 5 minutes.
Should we activate circuit breaker to prevent cascade failures?
```

### 2. RATE_LIMIT_BREACH
**When triggered:** Traffic exceeds configured limits  
**What Claude gets:** Request rate, limit config, client distribution  
**Claude's job:** Determine if it's attack or legitimate spike  
**Example prompt snippet:**
```
Client 'mobile-app-v2' exceeded 1000 req/min limit (current: 2500 req/min).
Is this a DDoS attack or legitimate traffic surge?
```

### 3. LATENCY_ANOMALY
**When triggered:** Response time degrades  
**What Claude gets:** Latency samples, trend data, route context  
**Claude's job:** Root cause analysis and mitigation  
**Example prompt snippet:**
```
Route '/api/search' latency jumped from 200ms to 2.5s.
What's causing the slowdown and how to fix it?
```

### 4. ERROR_RATE_SPIKE
**When triggered:** Error percentage increases suddenly  
**What Claude gets:** Error samples, status codes, affected routes  
**Claude's job:** Identify root cause and impact  
**Example prompt snippet:**
```
Error rate spiked to 12% (normal: 0.5%).
Most common: 503 Service Unavailable.
What broke?
```

### 5. COST_ALERT
**When triggered:** API costs exceed budget  
**What Claude gets:** Cost breakdown, route usage, trends  
**Claude's job:** Cost optimization recommendations  
**Example prompt snippet:**
```
Claude API costs jumped from $50/day to $500/day.
Route '/ai/chat' responsible for 80% of costs.
How to optimize?
```

### 6. RETRY_STORM
**When triggered:** Excessive retry attempts detected  
**What Claude gets:** Retry patterns, backoff config, failure reasons  
**Claude's job:** Stop the storm, prevent cascade  
**Example prompt snippet:**
```
Client retrying failed request 1000x/min with no backoff.
Causing cascading failures. Immediate action needed!
```

### 7. UPSTREAM_DEGRADATION
**When triggered:** Health checks failing  
**What Claude gets:** Health metrics, failure patterns, SLO breach  
**Claude's job:** Failover or scale recommendations  
**Example prompt snippet:**
```
Upstream 'database-primary' health degraded.
Response time: 5s (SLO: 100ms). Failover to replica?
```

### 8. SECURITY_ANOMALY
**When triggered:** Suspicious access patterns  
**What Claude gets:** Access logs, geo-location, patterns  
**Claude's job:** Threat assessment and mitigation  
**Example prompt snippet:**
```
Client from 10 different IPs attempting same endpoint.
Pattern: credential stuffing attack. Block?
```

### 9. CAPACITY_WARNING
**When triggered:** Resource saturation detected  
**What Claude gets:** CPU/memory/disk usage, trends  
**Claude's job:** Scale or shed load recommendations  
**Example prompt snippet:**
```
CPU at 95% sustained for 10 minutes.
Memory 90% full. Should we auto-scale or shed load?
```

### 10. RECOVERY_SIGNAL
**When triggered:** System auto-healed  
**What Claude gets:** Failure details, recovery actions taken  
**Claude's job:** Validate recovery, prevent recurrence  
**Example prompt snippet:**
```
Auto-recovery restarted 'redis-cache' after crash.
Root cause: OOM. How to prevent future crashes?
```

---

## Real-World Testing Scenario

### Scenario: Test Latency Degradation Flow

#### Step 1: Generate Event
```bash
curl -s http://localhost:8080/api/ai/events/sample?type=LATENCY_ANOMALY > event.json
cat event.json | jq .
```

#### Step 2: Build Prompt
```bash
curl -X POST http://localhost:8080/api/ai/prompts/build \
  -H "Content-Type: application/json" \
  -d @event.json > prompt.json

cat prompt.json | jq -r '.data.prompt' > claude-prompt.txt
```

#### Step 3: Send to Claude (Manual Test)
1. Copy contents of `claude-prompt.txt`
2. Go to https://claude.ai
3. Paste the prompt
4. Claude will respond with JSON analysis!

#### Step 4: Verify Response Format
Claude should return:
```json
{
  "root_cause": "Database connection pool exhaustion...",
  "impact": "High - All users experiencing 2.5s delays...",
  "immediate_actions": [
    "Increase connection pool size from 10 to 50",
    "Enable query caching",
    "Shed non-critical traffic"
  ],
  "long_term_recommendations": [
    "Implement read replicas",
    "Add query performance monitoring",
    "Set up auto-scaling triggers"
  ],
  "confidence_score": 0.85,
  "additional_data_needed": [
    "Database slow query logs",
    "Connection pool metrics"
  ]
}
```

---

## Quick Testing Checklist

### Backend Tests
- [ ] Run `npm test -- __tests__/ai/` → Should pass 72/72 tests
- [ ] Test event generation: `curl http://localhost:8080/api/ai/events/sample`
- [ ] Test prompt building: `curl -X POST http://localhost:8080/api/ai/prompts/build ...`
- [ ] Test all 10 event types
- [ ] Verify token estimates
- [ ] Verify cost calculations

### Integration Tests
- [ ] Generate event for each of 10 types
- [ ] Build Claude prompts for each type
- [ ] Verify JSON response format
- [ ] Test with actual Claude API (optional)
- [ ] Measure response times
- [ ] Verify confidence scores

### Admin UI Tests (TO DO)
- [ ] Create `/ai-testing` page
- [ ] Event type selector working
- [ ] Event generation working
- [ ] Prompt display working
- [ ] Copy to clipboard working
- [ ] Cost estimator accurate

---

## Example Test Script

Save this as `test-all-ai-features.sh`:

```bash
#!/bin/bash

echo "Testing AI Features..."
echo ""

# Test 1: Get all event types
echo "1. Testing event types endpoint..."
curl -s http://localhost:8080/api/ai/event-types | jq '.data.total'

# Test 2: Generate each event type
echo ""
echo "2. Testing event generation..."
for type in LATENCY_ANOMALY ERROR_RATE_SPIKE COST_ALERT RETRY_STORM \
            CIRCUIT_BREAKER_CANDIDATE RATE_LIMIT_BREACH UPSTREAM_DEGRADATION \
            SECURITY_ANOMALY CAPACITY_WARNING RECOVERY_SIGNAL; do
  echo "   - Generating $type..."
  curl -s "http://localhost:8080/api/ai/events/sample?type=$type" | jq -r '.data.event.event_id'
done

# Test 3: Build prompts
echo ""
echo "3. Testing prompt building..."
curl -s -X POST http://localhost:8080/api/ai/prompts/build \
  -H "Content-Type: application/json" \
  -d '{"eventType": "LATENCY_ANOMALY"}' | jq -r '.data.prompt' | wc -l

# Test 4: Get templates
echo ""
echo "4. Testing templates endpoint..."
curl -s http://localhost:8080/api/ai/templates | jq '.data.stats'

echo ""
echo "✅ All tests complete!"
```

Run it:
```bash
chmod +x test-all-ai-features.sh
./test-all-ai-features.sh
```

---

## Summary

### What You Have Now ✅
- Event Factory generating structured AI events
- Prompt Library with 10 optimized templates
- Automatic confidence calculation
- Token and cost estimation
- 72 passing unit tests
- Complete API endpoints

### What You Need to Test in Admin UI 📝
1. Create AI Testing page (`/ai-testing`)
2. Add event type selector
3. Show generated events (JSON)
4. Display Claude prompts (text)
5. Show cost estimates
6. Add "Copy to Claude" button

### How to Verify It Works ✅
1. Run unit tests → 72/72 passing
2. Call API endpoints → Get valid JSON
3. Build prompts → Get Claude-ready text
4. Send to Claude → Get structured analysis
5. Verify costs → Match estimates

---

## Next Steps

1. **Test Backend APIs**
   ```bash
   curl http://localhost:8080/api/ai/event-types
   curl http://localhost:8080/api/ai/events/sample
   curl -X POST http://localhost:8080/api/ai/prompts/build ...
   ```

2. **Create Admin UI Page** (See `ADMIN_UI_AI_PAGE.md` for code)

3. **Manual Claude Testing**
   - Generate event
   - Build prompt
   - Copy to https://claude.ai
   - Verify JSON response

4. **Production Integration**
   - Trigger events from real metrics
   - Send prompts to Claude API
   - Parse responses
   - Take automated actions

---

**Status:** AI features are fully implemented and tested (72/72 tests passing). Ready for Admin UI integration and production use!
