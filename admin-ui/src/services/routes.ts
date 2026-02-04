import { apiService } from './api';
import { Route, ApiResponse } from '../types';

export interface CreateRouteData {
  path: string;
  upstream: string;
  methods: string[];
  rateLimit?: {
    requests: number;
    window: string;
  };
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;
  };
}

export interface UpdateRouteData extends CreateRouteData {
  enabled?: boolean;
}

// Backend API format (what the server expects)
interface BackendRouteData {
  path: string;
  upstream: string;
  methods: string[];
  enabled?: boolean;
  rateLimit?: {
    enabled: boolean;
    max: number;
    windowMs: number;
    message?: string;
  };
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;
  };
}

// Helper function to convert window string to milliseconds
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return 60000; // Default to 60 seconds
  
  const value = parseInt(match[1]);
  const unit = match[2] || 's';
  
  const multipliers: Record<string, number> = {
    's': 1000,        // seconds
    'm': 60000,       // minutes
    'h': 3600000,     // hours
    'd': 86400000,    // days
  };
  
  return value * (multipliers[unit] || 1000);
}

// Transform frontend data to backend format
function transformToBackendFormat(data: CreateRouteData | UpdateRouteData): BackendRouteData {
  const transformed: BackendRouteData = {
    path: data.path,
    upstream: data.upstream,
    methods: data.methods,
  };

  if ('enabled' in data && data.enabled !== undefined) {
    transformed.enabled = data.enabled;
  }

  if (data.rateLimit) {
    transformed.rateLimit = {
      enabled: true,
      max: data.rateLimit.requests,
      windowMs: parseWindow(data.rateLimit.window),
    };
  }

  if (data.circuitBreaker) {
    transformed.circuitBreaker = data.circuitBreaker;
  }

  return transformed;
}

// Helper function to convert milliseconds to window string
function formatWindowMs(ms: number): string {
  if (ms >= 86400000 && ms % 86400000 === 0) {
    return `${ms / 86400000}d`; // days
  }
  if (ms >= 3600000 && ms % 3600000 === 0) {
    return `${ms / 3600000}h`; // hours
  }
  if (ms >= 60000 && ms % 60000 === 0) {
    return `${ms / 60000}m`; // minutes
  }
  return `${ms / 1000}s`; // seconds
}

// Transform backend response to frontend format
function transformFromBackendFormat(backendRoute: any): Route {
  const route: Route = {
    id: backendRoute.id,
    path: backendRoute.path,
    upstream: backendRoute.upstream,
    methods: backendRoute.methods,
    enabled: backendRoute.enabled,
    createdAt: backendRoute.createdAt,
    updatedAt: backendRoute.updatedAt,
  };

  if (backendRoute.rateLimit && backendRoute.rateLimit.enabled) {
    route.rateLimit = {
      requests: backendRoute.rateLimit.max,
      window: formatWindowMs(backendRoute.rateLimit.windowMs),
    };
  }

  if (backendRoute.circuitBreaker) {
    route.circuitBreaker = backendRoute.circuitBreaker;
  }

  return route;
}

export interface RouteTestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  responseTime: number;
}

class RouteService {
  /**
   * Get all routes
   */
  async getRoutes(): Promise<ApiResponse<Route[]>> {
    const response = await apiService.get<any>('/api/routes');
    
    // Backend returns { success: true, data: [...] }
    // apiService wraps it again, so we need response.data.data
    if (response.success && response.data) {
      const backendData = (response.data as any).data || response.data;
      const routes = Array.isArray(backendData) ? backendData : [];
      
      return {
        success: true,
        data: routes.map(transformFromBackendFormat)
      };
    }
    
    return { success: false, error: 'Failed to load routes' };
  }

  /**
   * Get a single route by ID
   */
  async getRoute(id: string): Promise<ApiResponse<Route>> {
    const response = await apiService.get<any>(`/api/routes/${id}`);
    
    // Handle double-wrapped response
    if (response.success && response.data) {
      const backendData = (response.data as any).data || response.data;
      
      return {
        success: true,
        data: transformFromBackendFormat(backendData)
      };
    }
    
    return { success: false, error: 'Failed to load route' };
  }

  /**
   * Create a new route
   */
  async createRoute(data: CreateRouteData): Promise<ApiResponse<Route>> {
    const backendData = transformToBackendFormat(data);
    const response = await apiService.post<any>('/api/routes', backendData);
    
    // Handle double-wrapped response
    if (response.success && response.data) {
      const backendData = (response.data as any).data || response.data;
      
      return {
        success: true,
        data: transformFromBackendFormat(backendData)
      };
    }
    
    return response;
  }

  /**
   * Update an existing route
   */
  async updateRoute(id: string, data: UpdateRouteData): Promise<ApiResponse<Route>> {
    const backendData = transformToBackendFormat(data);
    const response = await apiService.put<any>(`/api/routes/${id}`, backendData);
    
    // Handle double-wrapped response
    if (response.success && response.data) {
      const backendData = (response.data as any).data || response.data;
      
      return {
        success: true,
        data: transformFromBackendFormat(backendData)
      };
    }
    
    return response;
  }

  /**
   * Delete a route
   */
  async deleteRoute(id: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/api/routes/${id}`);
  }

  /**
   * Toggle route enabled status
   */
  async toggleRoute(id: string, enabled: boolean): Promise<ApiResponse<Route>> {
    return apiService.put<Route>(`/api/routes/${id}`, { enabled });
  }

  /**
   * Test a route by sending a test request
   */
  async testRoute(id: string, method: string = 'GET'): Promise<ApiResponse<RouteTestResult>> {
    return apiService.post<RouteTestResult>(`/api/routes/${id}/test`, { method });
  }
}

export const routeService = new RouteService();
export default routeService;
