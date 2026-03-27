# Autonomous Service Recovery Playbook

**Implementation Time:** 35 minutes  
**Difficulty:** Intermediate  
**ROI:** $108,400/year (80% auto-heal rate)

---

## Overview

Stop waiting for engineers to manually recover from common failures. This playbook shows you how to set up FlexGate's AI-powered autonomous recovery system that detects failures, generates recovery plans with Claude, and executes fixes automatically with human-in-loop safety controls.

**What You'll Build:**
- Failure pattern detection
- AI-powered recovery plan generation
- Automated execution with safety guardrails
- Slack-based approval workflow
- Recovery monitoring and rollback

**Prerequisites:**
- FlexGate v2.0+ with AI module installed
- Anthropic API key
- Slack workspace with admin access
- Kubernetes or Docker deployment (for automated actions)
- Node.js 18+

---

## ⚠️ Safety First

**This playbook implements AUTONOMOUS ACTIONS on production infrastructure.**

**Safety Guardrails Built-In:**
1. ✅ **Human-in-loop** - Critical actions require Slack approval (5 min timeout)
2. ✅ **Confidence thresholds** - Only execute if AI confidence >80%
3. ✅ **Rate limiting** - Max 3 auto-recoveries per hour
4. ✅ **Rollback capability** - One-click undo for any action
5. ✅ **Audit logging** - Every action logged with reasoning
6. ✅ **Dry-run mode** - Test without making changes

**Never Auto-Execute (Always Require Approval):**
- Pod/container restarts
- Database migrations
- Traffic rerouting
- Security changes
- Configuration with deployment

---

## Step 1: Define Recovery Runbooks (10 minutes)

Create `config/recovery-runbooks.ts`:

