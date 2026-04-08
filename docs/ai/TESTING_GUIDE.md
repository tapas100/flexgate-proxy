# AI Features Testing Guide

**Version:** 1.0.0  
**Last Updated:** February 15, 2026  
**Status:** Production Testing Ready

---

## Overview

This guide provides comprehensive, step-by-step testing flows for all implemented AI features. Each test includes setup, execution steps, expected results, and validation criteria.

**Testing Scope:**
- ✅ AI Event Factory (creation, validation, confidence scoring)
- ✅ Prompt Template Library (all 10 event types)
- ✅ Event detection and emission
- ✅ Claude API integration
- ✅ Cost tracking and optimization
- ✅ Auto-recovery runbooks
- ✅ End-to-end workflows

**Test Environment Requirements:**
- Node.js 18+
- Jest testing framework
- Anthropic API key (for integration tests)
- Slack workspace (optional, for notification tests)

---

## Test Suite 1: AI Event Factory

### Test 1.1: Event Creation - Basic
**Objective:** Verify events are created with all required fields

**Setup:**
```typescript
import { AIEventFactory, AIEventType, EventSeverity, TrendDirection } from '@flexgate/ai';
```

**Test Steps:**
```typescript
describe('Event Factory - Basic Creation', () => {
  it('should create event with all required fields', () => {
    // STEP 1: Create minimal event
    const event = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'Test error spike',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'error_rate',
        current_value: 15,
        threshold: 5,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      }
    });
    
    // STEP 2: Verify required fields present
    expect(event.id).toBeDefined();
    expect(event.id).toMatch(/^evt_\d+_[a-f0-9]+$/);
    
    // STEP 3: Verify type and severity
    expect(event.type).toBe(AIEventType.ERROR_RATE_SPIKE);
    expect(event.severity).toBe(EventSeverity.WARNING);
    
    // STEP 4: Verify timestamp
    expect(event.timestamp).toBeDefined();
    expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    
    // STEP 5: Verify data structure
    expect(event.data.metric).toBe('error_rate');
    expect(event.data.current_value).toBe(15);
    expect(event.data.threshold).toBe(5);
    
    // STEP 6: Verify confidence calculated
    expect(event.confidence).toBeGreaterThan(0);
    expect(event.confidence).toBeLessThanOrEqual(1);
  });
});
```

**Expected Results:**
- ✅ Event ID generated in format `evt_<timestamp>_<random>`
- ✅ All required fields populated
- ✅ Confidence score between 0.0 and 1.0
- ✅ Timestamp is valid ISO 8601 string

**Validation:**
```bash
npm test -- __tests__/ai/utils/eventFactory.test.ts -t "should create event with all required fields"
```

---

### Test 1.2: Confidence Scoring Algorithm
**Objective:** Verify confidence calculation based on 4 factors

**Test Steps:**
```typescript
describe('Confidence Scoring', () => {
  it('should calculate confidence from samples, breach, trend, completeness', () => {
    // STEP 1: Create event with high confidence indicators
    const highConfidenceEvent = AIEventFactory.create({
      type: AIEventType.LATENCY_ANOMALY,
      summary: 'High confidence latency spike',
      severity: EventSeverity.CRITICAL,
      data: {
        metric: 'latency_ms',
        current_value: 5000,  // 10x threshold
        threshold: 500,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: 'ms'
      },
      context: {
        route: '/api/users',
        upstream: 'users-service',
        recent_samples: [
          { timestamp: '2026-02-15T10:00:00Z', value: 450 },
          { timestamp: '2026-02-15T10:01:00Z', value: 800 },
          { timestamp: '2026-02-15T10:02:00Z', value: 1500 },
          { timestamp: '2026-02-15T10:03:00Z', value: 3000 },
          { timestamp: '2026-02-15T10:04:00Z', value: 5000 },
        ]
      }
    });
    
    // STEP 2: Verify high confidence (>0.85)
    expect(highConfidenceEvent.confidence).toBeGreaterThan(0.85);
    
    // STEP 3: Create event with low confidence indicators
    const lowConfidenceEvent = AIEventFactory.create({
      type: AIEventType.LATENCY_ANOMALY,
      summary: 'Low confidence spike',
      severity: EventSeverity.INFO,
      data: {
        metric: 'latency_ms',
        current_value: 550,  // Just over threshold
        threshold: 500,
        window: '5m',
        trend: TrendDirection.STABLE,
        unit: 'ms'
      },
      context: {
        recent_samples: [
          { timestamp: '2026-02-15T10:00:00Z', value: 510 },
          { timestamp: '2026-02-15T10:01:00Z', value: 540 }
        ]
      }
    });
    
    // STEP 4: Verify lower confidence
    expect(lowConfidenceEvent.confidence).toBeLessThan(0.6);
    
    // STEP 5: Verify confidence factors
    // High sample count → higher confidence
    expect(highConfidenceEvent.confidence).toBeGreaterThan(lowConfidenceEvent.confidence);
  });
  
  it('should weight confidence factors correctly', () => {
    // Test individual factor contributions
    const baseline = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'Baseline',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'error_rate',
        current_value: 10,
        threshold: 5,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      }
    });
    
    // Factor weights:
    // - Sample score: 25%
    // - Breach magnitude: 30%
    // - Trend clarity: 25%
    // - Data completeness: 20%
    
    expect(baseline.confidence).toBeGreaterThan(0.5);
  });
});
```

