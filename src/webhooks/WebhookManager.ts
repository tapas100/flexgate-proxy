import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { logger } from '../logger';
import { eventBus, EventMetadata, EventType } from '../events';
import { WebhookDeliveriesRepository, WebhookDelivery as DbWebhookDelivery } from '../database/repositories/webhookDeliveriesRepository';

/**
 * Webhook configuration interface
 */
export interface WebhookConfig {
  id: string;
  url: string;
  events: EventType[];
  enabled: boolean;
  secret: string;
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  headers?: Record<string, string>;
  timeout: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Webhook payload sent to external endpoints
 */
export interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  data: any;
  signature: string;
}

/**
 * Webhook delivery result
 */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: WebhookPayload;
  status: 'success' | 'failed' | 'pending';
  attempts: number;
  responseCode?: number;
  responseBody?: string;
  error?: string;
  deliveredAt?: string;
  createdAt: string;
}

/**
 * Webhook Manager
 * 
 * Handles webhook delivery, retries, and signature generation.
 * Subscribes to event bus and triggers webhook deliveries.
 */
export class WebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveryQueue: WebhookDelivery[] = [];
  private isProcessingQueue = false;

  constructor(private deliveriesRepo?: WebhookDeliveriesRepository) {
    // Subscribe to all events
    eventBus.subscribe('*', this.handleEvent.bind(this));
  }

  /**
   * Register a new webhook
   */
  public registerWebhook(config: WebhookConfig): void {
    // Validate URL
    if (!this.isValidUrl(config.url)) {
      throw new Error(`Invalid webhook URL: ${config.url}`);
    }

    // Ensure HTTPS in production
    if (process.env.NODE_ENV === 'production' && !config.url.startsWith('https://')) {
      throw new Error('Webhook URLs must use HTTPS in production');
    }

    // Generate secret if not provided
    if (!config.secret) {
      config.secret = this.generateSecret();
    }

    // Set defaults
    config.retryConfig = {
      maxRetries: config.retryConfig?.maxRetries ?? 3,
      backoffMultiplier: config.retryConfig?.backoffMultiplier ?? 2,
      initialDelay: config.retryConfig?.initialDelay ?? 1000,
    };
    config.timeout = config.timeout || 5000;
    config.enabled = config.enabled !== false;
    config.createdAt = config.createdAt || new Date().toISOString();
    config.updatedAt = new Date().toISOString();

    this.webhooks.set(config.id, config);
    logger.info('Webhook registered', {
      webhookId: config.id,
      url: config.url,
      events: config.events,
    });
  }

  /**
   * Unregister a webhook
   */
  public unregisterWebhook(webhookId: string): boolean {
    const deleted = this.webhooks.delete(webhookId);
    if (deleted) {
      logger.info('Webhook unregistered', { webhookId });
    }
    return deleted;
  }

  /**
   * Get webhook by ID
   */
  public getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Get all webhooks
   */
  public getAllWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Update webhook configuration
   */
  public updateWebhook(webhookId: string, updates: Partial<WebhookConfig>): WebhookConfig {
    const existing = this.webhooks.get(webhookId);
    if (!existing) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      updatedAt: new Date().toISOString(),
    };

    this.webhooks.set(webhookId, updated);
    logger.info('Webhook updated', { webhookId, updates: Object.keys(updates) });
    return updated;
  }

  /**
   * Handle incoming events from event bus
   */
  private handleEvent(metadata: EventMetadata): void {
    // Find all webhooks subscribed to this event
    const subscribedWebhooks = Array.from(this.webhooks.values()).filter(
      webhook => 
        webhook.enabled &&
        (webhook.events.includes(metadata.event) || webhook.events.includes('*' as EventType))
    );

    if (subscribedWebhooks.length === 0) {
      return;
    }

    logger.debug('Event triggered webhooks', {
      event: metadata.event,
      webhookCount: subscribedWebhooks.length,
    });

    // Queue delivery for each webhook
    for (const webhook of subscribedWebhooks) {
      this.queueDelivery(webhook, metadata);
    }
  }

  /**
   * Queue a webhook delivery
   */
  private async queueDelivery(webhook: WebhookConfig, metadata: EventMetadata): Promise<void> {
    const deliveryId = this.generateDeliveryId();
    const payload = this.createPayload(deliveryId, metadata);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      event: metadata.event,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    // Save to database if repository is available
    if (this.deliveriesRepo) {
      try {
        await this.deliveriesRepo.create({
          delivery_id: deliveryId,
          webhook_id: webhook.id,
          event_type: metadata.event,
          payload: metadata.payload,
        });
        logger.debug('Delivery saved to database', {
          deliveryId,
          webhookId: webhook.id,
          event: metadata.event,
        });
      } catch (error) {
        logger.error('Failed to save delivery to database', {
          deliveryId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.deliveryQueue.push(delivery);
    logger.debug('Delivery queued', {
      deliveryId,
      webhookId: webhook.id,
      event: metadata.event,
    });

    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Process delivery queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.deliveryQueue.length > 0) {
      const delivery = this.deliveryQueue.shift()!;
      const webhook = this.webhooks.get(delivery.webhookId);

      if (!webhook) {
        logger.warn('Webhook not found for delivery', {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
        });
        continue;
      }

      await this.attemptDelivery(webhook, delivery);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Attempt webhook delivery with retries
   */
  private async attemptDelivery(webhook: WebhookConfig, delivery: WebhookDelivery): Promise<void> {
    const maxRetries = webhook.retryConfig.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      delivery.attempts = attempt + 1;

      // Update attempts in database
      if (this.deliveriesRepo) {
        try {
          await this.deliveriesRepo.update(delivery.id, {
            attempts: delivery.attempts,
          });
        } catch (error) {
          logger.error('Failed to update delivery attempts', {
            deliveryId: delivery.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      try {
        const result = await this.sendWebhook(webhook, delivery.payload);
        
        // Success
        delivery.status = 'success';
        delivery.responseCode = result.status;
        delivery.responseBody = JSON.stringify(result.data).substring(0, 1000);
        delivery.deliveredAt = new Date().toISOString();

        // Update success in database
        if (this.deliveriesRepo) {
          try {
            await this.deliveriesRepo.update(delivery.id, {
              status: 'success',
              response_code: result.status,
              response_body: JSON.stringify(result.data).substring(0, 1000),
              delivered_at: new Date(),
            });
          } catch (error) {
            logger.error('Failed to update delivery success', {
              deliveryId: delivery.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        logger.info('Webhook delivered successfully', {
          deliveryId: delivery.id,
          webhookId: webhook.id,
          attempt: delivery.attempts,
          statusCode: result.status,
        });

        break;

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const axiosError = error as AxiosError;

        delivery.error = axiosError.message;
        delivery.responseCode = axiosError.response?.status;

        if (isLastAttempt) {
          // Final failure
          delivery.status = 'failed';
          
          // Update failure in database
          if (this.deliveriesRepo) {
            try {
              await this.deliveriesRepo.update(delivery.id, {
                status: 'failed',
                error: axiosError.message,
                response_code: axiosError.response?.status,
              });
            } catch (error) {
              logger.error('Failed to update delivery failure', {
                deliveryId: delivery.id,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }

          logger.error('Webhook delivery failed after retries', {
            deliveryId: delivery.id,
            webhookId: webhook.id,
            attempts: delivery.attempts,
            error: axiosError.message,
          });
        } else {
          // Retry with exponential backoff
          const delay = this.calculateBackoff(
            webhook.retryConfig.initialDelay,
            webhook.retryConfig.backoffMultiplier,
            attempt
          );

          logger.warn('Webhook delivery failed, retrying', {
            deliveryId: delivery.id,
            webhookId: webhook.id,
            attempt: delivery.attempts,
            nextRetryIn: `${delay}ms`,
            error: axiosError.message,
          });

          await this.sleep(delay);
        }
      }
    }
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhook(webhook: WebhookConfig, payload: WebhookPayload): Promise<any> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': payload.signature,
      'X-Webhook-Event': payload.event,
      'X-Webhook-Delivery': payload.id,
      'User-Agent': 'FlexGate-Webhooks/1.0',
      ...webhook.headers,
    };

    const response = await axios.post(webhook.url, payload, {
      headers,
      timeout: webhook.timeout,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    return response;
  }

  /**
   * Create webhook payload with signature
   */
  private createPayload(deliveryId: string, metadata: EventMetadata): WebhookPayload {
    const payload: Omit<WebhookPayload, 'signature'> = {
      id: deliveryId,
      event: metadata.event,
      timestamp: metadata.timestamp,
      data: metadata.payload,
    };

    const signature = 'placeholder'; // Will be set per webhook

    return {
      ...payload,
      signature,
    };
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  public generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verify webhook signature (for receivers)
   */
  public verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Test webhook delivery
   */
  public async testWebhook(webhookId: string): Promise<WebhookDelivery> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    // Create test event
    const testMetadata: EventMetadata = {
      id: 'test_' + Date.now(),
      event: EventType.CONFIG_CHANGED,
      payload: {
        timestamp: new Date().toISOString(),
        source: 'webhook_test',
        changeType: 'route_updated',
        entityId: 'test_route',
        changes: { test: true },
      },
      timestamp: new Date().toISOString(),
    };

    const deliveryId = this.generateDeliveryId();
    const payload = this.createPayload(deliveryId, testMetadata);
    
    // Generate signature with webhook secret
    const payloadWithoutSig = { ...payload, signature: '' };
    payload.signature = this.generateSignature(JSON.stringify(payloadWithoutSig), webhook.secret);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      event: testMetadata.event,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    try {
      const result = await this.sendWebhook(webhook, payload);
      delivery.status = 'success';
      delivery.responseCode = result.status;
      delivery.responseBody = JSON.stringify(result.data).substring(0, 1000);
      delivery.deliveredAt = new Date().toISOString();
    } catch (error) {
      const axiosError = error as AxiosError;
      delivery.status = 'failed';
      delivery.error = axiosError.message;
      delivery.responseCode = axiosError.response?.status;
    }

    delivery.attempts = 1;
    return delivery;
  }

  /**
   * Get delivery logs for a webhook
   */
  public async getDeliveryLogs(webhookId: string, limit = 100): Promise<DbWebhookDelivery[]> {
    if (!this.deliveriesRepo) {
      return [];
    }

    try {
      return await this.deliveriesRepo.findByWebhookId(webhookId, limit);
    } catch (error) {
      logger.error('Failed to fetch delivery logs', {
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get all recent deliveries
   */
  public async getAllDeliveries(_limit = 100): Promise<DbWebhookDelivery[]> {
    if (!this.deliveriesRepo) {
      return [];
    }

    try {
      // This would require a new repository method to get all deliveries
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Failed to fetch all deliveries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(initialDelay: number, multiplier: number, attempt: number): number {
    return initialDelay * Math.pow(multiplier, attempt);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique delivery ID
   */
  private generateDeliveryId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `delivery_${timestamp}_${random}`;
  }

  /**
   * Generate webhook secret
   */
  private generateSecret(): string {
    return `wh_secret_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Validate URL
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Get statistics
   */
  public async getStats(webhookId?: string): Promise<{
    totalWebhooks?: number;
    enabledWebhooks?: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    averageAttempts?: number;
    lastDelivery?: Date;
    byChannel?: { [key: string]: number };
    byEventType?: { [key: string]: number };
  }> {
    // If webhookId is provided, return stats for that specific webhook
    if (this.deliveriesRepo && webhookId) {
      try {
        const stats = await this.deliveriesRepo.getStats(webhookId);
        return {
          totalDeliveries: stats.total_deliveries,
          successfulDeliveries: stats.successful_deliveries,
          failedDeliveries: stats.failed_deliveries,
          pendingDeliveries: stats.pending_deliveries,
          averageAttempts: stats.average_attempts,
          lastDelivery: stats.last_delivery,
          byChannel: stats.by_channel,
          byEventType: stats.by_event_type,
        };
      } catch (error) {
        logger.error('Failed to fetch delivery stats', {
          webhookId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Return empty stats on error
        return {
          totalDeliveries: 0,
          successfulDeliveries: 0,
          failedDeliveries: 0,
          pendingDeliveries: 0,
        };
      }
    }

    // Return global stats if no webhookId provided
    return {
      totalWebhooks: this.webhooks.size,
      enabledWebhooks: Array.from(this.webhooks.values()).filter(w => w.enabled).length,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      pendingDeliveries: this.deliveryQueue.length,
    };
  }
}

/**
 * Export singleton instance
 */
export const webhookManager = new WebhookManager();
