# Cost-Aware API Management Playbook

**Implementation Time:** 30 minutes  
**Difficulty:** Beginner  
**ROI:** $23,270/year (prevent cost explosions)

---

## Overview

Stop discovering API cost overruns at month-end invoices. This playbook shows you how to set up FlexGate's AI-powered cost tracking that detects anomalies in real-time, analyzes root causes with Claude, and automatically applies optimizations.

**What You'll Build:**
- Per-route, per-client cost tracking
- Real-time budget alerts
- Claude-powered cost optimization analysis
- Automatic caching and rate limiting
- Cost trend forecasting

**Prerequisites:**
- FlexGate v2.0+ with AI module installed
- Anthropic API key ([get one here](https://console.anthropic.com))
- Basic understanding of API pricing (OpenAI, Anthropic, etc.)
- Node.js 18+

---

## Step 1: Define Your API Costs (5 minutes)

Create `config/api-costs.ts`:

```typescript
// Define cost per API call for your routes
export const API_COSTS = {
  // OpenAI routes
  '/api/chat/completions': {
    baseCost: 0.002,      // $0.002 per request (GPT-4)
    costPerToken: 0.00003, // $0.03 per 1K tokens
    model: 'gpt-4'
  },
  
  '/api/embeddings': {
    baseCost: 0.0001,     // $0.0001 per request
    costPerToken: 0.0000001,
    model: 'text-embedding-ada-002'
  },
  
  '/api/completions': {
    baseCost: 0.001,      // $0.001 per request (GPT-3.5)
    costPerToken: 0.000002,
    model: 'gpt-3.5-turbo'
  },
  
  // Anthropic routes
  '/api/claude/messages': {
    baseCost: 0.015,      // $0.015 per request (Claude 3.5 Sonnet)
    costPerToken: 0.000003,
    model: 'claude-3-5-sonnet-20241022'
  },
  
  // Database queries (estimated)
  '/api/analytics': {
    baseCost: 0.0005,     // $0.0005 per complex query
    model: 'postgresql'
  },
  
  // Default for unknown routes
  default: {
    baseCost: 0.0001,
    model: 'unknown'
  }
} as const;

// Monthly budgets
export const BUDGETS = {
  daily: {
    total: 50.00,         // $50/day total
    perRoute: {
      '/api/chat/completions': 30.00,
      '/api/claude/messages': 15.00,
      '/api/analytics': 5.00
    }
  },
  
  monthly: {
    total: 1500.00,       // $1500/month total
    perRoute: {
      '/api/chat/completions': 900.00,
      '/api/claude/messages': 450.00,
      '/api/analytics': 150.00
    }
  },
  
  // Per-client budgets (prevent single client from using entire quota)
  perClient: {
    daily: 10.00,         // $10/day per client
    monthly: 300.00       // $300/month per client
  }
};

// Cost alert thresholds
export const COST_THRESHOLDS = {
  warning: 0.75,    // Alert at 75% of budget
  critical: 0.90,   // Critical alert at 90% of budget
  emergency: 1.00   // Emergency at 100% of budget
};
```

**Customize for your use case:**
```typescript
// Example: Twilio SMS costs
'/api/sms/send': {
  baseCost: 0.0075,  // $0.0075 per SMS
  model: 'twilio'
}

// Example: AWS Lambda invocations
'/api/process': {
  baseCost: 0.0000002,  // $0.20 per 1M requests
  model: 'aws-lambda'
}
```

---

## Step 2: Implement Cost Tracking Middleware (10 minutes)

Create `middleware/cost-tracking.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { AIEventEmitter, AIEventType, EventSeverity } from '@flexgate/ai';
import { API_COSTS, BUDGETS, COST_THRESHOLDS } from '../config/api-costs';

// Cost tracking storage (use Redis in production)
interface CostRecord {
  route: string;
  client: string;
  cost: number;
  timestamp: string;
  tokens?: number;
  model?: string;
}

const costRecords: CostRecord[] = [];
const dailyCosts = new Map<string, number>(); // route -> total cost today
const clientCosts = new Map<string, number>(); // client -> total cost today

export const costTracking = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Capture original json method to intercept response
  const originalJson = res.json;
  
  res.json = function(body: any) {
    // Calculate cost based on route and response
    const route = req.route?.path || req.path;
    const client = req.headers['x-client-id'] as string || 'anonymous';
    
    const costConfig = API_COSTS[route] || API_COSTS.default;
    let totalCost = costConfig.baseCost;
    
    // Add token-based cost if available
    if (body?.usage?.total_tokens && costConfig.costPerToken) {
      totalCost += body.usage.total_tokens * costConfig.costPerToken;
    }
    
    // Record cost
    const record: CostRecord = {
      route,
      client,
      cost: totalCost,
      timestamp: new Date().toISOString(),
      tokens: body?.usage?.total_tokens,
      model: costConfig.model
    };
    
    costRecords.push(record);
    if (costRecords.length > 10000) {
      costRecords.shift(); // Keep last 10K records
    }
    
    // Update daily totals
    const routeKey = `${route}`;
    dailyCosts.set(routeKey, (dailyCosts.get(routeKey) || 0) + totalCost);
    clientCosts.set(client, (clientCosts.get(client) || 0) + totalCost);
    
    // Check budgets and emit alerts
    checkBudgets(route, client, totalCost).catch(console.error);
    
    return originalJson.call(this, body);
  };
  
  next();
};

async function checkBudgets(route: string, client: string, cost: number) {
  const aiEvents = (await import('../config/ai-events')).default;
  
  // Check route budget
  const routeDailyCost = dailyCosts.get(route) || 0;
  const routeBudget = BUDGETS.daily.perRoute[route] || BUDGETS.daily.total;
  const routeUsage = routeDailyCost / routeBudget;
  
  if (routeUsage >= COST_THRESHOLDS.warning) {
    const severity = routeUsage >= COST_THRESHOLDS.critical 
      ? EventSeverity.CRITICAL 
      : EventSeverity.WARNING;
    
    await aiEvents.emit({
      type: AIEventType.COST_ALERT,
      severity,
      summary: `Route ${route} at ${Math.round(routeUsage * 100)}% of daily budget ($${routeDailyCost.toFixed(2)}/$${routeBudget.toFixed(2)})`,
      data: {
        metric: 'cost_usd',
        current_value: routeDailyCost,
        threshold: routeBudget * COST_THRESHOLDS.warning,
        window: '1d',
        trend: 'RISING',
        unit: 'usd'
      },
      context: {
        route,
        budget_daily: routeBudget,
        usage_percent: routeUsage * 100,
        top_clients: getTopClientsByRoute(route),
        time_to_monthly_limit: estimateTimeToLimit(routeDailyCost, BUDGETS.monthly.perRoute[route] || BUDGETS.monthly.total)
      }
    });
  }
  
  // Check client budget
  const clientDailyCost = clientCosts.get(client) || 0;
  const clientBudget = BUDGETS.perClient.daily;
  const clientUsage = clientDailyCost / clientBudget;
  
  if (clientUsage >= COST_THRESHOLDS.warning) {
    await aiEvents.emit({
      type: AIEventType.COST_ALERT,
      severity: clientUsage >= COST_THRESHOLDS.critical 
        ? EventSeverity.CRITICAL 
        : EventSeverity.WARNING,
      summary: `Client ${client} at ${Math.round(clientUsage * 100)}% of daily budget ($${clientDailyCost.toFixed(2)}/$${clientBudget.toFixed(2)})`,
      data: {
        metric: 'cost_usd',
        current_value: clientDailyCost,
        threshold: clientBudget * COST_THRESHOLDS.warning,
        window: '1d',
        trend: 'RISING',
        unit: 'usd'
      },
      context: {
        client,
        budget_daily: clientBudget,
        usage_percent: clientUsage * 100,
        client_routes: getClientRoutes(client)
      }
    });
  }
}

function getTopClientsByRoute(route: string): Array<{ id: string; cost_usd: number; requests: number }> {
  const clientStats = new Map<string, { cost: number; requests: number }>();
  
  costRecords
    .filter(r => r.route === route)
    .forEach(r => {
      const stats = clientStats.get(r.client) || { cost: 0, requests: 0 };
      stats.cost += r.cost;
      stats.requests += 1;
      clientStats.set(r.client, stats);
    });
  
  return Array.from(clientStats.entries())
    .map(([id, stats]) => ({ id, cost_usd: stats.cost, requests: stats.requests }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 5);
}

function getClientRoutes(client: string): Array<{ route: string; cost_usd: number }> {
  const routeStats = new Map<string, number>();
  
  costRecords
    .filter(r => r.client === client)
    .forEach(r => {
      routeStats.set(r.route, (routeStats.get(r.route) || 0) + r.cost);
    });
  
  return Array.from(routeStats.entries())
    .map(([route, cost]) => ({ route, cost_usd: cost }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 5);
}

function estimateTimeToLimit(dailyCost: number, monthlyLimit: number): string {
  const daysInMonth = 30;
  const projectedMonthlyCost = dailyCost * daysInMonth;
  
  if (projectedMonthlyCost <= monthlyLimit) {
    return 'Within budget';
  }
  
  const daysToLimit = Math.floor(monthlyLimit / dailyCost);
  return `${daysToLimit} days`;
}

// Reset daily costs at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    dailyCosts.clear();
    clientCosts.clear();
    console.log('[Cost Tracking] Daily costs reset');
  }
}, 60000); // Check every minute

export { costRecords, dailyCosts, clientCosts };
```

**Add to your Express app:**
```typescript
import express from 'express';
import { costTracking } from './middleware/cost-tracking';

const app = express();

// Add cost tracking middleware (before routes)
app.use(costTracking);

// ... your routes
```

---

## Step 3: Configure Cost Alerts (5 minutes)

Update `config/ai-events.ts`:

```typescript
import { AIEventEmitter, AIEventType, EventSeverity } from '@flexgate/ai';

export const aiEvents = new AIEventEmitter({
  enabled: true,
  
  events: {
    // ... existing events
    
    [AIEventType.COST_ALERT]: {
      enabled: true,
      threshold: 75,  // 75% of budget triggers alert
      window: '1d',
      minSamples: 5,
      severity: EventSeverity.WARNING
    }
  },
  
  // Budget tracking
  budgets: {
    daily: 50.00,
    monthly: 1500.00,
    alertOnBudgetExceeded: true,
    autoThrottle: true  // Automatically rate limit when budget exceeded
  }
});

export default aiEvents;
```

---

## Step 4: AI-Powered Cost Optimization (5 minutes)

Create `services/cost-optimizer.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { PromptTemplateLibrary } from '@flexgate/ai';
import aiEvents from '../config/ai-events';
import type { AIEvent } from '@flexgate/ai';
import { costRecords } from '../middleware/cost-tracking';

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

interface OptimizationStrategy {
  strategy: string;
  savings_usd_per_month: number;
  implementation_effort: 'LOW' | 'MEDIUM' | 'HIGH';
  priority: number;
  code_example?: string;
}

// Analyze cost alert with Claude
export async function analyzeAndOptimize(event: AIEvent) {
  try {
    // Build prompt
    const prompt = PromptTemplateLibrary.buildPrompt(event);
    
    console.log(`[Cost Optimizer] Analyzing ${event.context.route || 'overall'} costs`);
    
    // Get Claude analysis
    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const analysis = JSON.parse(response.content[0].text);
    
    console.log(`[Cost Optimizer] Found ${analysis.strategies?.length || 0} optimization strategies`);
    
    // Auto-apply low-effort, high-impact optimizations
    const applied: string[] = [];
    for (const strategy of analysis.strategies || []) {
      if (strategy.implementation_effort === 'LOW' && strategy.priority === 1) {
        const success = await applyOptimization(strategy, event);
        if (success) {
          applied.push(strategy.strategy);
        }
      }
    }
    
    return {
      event,
      analysis,
      appliedOptimizations: applied,
      estimatedSavings: analysis.strategies
        ?.reduce((sum, s) => sum + s.savings_usd_per_month, 0) || 0,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[Cost Optimizer] Analysis failed:', error);
    throw error;
  }
}

async function applyOptimization(strategy: OptimizationStrategy, event: AIEvent): Promise<boolean> {
  try {
    console.log(`[Cost Optimizer] Applying: ${strategy.strategy}`);
    
    // Cache optimization
    if (strategy.strategy.toLowerCase().includes('cache') || 
        strategy.strategy.toLowerCase().includes('caching')) {
      await enableCaching(event.context.route, 300); // 5 min TTL
      return true;
    }
    
    // Rate limiting
    if (strategy.strategy.toLowerCase().includes('rate limit')) {
      await applyRateLimit(event.context.client, 60, 12); // 12 req/min
      return true;
    }
    
    // Request batching
    if (strategy.strategy.toLowerCase().includes('batch')) {
      await enableBatching(event.context.route);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[Cost Optimizer] Failed to apply ${strategy.strategy}:`, error);
    return false;
  }
}

