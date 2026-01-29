import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../src/logger';
import database from '../src/database/index';

const router: Router = Router();

// Database-backed routes (using PostgreSQL)
interface ProxyRoute {
  id: string;
  path: string;
  upstream: string;
  methods: string[];
  enabled: boolean;
  stripPath?: string;
  rateLimit?: {
    enabled: boolean;
    max: number;
    windowMs: number;
    message?: string;
  };
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Helper to convert database row to ProxyRoute
function dbRowToProxyRoute(row: any): ProxyRoute {
  return {
    id: row.route_id,
    path: row.path,
    upstream: row.upstream,
    methods: row.methods || ['GET'],
    enabled: row.enabled !== false,
    stripPath: row.strip_path,
    rateLimit: row.rate_limit_enabled ? {
      enabled: row.rate_limit_enabled,
      max: row.rate_limit_max || 100,
      windowMs: row.rate_limit_window_ms || 60000,
      message: row.rate_limit_message,
    } : undefined,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Validation schemas
const CreateRouteSchema = z.object({
  path: z.string().min(1).regex(/^\//, 'Path must start with /'),
  upstream: z.string().min(1),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])).min(1),
  enabled: z.boolean().optional().default(true),
  stripPath: z.string().optional(),
  description: z.string().optional(),
  rateLimit: z.object({
    enabled: z.boolean(),
    max: z.number().min(1),
    windowMs: z.number().min(1000),
    message: z.string().optional(),
  }).optional(),
});

const UpdateRouteSchema = CreateRouteSchema.partial();

/**
 * GET /api/routes
 * List all routes from database
 */
router.get('/', async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await database.query(
      'SELECT * FROM routes ORDER BY created_at DESC'
    );
    
    const routes = result.rows.map(dbRowToProxyRoute);
    
    logger.info('Fetched routes from database', { count: routes.length });
    
    return res.json({
      success: true,
      data: routes,
    });
  } catch (error) {
    logger.error('Failed to fetch routes from database', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch routes',
    });
  }
});

/**
 * GET /api/routes/:id
 * Get a single route by ID from database
 */
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    const result = await database.query(
      'SELECT * FROM routes WHERE route_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }
    
    const route = dbRowToProxyRoute(result.rows[0]);
    
    logger.info('Fetched route from database', { routeId: id });
    
    return res.json({
      success: true,
      data: route,
    });
  } catch (error) {
    logger.error('Failed to fetch route from database', {
      routeId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch route',
    });
  }
});

/**
 * POST /api/routes
 * Create a new route in database
 */
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const validation = CreateRouteSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid route data',
        details: validation.error.issues,
      });
    }

    const routeData = validation.data;

    // Check for duplicate path
    const duplicateCheck = await database.query(
      'SELECT route_id FROM routes WHERE path = $1',
      [routeData.path]
    );
    
    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: `Route with path '${routeData.path}' already exists`,
      });
    }

    // Generate route ID
    const routeId = `route-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Insert into database
    const result = await database.query(
      `INSERT INTO routes (
        route_id, path, upstream, methods, enabled, strip_path,
        rate_limit_enabled, rate_limit_max, rate_limit_window_ms, rate_limit_message,
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        routeId,
        routeData.path,
        routeData.upstream,
        routeData.methods,
        routeData.enabled,
        routeData.stripPath,
        routeData.rateLimit?.enabled || false,
        routeData.rateLimit?.max,
        routeData.rateLimit?.windowMs,
        routeData.rateLimit?.message,
        routeData.description,
      ]
    );

    const newRoute = dbRowToProxyRoute(result.rows[0]);

    logger.info('Route created in database', {
      routeId: newRoute.id,
      path: newRoute.path,
      upstream: newRoute.upstream,
    });

    return res.status(201).json({
      success: true,
      data: newRoute,
    });
  } catch (error) {
    logger.error('Failed to create route in database', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create route',
    });
  }
});

/**
 * PUT /api/routes/:id
 * Update an existing route in database
 */
router.put('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    // Validate request body
    const validation = UpdateRouteSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid route data',
        details: validation.error.issues,
      });
    }

    const updateData = validation.data;

    // Check if route exists
    const existingRoute = await database.query(
      'SELECT * FROM routes WHERE route_id = $1',
      [id]
    );
    
    if (existingRoute.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    // Check for duplicate path (if path is being updated)
    if (updateData.path) {
      const duplicateCheck = await database.query(
        'SELECT route_id FROM routes WHERE path = $1 AND route_id != $2',
        [updateData.path, id]
      );
      
      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: `Route with path '${updateData.path}' already exists`,
        });
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updateData.path !== undefined) {
      updates.push(`path = $${paramCount++}`);
      values.push(updateData.path);
    }
    if (updateData.upstream !== undefined) {
      updates.push(`upstream = $${paramCount++}`);
      values.push(updateData.upstream);
    }
    if (updateData.methods !== undefined) {
      updates.push(`methods = $${paramCount++}`);
      values.push(updateData.methods);
    }
    if (updateData.enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      values.push(updateData.enabled);
    }
    if (updateData.stripPath !== undefined) {
      updates.push(`strip_path = $${paramCount++}`);
      values.push(updateData.stripPath);
    }
    if (updateData.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(updateData.description);
    }
    if (updateData.rateLimit !== undefined) {
      updates.push(`rate_limit_enabled = $${paramCount++}`);
      values.push(updateData.rateLimit.enabled);
      updates.push(`rate_limit_max = $${paramCount++}`);
      values.push(updateData.rateLimit.max);
      updates.push(`rate_limit_window_ms = $${paramCount++}`);
      values.push(updateData.rateLimit.windowMs);
      updates.push(`rate_limit_message = $${paramCount++}`);
      values.push(updateData.rateLimit.message);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await database.query(
      `UPDATE routes SET ${updates.join(', ')} WHERE route_id = $${paramCount} RETURNING *`,
      values
    );

    const updatedRoute = dbRowToProxyRoute(result.rows[0]);

    logger.info('Route updated in database', {
      routeId: id,
      changes: Object.keys(updateData),
    });

    return res.json({
      success: true,
      data: updatedRoute,
    });
  } catch (error) {
    logger.error('Failed to update route in database', {
      routeId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update route',
    });
  }
});

/**
 * DELETE /api/routes/:id
 * Delete a route from database
 */
router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    // Check if route exists
    const existingRoute = await database.query(
      'SELECT * FROM routes WHERE route_id = $1',
      [id]
    );
    
    if (existingRoute.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    // Delete from database
    await database.query(
      'DELETE FROM routes WHERE route_id = $1',
      [id]
    );

    const deletedRoute = dbRowToProxyRoute(existingRoute.rows[0]);

    logger.info('Route deleted from database', {
      routeId: id,
      path: deletedRoute.path,
    });

    return res.json({
      success: true,
      data: deletedRoute,
    });
  } catch (error) {
    logger.error('Failed to delete route from database', {
      routeId: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to delete route',
    });
  }
});

export default router;
