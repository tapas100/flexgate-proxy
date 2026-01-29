/**
 * Routes Repository
 * Database operations for routes
 */

import database from '../index';
import { logger } from '../../logger';

export interface Route {
  id: string;
  route_id: string;
  path: string;
  upstream: string;
  methods: string[];
  strip_path?: string;
  enabled: boolean;
  rate_limit_enabled: boolean;
  rate_limit_max?: number;
  rate_limit_window_ms?: number;
  rate_limit_message?: string;
  description?: string;
  tags?: string[];
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface CreateRouteInput {
  route_id: string;
  path: string;
  upstream: string;
  methods: string[];
  strip_path?: string;
  enabled?: boolean;
  rate_limit_enabled?: boolean;
  rate_limit_max?: number;
  rate_limit_window_ms?: number;
  rate_limit_message?: string;
  description?: string;
  tags?: string[];
  created_by?: string;
}

export interface UpdateRouteInput {
  path?: string;
  upstream?: string;
  methods?: string[];
  strip_path?: string;
  enabled?: boolean;
  rate_limit_enabled?: boolean;
  rate_limit_max?: number;
  rate_limit_window_ms?: number;
  rate_limit_message?: string;
  description?: string;
  tags?: string[];
  updated_by?: string;
}

class RoutesRepository {
  /**
   * Get all routes (excluding soft-deleted)
   */
  async findAll(): Promise<Route[]> {
    const result = await database.query<Route>(
      'SELECT * FROM routes WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Find route by route_id
   */
  async findByRouteId(routeId: string): Promise<Route | null> {
    const result = await database.query<Route>(
      'SELECT * FROM routes WHERE route_id = $1 AND deleted_at IS NULL',
      [routeId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find route by UUID
   */
  async findById(id: string): Promise<Route | null> {
    const result = await database.query<Route>(
      'SELECT * FROM routes WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new route
   */
  async create(input: CreateRouteInput): Promise<Route> {
    const result = await database.query<Route>(
      `INSERT INTO routes (
        route_id, path, upstream, methods, strip_path, enabled,
        rate_limit_enabled, rate_limit_max, rate_limit_window_ms, rate_limit_message,
        description, tags, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        input.route_id,
        input.path,
        input.upstream,
        input.methods,
        input.strip_path,
        input.enabled ?? true,
        input.rate_limit_enabled ?? false,
        input.rate_limit_max,
        input.rate_limit_window_ms,
        input.rate_limit_message,
        input.description,
        input.tags,
        input.created_by,
      ]
    );

    if (!result.rows[0]) {
      throw new Error('Failed to create route');
    }

    logger.info('Route created', { routeId: input.route_id, path: input.path });
    return result.rows[0];
  }

  /**
   * Update a route
   */
  async update(routeId: string, input: UpdateRouteInput): Promise<Route | null> {
    // Build dynamic UPDATE query
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.path !== undefined) {
      fields.push(`path = $${paramIndex++}`);
      values.push(input.path);
    }
    if (input.upstream !== undefined) {
      fields.push(`upstream = $${paramIndex++}`);
      values.push(input.upstream);
    }
    if (input.methods !== undefined) {
      fields.push(`methods = $${paramIndex++}`);
      values.push(input.methods);
    }
    if (input.strip_path !== undefined) {
      fields.push(`strip_path = $${paramIndex++}`);
      values.push(input.strip_path);
    }
    if (input.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(input.enabled);
    }
    if (input.rate_limit_enabled !== undefined) {
      fields.push(`rate_limit_enabled = $${paramIndex++}`);
      values.push(input.rate_limit_enabled);
    }
    if (input.rate_limit_max !== undefined) {
      fields.push(`rate_limit_max = $${paramIndex++}`);
      values.push(input.rate_limit_max);
    }
    if (input.rate_limit_window_ms !== undefined) {
      fields.push(`rate_limit_window_ms = $${paramIndex++}`);
      values.push(input.rate_limit_window_ms);
    }
    if (input.rate_limit_message !== undefined) {
      fields.push(`rate_limit_message = $${paramIndex++}`);
      values.push(input.rate_limit_message);
    }
    if (input.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.updated_by !== undefined) {
      fields.push(`updated_by = $${paramIndex++}`);
      values.push(input.updated_by);
    }

    if (fields.length === 0) {
      const existing = await this.findByRouteId(routeId);
      return existing;
    }

    values.push(routeId);

    const result = await database.query<Route>(
      `UPDATE routes SET ${fields.join(', ')} WHERE route_id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (result.rows[0]) {
      logger.info('Route updated', { routeId, fields: Object.keys(input) });
    }

    return result.rows[0] || null;
  }

  /**
   * Soft delete a route
   */
  async delete(routeId: string, deletedBy?: string): Promise<boolean> {
    const result = await database.query(
      'UPDATE routes SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE route_id = $2 AND deleted_at IS NULL',
      [deletedBy, routeId]
    );

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info('Route deleted', { routeId, deletedBy });
    }

    return deleted;
  }

  /**
   * Permanently delete a route (use with caution)
   */
  async hardDelete(routeId: string): Promise<boolean> {
    const result = await database.query(
      'DELETE FROM routes WHERE route_id = $1',
      [routeId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Search routes
   */
  async search(query: string): Promise<Route[]> {
    const result = await database.query<Route>(
      `SELECT * FROM routes 
       WHERE deleted_at IS NULL 
       AND (
         route_id ILIKE $1 OR 
         path ILIKE $1 OR 
         upstream ILIKE $1 OR
         description ILIKE $1
       )
       ORDER BY created_at DESC`,
      [`%${query}%`]
    );

    return result.rows;
  }

  /**
   * Get routes with pagination
   */
  async findPaginated(limit: number = 50, offset: number = 0): Promise<{ routes: Route[]; total: number }> {
    const [dataResult, countResult] = await Promise.all([
      database.query<Route>(
        'SELECT * FROM routes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      ),
      database.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM routes WHERE deleted_at IS NULL'
      ),
    ]);

    return {
      routes: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0'),
    };
  }
}

export default new RoutesRepository();