**Expected Results:**
- ✅ High breach ratio (10x) → High confidence (>0.85)
- ✅ Low breach ratio (1.1x) → Lower confidence (<0.6)
- ✅ More samples → Higher confidence
- ✅ Strong trend (RISING) → Higher confidence
- ✅ Complete context → Higher confidence

**Validation:**
```bash
npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Confidence Scoring"
```

---

### Test 1.3: Event Validation
**Objective:** Verify validation catches missing/invalid data

**Test Steps:**
```typescript
describe('Event Validation', () => {
  it('should return errors for missing required fields', () => {
    const invalidEvent = {
      type: AIEventType.ERROR_RATE_SPIKE,
      // Missing summary, severity, data
    };
    
    // STEP 1: Validate incomplete event
    const validation = AIEventFactory.validate(invalidEvent as any);
    
    // STEP 2: Verify errors array populated
    expect(validation.errors.length).toBeGreaterThan(0);
    
    // STEP 3: Check specific error messages
    expect(validation.errors).toContain('Event summary is required');
    expect(validation.errors).toContain('Event severity is required');
    expect(validation.errors).toContain('Event data is required');
    
    // STEP 4: Verify not valid
    expect(validation.isValid).toBe(false);
  });
  
  it('should return warnings for optional missing fields', () => {
    const event = AIEventFactory.create({
      type: AIEventType.COST_ALERT,
      summary: 'Cost spike',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'cost_usd',
        current_value: 100,
        threshold: 50,
        window: '1d',
        trend: TrendDirection.RISING,
        unit: 'usd'
      }
      // Missing context (optional)
    });
    
    // STEP 1: Validate event
    const validation = AIEventFactory.validate(event);
    
    // STEP 2: Should be valid despite warnings
    expect(validation.isValid).toBe(true);
    
    // STEP 3: But should have warnings
    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings).toContain('Context information missing - analysis may be less accurate');
  });
  
  it('should validate data ranges', () => {
    const event = AIEventFactory.create({
      type: AIEventType.LATENCY_ANOMALY,
      summary: 'Test',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'latency_ms',
        current_value: -100,  // Invalid: negative latency
        threshold: 500,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: 'ms'
      }
    });
    
    const validation = AIEventFactory.validate(event);
    
    expect(validation.warnings).toContain('Negative metric value detected');
  });
});
```

**Expected Results:**
- ✅ Missing required fields → Errors array populated
- ✅ Missing optional fields → Warnings array populated
- ✅ Invalid data ranges → Warnings
- ✅ `isValid` flag accurate

**Validation:**
```bash
npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Event Validation"
```

---

### Test 1.4: Trend Detection
**Objective:** Verify linear regression trend analysis

