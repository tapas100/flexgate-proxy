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
    return apiService.get<Route[]>('/api/routes');
  }

  /**
   * Get a single route by ID
   */
  async getRoute(id: string): Promise<ApiResponse<Route>> {
    return apiService.get<Route>(`/api/routes/${id}`);
  }

  /**
   * Create a new route
   */
  async createRoute(data: CreateRouteData): Promise<ApiResponse<Route>> {
    return apiService.post<Route>('/api/routes', data);
  }

  /**
   * Update an existing route
   */
  async updateRoute(id: string, data: UpdateRouteData): Promise<ApiResponse<Route>> {
    return apiService.put<Route>(`/api/routes/${id}`, data);
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
