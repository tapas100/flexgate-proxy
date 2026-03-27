# AI Features Test Scenarios

**Comprehensive Test Cases** | **Version:** 1.0.0 | **Updated:** Feb 15, 2026

---

## Overview

This document provides realistic test scenarios for all AI features, including:
- ✅ Input data
- ✅ Expected outputs
- ✅ Validation criteria
- ✅ Real-world context

---

## Scenario 1: Payment API Error Spike

### Context
**Time:** 14:27 UTC  
**Route:** POST /api/v2/payments  
**Upstream:** stripe-payment-service  
**Baseline Error Rate:** 2.5%  
**Current Error Rate:** 35%  

### Input Event Data
```typescript
const event = AIEventFactory.create({
  type: AIEventType.ERROR_RATE_SPIKE,
  summary: 'Error rate spiked to 35% on POST /api/v2/payments',
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
    route: '/api/v2/payments',
    method: 'POST',
    upstream: 'stripe-payment-service',
    recent_samples: [
      { timestamp: '2026-02-15T14:22:00Z', value: 2.5 },
      { timestamp: '2026-02-15T14:23:00Z', value: 3.1 },
      { timestamp: '2026-02-15T14:24:00Z', value: 8.5 },
      { timestamp: '2026-02-15T14:25:00Z', value: 18.2 },
      { timestamp: '2026-02-15T14:26:00Z', value: 28.5 },
      { timestamp: '2026-02-15T14:27:00Z', value: 35.0 }
    ],
    error_types: {
      'stripe_api_error': 65,
      'timeout': 25,
      'validation_error': 10
    },
    affected_endpoints: [
      { endpoint: '/api/v2/payments', error_rate: 35 },
      { endpoint: '/api/v2/refunds', error_rate: 12 }
    ]
  }
});
```

### Expected Event Output
```json
{
  "id": "evt_1708009620_a3f5d9e1",
  "type": "ERROR_RATE_SPIKE",
  "timestamp": "2026-02-15T14:27:00Z",
  "severity": "CRITICAL",
  "confidence": 0.92,
  "summary": "Error rate spiked to 35% on POST /api/v2/payments",
  "data": {
    "metric": "error_rate",
    "current_value": 35,
    "threshold": 10,
    "breach_ratio": 3.5,
    "window": "5m",
    "trend": "RISING",
    "unit": "%"
  },
  "context": { /* ... */ }
}
```

### Expected Claude Analysis
```json
{
  "error_category": "UPSTREAM_API_FAILURE",
  "likely_causes": [
    "Stripe API experiencing high latency or rate limiting",
    "Recent deployment introduced invalid payment request format",
    "Authentication token expiration affecting 65% of requests"
  ],
  "severity_assessment": {
    "business_impact": "CRITICAL",
    "revenue_at_risk_per_hour": "$12,500",
    "affected_customers": "~450 customers/hour"
  },
  "immediate_actions": [
    "Enable circuit breaker on /api/v2/payments (TRIP after 3 failures)",
    "Route payments through fallback processor (PayPal API)",
    "Alert on-call engineer via PagerDuty"
  ],
  "root_cause_investigation": [
    "Check Stripe API status page",
    "Review last 3 deployments to payment service",
    "Verify API credentials haven't expired"
  ],
  "rollback_needed": true,
  "rollback_target": "deployment-abc123 (deployed 14:15 UTC)",
  "confidence": 88,
  "estimated_resolution_time": "8-15 minutes"
}
```

### Validation Steps
```typescript
describe('Scenario 1: Payment API Error Spike', () => {
  it('should create high-confidence critical event', () => {
    expect(event.severity).toBe(EventSeverity.CRITICAL);
    expect(event.confidence).toBeGreaterThan(0.85);
    expect(event.data.breach_ratio).toBe(3.5);
  });
  
  it('should generate actionable Claude prompt', () => {
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    
    expect(prompt).toContain('35%');
    expect(prompt).toContain('stripe-payment-service');
    expect(prompt).toContain('RISING');
    expect(prompt.length).toBeLessThan(4000); // ~1000 tokens
  });
  
  it('should receive structured Claude analysis', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.error_category).toBeDefined();
    expect(analysis.immediate_actions.length).toBeGreaterThan(0);
    expect(analysis.rollback_needed).toBe(true);
    expect(analysis.confidence).toBeGreaterThan(70);
  });
});
```

---