async function enableCaching(route: string, ttl: number) {
  // Implementation depends on your cache system (Redis, Memcached, etc.)
  console.log(`[Cache] Enabled ${ttl}s cache for ${route}`);
  
  // Example with Redis
  // await redis.setex(`cache:${route}:config`, 86400, JSON.stringify({ ttl }));
}

async function applyRateLimit(client: string, windowSeconds: number, maxRequests: number) {
  console.log(`[Rate Limit] Applied ${maxRequests} req/${windowSeconds}s for ${client}`);
  
  // Example: Store in rate limiter config
  // await rateLimiter.setLimit(client, { windowSeconds, maxRequests });
}

async function enableBatching(route: string) {
  console.log(`[Batching] Enabled request batching for ${route}`);
  
  // Example: Configure batch processor
  // await batchProcessor.enable(route, { maxBatchSize: 10, maxWaitMs: 100 });
}

// Auto-analyze cost alerts
aiEvents.on('COST_ALERT', async (event) => {
  const result = await analyzeAndOptimize(event);
  
  console.log('[Cost Alert] Analysis complete:', {
    strategies: result.analysis.strategies?.length,
    applied: result.appliedOptimizations.length,
    estimatedSavings: `$${result.estimatedSavings}/month`
  });
  
  // Notify team
  await notifyCostAlert(event, result);
});