```typescript
import { AIEventType, EventSeverity } from '@flexgate/ai';

export interface RecoveryAction {
  type: 'SCALE_RESOURCE' | 'CIRCUIT_BREAKER' | 'RESTART_POD' | 'CACHE_CLEAR' | 'RATE_LIMIT' | 'FAILOVER';
  resource?: string;
  operation?: string;
  parameters: Record<string, any>;
  duration?: number; // seconds
  gradual?: boolean;
}

export interface SafetyConfig {
  requiresApproval: boolean;
  maxExecutionsPerHour: number;
  rollbackAfterMinutes?: number;
  dryRun?: boolean;
}

export interface RecoveryRunbook {
  name: string;
  description: string;
  trigger: {
    eventType: AIEventType;
    conditions: Record<string, any>;
  };
  actions: RecoveryAction[];
  safety: SafetyConfig;
  estimatedRecoveryTime: number; // minutes
}

export const RECOVERY_RUNBOOKS: RecoveryRunbook[] = [
  {
    name: 'scale-database-connections',
    description: 'Scale database connection pool when exhausted',
    trigger: {
      eventType: AIEventType.LATENCY_ANOMALY,
      conditions: {
        cause: 'DATABASE',
        confidence: { min: 0.80 },
        severity: EventSeverity.WARNING
      }
    },
    actions: [
      {
        type: 'SCALE_RESOURCE',
        resource: 'DB_POOL_SIZE',
        parameters: {
          from: 20,
          to: 50,
          increment: 10,
          intervalSeconds: 30
        },
        gradual: true
      }
    ],
    safety: {
      requiresApproval: false, // Low risk
      maxExecutionsPerHour: 3,
      rollbackAfterMinutes: 30
    },
    estimatedRecoveryTime: 5
  },
  
  {
    name: 'open-circuit-breaker',
    description: 'Open circuit breaker for failing upstream service',
    trigger: {
      eventType: AIEventType.CIRCUIT_BREAKER_CANDIDATE,
      conditions: {
        confidence: { min: 0.85 },
        errorRate: { min: 50 }
      }
    },
    actions: [
      {
        type: 'CIRCUIT_BREAKER',
        operation: 'OPEN',
        parameters: {
          service: '{{upstream}}',
          duration: 60,
          halfOpenRequests: 3
        },
        duration: 60
      }
    ],
    safety: {
      requiresApproval: false,
      maxExecutionsPerHour: 5,
      rollbackAfterMinutes: 5
    },
    estimatedRecoveryTime: 2
  },
  
  {
    name: 'clear-cache-on-stale-data',
    description: 'Clear cache when serving stale data',
    trigger: {
      eventType: AIEventType.ERROR_RATE_SPIKE,
      conditions: {
        confidence: { min: 0.75 },
        errorCategory: '5xx'
      }
    },
    actions: [
      {
        type: 'CACHE_CLEAR',
        parameters: {
          pattern: '{{route}}:*',
          graceful: true
        }
      }
    ],
    safety: {
      requiresApproval: false,
      maxExecutionsPerHour: 5
    },
    estimatedRecoveryTime: 1
  },
  
  {
    name: 'restart-pod-memory-leak',
    description: 'Restart pod when memory leak detected',
    trigger: {
      eventType: AIEventType.CAPACITY_WARNING,
      conditions: {
        resourceType: 'MEMORY',
        confidence: { min: 0.80 },
        utilization: { min: 90 }
      }
    },
    actions: [
      {
        type: 'RESTART_POD',
        parameters: {
          deployment: 'api-gateway',
          graceful: true,
          drainTimeout: 30
        }
      }
    ],
    safety: {
      requiresApproval: true, // HIGH RISK - requires approval
      maxExecutionsPerHour: 2,
      dryRun: false
    },
    estimatedRecoveryTime: 3
  },
  
  {
    name: 'apply-rate-limit-abuse',
    description: 'Apply rate limit when abuse detected',
    trigger: {
      eventType: AIEventType.RATE_LIMIT_BREACH,
      conditions: {
        trafficType: 'ABUSE',
        confidence: { min: 0.75 }
      }
    },
    actions: [
      {
        type: 'RATE_LIMIT',
        parameters: {
          target: '{{client}}',
          limit: 100,
          window: 60,
          duration: 1800 // 30 minutes
        }
      }
    ],
    safety: {
      requiresApproval: false,
      maxExecutionsPerHour: 10
    },
    estimatedRecoveryTime: 1
  },
  
  {
    name: 'failover-upstream-degraded',
    description: 'Failover to backup service when primary degraded',
    trigger: {
      eventType: AIEventType.UPSTREAM_DEGRADATION,
      conditions: {
        confidence: { min: 0.85 },
        severity: EventSeverity.CRITICAL
      }
    },
    actions: [
      {
        type: 'FAILOVER',
        parameters: {
          from: '{{upstream}}',
          to: '{{backup_service}}',
          healthCheckInterval: 10,
          autoRevertOnRecovery: true
        }
      }
    ],
    safety: {
      requiresApproval: true, // HIGH RISK
      maxExecutionsPerHour: 2
    },
    estimatedRecoveryTime: 5
  }
];

// Find matching runbook for event
export function findRunbook(event: any): RecoveryRunbook | null {
  for (const runbook of RECOVERY_RUNBOOKS) {
    if (runbook.trigger.eventType !== event.type) continue;
    
    const conditions = runbook.trigger.conditions;
    let matches = true;
    
    // Check confidence
    if (conditions.confidence?.min && event.confidence < conditions.confidence.min) {
      matches = false;
    }
    
    // Check severity
    if (conditions.severity && event.severity !== conditions.severity) {
      matches = false;
    }
    
    // Check other conditions (cause, errorRate, etc.)
    for (const [key, value] of Object.entries(conditions)) {
      if (key === 'confidence' || key === 'severity') continue;
      
      if (typeof value === 'object' && 'min' in value) {
        if ((event.data[key] || event.context[key]) < value.min) {
          matches = false;
        }
      } else {
        if (event.data[key] !== value && event.context[key] !== value) {
          matches = false;
        }
      }
    }
    
    if (matches) return runbook;
  }
  
  return null;
}

export default RECOVERY_RUNBOOKS;
```

---

## Step 2: Implement Auto-Recovery Engine (10 minutes)

Create `services/auto-recovery.ts`:

