/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FlexGate AI-Native Event System
 * 
 * AI-optimized event types designed for Claude/GPT integration.
 * These events provide structured, decision-grade data with minimal token usage.
 * 
 * @module ai/types/events
 */

/**
 * AI Event Types - 10 core signals for infrastructure reasoning
 */
export enum AIEventType {
  /** Service showing failure patterns warranting circuit breaker consideration */
  CIRCUIT_BREAKER_CANDIDATE = 'CIRCUIT_BREAKER_CANDIDATE',
  
  /** Unusual traffic spike beyond normal thresholds */
  RATE_LIMIT_BREACH = 'RATE_LIMIT_BREACH',
  
  /** Response time degradation detected */
  LATENCY_ANOMALY = 'LATENCY_ANOMALY',
  
  /** Sudden increase in error rates */
  ERROR_RATE_SPIKE = 'ERROR_RATE_SPIKE',
  
  /** High-cost route usage detected */
  COST_ALERT = 'COST_ALERT',
  
  /** Excessive retry behavior indicating backpressure */
  RETRY_STORM = 'RETRY_STORM',
  
  /** Upstream service health degradation */
  UPSTREAM_DEGRADATION = 'UPSTREAM_DEGRADATION',
  
  /** Unusual access patterns or security concerns */
  SECURITY_ANOMALY = 'SECURITY_ANOMALY',
  
  /** Resource saturation warning */
  CAPACITY_WARNING = 'CAPACITY_WARNING',
  
  /** System auto-healing or recovery event */
  RECOVERY_SIGNAL = 'RECOVERY_SIGNAL',
}

/**
 * Event severity levels
 */
export enum EventSeverity {
  /** Informational - no immediate action required */
  INFO = 'info',
  
  /** Warning - should be investigated soon */
  WARNING = 'warning',
  
  /** Critical - requires immediate attention */
  CRITICAL = 'critical',
}

/**
 * Metric trend direction
 */
export enum TrendDirection {
  /** Metric is increasing over time */
  RISING = 'rising',
  
  /** Metric is decreasing over time */
  FALLING = 'falling',
  
  /** Metric is stable/oscillating around baseline */
  STABLE = 'stable',
}

/**
 * Metric data payload
 */
export interface MetricData {
  /** Name of the metric (e.g., 'response_time_ms', 'error_rate_percent') */
  metric: string;
  
  /** Current observed value */
  current_value: number;
  
  /** Configured threshold that triggered the event */
  threshold: number;
  
  /** Time window for measurement (e.g., '5m', '1h') */
  window: string;
  
  /** Observed trend direction */
  trend: TrendDirection;
  
  /** Unit of measurement (optional, e.g., 'ms', '%', 'req/s') */
  unit?: string;
}

/**
 * Time-series sample point
 */
export interface Sample {
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Metric value at this timestamp */
  value: number;
  
  /** Optional labels/tags for this sample */
  labels?: Record<string, string>;
}

/**
 * Event context for AI reasoning
 */
export interface EventContext {
  /** Route/endpoint where event occurred (e.g., '/api/users') */
  route: string;
  
  /** Upstream service identifier */
  upstream: string;
  
  /** Recent time-series samples (5-10 data points) */
  recent_samples: Sample[];
  
  /** Related event IDs for correlation (optional) */
  related_events?: string[];
  
  /** Correlation ID for request tracing (optional) */
  correlation_id?: string;
  
  /** HTTP method if applicable (optional) */
  method?: string;
  
  /** Client identifier if available (optional) */
  client_id?: string;
}

/**
 * AI-specific metadata for LLM integration
 */
export interface AIMetadata {
  /** Pre-built prompt template for this event (optional) */
  recommended_prompt?: string;
  
  /** Estimated token count for Claude/GPT processing */
  token_estimate?: number;
  
  /** Hints to guide AI reasoning */
  reasoning_hints?: string[];
  
  /** Schema version for compatibility tracking */
  model_version?: string;
  
  /** Expected analysis cost in USD (optional) */
  estimated_cost_usd?: number;
  
