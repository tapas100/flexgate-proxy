/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for Prompt Template Library
 */

import { PromptTemplateLibrary } from '../../../src/ai/prompts/templates';
import { AIEventFactory } from '../../../src/ai/utils/eventFactory';
import { AIEventType, EventSeverity, TrendDirection, Sample } from '../../../src/ai/types/events';

describe('PromptTemplateLibrary', () => {
  // Sample data for testing
  const sampleData: Sample[] = [
    { timestamp: '2026-02-15T10:25:00Z', value: 850 },
    { timestamp: '2026-02-15T10:26:00Z', value: 920 },
    { timestamp: '2026-02-15T10:27:00Z', value: 1500 },
    { timestamp: '2026-02-15T10:28:00Z', value: 2100 },
    { timestamp: '2026-02-15T10:29:00Z', value: 2500 },
  ];

  describe('getTemplate()', () => {
    it('should return template for valid event type', () => {
      const template = PromptTemplateLibrary.getTemplate(AIEventType.LATENCY_ANOMALY);
      
      expect(template).toBeDefined();
      expect(template?.event_type).toBe(AIEventType.LATENCY_ANOMALY);
      expect(template?.name).toBe('Latency Degradation Analysis');
    });

    it('should return undefined for invalid event type', () => {
      const template = PromptTemplateLibrary.getTemplate('INVALID_TYPE' as AIEventType);
      
      expect(template).toBeUndefined();
    });

    it('should have templates for all 10 event types', () => {
      const eventTypes = Object.values(AIEventType);
      
      eventTypes.forEach((type) => {
        const template = PromptTemplateLibrary.getTemplate(type);
        expect(template).toBeDefined();
        expect(template?.event_type).toBe(type);
      });
    });
  });

  describe('getAllTemplates()', () => {
    it('should return all templates', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();
      
      expect(templates).toHaveLength(10);
      expect(templates).toBeInstanceOf(Array);
    });

    it('should return templates with all required fields', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();
      
      templates.forEach((template) => {
        expect(template.event_type).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.template).toBeDefined();
        expect(template.max_tokens).toBeGreaterThan(0);
        expect(template.expected_cost_usd).toBeGreaterThan(0);
      });
    });
  });

  describe('buildPrompt()', () => {
    it('should build complete prompt from event', () => {
      const event = AIEventFactory.create({
        type: AIEventType.LATENCY_ANOMALY,
        summary: 'Response time increased to 2.5s',
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
        },
      });

      const prompt = PromptTemplateLibrary.buildPrompt(event);

      expect(prompt).toBeTruthy();
      expect(prompt).toContain('/api/users');
      expect(prompt).toContain('users-service');
      expect(prompt).toContain('2500');
      expect(prompt).toContain('1000');
    });

    it('should substitute all variables in template', () => {
      const event = AIEventFactory.create({
        type: AIEventType.CIRCUIT_BREAKER_CANDIDATE,
        summary: 'High error rate detected',
        severity: EventSeverity.CRITICAL,
        data: {
          metric: 'error_rate',
          current_value: 75,
          threshold: 5,
          window: '5m',
          trend: TrendDirection.RISING,
        },
        context: {
          route: '/api/payments',
          upstream: 'payment-service',
          recent_samples: sampleData,
        },
      });

      const prompt = PromptTemplateLibrary.buildPrompt(event);

      // Check that no variable placeholders remain
      expect(prompt).not.toContain('{summary}');
      expect(prompt).not.toContain('{upstream}');
      expect(prompt).not.toContain('{route}');
      expect(prompt).not.toContain('{current_value}');
      expect(prompt).not.toContain('{threshold}');
      expect(prompt).not.toContain('{trend}');
      expect(prompt).not.toContain('{window}');
    });

    it('should include formatted sample data', () => {
      const event = AIEventFactory.create({
        type: AIEventType.LATENCY_ANOMALY,
        summary: 'Latency spike',
        severity: EventSeverity.WARNING,
        data: {
          metric: 'latency',
          current_value: 2500,
          threshold: 1000,
          window: '5m',
          trend: TrendDirection.RISING,
        },
        context: {
          route: '/api/test',
          upstream: 'test-service',
          recent_samples: sampleData,
        },
      });

      const prompt = PromptTemplateLibrary.buildPrompt(event);

      expect(prompt).toContain('850');
      expect(prompt).toContain('2500');
      expect(prompt).not.toContain('{recent_samples}');
    });

    it('should calculate breach ratio', () => {
      const event = AIEventFactory.create({
        type: AIEventType.ERROR_RATE_SPIKE,
        summary: 'Error rate spike',
        severity: EventSeverity.CRITICAL,
        data: {
          metric: 'error_rate',
          current_value: 300,
          threshold: 100,
          window: '5m',
          trend: TrendDirection.RISING,
        },
        context: {
          route: '/api/test',
          upstream: 'test-service',
          recent_samples: sampleData,
        },
      });

      const prompt = PromptTemplateLibrary.buildPrompt(event);

      expect(prompt).toContain('3.00'); // 300/100 = 3.0
    });

    it('should throw error for unknown event type', () => {
      const event = AIEventFactory.create({
        type: AIEventType.LATENCY_ANOMALY,
        summary: 'Test',
        severity: EventSeverity.WARNING,
        data: {
          metric: 'test',
          current_value: 100,
          threshold: 50,
          window: '5m',
          trend: TrendDirection.STABLE,
        },
        context: {
          route: '/test',
          upstream: 'test',
          recent_samples: [],
        },
      });

      // Modify event type to invalid
      (event as any).event_type = 'INVALID_TYPE';

      expect(() => PromptTemplateLibrary.buildPrompt(event)).toThrow(
        'No template found for event type'
      );
    });

    it('should handle empty samples gracefully', () => {
      const event = AIEventFactory.create({
        type: AIEventType.LATENCY_ANOMALY,
        summary: 'Test',
        severity: EventSeverity.WARNING,
        data: {
          metric: 'test',
          current_value: 100,
          threshold: 50,
          window: '5m',
          trend: TrendDirection.STABLE,
        },
        context: {
          route: '/test',
          upstream: 'test',
          recent_samples: [],
        },
      });

      const prompt = PromptTemplateLibrary.buildPrompt(event);

      expect(prompt).toContain('No recent samples available');
    });

    it('should limit samples to last 5 for token efficiency', () => {
      const manySamples: Sample[] = Array(20)
        .fill(null)
        .map((_, i) => ({
          timestamp: `2026-02-15T10:${String(i).padStart(2, '0')}:00Z`,
          value: 100 + i * 10,
        }));

      const event = AIEventFactory.create({
        type: AIEventType.LATENCY_ANOMALY,
        summary: 'Test',
        severity: EventSeverity.WARNING,
        data: {
          metric: 'test',
          current_value: 100,
          threshold: 50,
          window: '5m',
          trend: TrendDirection.STABLE,
        },
        context: {
          route: '/test',
          upstream: 'test',
          recent_samples: manySamples,
        },
      });

      const prompt = PromptTemplateLibrary.buildPrompt(event);

      // Count how many sample entries are in the prompt
      const sampleMatches = prompt.match(/\d+\.\s+\d{2}:\d{2}:\d{2}:\s+\d+/g);
      expect(sampleMatches?.length).toBe(5);
    });
  });

  describe('estimateCost()', () => {
    it('should return cost estimate for event', () => {
      const event = AIEventFactory.create({
        type: AIEventType.LATENCY_ANOMALY,
        summary: 'Test',
        severity: EventSeverity.WARNING,
        data: {
          metric: 'test',
          current_value: 100,
          threshold: 50,
          window: '5m',
          trend: TrendDirection.STABLE,
        },
        context: {
          route: '/test',
          upstream: 'test',
          recent_samples: sampleData,
        },
      });

      const cost = PromptTemplateLibrary.estimateCost(event);

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.02); // Should be reasonable
    });

    it('should vary cost by event type', () => {
      const event1 = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);
      const event2 = AIEventFactory.createSample(AIEventType.SECURITY_ANOMALY);

      const cost1 = PromptTemplateLibrary.estimateCost(event1);
      const cost2 = PromptTemplateLibrary.estimateCost(event2);

      // Security events typically cost more due to complexity
      expect(cost1).not.toBe(cost2);
    });

    it('should return default cost for unknown event type', () => {
      const event = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);
      (event as any).event_type = 'UNKNOWN';

      const cost = PromptTemplateLibrary.estimateCost(event);

      expect(cost).toBe(0.015); // Default cost
    });
  });

  describe('getRecommendedModel()', () => {
    it('should return Claude model for all events', () => {
      const eventTypes = Object.values(AIEventType);

      eventTypes.forEach((type) => {
        const event = AIEventFactory.createSample(type);
        const model = PromptTemplateLibrary.getRecommendedModel(event);

        expect(model).toBe('claude-3-5-sonnet-20241022');
      });
    });

    it('should return default model for unknown event', () => {
      const event = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);
      (event as any).event_type = 'UNKNOWN';

      const model = PromptTemplateLibrary.getRecommendedModel(event);

      expect(model).toBe('claude-3-5-sonnet-20241022');
    });
  });

  describe('getMaxTokens()', () => {
    it('should return max tokens for event', () => {
      const event = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);
      const maxTokens = PromptTemplateLibrary.getMaxTokens(event);

      expect(maxTokens).toBeGreaterThan(0);
      expect(maxTokens).toBeLessThanOrEqual(1024);
    });

    it('should vary max tokens by event complexity', () => {
      const simple = AIEventFactory.createSample(AIEventType.RECOVERY_SIGNAL);
      const complex = AIEventFactory.createSample(AIEventType.SECURITY_ANOMALY);

      const simpleTokens = PromptTemplateLibrary.getMaxTokens(simple);
      const complexTokens = PromptTemplateLibrary.getMaxTokens(complex);

      // Recovery signals are simpler, security is complex
      expect(complexTokens).toBeGreaterThanOrEqual(simpleTokens);
    });

    it('should return default tokens for unknown event', () => {
      const event = AIEventFactory.createSample(AIEventType.LATENCY_ANOMALY);
      (event as any).event_type = 'UNKNOWN';

      const maxTokens = PromptTemplateLibrary.getMaxTokens(event);

      expect(maxTokens).toBe(1024); // Default
    });
  });

  describe('validateCoverage()', () => {
    it('should validate complete coverage of all event types', () => {
      const result = PromptTemplateLibrary.validateCoverage();

      expect(result.complete).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should report coverage statistics', () => {
      const result = PromptTemplateLibrary.validateCoverage();
      const allEventTypes = Object.values(AIEventType);

      expect(result.complete).toBe(true);
      expect(result.missing.length + 10).toBe(allEventTypes.length);
    });
  });

  describe('getStats()', () => {
    it('should return library statistics', () => {
      const stats = PromptTemplateLibrary.getStats();

      expect(stats.total_templates).toBe(10);
      expect(stats.total_event_types_covered).toBe(10);
      expect(stats.avg_max_tokens).toBeGreaterThan(0);
      expect(stats.avg_cost_usd).toBeGreaterThan(0);
    });

    it('should calculate average max tokens correctly', () => {
      const stats = PromptTemplateLibrary.getStats();

      expect(stats.avg_max_tokens).toBeGreaterThan(700);
      expect(stats.avg_max_tokens).toBeLessThan(1100);
    });

    it('should calculate average cost correctly', () => {
      const stats = PromptTemplateLibrary.getStats();

      expect(stats.avg_cost_usd).toBeGreaterThan(0.010);
      expect(stats.avg_cost_usd).toBeLessThan(0.020);
    });
  });

  describe('template quality', () => {
    it('should have templates under 1000 tokens estimate', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();

      templates.forEach((template) => {
        expect(template.max_tokens).toBeLessThanOrEqual(1024);
      });
    });

    it('should request JSON responses in all templates', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();

      templates.forEach((template) => {
        expect(template.template.toLowerCase()).toContain('json');
      });
    });

    it('should include confidence scores in templates', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();

      templates.forEach((template) => {
        const hasConfidence =
          template.template.toLowerCase().includes('confidence') ||
          template.response_schema?.confidence;
        expect(hasConfidence).toBe(true);
      });
    });

    it('should have actionable recommendations in templates', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();

      templates.forEach((template) => {
        const hasActions =
          template.template.toLowerCase().includes('action') ||
          template.template.toLowerCase().includes('recommend');
        expect(hasActions).toBe(true);
      });
    });

    it('should have specific templates for each event type', () => {
      const templates = PromptTemplateLibrary.getAllTemplates();

      templates.forEach((template) => {
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.template.length).toBeGreaterThan(200);
      });
    });
  });

  describe('integration with event factory', () => {
    it('should work with factory-created events', () => {
      const eventTypes = Object.values(AIEventType);

      eventTypes.forEach((type) => {
        const event = AIEventFactory.createSample(type);
        const prompt = PromptTemplateLibrary.buildPrompt(event);

        expect(prompt).toBeTruthy();
        expect(prompt.length).toBeGreaterThan(100);
      });
    });

    it('should handle all severity levels', () => {
      const severities = Object.values(EventSeverity);

      severities.forEach((severity) => {
        const event = AIEventFactory.create({
          type: AIEventType.LATENCY_ANOMALY,
          summary: 'Test',
          severity,
          data: {
            metric: 'test',
            current_value: 100,
            threshold: 50,
            window: '5m',
            trend: TrendDirection.STABLE,
          },
          context: {
            route: '/test',
            upstream: 'test',
            recent_samples: sampleData,
          },
        });

        const prompt = PromptTemplateLibrary.buildPrompt(event);
        expect(prompt).toBeTruthy();
      });
    });

    it('should handle all trend directions', () => {
      const trends = Object.values(TrendDirection);

      trends.forEach((trend) => {
        const event = AIEventFactory.create({
          type: AIEventType.LATENCY_ANOMALY,
          summary: 'Test',
          severity: EventSeverity.WARNING,
          data: {
            metric: 'test',
            current_value: 100,
            threshold: 50,
            window: '5m',
            trend,
          },
          context: {
            route: '/test',
            upstream: 'test',
            recent_samples: sampleData,
          },
        });

        const prompt = PromptTemplateLibrary.buildPrompt(event);
        expect(prompt).toContain(trend);
      });
    });
  });
});
