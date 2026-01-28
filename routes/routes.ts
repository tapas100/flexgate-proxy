import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../src/logger';
import config from '../src/config/loader';

const router: Router = Router();

// In-memory storage for routes (will be replaced with DB or persistent storage)
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
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
    halfOpenRequests?: number;
  };
  createdAt: number;
  updatedAt: number;
}

// Load initial routes from config
let routes: ProxyRoute[] = [];

function loadRoutesFromConfig() {
  const configRoutes = config.get<any[]>('routes', []) || [];
  routes = configRoutes.map((route: any, index: number) => ({
    id: `route-${index + 1}`,
    path: route.path,
    upstream: route.upstream,
    methods: route.methods || ['GET'],
    enabled: route.enabled !== false,
    stripPath: route.stripPath,
    rateLimit: route.rateLimit,
    circuitBreaker: route.circuitBreaker,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  logger.info(`Loaded ${routes.length} routes from configuration`);
}

// Initialize routes on module load
loadRoutesFromConfig();

// Validation schemas
const CreateRouteSchema = z.object({
  path: z.string().min(1).regex(/^\//, 'Path must start with /'),
  upstream: z.string().min(1),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])).min(1),
  enabled: z.boolean().optional().default(true),
  stripPath: z.string().optional(),
  rateLimit: z.object({
    enabled: z.boolean(),
    max: z.number().min(1),
    windowMs: z.number().min(1000),
    message: z.string().optional(),
  }).optional(),
  circuitBreaker: z.object({
    enabled: z.boolean(),
    failureThreshold: z.number().min(1).optional(),
    successThreshold: z.number().min(1).optional(),
    timeout: z.number().min(1000).optional(),
    halfOpenRequests: z.number().min(1).optional(),
  }).optional(),
});

const UpdateRouteSchema = CreateRouteSchema.partial().extend({
  id: z.string().optional(),
});

/**
 * GET /api/routes
 * List all routes
 */
router.get('/', (_req: Request, res: Response): any => {
  try {
    logger.info('Fetching all routes', { count: routes.length });
    
    return res.json({
      success: true,
      data: routes,
    });
  } catch (error) {
    logger.error('Failed to fetch routes', {
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
 * Get a single route by ID
 */
router.get('/:id', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;
    const route = routes.find(r => r.id === id);

    if (!route) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    logger.info('Fetched route', { routeId: id });

    return res.json({
      success: true,
      data: route,
    });
  } catch (error) {
    logger.error('Failed to fetch route', {
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
 * Create a new route
 */
router.post('/', (req: Request, res: Response): any => {
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
    const existingRoute = routes.find(r => r.path === routeData.path);
    if (existingRoute) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: `Route with path '${routeData.path}' already exists`,
      });
    }

    // Verify upstream exists
    const upstreams = config.get<any[]>('upstreams', []) || [];
    const upstreamExists = upstreams.some((u: any) => u.name === routeData.upstream);
    
    if (!upstreamExists) {
      return res.status(422).json({
        success: false,
        error: 'Unprocessable Entity',
        message: `Upstream '${routeData.upstream}' does not exist`,
      });
    }

    // Create new route
    const newRoute: ProxyRoute = {
      id: `route-${Date.now()}`,
      ...routeData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    routes.push(newRoute);

    logger.info('Route created', {
      routeId: newRoute.id,
      path: newRoute.path,
      upstream: newRoute.upstream,
    });

    return res.status(201).json({
      success: true,
      data: newRoute,
    });
  } catch (error) {
    logger.error('Failed to create route', {
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
 * Update an existing route
 */
router.put('/:id', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;
    const routeIndex = routes.findIndex(r => r.id === id);

    if (routeIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    const currentRoute = routes[routeIndex];
    if (!currentRoute) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

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

    // If updating path, check for duplicates
    if (updateData.path && updateData.path !== currentRoute.path) {
      const duplicateRoute = routes.find(r => r.path === updateData.path && r.id !== id);
      if (duplicateRoute) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: `Route with path '${updateData.path}' already exists`,
        });
      }
    }

    // If updating upstream, verify it exists
    if (updateData.upstream) {
      const upstreams = config.get<any[]>('upstreams', []) || [];
      const upstreamExists = upstreams.some((u: any) => u.name === updateData.upstream);
      
      if (!upstreamExists) {
        return res.status(422).json({
          success: false,
          error: 'Unprocessable Entity',
          message: `Upstream '${updateData.upstream}' does not exist`,
        });
      }
    }

    // Update route (ensure all required fields are present)
    const updatedRoute: ProxyRoute = {
      id: currentRoute.id,
      path: updateData.path || currentRoute.path,
      upstream: updateData.upstream || currentRoute.upstream,
      methods: updateData.methods || currentRoute.methods,
      enabled: updateData.enabled !== undefined ? updateData.enabled : currentRoute.enabled,
      stripPath: updateData.stripPath !== undefined ? updateData.stripPath : currentRoute.stripPath,
      rateLimit: updateData.rateLimit !== undefined ? updateData.rateLimit : currentRoute.rateLimit,
      circuitBreaker: updateData.circuitBreaker !== undefined ? updateData.circuitBreaker : currentRoute.circuitBreaker,
      createdAt: currentRoute.createdAt,
      updatedAt: Date.now(),
    };

    routes[routeIndex] = updatedRoute;

    logger.info('Route updated', {
      routeId: id,
      path: updatedRoute.path,
    });

    return res.json({
      success: true,
      data: updatedRoute,
    });
  } catch (error) {
    logger.error('Failed to update route', {
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
 * Delete a route
 */
router.delete('/:id', (req: Request, res: Response): any => {
  try {
    const { id } = req.params;
    const routeIndex = routes.findIndex(r => r.id === id);

    if (routeIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    const deletedRoute = routes[routeIndex];
    if (!deletedRoute) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    routes.splice(routeIndex, 1);

    logger.info('Route deleted', {
      routeId: id,
      path: deletedRoute.path,
    });

    return res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete route', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to delete route',
    });
  }
});

/**
 * POST /api/routes/:id/test
 * Test a route's upstream connectivity
 */
router.post('/:id/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { method = 'GET' } = req.body;

    const route = routes.find(r => r.id === id);

    if (!route) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route with ID '${id}' not found`,
      });
    }

    // Get upstream URL
    const upstreams = config.get<any[]>('upstreams', []) || [];
    const upstream = upstreams.find((u: any) => u.name === route.upstream);

    if (!upstream) {
      return res.status(422).json({
        success: false,
        error: 'Unprocessable Entity',
        message: `Upstream '${route.upstream}' not found in configuration`,
      });
    }

    // Test upstream connectivity
    const startTime = Date.now();
    
    try {
      const testUrl = `${upstream.url}${upstream.healthCheck?.path || '/'}`;
      const response = await fetch(testUrl, {
        method: method,
        signal: AbortSignal.timeout(upstream.timeout || 5000),
      });

      const duration = Date.now() - startTime;
      const success = response.ok;

      logger.info('Route test completed', {
        routeId: id,
        upstream: route.upstream,
        success,
        duration,
        status: response.status,
      });

      return res.json({
        success: true,
        data: {
          routeId: id,
          path: route.path,
          upstream: route.upstream,
          upstreamUrl: upstream.url,
          testUrl,
          method,
          responseTime: duration,
          status: response.status,
          statusText: response.statusText,
          reachable: success,
        },
      });
    } catch (testError) {
      const duration = Date.now() - startTime;

      logger.warn('Route test failed', {
        routeId: id,
        upstream: route.upstream,
        duration,
        error: testError instanceof Error ? testError.message : 'Unknown error',
      });

      return res.json({
        success: true,
        data: {
          routeId: id,
          path: route.path,
          upstream: route.upstream,
          upstreamUrl: upstream.url,
          method,
          responseTime: duration,
          reachable: false,
          error: testError instanceof Error ? testError.message : 'Connection failed',
        },
      });
    }
  } catch (error) {
    logger.error('Failed to test route', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to test route',
    });
  }
});

export default router;
