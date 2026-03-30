/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mock Claude API Service
 * 
 * Provides realistic sample responses for testing without requiring
 * a real Anthropic API key or subscription.
 */

interface IncidentData {
  event_type: string;
  severity: string;
  summary: string;
  metrics?: any;
  context?: any;
}

interface MockAnalysisResponse {
  analysis: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  responseTime: number;
}

/**
 * Generate mock Claude analysis based on incident type
 */
export function generateMockAnalysis(incident: IncidentData): MockAnalysisResponse {
  const analyses: Record<string, string> = {
    ERROR_RATE_SPIKE: `# 🔴 INCIDENT ANALYSIS

## EXECUTIVE SUMMARY
Critical error rate spike detected in the payment processing service. Immediate action required.

## ROOT CAUSE ANALYSIS

### Primary Issue
**Database Connection Pool Exhaustion**
- Connection pool size: 20 (configured maximum)
- Active connections: 20/20 (100% utilization)
- Waiting requests: 142 (queue building up)
- Average wait time: 3.2 seconds

### Contributing Factors
1. **Sudden Traffic Spike**: 3x normal load starting at 14:23 UTC
2. **Long-Running Transactions**: Payment validation queries taking 800ms avg (normal: 120ms)
3. **Missing Connection Timeout**: No automatic connection release on timeout

## IMPACT ASSESSMENT

**Severity**: ${incident.severity}
- Error Rate: 34% (baseline: 0.2%)
- Affected Users: ~1,200 (estimated)
- Revenue Impact: $12,400/hour (estimated)
- Customer Support Tickets: +47 in last 15 minutes

## IMMEDIATE ACTIONS REQUIRED

### 1. Scale Database Connections (DO THIS NOW)
\`\`\`sql
ALTER SYSTEM SET max_connections = 50;
SELECT pg_reload_conf();
\`\`\`

### 2. Add Connection Pool Settings
\`\`\`javascript
pool: {
  max: 40,
  min: 5,
  acquire: 30000,
  idle: 10000,
  evict: 1000
}
\`\`\`

### 3. Enable Circuit Breaker
- Threshold: 50% error rate
- Timeout: 30 seconds
- Fallback: Queue payments for retry

## MONITORING CHECKLIST

- [ ] Watch connection pool metrics
- [ ] Monitor error rate (target: <1% in 10 minutes)
- [ ] Track queue depth
- [ ] Verify payment retry queue processing

## PREVENTION STRATEGIES

### Short-term (This Week)
1. Implement connection pooling best practices
2. Add query performance monitoring
3. Set up auto-scaling triggers

### Long-term (This Month)
1. Database read replicas for reporting queries
2. Connection pool auto-scaling
3. Implement caching layer (Redis)
4. Load testing for 5x normal traffic

## ESTIMATED RESOLUTION TIME
- Immediate fix: 5-10 minutes
- Full recovery: 15-20 minutes
- Post-incident validation: 30 minutes

**Cost Estimate**: $0.0042 for this analysis`,

    LATENCY_ANOMALY: `# ⚠️ LATENCY ANOMALY DETECTED

## EXECUTIVE SUMMARY
P95 latency increased from 120ms to 1.2s (10x degradation). Database query optimization needed.

## ROOT CAUSE ANALYSIS

### Database Query Performance
**Problematic Query Identified**:
\`\`\`sql
SELECT * FROM orders 
WHERE status = 'pending' 
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
\`\`\`

**Issues**:
1. Missing index on (status, created_at)
2. SELECT * pulling unnecessary data
3. No query result caching

### Performance Metrics
- Query execution time: 980ms avg (was: 45ms)
- Rows scanned: 2.4M (should be: 120K)
- Index usage: Table scan (should be: Index scan)

## IMMEDIATE FIX

### 1. Add Composite Index
\`\`\`sql
CREATE INDEX CONCURRENTLY idx_orders_status_created 
ON orders(status, created_at DESC) 
WHERE status = 'pending';
\`\`\`

### 2. Optimize Query
\`\`\`sql
SELECT id, customer_id, total, created_at 
FROM orders 
WHERE status = 'pending' 
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;
\`\`\`

### 3. Add Redis Caching
\`\`\`javascript
const cacheKey = 'pending_orders_7d';
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const orders = await db.query(optimizedQuery);
await redis.setex(cacheKey, 300, JSON.stringify(orders)); // 5min cache
return orders;
\`\`\`

## EXPECTED RESULTS
- Latency: 1.2s → 80ms (93% improvement)
- Database load: -70%
- Cache hit rate: 85%+ (after warmup)

**Analysis Cost**: $0.0038`,

    CIRCUIT_BREAKER_CANDIDATE: `# 🔄 CIRCUIT BREAKER RECOMMENDATION

## SERVICE HEALTH ASSESSMENT

**Target Service**: ${incident.summary}
**Current Status**: Degraded (recommend protection)

## METRICS ANALYSIS

### Failure Patterns
- Error rate: 45% (last 5 minutes)
- Response time: P99 = 8.2s (timeout threshold: 5s)
- Success rate: 55% (critical threshold: 60%)

### Cascade Risk
**HIGH RISK** - This service is called by:
1. Payment API (15k req/min)
2. Order Processing (8k req/min)  
3. Notification Service (12k req/min)

**Potential Cascade**: All 3 services could fail if exhausting connection pools waiting for this service.

## RECOMMENDATION: ✅ ACTIVATE CIRCUIT BREAKER

### Configuration
\`\`\`javascript
{
  "threshold": 0.5,           // Open at 50% error rate
  "timeout": 30000,           // 30 seconds
  "resetTimeout": 60000,      // Try again after 1 minute
  "volumeThreshold": 20,      // Min 20 requests before opening
  "fallback": "queue_retry"   // Queue failed requests
}
\`\`\`

### Benefits
- Prevent cascade failures
- Fast-fail for clients (30ms vs 5s timeout)
- Automatic recovery detection
- Reduced database load during issues

### Fallback Strategy
1. Return cached data (if available)
2. Queue request for retry
3. Return graceful error to user

## IMPLEMENTATION

\`\`\`javascript
const breaker = new CircuitBreaker('external-service', {
  threshold: 0.5,
  timeout: 30000
});

async function callService(data) {
  if (breaker.isOpen()) {
    // Fast-fail, use fallback
    return getFallbackResponse(data);
  }
  
  try {
    const result = await service.call(data);
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}
\`\`\`

**Decision**: STRONGLY RECOMMEND immediate activation

**Analysis Cost**: $0.0045`,

    COST_ALERT: `# 💰 COST OPTIMIZATION ANALYSIS

## COST SPIKE DETECTED

**Current Monthly Projection**: $${(Math.random() * 5000 + 10000).toFixed(2)}
**Budget**: $12,000/month
**Overage**: ${((Math.random() * 5000 + 3000)).toFixed(2)} (${((Math.random() * 30 + 25)).toFixed(1)}% over budget)

## ROOT CAUSE BREAKDOWN

### 1. Database Costs (45% of total)
- **Issue**: Oversized instance running continuously
- **Current**: db.m5.2xlarge (8 vCPU, 32GB RAM)
- **Utilization**: 12% CPU, 28% RAM (severely underutilized)
- **Recommendation**: Downgrade to db.m5.large
- **Savings**: $780/month (60% reduction)

### 2. Data Transfer Costs (30% of total)
- **Issue**: Uncompressed responses, no CDN
- **Current**: 2.4TB egress/month @ $0.09/GB
- **Solutions**:
  - Enable gzip compression (70% size reduction)
  - Implement CDN (CloudFlare/CloudFront)
  - Cache static assets
- **Savings**: $520/month (75% reduction)

### 3. Idle Resources (15% of total)
- **Issue**: Dev/staging running 24/7
- **Instances**: 4x t3.medium ($120/month each)
- **Usage**: Only needed 9AM-6PM weekdays
- **Solution**: Auto-shutdown after hours
- **Savings**: $340/month (70% reduction)

### 4. Unused Services (10% of total)
- Old load balancers: $180/month
- Snapshot storage (1 year+): $95/month
- Unattached EBS volumes: $45/month
- **Action**: Clean up immediately
- **Savings**: $320/month

## OPTIMIZATION PLAN

### Immediate (This Week) - $1,640/month savings
1. ✅ Downgrade database instance
2. ✅ Enable compression
3. ✅ Delete old resources
4. ✅ Setup auto-shutdown for dev

### Short-term (This Month) - Additional $780/month
1. Implement CDN
2. Add caching layer (Redis)
3. Optimize database queries
4. Reserved instance purchases (40% discount)

### Long-term (Quarter) - Additional $1,200/month
1. Migrate to serverless for low-traffic services
2. Implement auto-scaling
3. Use spot instances for batch jobs
4. Archive old data to cold storage

## TOTAL POTENTIAL SAVINGS
**Monthly**: $3,620 (reduce from $15,000 to $11,380)
**Annual**: $43,440

**ROI on optimization effort**: ~2,900% (5 hours work = $3,620/month savings)

**Analysis Cost**: $0.0051`
  };

  const eventType = incident.event_type;
  const analysis = analyses[eventType] || generateGenericAnalysis(incident);

  // Simulate realistic response metrics
  const inputTokens = Math.floor(analysis.length / 4) + Math.floor(Math.random() * 50);
  const outputTokens = Math.floor(analysis.length / 4) + Math.floor(Math.random() * 100);
  const responseTime = Math.floor(Math.random() * 2000) + 500; // 500-2500ms

  return {
    analysis,
    model: 'claude-3-5-sonnet-20241022-mock',
    inputTokens,
    outputTokens,
    responseTime,
  };
}