## Scenario 2: Gradual Latency Degradation

### Context
**Time:** 09:15 UTC  
**Route:** GET /api/v1/users/:id  
**Upstream:** postgres-read-replica-1  
**Baseline P95 Latency:** 120ms  
**Current P95 Latency:** 1,850ms  

### Input Event Data
```typescript
const event = AIEventFactory.create({
  type: AIEventType.LATENCY_ANOMALY,
  summary: 'P95 latency increased to 1.85s on GET /api/v1/users/:id',
  severity: EventSeverity.WARNING,
  data: {
    metric: 'p95_latency_ms',
    current_value: 1850,
    threshold: 500,
    window: '15m',
    trend: TrendDirection.RISING,
    unit: 'ms'
  },
  context: {
    route: '/api/v1/users/:id',
    method: 'GET',
    upstream: 'postgres-read-replica-1',
    recent_samples: [
      { timestamp: '2026-02-15T09:00:00Z', value: 125 },
      { timestamp: '2026-02-15T09:03:00Z', value: 180 },
      { timestamp: '2026-02-15T09:06:00Z', value: 320 },
      { timestamp: '2026-02-15T09:09:00Z', value: 680 },
      { timestamp: '2026-02-15T09:12:00Z', value: 1240 },
      { timestamp: '2026-02-15T09:15:00Z', value: 1850 }
    ],
    database_metrics: {
      active_connections: 95,
      max_connections: 100,
      query_queue_depth: 42,
      slow_query_count: 18
    },
    related_metrics: {
      cpu_usage: 78,
      memory_usage: 82,
      disk_io_wait: 0.3
    }
  }
});
```

### Expected Event Output
```json
{
  "id": "evt_1708009620_b7c2e4f8",
  "type": "LATENCY_ANOMALY",
  "timestamp": "2026-02-15T09:15:00Z",
  "severity": "WARNING",
  "confidence": 0.89,
  "summary": "P95 latency increased to 1.85s on GET /api/v1/users/:id",
  "data": {
    "metric": "p95_latency_ms",
    "current_value": 1850,
    "threshold": 500,
    "breach_ratio": 3.7,
    "window": "15m",
    "trend": "RISING",
    "unit": "ms"
  }
}
```

### Expected Claude Analysis
```json
{
  "probable_cause": "DATABASE_CONNECTION_EXHAUSTION",
  "contributing_factors": [
    "Connection pool at 95% capacity (95/100 connections)",
    "42 queries waiting in queue",
    "18 slow queries consuming connections longer than usual",
    "Gradual degradation pattern suggests resource saturation, not sudden failure"
  ],
  "severity_score": 75,
  "business_impact": "Medium - User profile loads delayed, but not failing",
  "immediate_fix": {
    "action": "Increase connection pool size",
    "implementation": "Set postgres.max_connections=150 and app.pool_size=120",
    "expected_improvement": "Latency should drop to <500ms within 2 minutes"
  },
  "short_term_mitigations": [
    "Add read replica to connection pool (postgres-read-replica-2)",
    "Enable query result caching for user profile endpoint (TTL: 60s)",
    "Implement request queuing with 503 responses when pool exhausted"
  ],
  "long_term_fixes": [
    "Optimize slow queries (add indexes on user_metadata table)",
    "Implement application-level connection pooling (PgBouncer)",
    "Set up auto-scaling for read replicas based on connection count"
  ],
  "monitoring_recommendations": [
    "Alert when connection pool >80% full",
    "Track slow query count trend",
    "Monitor replication lag on read replicas"
  ],
  "confidence": 85,
  "estimated_resolution_time": "5-10 minutes (immediate fix)",
  "requires_human_decision": false
}
```

### Validation Steps
```typescript
describe('Scenario 2: Gradual Latency Degradation', () => {
  it('should detect gradual degradation pattern', () => {
    const trend = AIEventFactory.detectTrend(event.context.recent_samples);
    
    expect(trend.direction).toBe(TrendDirection.RISING);
    expect(trend.slope).toBeGreaterThan(200); // >200ms increase per sample
    expect(trend.correlation).toBeGreaterThan(0.95); // Strong correlation
  });
  
  it('should provide database-specific analysis', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.probable_cause).toContain('DATABASE');
    expect(analysis.immediate_fix).toBeDefined();
    expect(analysis.long_term_fixes.length).toBeGreaterThan(0);
  });
  
  it('should calculate accurate confidence with database context', () => {
    // High confidence due to:
    // - Clear rising trend
    // - Strong breach ratio (3.7x)
    // - Rich context (DB metrics)
    expect(event.confidence).toBeGreaterThan(0.85);
  });
});
```