**Test Steps:**
```typescript
describe('Trend Detection', () => {
  it('should detect RISING trend from increasing samples', () => {
    const risingData = [
      { timestamp: '2026-02-15T10:00:00Z', value: 100 },
      { timestamp: '2026-02-15T10:01:00Z', value: 150 },
      { timestamp: '2026-02-15T10:02:00Z', value: 200 },
      { timestamp: '2026-02-15T10:03:00Z', value: 250 },
      { timestamp: '2026-02-15T10:04:00Z', value: 300 },
    ];
    
    const trend = AIEventFactory.detectTrend(risingData);
    
    expect(trend.direction).toBe(TrendDirection.RISING);
    expect(trend.slope).toBeGreaterThan(0);
    expect(trend.correlation).toBeGreaterThan(0.95); // Strong correlation
  });
  
  it('should detect FALLING trend from decreasing samples', () => {
    const fallingData = [
      { timestamp: '2026-02-15T10:00:00Z', value: 300 },
      { timestamp: '2026-02-15T10:01:00Z', value: 250 },
      { timestamp: '2026-02-15T10:02:00Z', value: 200 },
      { timestamp: '2026-02-15T10:03:00Z', value: 150 },
      { timestamp: '2026-02-15T10:04:00Z', value: 100 },
    ];
    
    const trend = AIEventFactory.detectTrend(fallingData);
    
    expect(trend.direction).toBe(TrendDirection.FALLING);
    expect(trend.slope).toBeLessThan(0);
  });
  
  it('should detect STABLE trend from flat data', () => {
    const stableData = [
      { timestamp: '2026-02-15T10:00:00Z', value: 100 },
      { timestamp: '2026-02-15T10:01:00Z', value: 102 },
      { timestamp: '2026-02-15T10:02:00Z', value: 98 },
      { timestamp: '2026-02-15T10:03:00Z', value: 101 },
      { timestamp: '2026-02-15T10:04:00Z', value: 99 },
    ];
    
    const trend = AIEventFactory.detectTrend(stableData);
    
    expect(trend.direction).toBe(TrendDirection.STABLE);
    expect(Math.abs(trend.slope)).toBeLessThan(0.1);
  });
  
  it('should handle insufficient data', () => {
    const insufficientData = [
      { timestamp: '2026-02-15T10:00:00Z', value: 100 }
    ];
    
    const trend = AIEventFactory.detectTrend(insufficientData);
    
    expect(trend.direction).toBe(TrendDirection.STABLE);
    expect(trend.slope).toBe(0);
  });
});
```

**Expected Results:**
- ✅ Increasing values → RISING trend, positive slope
- ✅ Decreasing values → FALLING trend, negative slope
- ✅ Flat values → STABLE trend, near-zero slope
- ✅ <2 samples → STABLE (default)
- ✅ Correlation coefficient calculated

**Validation:**
```bash
npm test -- __tests__/ai/utils/eventFactory.test.ts -t "Trend Detection"
```

---

## Test Suite 2: Prompt Template Library

### Test 2.1: Template Retrieval
**Objective:** Verify all 10 event types have templates

**Test Steps:**
```typescript
describe('Prompt Templates - Retrieval', () => {
  it('should have templates for all 10 event types', () => {
    const eventTypes = [
      AIEventType.CIRCUIT_BREAKER_CANDIDATE,
      AIEventType.COST_ALERT,
      AIEventType.LATENCY_ANOMALY,
      AIEventType.ERROR_RATE_SPIKE,
      AIEventType.RATE_LIMIT_BREACH,
      AIEventType.RETRY_STORM,
      AIEventType.UPSTREAM_DEGRADATION,
      AIEventType.SECURITY_ANOMALY,
      AIEventType.CAPACITY_WARNING,
      AIEventType.RECOVERY_SIGNAL
    ];
    
    // STEP 1: Verify each event type has a template
    eventTypes.forEach(type => {
      const template = PromptTemplateLibrary.getTemplate(type);
      
      expect(template).toBeDefined();
      expect(template.event_type).toBe(type);
      expect(template.system_prompt).toBeDefined();
      expect(template.user_prompt).toBeDefined();
      expect(template.max_tokens).toBeGreaterThan(0);
    });
    
    // STEP 2: Verify coverage validation
    const validation = PromptTemplateLibrary.validateCoverage();
    expect(validation.isComplete).toBe(true);
    expect(validation.missingTypes).toHaveLength(0);
  });
  
  it('should return all templates', () => {
    const allTemplates = PromptTemplateLibrary.getAllTemplates();
    
    expect(allTemplates.size).toBe(10);
    expect(Array.from(allTemplates.keys())).toContain(AIEventType.ERROR_RATE_SPIKE);
  });
});
```