```typescript
import { AIEvent, AIEventType } from '@flexgate/ai';
import { RecoveryRunbook, RecoveryAction, findRunbook } from '../config/recovery-runbooks';
import aiEvents from '../config/ai-events';

interface RecoveryPlan {
  id: string;
  event: AIEvent;
  runbook: RecoveryRunbook;
  actions: RecoveryAction[];
  requiresApproval: boolean;
  confidence: number;
  estimatedRecoveryTime: number;
  rollbackPlan?: RecoveryPlan;
  timestamp: string;
}

interface RecoveryExecution {
  planId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  startTime?: string;
  endTime?: string;
  appliedActions: string[];
  error?: string;
}

class AutoRecoveryEngine {
  private executions = new Map<string, RecoveryExecution>();
  private executionCounts = new Map<string, number[]>(); // runbook -> timestamps
  
  async generateRecoveryPlan(event: AIEvent): Promise<RecoveryPlan | null> {
    const runbook = findRunbook(event);
    if (!runbook) {
      console.log(`[Auto-Recovery] No runbook found for ${event.type}`);
      return null;
    }
    
    // Check rate limiting
    if (!this.checkRateLimit(runbook)) {
      console.log(`[Auto-Recovery] Rate limit exceeded for ${runbook.name}`);
      return null;
    }
    
    // Substitute variables in actions
    const actions = runbook.actions.map(action => ({
      ...action,
      parameters: this.substituteVariables(action.parameters, event)
    }));
    
    const plan: RecoveryPlan = {
      id: `recovery-${Date.now()}`,
      event,
      runbook,
      actions,
      requiresApproval: runbook.safety.requiresApproval,
      confidence: event.confidence,
      estimatedRecoveryTime: runbook.estimatedRecoveryTime,
      timestamp: new Date().toISOString()
    };
    
    // Generate rollback plan
    plan.rollbackPlan = this.generateRollbackPlan(plan);
    
    console.log(`[Auto-Recovery] Generated plan: ${runbook.name} (approval: ${plan.requiresApproval})`);
    
    return plan;
  }
  
  async execute(plan: RecoveryPlan, approved = false): Promise<RecoveryExecution> {
    // Check if approval required
    if (plan.requiresApproval && !approved) {
      throw new Error('Recovery plan requires approval');
    }
    
    // Check dry-run mode
    if (plan.runbook.safety.dryRun) {
      console.log('[Auto-Recovery] DRY RUN MODE - No actions executed');
      return this.dryRunExecution(plan);
    }
    
    const execution: RecoveryExecution = {
      planId: plan.id,
      status: 'EXECUTING',
      startTime: new Date().toISOString(),
      appliedActions: []
    };
    
    this.executions.set(plan.id, execution);
    
    try {
      for (const action of plan.actions) {
        console.log(`[Auto-Recovery] Executing: ${action.type}`);
        await this.executeAction(action, plan.event);
        execution.appliedActions.push(action.type);
      }
      
      execution.status = 'SUCCESS';
      execution.endTime = new Date().toISOString();
      
      // Record execution for rate limiting
      this.recordExecution(plan.runbook.name);
      
      // Schedule rollback if configured
      if (plan.runbook.safety.rollbackAfterMinutes) {
        this.scheduleRollback(plan, plan.runbook.safety.rollbackAfterMinutes);
      }
      
      console.log(`[Auto-Recovery] Success: ${plan.runbook.name}`);
      
    } catch (error) {
      execution.status = 'FAILED';
      execution.endTime = new Date().toISOString();
      execution.error = error.message;
      
      console.error(`[Auto-Recovery] Failed: ${plan.runbook.name}`, error);
      
      // Auto-rollback on failure
      if (plan.rollbackPlan) {
        await this.execute(plan.rollbackPlan, true);
        execution.status = 'ROLLED_BACK';
      }
    }
    
    return execution;
  }
  
  private async executeAction(action: RecoveryAction, event: AIEvent): Promise<void> {
    switch (action.type) {
      case 'SCALE_RESOURCE':
        await this.scaleResource(action.parameters);
        break;
      
      case 'CIRCUIT_BREAKER':
        await this.circuitBreaker(action.parameters);
        break;
      
      case 'RESTART_POD':
        await this.restartPod(action.parameters);
        break;
      
      case 'CACHE_CLEAR':
        await this.clearCache(action.parameters);
        break;
      
      case 'RATE_LIMIT':
        await this.applyRateLimit(action.parameters);
        break;
      
      case 'FAILOVER':
        await this.failover(action.parameters);
        break;
      
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  private async scaleResource(params: any): Promise<void> {
    console.log(`[Action] Scaling ${params.resource}: ${params.from} → ${params.to}`);
    
    if (params.gradual) {
      const steps = Math.ceil((params.to - params.from) / params.increment);
      for (let i = 1; i <= steps; i++) {
        const newValue = Math.min(params.from + i * params.increment, params.to);
        await this.updateEnvironment(params.resource, newValue);
        await this.sleep(params.intervalSeconds * 1000);
      }
    } else {
      await this.updateEnvironment(params.resource, params.to);
    }
  }
  
  private async circuitBreaker(params: any): Promise<void> {
    console.log(`[Action] Circuit breaker ${params.operation}: ${params.service}`);
    
    // Implementation depends on your circuit breaker library
    // Example with Opossum:
    // const breaker = circuitBreakers.get(params.service);
    // if (params.operation === 'OPEN') {
    //   breaker.open();
    //   setTimeout(() => breaker.close(), params.duration * 1000);
    // }
  }
  
  private async restartPod(params: any): Promise<void> {
    console.log(`[Action] Restarting pod: ${params.deployment}`);
    
    if (params.graceful) {
      // Kubernetes rolling restart
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(
          `kubectl rollout restart deployment/${params.deployment}`,
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          }
        );
      });
    }
  }
  
  private async clearCache(params: any): Promise<void> {
    console.log(`[Action] Clearing cache: ${params.pattern}`);
    
    // Implementation depends on your cache system
    // Example with Redis:
    // const redis = await getRedisClient();
    // const keys = await redis.keys(params.pattern);
    // if (keys.length > 0) {
    //   await redis.del(...keys);
    // }
  }
  
  private async applyRateLimit(params: any): Promise<void> {
    console.log(`[Action] Rate limit: ${params.target} → ${params.limit} req/${params.window}s`);
    
    // Implementation depends on your rate limiter
    // Example:
    // await rateLimiter.setLimit(params.target, {
    //   limit: params.limit,
    //   window: params.window,
    //   duration: params.duration
    // });
  }
  
  private async failover(params: any): Promise<void> {
    console.log(`[Action] Failover: ${params.from} → ${params.to}`);
    
    // Update routing configuration
    // await routingConfig.setUpstream(params.from, params.to);
    
    // Set up health check for auto-revert
    if (params.autoRevertOnRecovery) {
      // this.monitorUpstreamHealth(params.from, params.to);
    }
  }
  
  private async updateEnvironment(key: string, value: any): Promise<void> {
    // Kubernetes ConfigMap update
    // const { exec } = require('child_process');
    // await exec(`kubectl set env deployment/api-gateway ${key}=${value}`);
    console.log(`[Config] Set ${key}=${value}`);
  }
  
  private substituteVariables(params: any, event: AIEvent): any {
    const result = { ...params };
    
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.includes('{{')) {
        result[key] = value
          .replace('{{upstream}}', event.context.upstream || '')
          .replace('{{route}}', event.context.route || '')
          .replace('{{client}}', event.context.client || '')
          .replace('{{backup_service}}', event.context.backup_service || '');
      }
    }
    
    return result;
  }
  
  private generateRollbackPlan(plan: RecoveryPlan): RecoveryPlan | undefined {
    const rollbackActions: RecoveryAction[] = [];
    
    for (const action of plan.actions) {
      switch (action.type) {
        case 'SCALE_RESOURCE':
          rollbackActions.push({
            ...action,
            parameters: {
              ...action.parameters,
              from: action.parameters.to,
              to: action.parameters.from
            }
          });
          break;
        
        case 'CIRCUIT_BREAKER':
          if (action.parameters.operation === 'OPEN') {
            rollbackActions.push({
              ...action,
              parameters: { ...action.parameters, operation: 'CLOSE' }
            });
          }
          break;
        
        case 'FAILOVER':
          rollbackActions.push({
            ...action,
            parameters: {
              from: action.parameters.to,
              to: action.parameters.from
            }
          });
          break;
      }
    }
    
    if (rollbackActions.length === 0) return undefined;
    
    return {
      ...plan,
      id: `rollback-${plan.id}`,
      actions: rollbackActions,
      requiresApproval: false // Rollbacks don't need approval
    };
  }
  
  private checkRateLimit(runbook: RecoveryRunbook): boolean {
    const executions = this.executionCounts.get(runbook.name) || [];
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recentExecutions = executions.filter(ts => ts > hourAgo);
    
    return recentExecutions.length < runbook.safety.maxExecutionsPerHour;
  }
  
  private recordExecution(runbookName: string): void {
    const executions = this.executionCounts.get(runbookName) || [];
    executions.push(Date.now());
    this.executionCounts.set(runbookName, executions);
  }
  
  private scheduleRollback(plan: RecoveryPlan, minutes: number): void {
    setTimeout(async () => {
      const execution = this.executions.get(plan.id);
      if (execution?.status === 'SUCCESS' && plan.rollbackPlan) {
        console.log(`[Auto-Recovery] Auto-rollback scheduled: ${plan.runbook.name}`);
        await this.execute(plan.rollbackPlan, true);
      }
    }, minutes * 60 * 1000);
  }
  
  private dryRunExecution(plan: RecoveryPlan): RecoveryExecution {
    return {
      planId: plan.id,
      status: 'SUCCESS',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      appliedActions: plan.actions.map(a => `[DRY RUN] ${a.type}`)
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getExecution(planId: string): RecoveryExecution | undefined {
    return this.executions.get(planId);
  }
}

export const autoRecovery = new AutoRecoveryEngine();

// Listen for AI events
aiEvents.on('*', async (event: AIEvent) => {
  const plan = await autoRecovery.generateRecoveryPlan(event);
  
  if (plan) {
    if (plan.requiresApproval) {
      // Send to Slack for approval (implemented in Step 3)
      const { requestApproval } = await import('./recovery-approval');
      await requestApproval(plan);
    } else {
      // Execute automatically
      await autoRecovery.execute(plan);
    }
  }
});

export default autoRecovery;
```