---

## Scenario 3: Token Cost Spike

### Context
**Time:** 11:45 UTC  
**Route:** POST /api/v1/chat/completions  
**Upstream:** openai-gpt4-api  
**Baseline Daily Cost:** $245  
**Current Daily Cost:** $1,820  

### Input Event Data
```typescript
const event = AIEventFactory.create({
  type: AIEventType.COST_ALERT,
  summary: 'Token costs spiked to $1,820/day (7.4x baseline)',
  severity: EventSeverity.WARNING,
  data: {
    metric: 'cost_usd_per_day',
    current_value: 1820,
    threshold: 500,
    window: '24h',
    trend: TrendDirection.RISING,
    unit: 'usd'
  },
  context: {
    route: '/api/v1/chat/completions',
    upstream: 'openai-gpt4-api',
    recent_samples: [
      { timestamp: '2026-02-14T11:45:00Z', value: 245 },
      { timestamp: '2026-02-14T17:45:00Z', value: 380 },
      { timestamp: '2026-02-14T23:45:00Z', value: 720 },
      { timestamp: '2026-02-15T05:45:00Z', value: 1240 },
      { timestamp: '2026-02-15T11:45:00Z', value: 1820 }
    ],
    cost_breakdown: {
      'gpt-4-turbo': { requests: 12500, tokens: 18500000, cost: 1480 },
      'gpt-3.5-turbo': { requests: 8200, tokens: 4100000, cost: 340 }
    },
    top_consumers: [
      { user_id: 'user_abc123', requests: 4200, cost: 680 },
      { user_id: 'user_xyz789', requests: 3800, cost: 520 },
      { user_id: 'automated_bot_1', requests: 2100, cost: 280 }
    ],
    recent_changes: [
      'Deployed new chat feature to beta users (2026-02-14 16:00 UTC)',
      'Increased context window from 4k to 16k tokens (2026-02-14 18:30 UTC)'
    ]
  }
});
```

### Expected Claude Analysis
```json
{
  "anomaly_assessment": "LEGITIMATE_USAGE_SPIKE",
  "root_causes": [
    "Context window increased 4x (4k→16k tokens) on 2026-02-14 18:30 UTC",
    "New beta chat feature driving 40% increase in request volume",
    "User 'user_abc123' sent 4,200 requests ($680) - possible testing/abuse"
  ],
  "cost_breakdown_insights": {
    "primary_driver": "Context window expansion (4x token usage per request)",
    "model_mix": "GPT-4 Turbo accounts for 81% of costs vs baseline 65%",
    "user_behavior": "Top 3 users consume 41% of total costs"
  },
  "optimization_strategies": [
    {
      "strategy": "Reduce context window to 8k tokens",
      "implementation": "Set max_context_tokens=8000 in chat config",
      "estimated_savings_per_month": "$18,450",
      "trade_off": "May reduce conversation quality for complex queries"
    },
    {
      "strategy": "Implement tiered model routing",
      "implementation": "Route simple queries to GPT-3.5, complex to GPT-4",
      "estimated_savings_per_month": "$12,800",
      "trade_off": "Requires classification logic (add 50ms latency)"
    },
    {
      "strategy": "Add per-user rate limiting",
      "implementation": "Limit beta users to 100 requests/day",
      "estimated_savings_per_month": "$8,200",
      "trade_off": "May frustrate power users"
    },
    {
      "strategy": "Enable prompt caching",
      "implementation": "Cache system prompts (reduce input tokens 60%)",
      "estimated_savings_per_month": "$22,100",
      "trade_off": "Requires OpenAI API upgrade"
    }
  ],
  "immediate_actions": [
    "Reduce context window to 8k tokens (deploy in 5 min)",
    "Contact user 'user_abc123' - possible bot/testing",
    "Enable request logging for cost attribution"
  ],
  "recommended_strategy": "Implement strategies 1 and 4 (reduce context + prompt caching)",
  "total_savings_usd_per_month": 40550,
  "payback_period_days": 0,
  "confidence": 92,
  "requires_business_approval": true,
  "approval_reason": "Reducing context window may impact user experience"
}
```