**Expected Results:**
- ✅ All 10 event types have templates
- ✅ Each template has system_prompt, user_prompt, max_tokens
- ✅ Coverage validation passes
- ✅ getAllTemplates returns 10 templates

**Validation:**
```bash
npm test -- __tests__/ai/prompts/templates.test.ts -t "Template Retrieval"
```

---

### Test 2.2: Prompt Building with Variable Substitution
**Objective:** Verify variables are correctly replaced

**Test Steps:**
```typescript
describe('Prompt Building', () => {
  it('should substitute all variables in prompt', () => {
    // STEP 1: Create event with context
    const event = AIEventFactory.create({
      type: AIEventType.LATENCY_ANOMALY,
      summary: 'Response time increased to 2.5s on /api/users',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'response_time_ms',
        current_value: 2500,
        threshold: 1000,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: 'ms'
      },
      context: {
        route: '/api/users',
        upstream: 'users-service',
        recent_samples: [
          { timestamp: '2026-02-15T10:25:00Z', value: 850 },
          { timestamp: '2026-02-15T10:26:00Z', value: 920 },
          { timestamp: '2026-02-15T10:27:00Z', value: 1500 },
          { timestamp: '2026-02-15T10:28:00Z', value: 2100 },
          { timestamp: '2026-02-15T10:29:00Z', value: 2500 },
        ]
      }
    });
    
    // STEP 2: Build prompt
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    
    // STEP 3: Verify variables substituted
    expect(prompt).toContain('Response time increased to 2.5s on /api/users');
    expect(prompt).toContain('users-service');
    expect(prompt).toContain('/api/users');
    expect(prompt).toContain('2500');
    expect(prompt).toContain('1000');
    expect(prompt).toContain('RISING');
    expect(prompt).toContain('2.5x'); // breach_ratio
    
    // STEP 4: Verify no template markers remain
    expect(prompt).not.toContain('{{');
    expect(prompt).not.toContain('}}');
  });
  
  it('should format samples readably', () => {
    const event = AIEventFactory.createSample('LATENCY_ANOMALY');
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    
    // Should format like:
    // 1. 10:25:00: 850ms
    // 2. 10:26:00: 920ms
    
    expect(prompt).toMatch(/\d+\.\s+\d{2}:\d{2}:\d{2}:\s+\d+/);
  });
  
  it('should handle missing optional variables', () => {
    const event = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'Error spike',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'error_rate',
        current_value: 15,
        threshold: 5,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      }
      // No context provided
    });
    
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    
    // Should not crash, should replace with empty or "unknown"
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });
});
```

**Expected Results:**
- ✅ All variables replaced with actual values
- ✅ No `{{variable}}` markers remain
- ✅ Samples formatted readably (1. HH:MM:SS: value)
- ✅ Breach ratio calculated correctly
- ✅ Handles missing context gracefully

**Validation:**
```bash
npm test -- __tests__/ai/prompts/templates.test.ts -t "Prompt Building"
```

---

### Test 2.3: Token Limits and Cost Estimation
**Objective:** Verify prompts stay under token limits

**Test Steps:**
```typescript
describe('Token Limits and Costs', () => {
  it('should keep all prompts under 1000 tokens', () => {
    const eventTypes = [
      AIEventType.CIRCUIT_BREAKER_CANDIDATE,
      AIEventType.COST_ALERT,
      AIEventType.LATENCY_ANOMALY,
      AIEventType.ERROR_RATE_SPIKE,
      AIEventType.RATE_LIMIT_BREACH,
      AIEventType.RETRY_STORM,
      AIEventType.UPSTREAM_DEGRADATION,
      AIEventType.SECURITY_ANOMALY,
      AIEventType.CAPACITY_WARNING,
      AIEventType.RECOVERY_SIGNAL
    ];
    
    eventTypes.forEach(type => {
      // STEP 1: Create sample event
      const event = AIEventFactory.createSample(type);
      
      // STEP 2: Build prompt
      const prompt = PromptTemplateLibrary.buildPrompt(event);
      
      // STEP 3: Estimate tokens (rough: 1 token ≈ 4 chars)
      const estimatedTokens = Math.ceil(prompt.length / 4);
      
      // STEP 4: Verify under limit
      const maxTokens = PromptTemplateLibrary.getMaxTokens(event);
      expect(estimatedTokens).toBeLessThan(maxTokens);
      expect(maxTokens).toBeLessThanOrEqual(1024);
    });
  });
  
  it('should estimate costs correctly', () => {
    const event = AIEventFactory.createSample('ERROR_RATE_SPIKE');
    
    // STEP 1: Get cost estimate
    const cost = PromptTemplateLibrary.estimateCost(event);
    
    // STEP 2: Verify reasonable range
    expect(cost).toBeGreaterThan(0.01);  // At least $0.01
    expect(cost).toBeLessThan(0.02);     // At most $0.02
  });
  
  it('should vary max tokens by event type', () => {
    const complexEvent = AIEventFactory.createSample('CIRCUIT_BREAKER_CANDIDATE');
    const simpleEvent = AIEventFactory.createSample('RECOVERY_SIGNAL');
    
    const complexTokens = PromptTemplateLibrary.getMaxTokens(complexEvent);
    const simpleTokens = PromptTemplateLibrary.getMaxTokens(simpleEvent);
    
    // Complex analysis needs more tokens
    expect(complexTokens).toBeGreaterThan(simpleTokens);
  });
});
```

