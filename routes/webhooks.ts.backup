import { Router, Request, Response } from 'express';
import { webhookManager, WebhookConfig } from '../src/webhooks/WebhookManager';
import { EventType } from '../src/events';
import { logger } from '../src/logger';

const router = Router();

/**
 * Create a new webhook
 * POST /api/webhooks
 */
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, events, headers, timeout, retryConfig } = req.body;

    // Validation
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Events array is required' });
    }

    // Validate event types
    const validEvents = Object.values(EventType);
    const invalidEvents = events.filter(e => !validEvents.includes(e) && e !== '*');
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        error: 'Invalid event types',
        invalidEvents,
        validEvents,
      });
    }

    // Generate webhook ID
    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Create webhook configuration
    const webhook: WebhookConfig = {
      id: webhookId,
      url,
      events,
      enabled: true,
      secret: '', // Will be auto-generated
      retryConfig: retryConfig || {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
      },
      headers: headers || {},
      timeout: timeout || 5000,
    };

    webhookManager.registerWebhook(webhook);

    const registered = webhookManager.getWebhook(webhookId)!;

    logger.info('Webhook created via API', {
      webhookId,
      url,
      events,
    });

    return res.status(201).json({
      id: registered.id,
      url: registered.url,
      events: registered.events,
      enabled: registered.enabled,
      secret: registered.secret,
      retryConfig: registered.retryConfig,
      headers: registered.headers,
      timeout: registered.timeout,
      createdAt: registered.createdAt,
    });
  } catch (error: any) {
    logger.error('Failed to create webhook', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * List all webhooks
 * GET /api/webhooks
 */
router.get('/', (_req: Request, res: Response): any => {
  try {
    const webhooks = webhookManager.getAllWebhooks();

    return res.json({
      webhooks: webhooks.map((w: WebhookConfig) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        enabled: w.enabled,
        timeout: w.timeout,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
      total: webhooks.length,
    });
  } catch (error: any) {
    logger.error('Failed to list webhooks', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get webhook details
 * GET /api/webhooks/:id
 */
router.get('/:id', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;
    const webhook = webhookManager.getWebhook(id as string);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    return res.json(webhook);
  } catch (error: any) {
    logger.error('Failed to get webhook', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Update webhook
 * PUT /api/webhooks/:id
 */
router.put('/:id', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const webhook = webhookManager.getWebhook(id as string);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    // Prevent updating certain fields
    delete updates.id;
    delete updates.secret;
    delete updates.createdAt;

    const updated = webhookManager.updateWebhook(id as string, updates);

    logger.info('Webhook updated via API', { webhookId: id, updates: Object.keys(updates) });

    return res.json(updated);
  } catch (error: any) {
    logger.error('Failed to update webhook', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Delete webhook
 * DELETE /api/webhooks/:id
 */
router.delete('/:id', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;

    const deleted = webhookManager.unregisterWebhook(id as string);

    if (!deleted) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    logger.info('Webhook deleted via API', { webhookId: id });

    return res.json({ success: true, message: 'Webhook deleted' });
  } catch (error: any) {
    logger.error('Failed to delete webhook', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Test webhook
 * POST /api/webhooks/:id/test
 */
router.post('/:id/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const delivery = await webhookManager.testWebhook(id as string);

    logger.info('Webhook test triggered via API', {
      webhookId: id,
      status: delivery.status,
    });

    return res.json(delivery);
  } catch (error: any) {
    logger.error('Failed to test webhook', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get webhook delivery logs
 * GET /api/webhooks/:id/logs
 */
router.get('/:id/logs', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const webhook = webhookManager.getWebhook(id as string);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const logs = webhookManager.getDeliveryLogs(id as string, limit);

    return res.json({
      webhookId: id,
      logs,
      total: logs.length,
    });
  } catch (error: any) {
    logger.error('Failed to get webhook logs', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get webhook statistics
 * GET /api/webhooks/stats
 */
router.get('/stats/all', (_req: Request, res: Response): any => {
  try {
    const stats = webhookManager.getStats();
    return res.json(stats);
  } catch (error: any) {
    logger.error('Failed to get webhook stats', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

export default router;