### Validation Steps
```typescript
describe('Scenario 3: Token Cost Spike', () => {
  it('should identify cost optimization opportunities', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.optimization_strategies.length).toBeGreaterThan(2);
    expect(analysis.total_savings_usd_per_month).toBeGreaterThan(10000);
    
    analysis.optimization_strategies.forEach(strategy => {
      expect(strategy.implementation).toBeDefined();
      expect(strategy.estimated_savings_per_month).toBeGreaterThan(0);
      expect(strategy.trade_off).toBeDefined();
    });
  });
  
  it('should calculate ROI correctly', async () => {
    const analysis = await callClaudeAPI(event);
    
    // Cost reduction should exceed implementation cost immediately
    expect(analysis.payback_period_days).toBeLessThan(30);
    expect(analysis.total_savings_usd_per_month).toBeGreaterThan(
      event.data.current_value - event.data.threshold
    );
  });
  
  it('should flag business approval needs', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.requires_business_approval).toBe(true);
    expect(analysis.approval_reason).toContain('user experience');
  });
});
```

---

## Scenario 4: Retry Storm Detection

### Context
**Time:** 16:32 UTC  
**Route:** POST /api/v1/orders  
**Upstream:** inventory-service  
**Baseline Retry Rate:** 0.8%  
**Current Retry Rate:** 42%  

### Input Event Data
```typescript
const event = AIEventFactory.create({
  type: AIEventType.RETRY_STORM,
  summary: 'Retry storm detected: 42% of requests retrying (52x baseline)',
  severity: EventSeverity.CRITICAL,
  data: {
    metric: 'retry_rate',
    current_value: 42,
    threshold: 5,
    window: '5m',
    trend: TrendDirection.RISING,
    unit: '%'
  },
  context: {
    route: '/api/v1/orders',
    method: 'POST',
    upstream: 'inventory-service',
    recent_samples: [
      { timestamp: '2026-02-15T16:27:00Z', value: 0.8 },
      { timestamp: '2026-02-15T16:28:00Z', value: 2.1 },
      { timestamp: '2026-02-15T16:29:00Z', value: 8.5 },
      { timestamp: '2026-02-15T16:30:00Z', value: 22.0 },
      { timestamp: '2026-02-15T16:31:00Z', value: 35.0 },
      { timestamp: '2026-02-15T16:32:00Z', value: 42.0 }
    ],
    retry_details: {
      max_attempts_reached: 1240,
      avg_retry_count: 3.2,
      retry_reasons: {
        'timeout': 68,
        '503_service_unavailable': 22,
        'connection_reset': 10
      }
    },
    upstream_health: {
      response_time_p95: 8500,
      error_rate: 12,
      active_connections: 450,
      queue_depth: 180
    }
  }
});
```

### Expected Claude Analysis
```json
{
  "storm_severity": "CRITICAL",
  "backpressure_level": 92,
  "root_cause": "Upstream service (inventory-service) overwhelmed by retry traffic",
  "cascading_failure_risk": "HIGH",
  "failure_chain": [
    "inventory-service experiencing high latency (8.5s P95)",
    "Clients timing out after 5s, triggering automatic retries",
    "Retry traffic amplifying load on already-stressed service",
    "1,240 requests reached max retry attempts (compounding problem)",
    "Risk: Will cascade to database layer within 3-5 minutes"
  ],
  "immediate_mitigation": {
    "action": "ENABLE_CIRCUIT_BREAKER",
    "config": {
      "failure_threshold": 3,
      "timeout_ms": 5000,
      "open_duration_ms": 30000,
      "half_open_requests": 5
    },
    "expected_outcome": "Stop retry storm within 30 seconds, allow upstream to recover"
  },
  "secondary_mitigations": [
    "Increase upstream timeout to 10s (reduce premature retries)",
    "Implement exponential backoff (2s, 4s, 8s instead of immediate retry)",
    "Add jitter to retry delays (prevent thundering herd)",
    "Enable request shedding on upstream (503 responses when queue >100)"
  ],
  "recovery_plan": [
    {
      "step": 1,
      "action": "Enable circuit breaker (stop new requests)",
      "duration": "30 seconds",
      "expected_result": "Retry rate drops to 0%, upstream queue drains"
    },
    {
      "step": 2,
      "action": "Scale inventory-service to 6 instances (currently 3)",
      "duration": "2 minutes",
      "expected_result": "Capacity increased 2x, latency drops"
    },
    {
      "step": 3,
      "action": "Half-open circuit breaker (allow 5 test requests)",
      "duration": "1 minute",
      "expected_result": "Verify latency <2s before full recovery"
    },
    {
      "step": 4,
      "action": "Full circuit breaker reset",
      "duration": "30 seconds",
      "expected_result": "Normal traffic resumes, monitor for regression"
    }
  ],
  "long_term_fixes": [
    "Implement adaptive timeout based on P95 latency",
    "Add request queuing with backpressure signals",
    "Set up auto-scaling for inventory-service (CPU >70%)",
    "Implement graceful degradation (return cached inventory when unavailable)"
  ],
  "estimated_revenue_impact_per_minute": "$2,400",
  "estimated_total_recovery_time": "4-6 minutes",
  "confidence": 94,
  "human_intervention_required": true,
  "escalation_needed": "Alert infrastructure team immediately"
}
```

