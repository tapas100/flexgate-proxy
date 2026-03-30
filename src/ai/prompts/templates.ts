/**
 * FlexGate AI Prompt Template Library
 * 
 * Claude/GPT-optimized prompt templates for each event type.
 * Designed for token efficiency (<1000 tokens) and structured JSON responses.
 * 
 * @module ai/prompts/templates
 */

import { AIEvent, AIEventType } from '../types/events';

/**
 * Prompt template definition
 */
export interface PromptTemplate {
  /** Event type this template handles */
  event_type: AIEventType;
  
  /** Human-readable template name */
  name: string;
  
  /** Brief description of what this template analyzes */
  description: string;
  
  /** Prompt template with {variable} placeholders */
  template: string;
  
  /** Maximum tokens for Claude response */
  max_tokens: number;
  
  /** Expected cost in USD per analysis */
  expected_cost_usd: number;
  
  /** Recommended AI model */
  model?: string;
  
  /** Expected response schema (for validation) */
  response_schema?: Partial<Record<string, string>>;
}

/**
 * Prompt Template Library
 * 
 * Provides Claude/GPT-optimized prompts for analyzing AI events.
 * Each prompt is designed to:
 * - Use minimal tokens (<1000)
 * - Return structured JSON
 * - Provide actionable recommendations
 * - Include confidence scores
 */
export class PromptTemplateLibrary {
  private static templates: Map<AIEventType, PromptTemplate> = new Map([
    // ========== Template 1: Circuit Breaker Candidate ==========
    [
      AIEventType.CIRCUIT_BREAKER_CANDIDATE,
      {
        event_type: AIEventType.CIRCUIT_BREAKER_CANDIDATE,
        name: 'Circuit Breaker Analysis',
        description: 'Analyze service health and recommend circuit breaker actions',
        max_tokens: 1024,
        expected_cost_usd: 0.015,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          root_causes: 'array',
          circuit_breaker_decision: 'string',
          confidence: 'number',
          actions: 'array',
          impact_if_ignored: 'string',
        },
        template: `You are an experienced SRE analyzing a service health issue.

**Event Summary:** {summary}
**Service:** {upstream}
**Route:** {route}
**Error Rate:** {current_value}% (threshold: {threshold}%)
**Trend:** {trend}
**Time Window:** {window}

**Recent Samples:**
{recent_samples}

Based on this data, analyze:

1. What are the 3 most likely root causes?
2. Should we open the circuit breaker? (YES/NO)
3. What immediate actions should be taken?
4. What's the expected impact if no action is taken in the next 5 minutes?
5. Your confidence in this diagnosis (0-100)

Respond in JSON format:
{
  "root_causes": ["cause 1", "cause 2", "cause 3"],
  "circuit_breaker_decision": "YES or NO",
  "reasoning": "brief explanation",
  "actions": ["action 1", "action 2"],
  "impact_if_ignored": "brief impact description",
  "confidence": 85
}

Be specific, quantitative, and actionable.`,
      },
    ],

    // ========== Template 2: Cost Alert ==========
    [
      AIEventType.COST_ALERT,
      {
        event_type: AIEventType.COST_ALERT,
        name: 'Cost Optimization Analysis',
        description: 'Analyze high-cost routes and suggest optimizations',
        max_tokens: 1024,
        expected_cost_usd: 0.015,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          anomaly_assessment: 'string',
          strategies: 'array',
          savings_estimates: 'array',
          billing_risks: 'array',
        },
        template: `You are a cloud cost optimization expert analyzing API usage patterns.

**Route:** {route}
**Request Volume:** {current_value} req/min (threshold: {threshold} req/min)
**Trend:** {trend}
**Time Window:** {window}

**Recent Request Rates:**
{recent_samples}

Analyze:

1. Is this usage pattern normal or anomalous?
2. Suggest 3 specific cost reduction strategies
3. Estimate potential savings for each strategy ($ per month)
4. Identify any billing risk or quota concerns
5. Priority order (1=highest priority)

Respond in JSON format:
{
  "anomaly_assessment": "NORMAL or ANOMALOUS with reason",
  "strategies": [
    {
      "strategy": "specific action",
      "savings_usd_per_month": 500,
      "implementation_effort": "LOW/MEDIUM/HIGH",
      "priority": 1
    }
  ],
  "billing_risks": ["risk 1", "risk 2"],
  "confidence": 80
}

Be specific and quantitative.`,
      },
    ],

