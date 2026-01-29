import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../src/logger';
import webhooksRepository from '../src/database/repositories/webhooksRepository';

const router = Router();

// Validation schemas
const CreateWebhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  enabled: z.boolean().optional().default(true),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().min(1000).max(60000).optional(),
  retry_count: z.number().min(0).max(10).optional(),
  retry_delay: z.number().min(100).max(10000).optional(),
  secret: z.string().optional(),
});

const UpdateWebhookSchema = CreateWebhookSchema.partial();

/**
 * GET /api/webhooks
 * List all webhooks from database
 */
router.get('/', async (_req: Request, res: Response): Promise<any> => {
  try {
    const webhooks = await webhooksRepository.findAll();
    
    logger.info('Fetched webhooks from database', { count: webhooks.length });
    
    return res.json({
      success: true,
      data: webhooks.map(w => ({
        id: w.webhook_id,
        name: w.name,
        url: w.url,
        events: w.events,
        enabled: w.enabled,
        headers: w.headers,
        timeout: w.timeout,
        retry_count: w.retry_count,
        retry_delay: w.retry_delay,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch webhooks from database', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch webhooks',
    });
  }
});

/**
 * GET /api/webhooks/:id
 * Get a single webhook by ID from database
 */
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid webhook ID',
      });
    }
    
    const webhook = await webhooksRepository.findByWebhookId(id);
    
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook with ID '${id}' not found`,
      });
    }
    
    logger.info('Fetched webhook from database', { webhookId: id });
    
    return res.json({
      success: true,
      data: {
        id: webhook.webhook_id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        enabled: webhook.enabled,
        headers: webhook.headers,
        timeout: webhook.timeout,
        retry_count: webhook.retry_count,
        retry_delay: webhook.retry_delay,
        secret: webhook.secret,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch webhook from database', {
      webhookId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch webhook',
    });
  }
});

/**
 * POST /api/webhooks
 * Create a new webhook in database
 */
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const validation = CreateWebhookSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid webhook data',
        details: validation.error.issues,
      });
    }

    const webhookData = validation.data;

    // Create webhook in database
    const webhook = await webhooksRepository.create(webhookData);

    logger.info('Webhook created in database', {
      webhookId: webhook.webhook_id,
      name: webhook.name,
      url: webhook.url,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: webhook.webhook_id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        enabled: webhook.enabled,
        headers: webhook.headers,
        timeout: webhook.timeout,
        retry_count: webhook.retry_count,
        retry_delay: webhook.retry_delay,
        secret: webhook.secret,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at,
      },
    });
  } catch (error) {
    logger.error('Failed to create webhook in database', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create webhook',
    });
  }
});

/**
 * PUT /api/webhooks/:id
 * Update an existing webhook in database
 */
router.put('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid webhook ID',
      });
    }

    // Validate request body
    const validation = UpdateWebhookSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid webhook data',
        details: validation.error.issues,
      });
    }

    const updateData = validation.data;

    // Update webhook in database
    const webhook = await webhooksRepository.update(id, updateData);
    
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook with ID '${id}' not found`,
      });
    }

    logger.info('Webhook updated in database', {
      webhookId: id,
      changes: Object.keys(updateData),
    });

    return res.json({
      success: true,
      data: {
        id: webhook.webhook_id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        enabled: webhook.enabled,
        headers: webhook.headers,
        timeout: webhook.timeout,
        retry_count: webhook.retry_count,
        retry_delay: webhook.retry_delay,
        secret: webhook.secret,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at,
      },
    });
  } catch (error) {
    logger.error('Failed to update webhook in database', {
      webhookId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update webhook',
    });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook from database
 */
router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid webhook ID',
      });
    }

    // Get webhook before deleting
    const webhook = await webhooksRepository.findByWebhookId(id);
    
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Webhook with ID '${id}' not found`,
      });
    }

    // Delete from database
    const deleted = await webhooksRepository.delete(id);
    
    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to delete webhook',
      });
    }

    logger.info('Webhook deleted from database', {
      webhookId: id,
      name: webhook.name,
    });

    return res.json({
      success: true,
      data: {
        id: webhook.webhook_id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
      },
    });
  } catch (error) {
    logger.error('Failed to delete webhook from database', {
      webhookId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to delete webhook',
    });
  }
});

export default router;