### Validation Steps
```typescript
describe('Scenario 4: Retry Storm Detection', () => {
  it('should identify cascading failure risk', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.cascading_failure_risk).toBe('HIGH');
    expect(analysis.failure_chain.length).toBeGreaterThan(3);
    expect(analysis.backpressure_level).toBeGreaterThan(80);
  });
  
  it('should provide immediate circuit breaker config', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.immediate_mitigation.action).toBe('ENABLE_CIRCUIT_BREAKER');
    expect(analysis.immediate_mitigation.config.failure_threshold).toBeDefined();
    expect(analysis.immediate_mitigation.config.timeout_ms).toBeDefined();
  });
  
  it('should estimate business impact', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.estimated_revenue_impact_per_minute).toMatch(/\$\d+/);
    expect(analysis.estimated_total_recovery_time).toBeDefined();
  });
});
```

---

## Scenario 5: Security Anomaly (DDoS Pattern)

### Context
**Time:** 03:42 UTC  
**Route:** GET /api/v1/public/search  
**Source IPs:** 1,240 unique IPs (87% from similar ASN ranges)  
**Baseline RPS:** 120  
**Current RPS:** 8,500  

### Input Event Data
```typescript
const event = AIEventFactory.create({
  type: AIEventType.SECURITY_ANOMALY,
  summary: 'Unusual traffic pattern: 8,500 RPS from 1,240 IPs (70x baseline)',
  severity: EventSeverity.CRITICAL,
  data: {
    metric: 'requests_per_second',
    current_value: 8500,
    threshold: 500,
    window: '10m',
    trend: TrendDirection.RISING,
    unit: 'rps'
  },
  context: {
    route: '/api/v1/public/search',
    method: 'GET',
    recent_samples: [
      { timestamp: '2026-02-15T03:32:00Z', value: 120 },
      { timestamp: '2026-02-15T03:34:00Z', value: 450 },
      { timestamp: '2026-02-15T03:36:00Z', value: 1800 },
      { timestamp: '2026-02-15T03:38:00Z', value: 4200 },
      { timestamp: '2026-02-15T03:40:00Z', value: 6800 },
      { timestamp: '2026-02-15T03:42:00Z', value: 8500 }
    ],
    traffic_analysis: {
      unique_ips: 1240,
      top_asn: 'AS15169',
      asn_concentration: 87,
      user_agents: [
        { ua: 'curl/7.68.0', percentage: 42 },
        { ua: 'python-requests/2.28.0', percentage: 35 },
        { ua: 'Mozilla/5.0 (legitimate)', percentage: 23 }
      ],
      geographic_distribution: {
        'US-EAST': 34,
        'EU-WEST': 28,
        'AP-SOUTHEAST': 22,
        'OTHER': 16
      },
      request_patterns: {
        same_query_repeated: true,
        query_variation_low: 0.12,
        requests_per_ip_avg: 6.8,
        requests_per_ip_max: 240
      }
    },
    resource_impact: {
      cpu_usage: 92,
      memory_usage: 78,
      database_connections: 185,
      response_time_p95: 2400
    }
  }
});
```

