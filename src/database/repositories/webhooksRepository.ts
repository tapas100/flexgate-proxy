import database from '../index';

export interface Webhook {
  id: number;
  webhook_id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  retry_count?: number;
  retry_delay?: number;
  secret?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  enabled?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  retry_count?: number;
  retry_delay?: number;
  secret?: string;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  enabled?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  retry_count?: number;
  retry_delay?: number;
  secret?: string;
}

/**
 * Find all webhooks
 */
export async function findAll(): Promise<Webhook[]> {
  const result = await database.query<Webhook>(
    'SELECT * FROM webhooks ORDER BY created_at DESC'
  );
  return result.rows;
}

/**
 * Find webhook by webhook_id
 */
export async function findByWebhookId(webhookId: string): Promise<Webhook | null> {
  const result = await database.query<Webhook>(
    'SELECT * FROM webhooks WHERE webhook_id = $1',
    [webhookId]
  );
  return result.rows.length > 0 ? result.rows[0]! : null;
}

/**
 * Create a new webhook
 */
export async function create(input: CreateWebhookInput): Promise<Webhook> {
  const webhookId = `webhook-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const result = await database.query<Webhook>(
    `INSERT INTO webhooks (
      webhook_id, name, url, events, enabled,
      headers, timeout, retry_count, retry_delay, secret
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      webhookId,
      input.name,
      input.url,
      input.events,
      input.enabled !== false,
      input.headers ? JSON.stringify(input.headers) : null,
      input.timeout || 5000,
      input.retry_count || 3,
      input.retry_delay || 1000,
      input.secret,
    ]
  );
  
  return result.rows[0]!;
}

/**
 * Update a webhook
 */
export async function update(
  webhookId: string,
  input: UpdateWebhookInput
): Promise<Webhook | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(input.name);
  }
  if (input.url !== undefined) {
    updates.push(`url = $${paramCount++}`);
    values.push(input.url);
  }
  if (input.events !== undefined) {
    updates.push(`events = $${paramCount++}`);
    values.push(input.events);
  }
  if (input.enabled !== undefined) {
    updates.push(`enabled = $${paramCount++}`);
    values.push(input.enabled);
  }
  if (input.headers !== undefined) {
    updates.push(`headers = $${paramCount++}`);
    values.push(JSON.stringify(input.headers));
  }
  if (input.timeout !== undefined) {
    updates.push(`timeout = $${paramCount++}`);
    values.push(input.timeout);
  }
  if (input.retry_count !== undefined) {
    updates.push(`retry_count = $${paramCount++}`);
    values.push(input.retry_count);
  }
  if (input.retry_delay !== undefined) {
    updates.push(`retry_delay = $${paramCount++}`);
    values.push(input.retry_delay);
  }
  if (input.secret !== undefined) {
    updates.push(`secret = $${paramCount++}`);
    values.push(input.secret);
  }

  if (updates.length === 0) {
    return findByWebhookId(webhookId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(webhookId);

  const result = await database.query<Webhook>(
    `UPDATE webhooks SET ${updates.join(', ')} WHERE webhook_id = $${paramCount} RETURNING *`,
    values
  );

  return result.rows.length > 0 ? result.rows[0]! : null;
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: string): Promise<boolean> {
  const result = await database.query(
    'DELETE FROM webhooks WHERE webhook_id = $1',
    [webhookId]
  );
  
  return (result.rowCount || 0) > 0;
}

/**
 * Record webhook delivery
 */
export async function recordDelivery(
  webhookId: string,
  event: string,
  payload: any,
  statusCode: number,
  success: boolean,
  responseBody?: string,
  errorMessage?: string
): Promise<void> {
  await database.query(
    `INSERT INTO webhook_deliveries (
      webhook_id, event, payload, status_code, success, response_body, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      webhookId,
      event,
      JSON.stringify(payload),
      statusCode,
      success,
      responseBody,
      errorMessage,
    ]
  );
}

export default {
  findAll,
  findByWebhookId,
  create,
  update,
  delete: deleteWebhook,
  recordDelivery,
};
