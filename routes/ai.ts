/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI Events API Routes
 * 
 * Endpoints for testing and demonstrating AI event generation
 * and prompt building for Claude/GPT integration.
 */

import { Router, Request, Response } from 'express';
import { AIEventFactory } from '../src/ai/utils/eventFactory';
import { PromptTemplateLibrary } from '../src/ai/prompts/templates';
import { AIEventType } from '../src/ai/types/events';

const router = Router();

/**
 * GET /api/ai/events/sample
 * Generate sample AI events for all event types
 */
router.get('/events/sample', (req: Request, res: Response): void => {
  try {
    const eventType = req.query.type as AIEventType | undefined;
    
    if (eventType && !Object.values(AIEventType).includes(eventType)) {
      res.status(400).json({
        success: false,
        error: `Invalid event type. Must be one of: ${Object.values(AIEventType).join(', ')}`,
      });
      return;
    }

    if (eventType) {
      // Generate single event type
      const event = AIEventFactory.createSample(eventType);
      res.json({
        success: true,
        data: {
          event,
          event_type: eventType,
        },
      });
      return;
    }

    // Generate all event types
    const events = Object.values(AIEventType).map((type) => ({
      type,
      event: AIEventFactory.createSample(type),
    }));

    res.json({
      success: true,
      data: {
        total: events.length,
        events,
      },
    });
  } catch (error) {
    console.error('Error generating sample events:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate sample events',
    });
  }
});

/**
 * POST /api/ai/events/create
 * Create a custom AI event
 */
router.post('/events/create', (req: Request, res: Response) => {
  try {
    const event = AIEventFactory.create(req.body);
    
    // Validate the event
    const validation = AIEventFactory.validate(event);
    
    res.json({
      success: true,
      data: {
        event,
        validation,
      },
    });
  } catch (error) {
    console.error('Error creating AI event:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create AI event',
    });
  }
});

/**
 * POST /api/ai/prompts/build
 * Build a Claude prompt from an AI event
 */
router.post('/prompts/build', (req: Request, res: Response): void => {
  try {
    const { event, eventType } = req.body;
    
    let aiEvent;
    if (event) {
      // Use provided event
      aiEvent = event;
    } else if (eventType) {
      // Generate sample event
      aiEvent = AIEventFactory.createSample(eventType as AIEventType);
    } else {
      res.status(400).json({
        success: false,
        error: 'Must provide either "event" or "eventType"',
      });
      return;
    }

    // Build the prompt
    const prompt = PromptTemplateLibrary.buildPrompt(aiEvent);
    const template = PromptTemplateLibrary.getTemplate(aiEvent.event_type);
    const cost = PromptTemplateLibrary.estimateCost(aiEvent);
    const model = PromptTemplateLibrary.getRecommendedModel(aiEvent);
    const maxTokens = PromptTemplateLibrary.getMaxTokens(aiEvent);

    res.json({
      success: true,
      data: {
        event: aiEvent,
        prompt,
        template: {
          name: template?.name,
          event_type: template?.event_type,
          max_tokens: template?.max_tokens,
        },
        recommendations: {
          model,
          max_tokens: maxTokens,
          estimated_cost_usd: cost,
        },
      },
    });
  } catch (error) {
    console.error('Error building prompt:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build prompt',
    });
  }
});

/**
 * GET /api/ai/templates
 * Get all prompt templates
 */
router.get('/templates', (_req: Request, res: Response) => {
  try {
    const templates = PromptTemplateLibrary.getAllTemplates();
    const stats = PromptTemplateLibrary.getStats();
    const coverage = PromptTemplateLibrary.validateCoverage();

    res.json({
      success: true,
      data: {
        templates: templates.map((t: any) => ({
          event_type: t.event_type,
          name: t.name,
          max_tokens: t.max_tokens,
          template_length: t.template.length,
        })),
        stats,
        coverage,
      },
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch templates',
    });
  }
});

/**
 * GET /api/ai/templates/:eventType
 * Get specific template
 */
router.get('/templates/:eventType', (req: Request, res: Response): void => {
  try {
    const eventType = req.params.eventType as AIEventType;
    const template = PromptTemplateLibrary.getTemplate(eventType);

    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template not found for event type: ${eventType}`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        template,
      },
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch template',
    });
  }
});

/**
 * GET /api/ai/event-types
 * Get all available event types
 */
router.get('/event-types', (_req: Request, res: Response) => {
  try {
    const eventTypes = Object.values(AIEventType).map((type) => {
      const template = PromptTemplateLibrary.getTemplate(type);
      return {
        type,
        name: template?.name || type,
        description: getEventTypeDescription(type),
      };
    });

    res.json({
      success: true,
      data: {
        total: eventTypes.length,
        event_types: eventTypes,
      },
    });
  } catch (error) {
    console.error('Error fetching event types:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch event types',
    });
  }
});

/**
 * Helper function to get event type descriptions
 */
function getEventTypeDescription(type: AIEventType): string {
  const descriptions: Record<AIEventType, string> = {
    [AIEventType.CIRCUIT_BREAKER_CANDIDATE]: 'Service instability requiring circuit breaker activation',
    [AIEventType.RATE_LIMIT_BREACH]: 'Traffic exceeding configured rate limits',
    [AIEventType.LATENCY_ANOMALY]: 'Response time degradation affecting user experience',
    [AIEventType.ERROR_RATE_SPIKE]: 'Sudden increase in API error rates requiring immediate attention',
    [AIEventType.COST_ALERT]: 'High-cost route usage detected',
    [AIEventType.RETRY_STORM]: 'Excessive retry attempts causing cascading failures',
    [AIEventType.UPSTREAM_DEGRADATION]: 'Upstream service health degradation',
    [AIEventType.SECURITY_ANOMALY]: 'Unusual access patterns or security concerns',
    [AIEventType.CAPACITY_WARNING]: 'Resource saturation warning',
    [AIEventType.RECOVERY_SIGNAL]: 'System auto-healing or recovery event',
  };
  return descriptions[type] || 'No description available';
}

export default router;