### Expected Claude Analysis
```json
{
  "threat_level": "CRITICAL",
  "attack_type": "DISTRIBUTED_APPLICATION_LAYER_DDOS",
  "attack_characteristics": {
    "classification": "Low-and-slow distributed attack",
    "sophistication": "MEDIUM",
    "likely_motivation": "Service disruption or resource exhaustion",
    "attack_vector": "Public search API abuse"
  },
  "evidence": [
    "87% of traffic from single ASN (AS15169) - likely cloud-hosted bots",
    "42% using curl, 35% python-requests - automated tools",
    "Query variation extremely low (0.12) - same queries repeated",
    "One IP sent 240 requests (35x average) - clear bot pattern",
    "Traffic spike correlates with off-hours (03:00 UTC) - deliberate timing"
  ],
  "false_positive_probability": 8,
  "block_recommendation": {
    "action": "RATE_LIMIT_AND_CHALLENGE",
    "implementation": [
      "Enable aggressive rate limiting: 10 req/min per IP on /api/v1/public/search",
      "Block IPs exceeding 50 requests total",
      "Require CAPTCHA for IPs with suspicious user agents (curl, python-requests)",
      "Geo-fence if attack concentrated in specific regions"
    ],
    "expected_blocked_percentage": 78,
    "false_positive_risk": "LOW (legitimate users unlikely at 03:00 UTC)"
  },
  "immediate_defense": [
    {
      "layer": "Edge (CDN/WAF)",
      "action": "Enable CloudFlare 'Under Attack' mode",
      "effectiveness": "Block 60-70% of malicious traffic"
    },
    {
      "layer": "Application",
      "action": "Enable circuit breaker on search endpoint",
      "effectiveness": "Prevent database overload"
    },
    {
      "layer": "Database",
      "action": "Enable read replica failover",
      "effectiveness": "Distribute query load"
    }
  ],
  "investigation_steps": [
    "Capture PCAP of attack traffic for forensics",
    "Review search query content (looking for scraping patterns)",
    "Check if attack targeting specific vulnerability (SQLi, RCE)",
    "Contact abuse team at AS15169 to report malicious traffic"
  ],
  "long_term_hardening": [
    "Implement request fingerprinting (TLS, HTTP/2 fingerprints)",
    "Add honeypot endpoints to identify automated scrapers",
    "Require API keys for public endpoints (rate limit per key)",
    "Set up anomaly detection ML model for traffic patterns"
  ],
  "estimated_attack_cost_to_attacker": "$120-$200 (cloud compute)",
  "estimated_cost_to_defend": "$0 (using existing rate limiting)",
  "estimated_business_impact": "~$800/hour (degraded legitimate user experience)",
  "confidence": 96,
  "recommended_escalation": "Security team + Infrastructure team",
  "legal_considerations": "Consider filing abuse report with hosting providers"
}
```

### Validation Steps
```typescript
describe('Scenario 5: Security Anomaly (DDoS)', () => {
  it('should detect attack patterns', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.threat_level).toBe('CRITICAL');
    expect(analysis.attack_type).toContain('DDOS');
    expect(analysis.evidence.length).toBeGreaterThan(3);
  });
  
  it('should provide layered defense strategy', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.immediate_defense.length).toBeGreaterThan(2);
    
    const layers = analysis.immediate_defense.map(d => d.layer);
    expect(layers).toContain('Edge (CDN/WAF)');
    expect(layers).toContain('Application');
  });
  
  it('should estimate attack cost and business impact', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.estimated_attack_cost_to_attacker).toBeDefined();
    expect(analysis.estimated_business_impact).toBeDefined();
    expect(analysis.confidence).toBeGreaterThan(90);
  });
});
```

---

## Scenario 6: Successful Auto-Recovery

### Context
**Time:** 22:18 UTC  
**Route:** GET /api/v1/products  
**Previous Event:** Circuit breaker opened at 22:05 UTC  
**Current State:** Service recovered, latency normal  