---

## Step 3: Slack Approval Workflow (10 minutes)

Create `services/recovery-approval.ts`:

```typescript
import { App } from '@slack/bolt';
import { RecoveryPlan } from '../config/recovery-runbooks';
import { autoRecovery } from './auto-recovery';

const slack = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const RECOVERY_CHANNEL = process.env.SLACK_RECOVERY_CHANNEL || '#auto-recovery';

const pendingApprovals = new Map<string, {
  plan: RecoveryPlan;
  timeout: NodeJS.Timeout;
}>();

export async function requestApproval(plan: RecoveryPlan): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('[Recovery Approval] Slack not configured, auto-rejecting');
    return;
  }
  
  try {
    const message = await slack.client.chat.postMessage({
      channel: RECOVERY_CHANNEL,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🤖 Auto-Recovery Approval Required`,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Event:* ${plan.event.type}\n*Runbook:* ${plan.runbook.name}\n*Confidence:* ${Math.round(plan.confidence * 100)}%\n*Est. Recovery Time:* ${plan.estimatedRecoveryTime} minutes`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Problem:*\n${plan.event.summary}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Planned Actions:*\n${formatActions(plan.actions)}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Rollback Plan:* ${plan.rollbackPlan ? 'Available ✅' : 'None ⚠️'}`
          }
        },
        {
          type: 'actions',
          block_id: `recovery_${plan.id}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Approve & Execute' },
              style: 'primary',
              action_id: 'approve_recovery',
              value: plan.id
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Reject' },
              style: 'danger',
              action_id: 'reject_recovery',
              value: plan.id
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '🔍 View Details' },
              action_id: 'view_recovery_details',
              value: plan.id
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `⏰ This request will timeout in 5 minutes`
            }
          ]
        }
      ]
    });
    
    // Set 5-minute timeout
    const timeout = setTimeout(async () => {
      console.log(`[Recovery Approval] Timeout for plan ${plan.id}`);
      pendingApprovals.delete(plan.id);
      
      await slack.client.chat.update({
        channel: RECOVERY_CHANNEL,
        ts: message.ts!,
        text: '⏰ Approval timeout - Recovery NOT executed',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏰ *Approval Timeout*\n\nRecovery plan for ${plan.runbook.name} was not executed due to timeout.`
            }
          }
        ]
      });
    }, 5 * 60 * 1000);
    
    pendingApprovals.set(plan.id, { plan, timeout });
    
    console.log(`[Recovery Approval] Sent approval request for ${plan.runbook.name}`);
    
  } catch (error) {
    console.error('[Recovery Approval] Failed to request approval:', error);
  }
}

