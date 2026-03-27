/**
 * FlexGate AI Event Factory
 * 
 * Utilities for creating, validating, and enriching AI events.
 * Ensures consistent event structure and quality scoring.
 * 
 * @module ai/utils/eventFactory
 */

import { randomUUID } from 'crypto';
import {
  AIEvent,
  AIEventType,
  EventSeverity,
  TrendDirection,
  AIMetadata,
  Sample,
} from '../types/events';

/**
 * Event creation parameters (simplified input)
 */
export interface CreateEventParams {
  /** Event type */
  type: AIEventType;
  
  /** One-line summary */
  summary: string;
  
  /** Severity level */
  severity: EventSeverity;
  
  /** Metric data */
  data: {
    metric: string;
    current_value: number;
    threshold: number;
    window: string;
    trend: TrendDirection;
    unit?: string;
  };
  
  /** Context information */
  context: {
    route: string;
    upstream: string;
    recent_samples: Sample[];
    method?: string;
    client_id?: string;
    correlation_id?: string;
  };
  
  /** Override confidence (optional, auto-calculated if not provided) */
  confidence?: number;
  
  /** Additional AI metadata (optional) */
  ai_metadata?: Partial<AIMetadata>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Is the event valid? */
  valid: boolean;
  
  /** Validation errors (if any) */
  errors: string[];
  
  /** Validation warnings (non-blocking) */
  warnings?: string[];
}

/**
 * AI Event Factory
 * 
 * Creates properly structured AI events with automatic enrichment,
 * confidence scoring, and validation.
 */