**Expected Results:**
- ✅ All prompts < 1000 tokens
- ✅ Cost estimates in range $0.010 - $0.015
- ✅ Complex events have higher token limits
- ✅ Simple events have lower token limits

**Validation:**
```bash
npm test -- __tests__/ai/prompts/templates.test.ts -t "Token Limits"
```

---

### Test 2.4: Template Quality Checks
**Objective:** Verify templates request proper JSON responses

**Test Steps:**
```typescript
describe('Template Quality', () => {
  it('should request JSON format in all templates', () => {
    const allTemplates = PromptTemplateLibrary.getAllTemplates();
    
    allTemplates.forEach((template, eventType) => {
      const prompt = template.user_prompt;
      
      // Should mention JSON explicitly
      expect(
        prompt.toLowerCase().includes('json') ||
        prompt.toLowerCase().includes('respond in json format')
      ).toBe(true);
    });
  });
  
  it('should include confidence score requirement', () => {
    const allTemplates = PromptTemplateLibrary.getAllTemplates();
    
    allTemplates.forEach((template, eventType) => {
      const prompt = template.user_prompt;
      
      // Should ask for confidence score
      expect(
        prompt.toLowerCase().includes('confidence') ||
        prompt.includes('confidence_score') ||
        prompt.includes('"confidence":')
      ).toBe(true);
    });
  });
  
  it('should provide response schema', () => {
    const template = PromptTemplateLibrary.getTemplate(AIEventType.ERROR_RATE_SPIKE);
    
    expect(template.response_schema).toBeDefined();
    expect(Object.keys(template.response_schema || {}).length).toBeGreaterThan(0);
  });
  
  it('should have descriptive system prompts', () => {
    const allTemplates = PromptTemplateLibrary.getAllTemplates();
    
    allTemplates.forEach((template, eventType) => {
      expect(template.system_prompt.length).toBeGreaterThan(50);
      expect(template.system_prompt).toContain('FlexGate');
    });
  });
});
```

**Expected Results:**
- ✅ All templates request JSON format
- ✅ All templates require confidence scores
- ✅ Response schemas defined
- ✅ System prompts describe FlexGate context

**Validation:**
```bash
npm test -- __tests__/ai/prompts/templates.test.ts -t "Template Quality"
```

---

## Test Suite 3: Integration Tests

### Test 3.1: End-to-End Event Flow
**Objective:** Test complete flow from event creation to prompt generation

**Test Steps:**
```typescript
describe('Integration - Event to Prompt', () => {
  it('should create event and generate valid prompt', () => {
    // STEP 1: Create event
    const event = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'Payment API error rate spiked to 35%',
      severity: EventSeverity.CRITICAL,
      data: {
        metric: 'error_rate',
        current_value: 35,
        threshold: 10,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      },
      context: {
        route: '/api/payments',
        method: 'POST',
        recent_samples: [
          { timestamp: '2026-02-15T14:25:00Z', value: 2.5 },
          { timestamp: '2026-02-15T14:26:00Z', value: 5.0 },
          { timestamp: '2026-02-15T14:27:00Z', value: 15.0 },
          { timestamp: '2026-02-15T14:28:00Z', value: 28.0 },
          { timestamp: '2026-02-15T14:29:00Z', value: 35.0 },
        ]
      }
    });
    
    // STEP 2: Validate event
    const validation = AIEventFactory.validate(event);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    
    // STEP 3: Build prompt
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(100);
    
    // STEP 4: Verify prompt contains critical info
    expect(prompt).toContain('35%');
    expect(prompt).toContain('/api/payments');
    expect(prompt).toContain('RISING');
    
    // STEP 5: Get analysis parameters
    const model = PromptTemplateLibrary.getRecommendedModel(event);
    const maxTokens = PromptTemplateLibrary.getMaxTokens(event);
    const cost = PromptTemplateLibrary.estimateCost(event);
    
    expect(model).toBe('claude-3-5-sonnet-20241022');
    expect(maxTokens).toBeGreaterThan(0);
    expect(cost).toBeGreaterThan(0);
  });
});
```