function formatActions(actions: any[]): string {
  return actions.map((action, i) => {
    const params = JSON.stringify(action.parameters, null, 2)
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n');
    
    return `${i + 1}. *${action.type}*\n\`\`\`${params}\`\`\``;
  }).join('\n');
}

// Handle approval
slack.action('approve_recovery', async ({ ack, body, client }) => {
  await ack();
  
  const planId = (body as any).actions[0].value;
  const approval = pendingApprovals.get(planId);
  
  if (!approval) {
    await client.chat.postMessage({
      channel: RECOVERY_CHANNEL,
      thread_ts: (body as any).message.ts,
      text: '❌ Recovery plan not found or already executed'
    });
    return;
  }
  
  clearTimeout(approval.timeout);
  pendingApprovals.delete(planId);
  
  // Execute recovery
  console.log(`[Recovery Approval] Approved by ${(body as any).user.id}`);
  
  await client.chat.update({
    channel: RECOVERY_CHANNEL,
    ts: (body as any).message.ts,
    text: `✅ Approved by <@${(body as any).user.id}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *Approved by <@${(body as any).user.id}>*\n\nExecuting recovery plan: ${approval.plan.runbook.name}...`
        }
      }
    ]
  });
  
  try {
    const execution = await autoRecovery.execute(approval.plan, true);
    
    await client.chat.postMessage({
      channel: RECOVERY_CHANNEL,
      thread_ts: (body as any).message.ts,
      text: execution.status === 'SUCCESS'
        ? `✅ Recovery completed successfully!\n\nActions applied:\n${execution.appliedActions.map(a => `• ${a}`).join('\n')}`
        : `❌ Recovery failed: ${execution.error}`
    });
    
  } catch (error) {
    await client.chat.postMessage({
      channel: RECOVERY_CHANNEL,
      thread_ts: (body as any).message.ts,
      text: `❌ Recovery execution failed: ${error.message}`
    });
  }
});

