import { routeService } from '../routes';
import { apiService } from '../api';

// Mock the apiService
jest.mock('../api');

const mockedApiService = apiService as jest.Mocked<typeof apiService>;

describe('RouteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRoutes', () => {
    it('should fetch all routes', async () => {
      const mockRoutes = [
        {
          id: '1',
          path: '/api/users',
          upstream: 'https://api.example.com',
          methods: ['GET'],
          enabled: true,
          createdAt: '2026-01-28',
          updatedAt: '2026-01-28',
        },
      ];

      mockedApiService.get.mockResolvedValue({
        success: true,
        data: mockRoutes,
      });

      const result = await routeService.getRoutes();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRoutes);
      expect(mockedApiService.get).toHaveBeenCalledWith('/api/routes');
    });
  });

  describe('createRoute', () => {
    it('should create a new route', async () => {
      const newRoute = {
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET', 'POST'],
      };

      const createdRoute = {
        id: '1',
        ...newRoute,
        enabled: true,
        createdAt: '2026-01-28',
        updatedAt: '2026-01-28',
      };

      mockedApiService.post.mockResolvedValue({
        success: true,
        data: createdRoute,
      });

      const result = await routeService.createRoute(newRoute);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(createdRoute);
      expect(mockedApiService.post).toHaveBeenCalledWith('/api/routes', newRoute);
    });
  });

  describe('updateRoute', () => {
    it('should update an existing route', async () => {
      const updateData = {
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET', 'POST', 'PUT'],
      };

      const updatedRoute = {
        id: '1',
        ...updateData,
        enabled: true,
        createdAt: '2026-01-28',
        updatedAt: '2026-01-28',
      };

      mockedApiService.put.mockResolvedValue({
        success: true,
        data: updatedRoute,
      });

      const result = await routeService.updateRoute('1', updateData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedRoute);
      expect(mockedApiService.put).toHaveBeenCalledWith('/api/routes/1', updateData);
    });
  });

  describe('deleteRoute', () => {
    it('should delete a route', async () => {
      mockedApiService.delete.mockResolvedValue({
        success: true,
      });

      const result = await routeService.deleteRoute('1');

      expect(result.success).toBe(true);
      expect(mockedApiService.delete).toHaveBeenCalledWith('/api/routes/1');
    });
  });

  describe('toggleRoute', () => {
    it('should toggle route enabled status', async () => {
      const toggledRoute = {
        id: '1',
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET'],
        enabled: false,
        createdAt: '2026-01-28',
        updatedAt: '2026-01-28',
      };

      mockedApiService.put.mockResolvedValue({
        success: true,
        data: toggledRoute,
      });

      const result = await routeService.toggleRoute('1', false);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(toggledRoute);
      expect(mockedApiService.put).toHaveBeenCalledWith('/api/routes/1', { enabled: false });
    });
  });
});