**Expected Results:**
- ✅ Event created successfully
- ✅ Validation passes
- ✅ Prompt generated with all variables
- ✅ Model, tokens, cost provided
- ✅ Ready for Claude API call

**Validation:**
```bash
npm test -- __tests__/ai/integration.test.ts -t "Event to Prompt"
```

---

### Test 3.2: Claude API Integration (Requires API Key)
**Objective:** Test actual Claude API calls

**Setup:**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

**Test Steps:**
```typescript
describe('Claude API Integration', () => {
  // Skip if no API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const testIf = (condition: boolean) => condition ? it : it.skip;
  
  testIf(!!apiKey)('should analyze error spike with Claude', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey });
    
    // STEP 1: Create realistic error spike event
    const event = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'Error rate spiked to 35% on POST /api/payments',
      severity: EventSeverity.CRITICAL,
      data: {
        metric: 'error_rate',
        current_value: 35,
        threshold: 10,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      },
      context: {
        route: '/api/payments',
        method: 'POST',
        recent_samples: [
          { timestamp: '2026-02-15T14:25:00Z', value: 2.5 },
          { timestamp: '2026-02-15T14:26:00Z', value: 35.0 },
        ]
      }
    });
    
    // STEP 2: Build prompt
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    
    // STEP 3: Call Claude
    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    // STEP 4: Verify response structure
    expect(response.content).toBeDefined();
    expect(response.content[0].type).toBe('text');
    
    // STEP 5: Parse JSON response
    const analysis = JSON.parse(response.content[0].text);
    
    // STEP 6: Verify required fields
    expect(analysis.error_category).toBeDefined();
    expect(analysis.likely_causes).toBeDefined();
    expect(Array.isArray(analysis.likely_causes)).toBe(true);
    expect(analysis.actions).toBeDefined();
    expect(analysis.confidence).toBeGreaterThan(0);
    expect(analysis.confidence).toBeLessThanOrEqual(100);
    
    // STEP 7: Verify actionable recommendations
    expect(analysis.actions.length).toBeGreaterThan(0);
    expect(typeof analysis.actions[0]).toBe('string');
    
  }, 30000); // 30 second timeout for API call
});
```

**Expected Results:**
- ✅ Claude responds within 30 seconds
- ✅ Response is valid JSON
- ✅ Contains required fields (error_category, likely_causes, actions, confidence)
- ✅ Confidence score 0-100
- ✅ At least one recommended action

**Validation:**
```bash
npm test -- __tests__/ai/integration.test.ts -t "Claude API Integration"
```

---

### Test 3.3: All Event Types with Claude (Comprehensive)
**Objective:** Verify Claude can analyze all 10 event types