async function notifyCostAlert(event: AIEvent, result: any) {
  // Implementation in Step 5
}

export default { analyzeAndOptimize };
```

---

## Step 5: Cost Alert Notifications (5 minutes)

Create `services/cost-notifier.ts`:

```typescript
import { App } from '@slack/bolt';
import type { AIEvent } from '@flexgate/ai';

const slack = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const FINANCE_CHANNEL = process.env.SLACK_FINANCE_CHANNEL || '#api-costs';

export async function notifyCostAlert(event: AIEvent, analysis: any, appliedOptimizations: string[]) {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('[Slack] Not configured, skipping cost notification');
    return;
  }
  
  try {
    const usagePercent = Math.round(event.context.usage_percent || 0);
    const severityEmoji = usagePercent >= 90 ? '🚨' : '⚠️';
    
    await slack.client.chat.postMessage({
      channel: FINANCE_CHANNEL,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} Cost Alert: ${event.context.route || event.context.client}`,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Summary:* ${event.summary}\n*Budget Usage:* ${usagePercent}% ($${event.data.current_value.toFixed(2)}/$${event.context.budget_daily.toFixed(2)})\n*Trend:* ${event.data.trend}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🤖 AI Analysis:*\n\n${formatCostAnalysis(analysis)}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*💰 Estimated Savings:* $${calculateTotalSavings(analysis.strategies)}/month`
          }
        },
        ...(appliedOptimizations.length > 0 ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✅ Auto-Applied Optimizations:*\n${appliedOptimizations.map(o => `• ${o}`).join('\n')}`
          }
        }] : []),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔝 Top Clients:*\n${formatTopClients(event.context.top_clients)}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📊 View Details' },
              style: 'primary',
              url: `https://your-dashboard.com/costs/${event.id}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Acknowledge' },
              action_id: 'ack_cost_alert',
              value: event.id
            }
          ]
        }
      ]
    });
    
    console.log(`[Slack] Cost alert sent to ${FINANCE_CHANNEL}`);
    
  } catch (error) {
    console.error('[Slack] Cost notification failed:', error);
  }
}