export class AIEventFactory {
  /**
   * Create a new AI event with automatic enrichment
   * 
   * @param params Event creation parameters
   * @returns Complete AI event ready for emission
   * 
   * @example
   * ```typescript
   * const event = AIEventFactory.create({
   *   type: AIEventType.LATENCY_ANOMALY,
   *   summary: 'Response time increased to 2.5s',
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
   *     recent_samples: samples
   *   }
   * });
   * ```
   */
  static create(params: CreateEventParams): AIEvent {
    const event: AIEvent = {
      // Core identification
      event_type: params.type,
      event_id: `evt_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      
      // Context
      summary: params.summary,
      confidence: params.confidence ?? this.calculateConfidence(params),
      severity: params.severity,
      
      // Data
      data: params.data,
      
      // Context
      context: params.context,
      
      // AI metadata
      ai_metadata: this.generateMetadata(params),
    };

    return event;
  }

  /**
   * Calculate confidence score based on data quality
   * 
   * Confidence factors:
   * - Sample size (more samples = higher confidence)
   * - Threshold breach magnitude (larger breach = higher confidence)
   * - Trend stability (stable trend = higher confidence)
   * - Data completeness
   * 
   * @param params Event parameters
   * @returns Confidence score (0.0 - 1.0)
   */
  private static calculateConfidence(params: CreateEventParams): number {
    let score = 0.5; // Base confidence
    
    // Factor 1: Sample size (max +0.25)
    const sample_count = params.context.recent_samples.length;
    if (sample_count >= 10) {
      score += 0.25;
    } else if (sample_count >= 5) {
      score += 0.15;
    } else if (sample_count >= 3) {
      score += 0.05;
    }
    
    // Factor 2: Threshold breach magnitude (max +0.25)
    const breach_ratio = params.data.current_value / params.data.threshold;
    if (breach_ratio > 3.0) {
      score += 0.25;
    } else if (breach_ratio > 2.0) {
      score += 0.15;
    } else if (breach_ratio > 1.5) {
      score += 0.10;
    } else if (breach_ratio > 1.2) {
      score += 0.05;
    }
    
    // Factor 3: Trend consistency (max +0.15)
    if (params.data.trend === TrendDirection.STABLE) {
      score += 0.15; // Stable = predictable = high confidence
    } else if (params.data.trend === TrendDirection.RISING && params.severity === EventSeverity.CRITICAL) {
      score += 0.10; // Rising critical = high confidence
    }
    
    // Factor 4: Data completeness (max +0.10)
    if (params.context.method) score += 0.03;
    if (params.context.correlation_id) score += 0.03;
    if (params.data.unit) score += 0.02;
    if (params.context.client_id) score += 0.02;
    
    // Cap at 1.0
    return Math.min(score, 1.0);
  }

  /**
   * Generate AI-specific metadata
   * 
   * @param params Event parameters
   * @returns AI metadata with token estimates and hints
   */
  private static generateMetadata(params: CreateEventParams): AIMetadata {
    const base_metadata: AIMetadata = {
      token_estimate: this.estimateTokens(params),
      reasoning_hints: this.generateHints(params),
      model_version: '1.0.0',
      estimated_cost_usd: 0.015, // Base estimate for Claude 3.5 Sonnet
      suggested_model: 'claude-3-5-sonnet-20241022',
    };

    // Merge with any user-provided metadata
    if (params.ai_metadata) {
      return { ...base_metadata, ...params.ai_metadata };
    }

    return base_metadata;
  }

  /**
   * Estimate Claude tokens for this event
   * 
   * Rough estimation: 4 characters ≈ 1 token
   * Includes event JSON + prompt template overhead
   * 
   * @param params Event parameters
   * @returns Estimated token count
   */
  private static estimateTokens(params: CreateEventParams): number {
    // Base event JSON size
    const event_json = JSON.stringify({
      type: params.type,
      summary: params.summary,
      data: params.data,
      context: {
        route: params.context.route,
        upstream: params.context.upstream,
        samples: params.context.recent_samples.slice(0, 5), // Only first 5 samples
      },
    });
    
    const event_tokens = Math.ceil(event_json.length / 4);
    
    // Add prompt template overhead (varies by event type)
    const template_overhead = this.getTemplateOverhead(params.type);
    
    return event_tokens + template_overhead;
  }

  /**
   * Get prompt template token overhead by event type
   */
  private static getTemplateOverhead(type: AIEventType): number {
    const overheads: Record<AIEventType, number> = {
      [AIEventType.CIRCUIT_BREAKER_CANDIDATE]: 300,
      [AIEventType.RATE_LIMIT_BREACH]: 250,
      [AIEventType.LATENCY_ANOMALY]: 280,
      [AIEventType.ERROR_RATE_SPIKE]: 290,
      [AIEventType.COST_ALERT]: 320,
      [AIEventType.RETRY_STORM]: 270,
      [AIEventType.UPSTREAM_DEGRADATION]: 280,
      [AIEventType.SECURITY_ANOMALY]: 350,
      [AIEventType.CAPACITY_WARNING]: 260,
      [AIEventType.RECOVERY_SIGNAL]: 240,
    };
    
    return overheads[type] || 300;
  }

  /**
   * Generate AI reasoning hints based on event characteristics
   * 
   * @param params Event parameters
   * @returns Array of reasoning hints
   */
  private static generateHints(params: CreateEventParams): string[] {
    const hints: string[] = [];
    
    // Severity-based hints
    if (params.severity === EventSeverity.CRITICAL) {
      hints.push('Requires immediate attention - critical severity');
    } else if (params.severity === EventSeverity.WARNING) {
      hints.push('Should be investigated soon - warning level');
    }
    
    // Trend-based hints
    if (params.data.trend === TrendDirection.RISING) {
      hints.push('Situation is worsening - rising trend detected');
    } else if (params.data.trend === TrendDirection.FALLING) {
      hints.push('Situation may be improving - falling trend');
    } else {
      hints.push('Stable pattern - consistent behavior observed');
    }
    
    // Magnitude-based hints
    const breach_ratio = params.data.current_value / params.data.threshold;
    if (breach_ratio > 2.0) {
      hints.push(`Significant breach - ${(breach_ratio * 100).toFixed(0)}% of threshold`);
    }
    
    // Sample quality hints
    const sample_count = params.context.recent_samples.length;
    if (sample_count < 3) {
      hints.push('Limited sample data - confidence may be lower');
    } else if (sample_count >= 10) {
      hints.push('Strong sample data - high confidence in detection');
    }
    
    // Event-specific hints
    hints.push(...this.getEventSpecificHints(params));
    
    return hints;
  }

  /**
   * Generate event-type-specific hints
   */
  private static getEventSpecificHints(params: CreateEventParams): string[] {
    const hints: string[] = [];
    
    switch (params.type) {
      case AIEventType.LATENCY_ANOMALY:
        hints.push('Check database query performance and connection pools');
        hints.push('Consider caching opportunities');
        break;
        
      case AIEventType.ERROR_RATE_SPIKE:
        hints.push('Review recent deployments or configuration changes');
        hints.push('Check upstream service health');
        break;
        
      case AIEventType.COST_ALERT:
        hints.push('Evaluate if traffic pattern is legitimate or abuse');
        hints.push('Consider rate limiting or caching');
        break;
        
      case AIEventType.CIRCUIT_BREAKER_CANDIDATE:
        hints.push('Evaluate if circuit breaker should be opened');
        hints.push('Check for cascading failures');
        break;
        
      case AIEventType.SECURITY_ANOMALY:
        hints.push('Investigate source IP and access patterns');
        hints.push('Consider blocking or throttling suspicious actors');
        break;
    }
    
    return hints;
  }

  /**
   * Validate event structure and content
   * 
   * @param event Event to validate
   * @returns Validation result with errors and warnings
   * 
   * @example
   * ```typescript
   * const result = AIEventFactory.validate(event);
   * if (!result.valid) {
   *   console.error('Invalid event:', result.errors);
   * }
   * ```
   */
  static validate(event: AIEvent): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields
    if (!event.event_id) {
      errors.push('Missing required field: event_id');
    } else if (!event.event_id.startsWith('evt_')) {
      warnings.push('event_id should start with "evt_" prefix');
    }
    
    if (!event.event_type) {
      errors.push('Missing required field: event_type');
    }
    
    if (!event.timestamp) {
      errors.push('Missing required field: timestamp');
    } else {
      // Validate ISO 8601 format
      try {
        new Date(event.timestamp);
      } catch {
        errors.push('timestamp must be valid ISO 8601 format');
      }
    }
    
    // Summary validation
    if (!event.summary) {
      errors.push('Missing required field: summary');
    } else if (event.summary.length < 10) {
      errors.push('summary too short (minimum 10 characters)');
    } else if (event.summary.length > 200) {
      warnings.push('summary very long (recommended max 200 characters)');
    }
    
    // Confidence validation
    if (event.confidence === undefined || event.confidence === null) {
      errors.push('Missing required field: confidence');
    } else if (event.confidence < 0 || event.confidence > 1) {
      errors.push('confidence must be between 0.0 and 1.0');
    } else if (event.confidence < 0.3) {
      warnings.push('Low confidence score - consider filtering this event');
    }
    
    // Severity validation
    if (!event.severity) {
      errors.push('Missing required field: severity');
    }
    
    // Data validation
    if (!event.data) {
      errors.push('Missing required field: data');
    } else {
      if (!event.data.metric) {
        errors.push('Missing required field: data.metric');
      }
      if (event.data.current_value === undefined) {
        errors.push('Missing required field: data.current_value');
      }
      if (event.data.threshold === undefined) {
        errors.push('Missing required field: data.threshold');
      }
      if (!event.data.window) {
        errors.push('Missing required field: data.window');
      }
      if (!event.data.trend) {
        errors.push('Missing required field: data.trend');
      }
    }
    
    // Context validation
    if (!event.context) {
      errors.push('Missing required field: context');
    } else {
      if (!event.context.route) {
        errors.push('Missing required field: context.route');
      }
      if (!event.context.upstream) {
        errors.push('Missing required field: context.upstream');
      }
      if (!event.context.recent_samples || event.context.recent_samples.length === 0) {
        warnings.push('No recent_samples provided - limits AI reasoning capability');
      } else if (event.context.recent_samples.length < 3) {
        warnings.push('Few recent_samples (<3) - may reduce confidence');
      }
    }
    
    // AI metadata validation
    if (!event.ai_metadata) {
      warnings.push('Missing ai_metadata - event may not be optimized for AI');
    } else {
      if (!event.ai_metadata.token_estimate) {
        warnings.push('Missing token_estimate in ai_metadata');
      }
      if (!event.ai_metadata.model_version) {
        warnings.push('Missing model_version in ai_metadata');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate trend direction from sample array
   * 
   * Uses simple linear regression to determine trend
   * 
   * @param samples Time-series samples
   * @returns Detected trend direction
   */
  static detectTrend(samples: Sample[]): TrendDirection {
    if (samples.length < 2) {
      return TrendDirection.STABLE;
    }
    
    // Simple linear regression
    const n = samples.length;
    let sum_x = 0;
    let sum_y = 0;
    let sum_xy = 0;
    let sum_xx = 0;
    
    samples.forEach((sample, i) => {
      const x = i;
      const y = sample.value;
      sum_x += x;
      sum_y += y;
      sum_xy += x * y;
      sum_xx += x * x;
    });
    
    const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    
    // Calculate mean for relative slope
    const mean_y = sum_y / n;
    const relative_slope = slope / mean_y;
    
    // Threshold: ±5% change over the window is significant
    if (relative_slope > 0.05) {
      return TrendDirection.RISING;
    } else if (relative_slope < -0.05) {
      return TrendDirection.FALLING;
    } else {
      return TrendDirection.STABLE;
    }
  }

  /**
   * Create a test/sample event for development
   * 
   * @param type Event type to create
   * @returns Sample event
   */
  static createSample(type: AIEventType): AIEvent {
    const samples: Sample[] = [
      { timestamp: new Date(Date.now() - 300000).toISOString(), value: 850 },
      { timestamp: new Date(Date.now() - 240000).toISOString(), value: 920 },
      { timestamp: new Date(Date.now() - 180000).toISOString(), value: 1500 },
      { timestamp: new Date(Date.now() - 120000).toISOString(), value: 2100 },
      { timestamp: new Date(Date.now() - 60000).toISOString(), value: 2500 },
    ];

    return this.create({
      type,
      summary: `Sample ${type} event for testing`,
      severity: EventSeverity.WARNING,
      data: {
        metric: 'test_metric',
        current_value: 2500,
        threshold: 1000,
        window: '5m',
        trend: TrendDirection.RISING,
        unit: 'ms',
      },
      context: {
        route: '/api/test',
        upstream: 'test-service',
        recent_samples: samples,
        method: 'GET',
      },
    });
  }
}
