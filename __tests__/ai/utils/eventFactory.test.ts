/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for AI Event Factory
 */

import { AIEventFactory, CreateEventParams } from '../../../src/ai/utils/eventFactory';
import {
  AIEventType,
  EventSeverity,
  TrendDirection,
  Sample,
} from '../../../src/ai/types/events';

describe('AIEventFactory', () => {
  // Sample data for testing
  const sampleData: Sample[] = [
    { timestamp: '2026-02-15T10:25:00Z', value: 850 },
    { timestamp: '2026-02-15T10:26:00Z', value: 920 },
    { timestamp: '2026-02-15T10:27:00Z', value: 1500 },
    { timestamp: '2026-02-15T10:28:00Z', value: 2100 },
    { timestamp: '2026-02-15T10:29:00Z', value: 2500 },
  ];

  const validParams: CreateEventParams = {
    type: AIEventType.LATENCY_ANOMALY,
    summary: 'Response time increased to 2.5s on /api/users',
    severity: EventSeverity.WARNING,
    data: {
      metric: 'response_time_ms',
      current_value: 2500,
      threshold: 1000,
      window: '5m',
      trend: TrendDirection.RISING,
      unit: 'ms',
    },
    context: {
      route: '/api/users',
      upstream: 'users-service',
      recent_samples: sampleData,
      method: 'GET',
      client_id: 'client_123',
    },
  };

  describe('create()', () => {
    it('should create a valid AI event with all required fields', () => {
      const event = AIEventFactory.create(validParams);

      expect(event.event_type).toBe(AIEventType.LATENCY_ANOMALY);
      expect(event.event_id).toMatch(/^evt_[a-f0-9-]+$/);
      expect(event.timestamp).toBeTruthy();
      expect(event.summary).toBe(validParams.summary);
      expect(event.severity).toBe(EventSeverity.WARNING);
      expect(event.data).toEqual(validParams.data);
      expect(event.context).toEqual(validParams.context);
    });

    it('should generate unique event IDs', () => {
      const event1 = AIEventFactory.create(validParams);
      const event2 = AIEventFactory.create(validParams);

      expect(event1.event_id).not.toBe(event2.event_id);
    });

    it('should generate valid ISO 8601 timestamps', () => {
      const event = AIEventFactory.create(validParams);
      const timestamp = new Date(event.timestamp);

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 1000); // Within last second
    });

    it('should auto-calculate confidence when not provided', () => {
      const event = AIEventFactory.create(validParams);

      expect(event.confidence).toBeGreaterThan(0);
      expect(event.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should use provided confidence when specified', () => {
      const params = { ...validParams, confidence: 0.75 };
      const event = AIEventFactory.create(params);

      expect(event.confidence).toBe(0.75);
    });

    it('should generate AI metadata', () => {
      const event = AIEventFactory.create(validParams);

      expect(event.ai_metadata).toBeDefined();
      expect(event.ai_metadata.token_estimate).toBeGreaterThan(0);
      expect(event.ai_metadata.reasoning_hints).toBeInstanceOf(Array);
      expect(event.ai_metadata.model_version).toBe('1.0.0');
    });

    it('should merge custom AI metadata', () => {
      const params: CreateEventParams = {
        ...validParams,
        ai_metadata: {
          recommended_prompt: 'Custom prompt',
          suggested_model: 'gpt-4',
        },
      };
      const event = AIEventFactory.create(params);

      expect(event.ai_metadata.recommended_prompt).toBe('Custom prompt');
      expect(event.ai_metadata.suggested_model).toBe('gpt-4');
      expect(event.ai_metadata.token_estimate).toBeGreaterThan(0); // Still auto-generated
    });
  });

  describe('confidence calculation', () => {
    it('should give higher confidence with more samples', () => {
      const params_few_samples = {
        ...validParams,
        context: {
          ...validParams.context,
          recent_samples: sampleData.slice(0, 2), // Only 2 samples
        },
      };
      const params_many_samples = {
        ...validParams,
        context: {
          ...validParams.context,
          recent_samples: [...sampleData, ...sampleData], // 10 samples
        },
      };

      const event_few = AIEventFactory.create(params_few_samples);
      const event_many = AIEventFactory.create(params_many_samples);

      expect(event_many.confidence).toBeGreaterThan(event_few.confidence);
    });

    it('should give higher confidence with larger threshold breach', () => {
      const params_small_breach = {
        ...validParams,
        data: {
          ...validParams.data,
          current_value: 1100, // 10% over threshold
          threshold: 1000,
        },
      };
      const params_large_breach = {
        ...validParams,
        data: {
          ...validParams.data,
          current_value: 3000, // 200% over threshold
          threshold: 1000,
        },
      };

      const event_small = AIEventFactory.create(params_small_breach);
      const event_large = AIEventFactory.create(params_large_breach);

      expect(event_large.confidence).toBeGreaterThan(event_small.confidence);
    });

    it('should give higher confidence for stable trends', () => {
      const params_rising = {
        ...validParams,
        data: { ...validParams.data, trend: TrendDirection.RISING },
      };
      const params_stable = {
        ...validParams,
        data: { ...validParams.data, trend: TrendDirection.STABLE },
      };

      const event_rising = AIEventFactory.create(params_rising);
      const event_stable = AIEventFactory.create(params_stable);

      expect(event_stable.confidence).toBeGreaterThan(event_rising.confidence);
    });

    it('should give higher confidence with complete data', () => {
      const params_minimal = {
        ...validParams,
        context: {
          route: '/api/test',
          upstream: 'test-service',
          recent_samples: sampleData,
        },
      };
      const params_complete = {
        ...validParams,
        data: { ...validParams.data, unit: 'ms' },
        context: {
          ...validParams.context,
          method: 'GET',
          client_id: 'client_123',
          correlation_id: 'corr_456',
        },
      };

      const event_minimal = AIEventFactory.create(params_minimal);
      const event_complete = AIEventFactory.create(params_complete);

      expect(event_complete.confidence).toBeGreaterThan(event_minimal.confidence);
    });

    it('should never exceed 1.0 confidence', () => {
      const params_extreme = {
        ...validParams,
        data: {
          ...validParams.data,
          current_value: 10000, // 10x threshold
          threshold: 1000,
          trend: TrendDirection.STABLE,
          unit: 'ms',
        },
        context: {
          ...validParams.context,
          recent_samples: Array(20).fill(sampleData[0]), // Many samples
          method: 'GET',
          client_id: 'client_123',
          correlation_id: 'corr_456',
        },
      };

      const event = AIEventFactory.create(params_extreme);

      expect(event.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens for event', () => {
      const event = AIEventFactory.create(validParams);

      expect(event.ai_metadata.token_estimate).toBeGreaterThan(0);
      expect(event.ai_metadata.token_estimate).toBeLessThan(2000); // Reasonable upper bound
    });

    it('should vary token estimate by event type', () => {
      const event_latency = AIEventFactory.create({
        ...validParams,
        type: AIEventType.LATENCY_ANOMALY,
      });
      const event_security = AIEventFactory.create({
        ...validParams,
        type: AIEventType.SECURITY_ANOMALY,
      });

      // Security events typically need more context/tokens
      expect(event_security.ai_metadata.token_estimate).not.toBe(
        event_latency.ai_metadata.token_estimate
      );
    });
  });

  describe('reasoning hints', () => {
    it('should generate severity-based hints', () => {
      const event_critical = AIEventFactory.create({
        ...validParams,
        severity: EventSeverity.CRITICAL,
      });

      const hasAttentionHint = event_critical.ai_metadata.reasoning_hints?.some(hint => 
        hint.includes('immediate attention')
      );
      expect(hasAttentionHint).toBe(true);
    });

    it('should generate trend-based hints', () => {
      const event_rising = AIEventFactory.create({
        ...validParams,
        data: { ...validParams.data, trend: TrendDirection.RISING },
      });

      const hasWorseningHint = event_rising.ai_metadata.reasoning_hints?.some(hint =>
        hint.includes('worsening')
      );
      expect(hasWorseningHint).toBe(true);
    });

    it('should generate event-specific hints', () => {
      const event_latency = AIEventFactory.create({
        ...validParams,
        type: AIEventType.LATENCY_ANOMALY,
      });

      const hasDatabaseHint = event_latency.ai_metadata.reasoning_hints?.some(hint =>
        hint.includes('database')
      );
      expect(hasDatabaseHint).toBe(true);
    });

    it('should warn about limited samples', () => {
      const params_few_samples = {
        ...validParams,
        context: {
          ...validParams.context,
          recent_samples: sampleData.slice(0, 2),
        },
      };
      const event = AIEventFactory.create(params_few_samples);

      const hasLimitedDataHint = event.ai_metadata.reasoning_hints?.some(hint =>
        hint.includes('Limited sample data')
      );
      expect(hasLimitedDataHint).toBe(true);
    });
  });

  describe('validate()', () => {
    it('should validate a properly created event', () => {
      const event = AIEventFactory.create(validParams);
      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch missing event_id', () => {
      const event = AIEventFactory.create(validParams);
      delete (event as any).event_id;

      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: event_id');
    });

    it('should catch missing summary', () => {
      const event = AIEventFactory.create(validParams);
      (event as any).summary = '';

      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: summary');
    });

    it('should catch summary too short', () => {
      const event = AIEventFactory.create(validParams);
      event.summary = 'Short';

      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('summary too short (minimum 10 characters)');
    });

    it('should catch invalid confidence range', () => {
      const event = AIEventFactory.create(validParams);
      event.confidence = 1.5;

      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('confidence must be between 0.0 and 1.0');
    });

    it('should catch missing data fields', () => {
      const event = AIEventFactory.create(validParams);
      delete (event as any).data.metric;

      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: data.metric');
    });

    it('should catch missing context fields', () => {
      const event = AIEventFactory.create(validParams);
      delete (event as any).context.route;

      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: context.route');
    });

    it('should warn about low confidence', () => {
      const event = AIEventFactory.create(validParams);
      event.confidence = 0.2;

      const result = AIEventFactory.validate(event);

      const hasLowConfidenceWarning = result.warnings?.some(warning =>
        warning.includes('Low confidence score')
      );
      expect(hasLowConfidenceWarning).toBe(true);
    });

    it('should warn about few samples', () => {
      const event = AIEventFactory.create(validParams);
      event.context.recent_samples = sampleData.slice(0, 2);

      const result = AIEventFactory.validate(event);

      const hasFewSamplesWarning = result.warnings?.some(warning =>
        warning.includes('Few recent_samples')
      );
      expect(hasFewSamplesWarning).toBe(true);
    });

    it('should warn about missing AI metadata', () => {
      const event = AIEventFactory.create(validParams);
      delete (event as any).ai_metadata;

      const result = AIEventFactory.validate(event);

      const hasMissingMetadataWarning = result.warnings?.some(warning =>
        warning.includes('Missing ai_metadata')
      );
      expect(hasMissingMetadataWarning).toBe(true);
    });
  });

  describe('detectTrend()', () => {
    it('should detect rising trend', () => {
      const rising_samples: Sample[] = [
        { timestamp: '2026-02-15T10:00:00Z', value: 100 },
        { timestamp: '2026-02-15T10:01:00Z', value: 150 },
        { timestamp: '2026-02-15T10:02:00Z', value: 200 },
        { timestamp: '2026-02-15T10:03:00Z', value: 250 },
        { timestamp: '2026-02-15T10:04:00Z', value: 300 },
      ];

      const trend = AIEventFactory.detectTrend(rising_samples);

      expect(trend).toBe(TrendDirection.RISING);
    });

    it('should detect falling trend', () => {
      const falling_samples: Sample[] = [
        { timestamp: '2026-02-15T10:00:00Z', value: 300 },
        { timestamp: '2026-02-15T10:01:00Z', value: 250 },
        { timestamp: '2026-02-15T10:02:00Z', value: 200 },
        { timestamp: '2026-02-15T10:03:00Z', value: 150 },
        { timestamp: '2026-02-15T10:04:00Z', value: 100 },
      ];

      const trend = AIEventFactory.detectTrend(falling_samples);

      expect(trend).toBe(TrendDirection.FALLING);
    });

    it('should detect stable trend', () => {
      const stable_samples: Sample[] = [
        { timestamp: '2026-02-15T10:00:00Z', value: 200 },
        { timestamp: '2026-02-15T10:01:00Z', value: 205 },
        { timestamp: '2026-02-15T10:02:00Z', value: 198 },
        { timestamp: '2026-02-15T10:03:00Z', value: 202 },
        { timestamp: '2026-02-15T10:04:00Z', value: 200 },
      ];

      const trend = AIEventFactory.detectTrend(stable_samples);

      expect(trend).toBe(TrendDirection.STABLE);
    });

    it('should handle single sample as stable', () => {
      const single_sample: Sample[] = [
        { timestamp: '2026-02-15T10:00:00Z', value: 100 },
      ];

      const trend = AIEventFactory.detectTrend(single_sample);

      expect(trend).toBe(TrendDirection.STABLE);
    });

    it('should handle empty array as stable', () => {
      const trend = AIEventFactory.detectTrend([]);

      expect(trend).toBe(TrendDirection.STABLE);
    });
  });

  describe('createSample()', () => {
    it('should create sample event for each event type', () => {
      const event_types = Object.values(AIEventType);

      event_types.forEach((type) => {
        const event = AIEventFactory.createSample(type);

        expect(event.event_type).toBe(type);
        expect(event.event_id).toMatch(/^evt_/);
        expect(event.context.recent_samples).toHaveLength(5);
      });
    });

    it('should create valid sample event', () => {
      const event = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);
      const result = AIEventFactory.validate(event);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero threshold gracefully', () => {
      const params = {
        ...validParams,
        data: { ...validParams.data, threshold: 0 },
      };

      expect(() => AIEventFactory.create(params)).not.toThrow();
    });

    it('should handle negative values', () => {
      const params = {
        ...validParams,
        data: { ...validParams.data, current_value: -100 },
      };

      const event = AIEventFactory.create(params);
      expect(event.data.current_value).toBe(-100);
    });

    it('should handle empty reasoning hints gracefully', () => {
      const params = {
        ...validParams,
        ai_metadata: { reasoning_hints: [] },
      };

      const event = AIEventFactory.create(params);
      expect(event.ai_metadata.reasoning_hints).toBeInstanceOf(Array);
    });

    it('should handle very long summaries', () => {
      const long_summary = 'A'.repeat(500);
      const params = {
        ...validParams,
        summary: long_summary,
      };

      const event = AIEventFactory.create(params);
      expect(event.summary).toBe(long_summary);

      const result = AIEventFactory.validate(event);
      const hasLongSummaryWarning = result.warnings?.some(warning =>
        warning.includes('summary very long')
      );
      expect(hasLongSummaryWarning).toBe(true);
    });
  });
});