function formatCostAnalysis(analysis: any): string {
  let text = '';
  
  if (analysis.anomaly_assessment) {
    text += `*Assessment:* ${analysis.anomaly_assessment}\n\n`;
  }
  
  if (analysis.root_cause) {
    text += `*Root Cause:* ${analysis.root_cause}\n\n`;
  }
  
  if (analysis.strategies && analysis.strategies.length > 0) {
    text += '*Top Optimization Strategies:*\n';
    analysis.strategies.slice(0, 3).forEach((s: any, i: number) => {
      text += `${i + 1}. ${s.strategy}\n`;
      text += `   • Savings: $${s.savings_usd_per_month}/month\n`;
      text += `   • Effort: ${s.implementation_effort}\n`;
    });
  }
  
  return text;
}

function formatTopClients(clients: Array<{ id: string; cost_usd: number; requests: number }>): string {
  if (!clients || clients.length === 0) return 'No client data available';
  
  return clients.slice(0, 5).map((c, i) => 
    `${i + 1}. ${c.id}: $${c.cost_usd.toFixed(2)} (${c.requests} requests)`
  ).join('\n');
}

function calculateTotalSavings(strategies: any[]): number {
  if (!strategies) return 0;
  return strategies.reduce((sum, s) => sum + (s.savings_usd_per_month || 0), 0);
}