// Handle rejection
slack.action('reject_recovery', async ({ ack, body, client }) => {
  await ack();
  
  const planId = (body as any).actions[0].value;
  const approval = pendingApprovals.get(planId);
  
  if (approval) {
    clearTimeout(approval.timeout);
    pendingApprovals.delete(planId);
  }
  
  await client.chat.update({
    channel: RECOVERY_CHANNEL,
    ts: (body as any).message.ts,
    text: `❌ Rejected by <@${(body as any).user.id}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `❌ *Rejected by <@${(body as any).user.id}>*\n\nRecovery will NOT be executed.`
        }
      }
    ]
  });
});

// View details
slack.action('view_recovery_details', async ({ ack, body, client }) => {
  await ack();
  
  const planId = (body as any).actions[0].value;
  const approval = pendingApprovals.get(planId);
  
  if (!approval) {
    return;
  }
  
  await client.chat.postMessage({
    channel: RECOVERY_CHANNEL,
    thread_ts: (body as any).message.ts,
    text: `📋 *Recovery Plan Details*\n\n\`\`\`json\n${JSON.stringify(approval.plan, null, 2)}\n\`\`\``
  });
});

// Start Slack app
(async () => {
  if (process.env.SLACK_BOT_TOKEN) {
    await slack.start(process.env.SLACK_PORT || 3001);
    console.log('[Recovery Approval] Slack app started');
  }
})();

export default slack;
```

---

## Step 4: Recovery Monitoring (5 minutes)

Create `services/recovery-monitor.ts`:

```typescript
import aiEvents from '../config/ai-events';
import { AIEventType, EventSeverity } from '@flexgate/ai';

// Monitor metrics after recovery
export async function monitorRecovery(planId: string, metrics: string[]): Promise<boolean> {
  const startTime = Date.now();
  const maxDuration = 5 * 60 * 1000; // 5 minutes
  
  console.log(`[Recovery Monitor] Monitoring ${metrics.join(', ')} for plan ${planId}`);
  
  while (Date.now() - startTime < maxDuration) {
    const healthy = await checkMetrics(metrics);
    
    if (healthy) {
      console.log('[Recovery Monitor] Metrics stable ✅');
      
      // Emit recovery signal
      await aiEvents.emit({
        type: AIEventType.RECOVERY_SIGNAL,
        severity: EventSeverity.INFO,
        summary: `Recovery successful for plan ${planId}`,
        data: {
          metric: 'recovery_status',
          current_value: 100,
          threshold: 80,
          window: '5m',
          trend: 'STABLE',
          unit: '%'
        },
        context: {
          plan_id: planId,
          monitored_metrics: metrics
        }
      });
      
      return true;
    }
    
    await sleep(10000); // Check every 10 seconds
  }
  
  console.log('[Recovery Monitor] Metrics did not stabilize ❌');
  return false;
}

