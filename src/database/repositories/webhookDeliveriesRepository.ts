import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookDelivery {
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  payload: any;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  response_code?: number;
  response_body?: string;
  error?: string;
  delivery_channel: 'webhook' | 'slack' | 'whatsapp' | 'webex' | 'teams';
  delivered_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDeliveryInput {
  delivery_id?: string; // Optional - will be generated if not provided
  webhook_id: string;
  event_type: string;
  payload: any;
  delivery_channel?: 'webhook' | 'slack' | 'whatsapp' | 'webex' | 'teams';
}

export interface UpdateDeliveryInput {
  status?: 'pending' | 'success' | 'failed';
  attempts?: number;
  response_code?: number;
  response_body?: string;
  error?: string;
  delivered_at?: Date;
}

export interface DeliveryStats {
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  pending_deliveries: number;
  average_attempts: number;
  last_delivery?: Date;
  by_channel?: {
    [key: string]: number;
  };
  by_event_type?: {
    [key: string]: number;
  };
}

export class WebhookDeliveriesRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new delivery record
   */
  async create(input: CreateDeliveryInput): Promise<WebhookDelivery> {
    const delivery_id = input.delivery_id || uuidv4();
    const delivery_channel = input.delivery_channel || 'webhook';
    
    const query = `
      INSERT INTO webhook_deliveries (
        delivery_id, webhook_id, event_type, payload, status, delivery_channel
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      delivery_id,
      input.webhook_id,
      input.event_type,
      JSON.stringify(input.payload),
      'pending',
      delivery_channel
    ];
    
    const result = await this.pool.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update a delivery record
   */
  async update(delivery_id: string, input: UpdateDeliveryInput): Promise<WebhookDelivery | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.attempts !== undefined) {
      fields.push(`attempts = $${paramCount++}`);
      values.push(input.attempts);
    }
    if (input.response_code !== undefined) {
      fields.push(`response_code = $${paramCount++}`);
      values.push(input.response_code);
    }
    if (input.response_body !== undefined) {
      fields.push(`response_body = $${paramCount++}`);
      values.push(input.response_body);
    }
    if (input.error !== undefined) {
      fields.push(`error = $${paramCount++}`);
      values.push(input.error);
    }
    if (input.delivered_at !== undefined) {
      fields.push(`delivered_at = $${paramCount++}`);
      values.push(input.delivered_at);
    }

    if (fields.length === 0) {
      return this.findById(delivery_id);
    }

    values.push(delivery_id);
    const query = `
      UPDATE webhook_deliveries
      SET ${fields.join(', ')}
      WHERE delivery_id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find delivery by ID
   */
  async findById(delivery_id: string): Promise<WebhookDelivery | null> {
    const query = 'SELECT * FROM webhook_deliveries WHERE delivery_id = $1';
    const result = await this.pool.query(query, [delivery_id]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find deliveries by webhook ID
   */
  async findByWebhookId(webhook_id: string, limit = 100, offset = 0): Promise<WebhookDelivery[]> {
    const query = `
      SELECT * FROM webhook_deliveries
      WHERE webhook_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await this.pool.query(query, [webhook_id, limit, offset]);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find deliveries by status
   */
  async findByStatus(status: 'pending' | 'success' | 'failed', limit = 100): Promise<WebhookDelivery[]> {
    const query = `
      SELECT * FROM webhook_deliveries
      WHERE status = $1
      ORDER BY created_at ASC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [status, limit]);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find deliveries by channel
   */
  async findByChannel(
    delivery_channel: 'webhook' | 'slack' | 'whatsapp' | 'webex' | 'teams',
    limit = 100
  ): Promise<WebhookDelivery[]> {
    const query = `
      SELECT * FROM webhook_deliveries
      WHERE delivery_channel = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [delivery_channel, limit]);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get pending deliveries for retry
   */
  async findPendingForRetry(max_attempts = 3): Promise<WebhookDelivery[]> {
    const query = `
      SELECT * FROM webhook_deliveries
      WHERE status = 'pending'
        AND attempts < $1
        AND created_at < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at ASC
      LIMIT 100
    `;
    const result = await this.pool.query(query, [max_attempts]);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get delivery statistics for a webhook
   */
  async getStats(webhook_id: string): Promise<DeliveryStats> {
    const query = `
      SELECT
        COUNT(*) as total_deliveries,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_deliveries,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_deliveries,
        AVG(attempts) as average_attempts,
        MAX(delivered_at) as last_delivery
      FROM webhook_deliveries
      WHERE webhook_id = $1
    `;
    
    const result = await this.pool.query(query, [webhook_id]);
    const row = result.rows[0];

    // Get stats by channel
    const channelQuery = `
      SELECT delivery_channel, COUNT(*) as count
      FROM webhook_deliveries
      WHERE webhook_id = $1
      GROUP BY delivery_channel
    `;
    const channelResult = await this.pool.query(channelQuery, [webhook_id]);
    const by_channel = channelResult.rows.reduce((acc, row) => {
      acc[row.delivery_channel] = parseInt(row.count);
      return acc;
    }, {} as { [key: string]: number });

    // Get stats by event type
    const eventQuery = `
      SELECT event_type, COUNT(*) as count
      FROM webhook_deliveries
      WHERE webhook_id = $1
      GROUP BY event_type
    `;
    const eventResult = await this.pool.query(eventQuery, [webhook_id]);
    const by_event_type = eventResult.rows.reduce((acc, row) => {
      acc[row.event_type] = parseInt(row.count);
      return acc;
    }, {} as { [key: string]: number });

    return {
      total_deliveries: parseInt(row.total_deliveries) || 0,
      successful_deliveries: parseInt(row.successful_deliveries) || 0,
      failed_deliveries: parseInt(row.failed_deliveries) || 0,
      pending_deliveries: parseInt(row.pending_deliveries) || 0,
      average_attempts: parseFloat(row.average_attempts) || 0,
      last_delivery: row.last_delivery ? new Date(row.last_delivery) : undefined,
      by_channel,
      by_event_type
    };
  }

  /**
   * Delete old deliveries (cleanup)
   */
  async deleteOlderThan(days: number): Promise<number> {
    const query = `
      DELETE FROM webhook_deliveries
      WHERE created_at < NOW() - INTERVAL '${days} days'
    `;
    const result = await this.pool.query(query);
    return result.rowCount || 0;
  }

  /**
   * Delete all deliveries for a webhook
   */
  async deleteByWebhookId(webhook_id: string): Promise<number> {
    const query = 'DELETE FROM webhook_deliveries WHERE webhook_id = $1';
    const result = await this.pool.query(query, [webhook_id]);
    return result.rowCount || 0;
  }

  /**
   * Map database row to WebhookDelivery object
   */
  private mapRow(row: any): WebhookDelivery {
    return {
      delivery_id: row.delivery_id,
      webhook_id: row.webhook_id,
      event_type: row.event_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      attempts: row.attempts,
      response_code: row.response_code,
      response_body: row.response_body,
      error: row.error,
      delivery_channel: row.delivery_channel,
      delivered_at: row.delivered_at ? new Date(row.delivered_at) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }
}