### Input Event Data
```typescript
const event = AIEventFactory.create({
  type: AIEventType.RECOVERY_SIGNAL,
  summary: 'Circuit breaker auto-recovery: latency normalized to 85ms (95% below threshold)',
  severity: EventSeverity.INFO,
  data: {
    metric: 'p95_latency_ms',
    current_value: 85,
    threshold: 500,
    window: '5m',
    trend: TrendDirection.FALLING,
    unit: 'ms'
  },
  context: {
    route: '/api/v1/products',
    upstream: 'product-catalog-service',
    recovery_timeline: [
      { timestamp: '2026-02-15T22:05:00Z', event: 'Circuit breaker OPEN', latency: 5200 },
      { timestamp: '2026-02-15T22:07:00Z', event: 'Upstream scaled 2x (4→8 instances)' },
      { timestamp: '2026-02-15T22:10:00Z', event: 'Circuit breaker HALF-OPEN', latency: 420 },
      { timestamp: '2026-02-15T22:12:00Z', event: 'Test requests successful (5/5)', latency: 180 },
      { timestamp: '2026-02-15T22:15:00Z', event: 'Circuit breaker CLOSED', latency: 120 },
      { timestamp: '2026-02-15T22:18:00Z', event: 'Latency fully normalized', latency: 85 }
    ],
    recovery_metrics: {
      downtime_minutes: 13,
      requests_blocked: 8400,
      requests_successful_after_recovery: 1250,
      error_rate_before: 42,
      error_rate_after: 0.8,
      latency_improvement: '98.4%'
    },
    root_cause_identified: 'Database connection pool exhaustion',
    fix_applied: 'Scaled product-catalog-service + increased connection pool'
  }
});
```

### Expected Claude Analysis
```json
{
  "recovery_status": "FULLY_RECOVERED",
  "recovery_quality_score": 96,
  "stability_assessment": {
    "is_stable": true,
    "confidence_level": 94,
    "risk_of_regression": "LOW",
    "evidence": [
      "Latency 85ms (83% below threshold) - healthy margin",
      "Error rate returned to baseline (0.8%)",
      "13-minute downtime aligned with scaling timeline",
      "5/5 half-open test requests successful",
      "Trend is FALLING - continuing to improve"
    ]
  },
  "root_cause_resolution": {
    "problem": "Database connection pool exhaustion",
    "fix": "Scaled service 2x + increased connection pool",
    "effectiveness": "98.4% latency improvement",
    "permanent": true
  },
  "incident_summary": {
    "total_duration_minutes": 13,
    "mttr_minutes": 13,
    "affected_requests": 8400,
    "business_impact": "~$180 revenue loss (13 min × $13.85/min)",
    "user_impact": "Medium - Some customers saw errors, most queued successfully"
  },
  "lessons_learned": [
    "Circuit breaker prevented cascading failure to other services",
    "Auto-scaling triggered appropriately (2x capacity in 2 minutes)",
    "Connection pool monitoring should alert earlier (pre-emptive scaling)"
  ],
  "recommended_follow_ups": [
    "Add alert: connection pool >70% (currently triggers at 90%)",
    "Document runbook for connection pool exhaustion",
    "Review other services for similar connection pool risks",
    "Consider implementing connection pool auto-scaling"
  ],
  "monitoring_recommendations": [
    "Continue monitoring for 24 hours (ensure no regression)",
    "Watch for similar patterns on other database-backed services",
    "Track connection pool utilization trend"
  ],
  "close_incident": true,
  "incident_report_ready": true,
  "confidence": 94
}
```

### Validation Steps
```typescript
describe('Scenario 6: Successful Auto-Recovery', () => {
  it('should confirm recovery status', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.recovery_status).toBe('FULLY_RECOVERED');
    expect(analysis.stability_assessment.is_stable).toBe(true);
    expect(analysis.stability_assessment.confidence_level).toBeGreaterThan(90);
  });
  
  it('should calculate MTTR accurately', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.incident_summary.mttr_minutes).toBe(13);
    expect(analysis.incident_summary.total_duration_minutes).toBe(13);
  });
  
  it('should recommend incident closure', async () => {
    const analysis = await callClaudeAPI(event);
    
    expect(analysis.close_incident).toBe(true);
    expect(analysis.lessons_learned.length).toBeGreaterThan(0);
    expect(analysis.recommended_follow_ups.length).toBeGreaterThan(0);
  });
});
```

---

## Running All Scenarios

### Test Command
```bash
npm test -- __tests__/ai/scenarios.test.ts --verbose
```

### Expected Results
- ✅ 6 scenarios tested
- ✅ All events created successfully
- ✅ All prompts generated
- ✅ All Claude analyses validate (if API key provided)
- ✅ Business impact calculated
- ✅ Actionable recommendations provided

### Performance Benchmarks
- Event creation: <1ms per scenario
- Prompt generation: <5ms per scenario
- Claude analysis: <8s per scenario
- Total test suite: <60s (with API calls)

---

**Document Version:** 1.0.0  
**Test Coverage:** 6 comprehensive scenarios  
**Lines of Code:** ~500 test assertions