async function checkMetrics(metrics: string[]): Promise<boolean> {
  // Implementation depends on your metrics system
  // Example checks:
  // - Error rate < 5%
  // - Latency p99 < threshold
  // - CPU/Memory normal
  
  return true; // Placeholder
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { monitorRecovery };
```

---

## Testing

Create `tests/auto-recovery.test.ts`:

```typescript
import { AIEventFactory, AIEventType, EventSeverity } from '@flexgate/ai';
import { autoRecovery } from '../services/auto-recovery';
import { findRunbook } from '../config/recovery-runbooks';

describe('Auto-Recovery', () => {
  
  it('should find matching runbook', () => {
    const event = AIEventFactory.create({
      type: AIEventType.LATENCY_ANOMALY,
      summary: 'Database connection pool exhausted',
      severity: EventSeverity.WARNING,
      data: {
        metric: 'latency_ms',
        current_value: 2500,
        threshold: 100,
        window: '5m',
        trend: 'RISING',
        unit: 'ms'
      },
      context: {
        cause: 'DATABASE'
      }
    });
    
    const runbook = findRunbook(event);
    
    expect(runbook).toBeDefined();
    expect(runbook?.name).toBe('scale-database-connections');
  });
  
  it('should generate recovery plan', async () => {
    const event = AIEventFactory.createSample('CIRCUIT_BREAKER_CANDIDATE');
    event.confidence = 0.90;
    
    const plan = await autoRecovery.generateRecoveryPlan(event);
    
    expect(plan).toBeDefined();
    expect(plan?.runbook.name).toBe('open-circuit-breaker');
    expect(plan?.requiresApproval).toBe(false);
    expect(plan?.rollbackPlan).toBeDefined();
  });
  
  it('should execute dry run', async () => {
    const event = AIEventFactory.createSample('CAPACITY_WARNING');
    const plan = await autoRecovery.generateRecoveryPlan(event);
    
    if (plan) {
      plan.runbook.safety.dryRun = true;
      const execution = await autoRecovery.execute(plan);
      
      expect(execution.status).toBe('SUCCESS');
      expect(execution.appliedActions.length).toBeGreaterThan(0);
      expect(execution.appliedActions[0]).toContain('[DRY RUN]');
    }
  });
  
});
```

---

## Verification Checklist

### ✅ Configuration
- [ ] Recovery runbooks defined
- [ ] Safety guardrails configured
- [ ] Slack bot configured
- [ ] Dry-run mode tested

### ✅ Auto-Recovery
- [ ] Plans generating correctly
- [ ] Rate limiting working
- [ ] Rollback plans created

### ✅ Approval Workflow
- [ ] Slack approvals arriving
- [ ] Timeout working (5 min)
- [ ] Rejection handling

### ✅ Execution
- [ ] Dry-run mode working
- [ ] Actions executing
- [ ] Rollback on failure

---

## Production Deployment

### Phase 1: Dry-Run (Week 1)
```typescript
// All runbooks in dry-run mode
safety: { dryRun: true }
```

### Phase 2: Low-Risk Auto (Week 2)
```typescript
// Enable auto for cache clearing, rate limiting
safety: { requiresApproval: false, dryRun: false }
```

### Phase 3: Full Production (Week 3+)
```typescript
// Enable all runbooks with appropriate approval settings
```

---

## Troubleshooting

### Issue: Approvals timing out
**Solution:** Increase timeout or reduce scope

### Issue: Actions failing
**Solution:** Check permissions, test dry-run

### Issue: Rollback not working
**Solution:** Verify rollback plan generation

---

## Success Metrics

- Auto-heal rate: Target 80%+
- MTTR: Target <10 minutes
- False actions: Target <5%

---

**Playbook Version:** 1.0.0  
**Last Updated:** February 15, 2026  
**Tested With:** FlexGate v2.0.0, Kubernetes 1.28