    // ========== Template 3: Latency Anomaly ==========
    [
      AIEventType.LATENCY_ANOMALY,
      {
        event_type: AIEventType.LATENCY_ANOMALY,
        name: 'Latency Degradation Analysis',
        description: 'Diagnose response time issues and suggest fixes',
        max_tokens: 800,
        expected_cost_usd: 0.012,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          probable_cause: 'string',
          severity_score: 'number',
          immediate_fix: 'string',
          prevention: 'string',
        },
        template: `You are a performance engineer diagnosing latency issues.

**Route:** {route}
**Current Latency:** {current_value}ms (baseline: {threshold}ms)
**Increase:** {breach_ratio}x baseline
**Trend:** {trend}
**Upstream Service:** {upstream}

**Recent Latency Samples (ms):**
{recent_samples}

Diagnose:

1. Most likely cause (database, network, code, external API, or other)?
2. Severity: How bad will this get if not addressed? (1-10 scale)
3. Recommended immediate fix (one specific action)
4. Long-term prevention strategy

Respond in JSON format:
{
  "probable_cause": "DATABASE/NETWORK/CODE/EXTERNAL_API/OTHER",
  "cause_details": "specific explanation",
  "severity_score": 7,
  "immediate_fix": "specific action",
  "prevention": "long-term strategy",
  "estimated_fix_time_minutes": 15,
  "confidence": 85
}

Be specific and actionable.`,
      },
    ],

    // ========== Template 4: Error Rate Spike ==========
    [
      AIEventType.ERROR_RATE_SPIKE,
      {
        event_type: AIEventType.ERROR_RATE_SPIKE,
        name: 'Error Rate Spike Analysis',
        description: 'Investigate sudden increase in errors',
        max_tokens: 900,
        expected_cost_usd: 0.013,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          error_category: 'string',
          likely_causes: 'array',
          rollback_needed: 'boolean',
          actions: 'array',
        },
        template: `You are an SRE investigating an error rate spike.

**Route:** {route}
**Error Rate:** {current_value}% (baseline: {threshold}%)
**Spike Magnitude:** {breach_ratio}x baseline
**Trend:** {trend}
**Upstream:** {upstream}

**Recent Error Rate Samples (%):**
{recent_samples}

Investigate:

1. Error category (4xx client errors, 5xx server errors, or timeout)?
2. 3 most likely causes
3. Is this deployment-related? Should we rollback?
4. Immediate actions to take
5. Expected user impact

Respond in JSON format:
{
  "error_category": "4xx/5xx/TIMEOUT",
  "likely_causes": [
    {
      "cause": "specific cause",
      "probability": 70
    }
  ],
  "rollback_needed": true,
  "rollback_reasoning": "why or why not",
  "actions": ["action 1", "action 2"],
  "user_impact": "brief description",
  "confidence": 80
}

Be specific about deployment timing and user impact.`,
      },
    ],

    // ========== Template 5: Rate Limit Breach ==========
    [
      AIEventType.RATE_LIMIT_BREACH,
      {
        event_type: AIEventType.RATE_LIMIT_BREACH,
        name: 'Rate Limit Breach Analysis',
        description: 'Analyze traffic spikes and recommend throttling',
        max_tokens: 850,
        expected_cost_usd: 0.013,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          traffic_type: 'string',
          throttle_recommendation: 'object',
          abuse_indicators: 'array',
        },
        template: `You are a security engineer analyzing a traffic spike.

**Route:** {route}
**Request Rate:** {current_value} req/s (limit: {threshold} req/s)
**Spike Magnitude:** {breach_ratio}x limit
**Trend:** {trend}

**Recent Traffic Samples (req/s):**
{recent_samples}

Analyze:

1. Traffic type (legitimate spike, abuse/bot, DDoS, or flash crowd)?
2. Should we throttle? If yes, to what rate?
3. Indicators of abuse or malicious activity
4. Recommended actions
5. Impact of throttling on legitimate users

Respond in JSON format:
{
  "traffic_type": "LEGITIMATE/ABUSE/DDOS/FLASH_CROWD",
  "reasoning": "brief explanation",
  "throttle_recommendation": {
    "should_throttle": true,
    "new_rate_limit": 100,
    "duration_minutes": 30
  },
  "abuse_indicators": ["indicator 1", "indicator 2"],
  "actions": ["action 1", "action 2"],
  "legitimate_user_impact": "LOW/MEDIUM/HIGH",
  "confidence": 75
}

Be specific about throttling parameters.`,
      },
    ],

    // ========== Template 6: Retry Storm ==========
    [
      AIEventType.RETRY_STORM,
      {
        event_type: AIEventType.RETRY_STORM,
        name: 'Retry Storm Analysis',
        description: 'Detect and mitigate excessive retry behavior',
        max_tokens: 800,
        expected_cost_usd: 0.012,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          backpressure_level: 'string',
          mitigation: 'object',
          cascading_failure_risk: 'string',
        },
        template: `You are an SRE analyzing retry storm and backpressure.

**Route:** {route}
**Retry Rate:** {current_value} retries/min (threshold: {threshold} retries/min)
**Trend:** {trend}
**Upstream:** {upstream}

**Recent Retry Rate Samples:**
{recent_samples}

Analyze:

1. Backpressure level (LOW/MEDIUM/HIGH/CRITICAL)
2. Root cause of retries (upstream failure, timeout, transient error)?
3. Risk of cascading failure
4. Immediate mitigation strategy
5. Should we implement exponential backoff or circuit breaker?

Respond in JSON format:
{
  "backpressure_level": "LOW/MEDIUM/HIGH/CRITICAL",
  "root_cause": "specific cause",
  "cascading_failure_risk": "LOW/MEDIUM/HIGH",
  "mitigation": {
    "strategy": "EXPONENTIAL_BACKOFF/CIRCUIT_BREAKER/RATE_LIMIT/STOP_RETRIES",
    "parameters": "specific configuration"
  },
  "actions": ["action 1", "action 2"],
  "estimated_recovery_time_minutes": 10,
  "confidence": 80
}

Be specific about mitigation parameters.`,
      },
    ],

    // ========== Template 7: Upstream Degradation ==========
    [
      AIEventType.UPSTREAM_DEGRADATION,
      {
        event_type: AIEventType.UPSTREAM_DEGRADATION,
        name: 'Upstream Service Health Analysis',
        description: 'Diagnose dependency health issues',
        max_tokens: 850,
        expected_cost_usd: 0.013,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          degradation_type: 'string',
          failover_recommendation: 'object',
          actions: 'array',
        },
        template: `You are an SRE analyzing upstream service degradation.

**Route:** {route}
**Upstream Service:** {upstream}
**Health Score:** {current_value}% (threshold: {threshold}%)
**Trend:** {trend}

**Recent Health Samples (%):**
{recent_samples}

Analyze:

1. Type of degradation (latency, errors, availability, or capacity)?
2. Should we failover to backup/replica?
3. Is this a partial or complete outage?
4. Immediate actions to protect our service
5. Expected recovery time

Respond in JSON format:
{
  "degradation_type": "LATENCY/ERRORS/AVAILABILITY/CAPACITY",
  "severity": "PARTIAL/COMPLETE",
  "failover_recommendation": {
    "should_failover": true,
    "target": "backup-service-url",
    "confidence": 85
  },
  "actions": ["action 1", "action 2"],
  "expected_recovery_minutes": 20,
  "user_impact": "brief description",
  "confidence": 80
}

Be specific about failover targets.`,
      },
    ],

    // ========== Template 8: Security Anomaly ==========
    [
      AIEventType.SECURITY_ANOMALY,
      {
        event_type: AIEventType.SECURITY_ANOMALY,
        name: 'Security Anomaly Analysis',
        description: 'Investigate unusual access patterns',
        max_tokens: 950,
        expected_cost_usd: 0.014,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          threat_level: 'string',
          attack_type: 'string',
          block_recommendation: 'object',
          forensics: 'array',
        },
        template: `You are a security analyst investigating suspicious activity.

**Route:** {route}
**Anomaly Score:** {current_value} (threshold: {threshold})
**Trend:** {trend}

**Recent Activity Pattern:**
{recent_samples}

**Context:**
{reasoning_hints}

Investigate:

1. Threat level (LOW/MEDIUM/HIGH/CRITICAL)
2. Attack type (brute force, SQL injection, XSS, credential stuffing, recon, or other)?
3. Should we block the source? If yes, for how long?
4. Forensic data to collect
5. Indicators of compromise (IOCs)

Respond in JSON format:
{
  "threat_level": "LOW/MEDIUM/HIGH/CRITICAL",
  "attack_type": "BRUTE_FORCE/SQL_INJECTION/XSS/CREDENTIAL_STUFFING/RECON/OTHER",
  "attack_details": "specific indicators",
  "block_recommendation": {
    "should_block": true,
    "target": "IP/USER/PATTERN",
    "duration_hours": 24,
    "whitelist_risk": "LOW/MEDIUM/HIGH"
  },
  "forensics": ["data to collect 1", "data to collect 2"],
  "iocs": ["IOC 1", "IOC 2"],
  "confidence": 85
}

Be specific about blocking criteria.`,
      },
    ],

    // ========== Template 9: Capacity Warning ==========
    [
      AIEventType.CAPACITY_WARNING,
      {
        event_type: AIEventType.CAPACITY_WARNING,
        name: 'Capacity Saturation Analysis',
        description: 'Analyze resource saturation and scaling needs',
        max_tokens: 800,
        expected_cost_usd: 0.012,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          resource_type: 'string',
          time_to_saturation: 'number',
          scaling_recommendation: 'object',
        },
        template: `You are a capacity planning engineer analyzing resource saturation.

**Route:** {route}
**Resource Utilization:** {current_value}% (threshold: {threshold}%)
**Trend:** {trend}

**Recent Utilization Samples (%):**
{recent_samples}

Analyze:

1. Resource type (CPU, memory, connections, disk, or network)?
2. Time to saturation (minutes until 100%)
3. Scaling recommendation (horizontal, vertical, or optimize)
4. Should we scale now or wait?
5. Quick optimization opportunities

Respond in JSON format:
{
  "resource_type": "CPU/MEMORY/CONNECTIONS/DISK/NETWORK",
  "current_utilization": 85,
  "time_to_saturation_minutes": 45,
  "scaling_recommendation": {
    "action": "SCALE_HORIZONTAL/SCALE_VERTICAL/OPTIMIZE/WAIT",
    "target_capacity": "specific target",
    "urgency": "IMMEDIATE/SOON/MONITOR"
  },
  "optimizations": ["optimization 1", "optimization 2"],
  "estimated_cost_increase_usd": 200,
  "confidence": 80
}

Be specific about scaling targets.`,
      },
    ],

    // ========== Template 10: Recovery Signal ==========
    [
      AIEventType.RECOVERY_SIGNAL,
      {
        event_type: AIEventType.RECOVERY_SIGNAL,
        name: 'Recovery Validation Analysis',
        description: 'Validate service recovery and assess stability',
        max_tokens: 700,
        expected_cost_usd: 0.010,
        model: 'claude-3-5-sonnet-20241022',
        response_schema: {
          recovery_status: 'string',
          stability_assessment: 'string',
          actions: 'array',
        },
        template: `You are an SRE validating service recovery.

**Route:** {route}
**Recovery Metric:** {current_value} (healthy threshold: {threshold})
**Trend:** {trend}

**Recent Recovery Samples:**
{recent_samples}

Assess:

1. Recovery status (COMPLETE/PARTIAL/UNSTABLE/FALSE_POSITIVE)
2. System stability (STABLE/FRAGILE/DEGRADED)
3. Should we restore full traffic?
4. Monitoring points to watch
5. Risk of regression

Respond in JSON format:
{
  "recovery_status": "COMPLETE/PARTIAL/UNSTABLE/FALSE_POSITIVE",
  "stability_assessment": "STABLE/FRAGILE/DEGRADED",
  "restore_traffic_recommendation": {
    "should_restore": true,
    "percentage": 100,
    "ramp_duration_minutes": 15
  },
  "monitoring_points": ["metric 1", "metric 2"],
  "regression_risk": "LOW/MEDIUM/HIGH",
  "actions": ["action 1", "action 2"],
  "confidence": 85
}

Be conservative - prioritize safety over speed.`,
      },
    ],
  ]);

  /**
   * Get template for a specific event type
   * 
   * @param eventType Event type
   * @returns Prompt template or undefined if not found
   */
  static getTemplate(eventType: AIEventType): PromptTemplate | undefined {
    return this.templates.get(eventType);
  }

  /**
   * Get all available templates
   * 
   * @returns Array of all prompt templates
   */
  static getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Build complete prompt from AI event
   * 
   * Substitutes all {variable} placeholders with actual event data.
   * 
   * @param event AI event to analyze
   * @returns Complete prompt ready for Claude/GPT
   * 
   * @example
   * ```typescript
   * const event = AIEventFactory.create({...});
   * const prompt = PromptTemplateLibrary.buildPrompt(event);
   * // Send prompt to Claude API
   * ```
   */
  static buildPrompt(event: AIEvent): string {
    const template = this.getTemplate(event.event_type);
    if (!template) {
      throw new Error(`No template found for event type: ${event.event_type}`);
    }

    let prompt = template.template;

    // Calculate breach ratio
    const breach_ratio = event.data.current_value / event.data.threshold;

    // Substitute basic variables
    const substitutions: Record<string, string> = {
      summary: event.summary,
      upstream: event.context.upstream,
      route: event.context.route,
      current_value: event.data.current_value.toString(),
      threshold: event.data.threshold.toString(),
      trend: event.data.trend,
      window: event.data.window,
      breach_ratio: breach_ratio.toFixed(2),
      reasoning_hints: event.ai_metadata.reasoning_hints?.join('\n- ') || 'None',
    };

    // Apply substitutions
    for (const [key, value] of Object.entries(substitutions)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      prompt = prompt.replace(regex, value);
    }

    // Format recent samples for readability
    const samples_formatted = this.formatSamples(event.context.recent_samples);
    prompt = prompt.replace('{recent_samples}', samples_formatted);

    return prompt;
  }

  /**
   * Format sample data for prompt inclusion
   * 
   * @param samples Recent sample data
   * @returns Formatted string for prompt
   */
  private static formatSamples(samples: Array<{ timestamp: string; value: number }>): string {
    if (!samples || samples.length === 0) {
      return 'No recent samples available';
    }

    // Take last 5 samples for token efficiency
    const recent = samples.slice(-5);
    
    return recent
      .map((sample, index) => {
        const time = new Date(sample.timestamp).toISOString().substring(11, 19);
        return `${index + 1}. ${time}: ${sample.value}`;
      })
      .join('\n');
  }

  /**
   * Estimate cost for analyzing an event
   * 
   * @param event AI event
   * @returns Estimated cost in USD
   */
  static estimateCost(event: AIEvent): number {
    const template = this.getTemplate(event.event_type);
    return template?.expected_cost_usd || 0.015;
  }

  /**
   * Get recommended model for event type
   * 
   * @param event AI event
   * @returns Recommended model identifier
   */
  static getRecommendedModel(event: AIEvent): string {
    const template = this.getTemplate(event.event_type);
    return template?.model || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Get max tokens for event type
   * 
   * @param event AI event
   * @returns Maximum tokens for response
   */
  static getMaxTokens(event: AIEvent): number {
    const template = this.getTemplate(event.event_type);
    return template?.max_tokens || 1024;
  }

  /**
   * Validate template coverage
   * 
   * Ensures all event types have templates
   * 
   * @returns Validation result
   */
  static validateCoverage(): { complete: boolean; missing: AIEventType[] } {
    const allEventTypes = Object.values(AIEventType);
    const missing: AIEventType[] = [];

    for (const eventType of allEventTypes) {
      if (!this.templates.has(eventType)) {
        missing.push(eventType);
      }
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }

  /**
   * Get template statistics
   * 
   * @returns Statistics about template library
   */
  static getStats(): {
    total_templates: number;
    avg_max_tokens: number;
    avg_cost_usd: number;
    total_event_types_covered: number;
    } {
    const templates = Array.from(this.templates.values());
    
    return {
      total_templates: templates.length,
      avg_max_tokens: Math.round(
        templates.reduce((sum, t) => sum + t.max_tokens, 0) / templates.length
      ),
      avg_cost_usd: parseFloat(
        (templates.reduce((sum, t) => sum + t.expected_cost_usd, 0) / templates.length).toFixed(4)
      ),
      total_event_types_covered: templates.length,
    };
  }
}