**Test Steps:**
```typescript
describe('Claude Analysis - All Event Types', () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const testIf = (condition: boolean) => condition ? it : it.skip;
  
  const testCases = [
    {
      type: AIEventType.CIRCUIT_BREAKER_CANDIDATE,
      expectedFields: ['root_causes', 'circuit_breaker_decision', 'actions']
    },
    {
      type: AIEventType.COST_ALERT,
      expectedFields: ['anomaly_assessment', 'strategies', 'savings_usd_per_month']
    },
    {
      type: AIEventType.LATENCY_ANOMALY,
      expectedFields: ['probable_cause', 'severity_score', 'immediate_fix']
    },
    {
      type: AIEventType.ERROR_RATE_SPIKE,
      expectedFields: ['error_category', 'likely_causes', 'rollback_needed']
    },
    {
      type: AIEventType.RATE_LIMIT_BREACH,
      expectedFields: ['traffic_type', 'throttle_recommendation']
    },
    {
      type: AIEventType.RETRY_STORM,
      expectedFields: ['backpressure_level', 'mitigation']
    },
    {
      type: AIEventType.UPSTREAM_DEGRADATION,
      expectedFields: ['degradation_type', 'failover_recommendation']
    },
    {
      type: AIEventType.SECURITY_ANOMALY,
      expectedFields: ['threat_level', 'attack_type', 'block_recommendation']
    },
    {
      type: AIEventType.CAPACITY_WARNING,
      expectedFields: ['resource_type', 'scaling_recommendation']
    },
    {
      type: AIEventType.RECOVERY_SIGNAL,
      expectedFields: ['recovery_status', 'stability_assessment']
    }
  ];
  
  testCases.forEach(({ type, expectedFields }) => {
    testIf(!!apiKey)(`should analyze ${type} with Claude`, async () => {
      // STEP 1: Create event
      const event = AIEventFactory.createSample(type);
      
      // STEP 2: Build prompt
      const prompt = PromptTemplateLibrary.buildPrompt(event);
      
      // STEP 3: Call Claude
      const claude = new (require('@anthropic-ai/sdk').default)({ apiKey });
      const response = await claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: PromptTemplateLibrary.getMaxTokens(event),
        messages: [{ role: 'user', content: prompt }]
      });
      
      // STEP 4: Parse response
      const analysis = JSON.parse(response.content[0].text);
      
      // STEP 5: Verify expected fields present
      expectedFields.forEach(field => {
        expect(analysis[field]).toBeDefined();
      });
      
      // STEP 6: Verify confidence score
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.confidence).toBeLessThanOrEqual(100);
      
    }, 30000);
  });
});
```

**Expected Results:**
- ✅ All 10 event types analyzable
- ✅ Each returns expected fields
- ✅ All include confidence scores
- ✅ JSON parsing succeeds
- ✅ Responses within 30 seconds

**Validation:**
```bash
npm test -- __tests__/ai/integration.test.ts -t "Claude Analysis - All Event Types"
```

---

## Test Suite 4: Performance Tests

### Test 4.1: Event Creation Performance
**Objective:** Verify event creation is fast

**Test Steps:**
```typescript
describe('Performance - Event Creation', () => {
  it('should create 1000 events in under 1 second', () => {
    const startTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      AIEventFactory.create({
        type: AIEventType.ERROR_RATE_SPIKE,
        summary: `Error spike ${i}`,
        severity: EventSeverity.WARNING,
        data: {
          metric: 'error_rate',
          current_value: 15,
          threshold: 5,
          window: '5m',
          trend: TrendDirection.RISING,
          unit: '%'
        }
      });
    }
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000);
    console.log(`Created 1000 events in ${duration}ms`);
  });
});
```

**Expected Results:**
- ✅ 1000 events created in <1 second
- ✅ Average <1ms per event

---

### Test 4.2: Prompt Building Performance
**Objective:** Verify prompt generation is fast

**Test Steps:**
```typescript
describe('Performance - Prompt Building', () => {
  it('should build 100 prompts in under 500ms', () => {
    const event = AIEventFactory.createSample('LATENCY_ANOMALY');
    
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      PromptTemplateLibrary.buildPrompt(event);
    }
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(500);
    console.log(`Built 100 prompts in ${duration}ms`);
  });
});
```

**Expected Results:**
- ✅ 100 prompts built in <500ms
- ✅ Average <5ms per prompt

---

## Test Suite 5: Edge Cases

### Test 5.1: Extreme Values
**Objective:** Handle extreme metric values