  /** Suggested AI model (optional, e.g., 'claude-3-5-sonnet') */
  suggested_model?: string;
}

/**
 * Complete AI Event structure
 * 
 * Designed for minimal token usage while providing complete context
 * for AI-driven incident analysis, cost optimization, and autonomous decisions.
 * 
 * @example
 * ```typescript
 * const event: AIEvent = {
 *   event_type: AIEventType.LATENCY_ANOMALY,
 *   event_id: 'evt_abc123',
 *   timestamp: '2026-02-15T10:30:00Z',
 *   summary: 'Response time spiked to 2.5s on /api/users',
 *   confidence: 0.85,
 *   severity: EventSeverity.WARNING,
 *   data: {
 *     metric: 'response_time_ms',
 *     current_value: 2500,
 *     threshold: 1000,
 *     window: '5m',
 *     trend: TrendDirection.RISING,
 *     unit: 'ms'
 *   },
 *   context: {
 *     route: '/api/users',
 *     upstream: 'users-service',
 *     recent_samples: [
 *       { timestamp: '2026-02-15T10:25:00Z', value: 850 },
 *       { timestamp: '2026-02-15T10:26:00Z', value: 920 },
 *       { timestamp: '2026-02-15T10:27:00Z', value: 1500 },
 *       { timestamp: '2026-02-15T10:28:00Z', value: 2100 },
 *       { timestamp: '2026-02-15T10:29:00Z', value: 2500 },
 *     ]
 *   },
 *   ai_metadata: {
 *     token_estimate: 450,
 *     reasoning_hints: [
 *       'Database query performance suspected',
 *       'No upstream service changes in last hour',
 *       'Traffic volume unchanged'
 *     ],
 *     model_version: '1.0.0'
 *   }
 * };
 * ```
 */
export interface AIEvent {
  // ========== Core Identification ==========
  
  /** Type of event from predefined catalog */
  event_type: AIEventType;
  
  /** Unique event identifier (e.g., 'evt_uuid') */
  event_id: string;
  
  /** ISO 8601 timestamp when event occurred */
  timestamp: string;
  
  // ========== AI-Optimized Context ==========
  
  /** Human-readable one-line summary (optimized for LLM tokens) */
  summary: string;
  
  /** Signal quality score (0.0 - 1.0, higher = more confident) */
  confidence: number;
  
  /** Urgency level for prioritization */
  severity: EventSeverity;
  
  // ========== Decision Payload ==========
  
  /** Metric data that triggered this event */
  data: MetricData;
  
  // ========== Reasoning Support ==========
  
  /** Contextual information for AI analysis */
  context: EventContext;
  
  // ========== AI Integration ==========
  
  /** Metadata for LLM processing */
  ai_metadata: AIMetadata;
}

/**
 * Event emission configuration
 */
export interface EventEmissionConfig {
  /** Enable/disable AI event emission */
  enabled: boolean;
  
  /** Minimum confidence score to emit (0.0 - 1.0) */
  min_confidence: number;
  
  /** Event types to emit (empty = all types) */
  event_types?: AIEventType[];
  
  /** Webhook URL for event delivery (optional) */
  webhook_url?: string;
  
  /** Rate limit: max events per minute per type */
  rate_limit_per_minute: number;
  
  /** Batch window in milliseconds (0 = no batching) */
  batch_window_ms?: number;
  
  /** Enable event deduplication */
  enable_deduplication?: boolean;
  
  /** Deduplication window in seconds */
  deduplication_window_sec?: number;
}

/**
 * AI Analysis result structure (from Claude/GPT)
 */
export interface AIAnalysisResult {
  /** Event that was analyzed */
  event_id: string;
  
  /** Analysis timestamp */
  analyzed_at: string;
  
  /** Model used for analysis */
  model: string;
  
  /** Analysis results (structure varies by event type) */
  analysis: Record<string, any>;
  
  /** Recommended actions */
  recommendations?: string[];
  
  /** Analysis confidence (0.0 - 1.0) */
  analysis_confidence?: number;
  
  /** Actual token count used */
  tokens_used?: number;
  
  /** Actual cost in USD */
  cost_usd?: number;
}