slack.action('ack_cost_alert', async ({ ack, body }) => {
  await ack();
  
  await slack.client.chat.postMessage({
    channel: FINANCE_CHANNEL,
    thread_ts: (body as any).message.ts,
    text: `✅ Cost alert acknowledged by <@${body.user.id}>`
  });
});

export default slack;
```

---

## Step 6: Cost Dashboard API (Optional - 5 minutes)

Create `routes/cost-api.ts`:

```typescript
import express from 'express';
import { costRecords, dailyCosts, clientCosts } from '../middleware/cost-tracking';

const router = express.Router();

// Get current costs
router.get('/api/costs/current', (req, res) => {
  const totalDaily = Array.from(dailyCosts.values()).reduce((a, b) => a + b, 0);
  
  res.json({
    daily_total: totalDaily,
    by_route: Object.fromEntries(dailyCosts),
    by_client: Object.fromEntries(clientCosts),
    timestamp: new Date().toISOString()
  });
});

// Get cost trend
router.get('/api/costs/trend', (req, res) => {
  const hours = parseInt(req.query.hours as string) || 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const recentCosts = costRecords
    .filter(r => new Date(r.timestamp) >= cutoff)
    .reduce((acc, r) => {
      const hour = new Date(r.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + r.cost;
      return acc;
    }, {} as Record<number, number>);
  
  res.json({
    hours,
    trend: recentCosts,
    total: Object.values(recentCosts).reduce((a, b) => a + b, 0)
  });
});

// Get top spenders
router.get('/api/costs/top-clients', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  
  const topClients = Array.from(clientCosts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([client, cost]) => ({
      client,
      cost_usd: cost,
      requests: costRecords.filter(r => r.client === client).length
    }));
  
  res.json({ top_clients: topClients });
});

export default router;
```

**Add to your app:**
```typescript
import costApi from './routes/cost-api';
app.use(costApi);
```

---

## Testing

Create `tests/cost-optimization.test.ts`:

```typescript
import { AIEventFactory, AIEventType, EventSeverity, TrendDirection } from '@flexgate/ai';
import { analyzeAndOptimize } from '../services/cost-optimizer';

describe('Cost Optimization', () => {
  
  it('should detect cost spike', async () => {
    const event = AIEventFactory.create({
      type: AIEventType.COST_ALERT,
      summary: 'Route /api/chat costs exceeded daily budget by 3.2x',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'cost_usd',
        current_value: 48.50,
        threshold: 15.00,
        window: '1d',
        trend: TrendDirection.RISING,
        unit: 'usd'
      },
      context: {
        route: '/api/chat',
        budget_daily: 15.00,
        usage_percent: 323,
        top_clients: [
          { id: 'acme-corp', cost_usd: 38.20, requests: 43200 }
        ]
      }
    });
    
    expect(event.confidence).toBeGreaterThan(0.8);
    expect(event.data.breach_ratio).toBeGreaterThan(3.0);
  });
  
  it('should analyze and suggest optimizations', async () => {
    const event = AIEventFactory.createSample('COST_ALERT');
    
    const result = await analyzeAndOptimize(event);
    
    expect(result.analysis).toBeDefined();
    expect(result.analysis.strategies).toBeDefined();
    expect(Array.isArray(result.analysis.strategies)).toBe(true);
    expect(result.estimatedSavings).toBeGreaterThan(0);
  }, 15000);
  
});
```

**Run tests:**
```bash
npm test -- tests/cost-optimization.test.ts
```

---

## Verification Checklist

### ✅ Configuration
- [ ] API costs defined for all routes
- [ ] Daily/monthly budgets set
- [ ] Cost thresholds configured
- [ ] Environment variables loaded

**Test:**
```bash
node -e "console.log(require('./config/api-costs').API_COSTS)"
```

### ✅ Cost Tracking
- [ ] Middleware integrated
- [ ] Costs being recorded
- [ ] Daily totals accumulating
- [ ] Client costs tracked

**Test:**
```bash
# Make some API calls
curl -H "x-client-id: test-client" http://localhost:3000/api/chat/completions