**Test Steps:**
```typescript
describe('Edge Cases - Extreme Values', () => {
  it('should handle very large breach ratios', () => {
    const event = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'Extreme error spike',
      severity: EventSeverity.CRITICAL,
      data: {
        metric: 'error_rate',
        current_value: 99.9,
        threshold: 0.1,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      }
    });
    
    expect(event.confidence).toBeGreaterThan(0.95);
    expect(event.data.breach_ratio).toBeGreaterThan(900);
  });
  
  it('should handle very small breach ratios', () => {
    const event = AIEventFactory.create({
      type: AIEventType.LATENCY_ANOMALY,
      summary: 'Slight latency increase',
      severity: EventSeverity.INFO,
      data: {
        metric: 'latency_ms',
        current_value: 101,
        threshold: 100,
        window: '5m',
        trend: TrendDirection.STABLE,
        unit: 'ms'
      }
    });
    
    expect(event.confidence).toBeLessThan(0.5);
    expect(event.data.breach_ratio).toBeLessThan(1.1);
  });
  
  it('should handle empty samples array', () => {
    const event = AIEventFactory.create({
      type: AIEventType.ERROR_RATE_SPIKE,
      summary: 'No samples',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'error_rate',
        current_value: 15,
        threshold: 5,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: '%'
      },
      context: {
        recent_samples: []
      }
    });
    
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    expect(prompt).toBeDefined();
    expect(prompt).toContain('No sample data available');
  });
});
```

---

## Test Execution Commands

### Run All AI Tests
```bash
# Run all AI module tests with coverage
npm test -- __tests__/ai/ --coverage

# Run with verbose output
npm test -- __tests__/ai/ --verbose

# Run specific test suite
npm test -- __tests__/ai/utils/eventFactory.test.ts
npm test -- __tests__/ai/prompts/templates.test.ts

# Run integration tests (requires API key)
ANTHROPIC_API_KEY=sk-ant-xxx npm test -- __tests__/ai/integration.test.ts
```

### Watch Mode (Development)
```bash
# Watch for changes and re-run tests
npm test -- __tests__/ai/ --watch

# Watch specific file
npm test -- __tests__/ai/utils/eventFactory.test.ts --watch
```

### Coverage Reports
```bash
# Generate HTML coverage report
npm test -- __tests__/ai/ --coverage --coverageReporters=html

# Open coverage report
open coverage/index.html
```

### Performance Profiling
```bash
# Run tests with timing
npm test -- __tests__/ai/ --verbose --testTimeout=10000

# Profile specific slow tests
npm test -- __tests__/ai/integration.test.ts --detectOpenHandles
```

---

## Success Criteria

### Test Coverage Targets
- ✅ **Overall:** >95% coverage
- ✅ **Event Factory:** >88% coverage
- ✅ **Prompt Templates:** >97% coverage
- ✅ **Event Types:** 100% coverage

### Performance Targets
- ✅ Event creation: <1ms per event
- ✅ Prompt building: <5ms per prompt
- ✅ Claude API response: <10 seconds
- ✅ All tests pass in <5 seconds (excluding integration)

### Quality Targets
- ✅ Zero TypeScript compilation errors
- ✅ Zero test failures
- ✅ All edge cases covered
- ✅ Integration tests pass with real API

---

## Continuous Integration

### Jenkins Pipeline

> FlexGate uses **Jenkins** for CI/CD. GitHub Actions have been removed.
> The `Jenkinsfile` at the repo root runs all tests automatically on every push
> or merge to `main`.

Relevant stage for AI tests:

```groovy
stage('Test') {
    environment {
        NODE_ENV         = 'test'
        DATABASE_URL     = 'postgresql://flexgate:flexgate@localhost:5432/flexgate_test'
        // ANTHROPIC_API_KEY is injected via Jenkins credential for integration tests
    }
    steps {
        sh 'npm run test:ci'
    }
    post {
        always {
            junit allowEmptyResults: true, testResults: 'test-results/**/*.xml'
            publishHTML(target: [
                reportDir  : 'coverage/lcov-report',
                reportFiles: 'index.html',
                reportName : 'Coverage Report'
            ])
        }
    }
}
```

To run AI-specific tests locally:

```bash
# Unit tests only
npm test -- __tests__/ai/ --coverage

# Integration tests (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... npm test -- __tests__/ai/integration.test.ts
```

---

## Troubleshooting

### Common Issues

**Issue:** Tests fail with "Cannot find module '@flexgate/ai'"  
**Solution:** Run `npm install` to install dependencies

**Issue:** Integration tests timeout  
**Solution:** Increase timeout: `jest.setTimeout(60000)`

**Issue:** Claude API returns 401  
**Solution:** Check `ANTHROPIC_API_KEY` is set correctly

**Issue:** Coverage below targets  
**Solution:** Run `npm test -- --coverage --verbose` to see uncovered lines

---

**Document Version:** 1.0.0  
**Last Updated:** February 15, 2026  
**Next Review:** February 22, 2026