/**
 * Generate generic analysis for unknown event types
 */
function generateGenericAnalysis(incident: IncidentData): string {
  return `# 📊 INCIDENT ANALYSIS - ${incident.event_type}

## SUMMARY
**Event Type**: ${incident.event_type}
**Severity**: ${incident.severity}
**Description**: ${incident.summary}

## ANALYSIS (DEMO MODE)

This is a mock analysis generated in demo mode. In production mode with a real Claude API key, you would receive:

### Detailed Root Cause Analysis
- Deep investigation into the incident cause
- Timeline of events leading to the issue
- Contributing factors and dependencies

### Impact Assessment
- Affected users and services
- Business impact quantification
- SLA implications

## IMMEDIATE ACTIONS

1. **Investigate root cause** - Review recent changes and system logs (Risk: Low, Time: 15 min)
2. **Monitor key metrics** - Track error rates, latency, and resource usage (Risk: Low, Time: 10 min)
3. **Enable additional logging** - Capture detailed traces for analysis (Risk: Low, Time: 20 min)
4. **Implement circuit breaker** - Prevent cascade failures if needed (Risk: Medium, Time: 30 min)
5. **Prepare rollback plan** - Document steps to revert recent changes (Risk: Low, Time: 25 min)

### Long-term Prevention Strategies
1. Implement automated testing for this scenario
2. Add proactive monitoring and alerting
3. Create runbook for similar incidents

### Code Examples
Specific configuration changes, queries, or code fixes tailored to your incident.

## DEMO MODE NOTICE

🎭 **You're using FlexGate's demo mode!**

To get real AI-powered analysis:
1. Go to Settings > Claude AI
2. Toggle "Production Mode"
3. Add your Anthropic API key
4. Save settings

**Benefits of Production Mode:**
- Real-time AI analysis from Claude 3.5 Sonnet
- Context-aware recommendations
- Custom solutions for your specific incidents
- Continuous learning from your codebase

---
*This is a simulated response. Analysis cost: $0.00 (demo mode)*`;
}

/**
 * Test if API key is valid (mock version)
 */
export function mockTestApiKey(apiKey: string): Promise<{ success: boolean; message: string; responseTime: number }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!apiKey || apiKey.length < 20) {
        resolve({
          success: false,
          message: 'Invalid API key format. Real keys start with sk-ant-api03-',
          responseTime: 0,
        });
      } else {
        resolve({
          success: true,
          message: 'API key format looks valid! (Note: Not validated against real API in demo mode)',
          responseTime: Math.floor(Math.random() * 1000) + 500,
        });
      }
    }, 1000);
  });
}

export default {
  generateMockAnalysis,
  mockTestApiKey,
};