# Check costs
curl http://localhost:3000/api/costs/current
```

### ✅ AI Analysis
- [ ] Cost alerts triggering
- [ ] Claude analysis working
- [ ] Optimization strategies generated
- [ ] Auto-optimizations applying

**Test:**
```bash
npm test -- tests/cost-optimization.test.ts
```

### ✅ Notifications
- [ ] Slack alerts arriving
- [ ] Cost details visible
- [ ] Optimization suggestions included

---

## Production Deployment

### Environment Variables

```bash
# Cost tracking
COST_TRACKING_ENABLED=true
DAILY_BUDGET_USD=50.00
MONTHLY_BUDGET_USD=1500.00

# Slack notifications
SLACK_FINANCE_CHANNEL=#api-costs

# Auto-optimization
AUTO_OPTIMIZE_ENABLED=true
AUTO_OPTIMIZE_MAX_PER_DAY=5
```

### Monitoring

```typescript
// Track cost metrics
metrics.gauge('costs.daily_total_usd', dailyTotal);
metrics.gauge('costs.budget_usage_percent', usagePercent);
metrics.counter('costs.alerts_triggered');
metrics.counter('costs.optimizations_applied');
```

---

## Cost Optimization Strategies

### Strategy 1: Intelligent Caching
**When:** Repeated identical requests  
**Implementation:**
```typescript
import { createCache } from 'cache-manager';

const cache = await createCache({
  store: 'redis',
  ttl: 300, // 5 minutes
  max: 1000
});

app.get('/api/chat/history', async (req, res) => {
  const cacheKey = `history:${req.userId}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return res.json(cached); // No API cost!
  }
  
  const result = await fetchHistory(req.userId);
  await cache.set(cacheKey, result);
  res.json(result);
});
```
**Savings:** 90-98% on cacheable endpoints

### Strategy 2: Request Batching
**When:** Multiple small requests  
**Implementation:**
```typescript
import pQueue from 'p-queue';

const batchQueue = new pQueue({ concurrency: 1, interval: 100 });
const pendingRequests: any[] = [];

app.post('/api/embeddings', async (req, res) => {
  pendingRequests.push({ req, res });
  
  if (pendingRequests.length >= 10) {
    await processBatch();
  }
});

async function processBatch() {
  const batch = pendingRequests.splice(0, 10);
  const texts = batch.map(b => b.req.body.text);
  
  // Single API call for 10 requests
  const embeddings = await openai.embeddings.create({
    input: texts,
    model: 'text-embedding-ada-002'
  });
  
  batch.forEach((b, i) => {
    b.res.json({ embedding: embeddings.data[i].embedding });
  });
}
```
**Savings:** 50-70% on batchable requests

### Strategy 3: Model Selection
**When:** Using expensive models unnecessarily  
**Implementation:**
```typescript
function selectModel(complexity: number) {
  if (complexity < 0.3) return 'gpt-3.5-turbo'; // $0.001
  if (complexity < 0.7) return 'gpt-4-turbo';   // $0.005
  return 'gpt-4';                                // $0.015
}

const model = selectModel(calculateComplexity(prompt));
```
**Savings:** 40-60% on appropriate model selection

---

## Troubleshooting

### Issue: Costs not tracking

**Solutions:**
1. Verify middleware order (must be before routes)
2. Check route paths match exactly
3. Ensure response uses `.json()` method

### Issue: Budget alerts not firing

**Solutions:**
1. Check threshold values
2. Verify enough samples collected
3. Review AI event configuration

### Issue: Optimizations not applying

**Solutions:**
1. Check optimization strategy detection
2. Verify permissions for changes
3. Review logs for errors

---

## Success Metrics

**Track these KPIs:**
- Daily/monthly cost vs budget
- Cost per request trend
- Optimization success rate
- Savings from auto-optimizations

**Expected Results (4 weeks):**
- 30-50% cost reduction
- 90%+ anomaly detection
- <1 hour detection time

---

## Next Steps

1. **Run for 2 weeks** - Gather baseline data
2. **Review Claude suggestions** - Validate recommendations
3. **Expand to Auto-Recovery** - [Next Playbook →](./auto-recovery.md)

---

**Playbook Version:** 1.0.0  
**Last Updated:** February 15, 2026  
**Tested With:** FlexGate v2.0.0, Claude 3.5 Sonnet
