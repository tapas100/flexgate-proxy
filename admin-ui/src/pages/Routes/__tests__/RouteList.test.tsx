import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteList from '../RouteList';
import { routeService } from '../../../services/routes';

// Mock the route service
jest.mock('../../../services/routes');

const mockedRouteService = routeService as jest.Mocked<typeof routeService>;

describe('RouteList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty state when no routes exist', async () => {
    mockedRouteService.getRoutes.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<RouteList />);

    await waitFor(() => {
      expect(screen.getByText(/No routes configured/i)).toBeInTheDocument();
    });
  });

  it('should render routes table with data', async () => {
    const mockRoutes = [
      {
        id: '1',
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET', 'POST'],
        enabled: true,
        createdAt: '2026-01-28',
        updatedAt: '2026-01-28',
      },
    ];

    mockedRouteService.getRoutes.mockResolvedValue({
      success: true,
      data: mockRoutes,
    });

    render(<RouteList />);

    await waitFor(() => {
      expect(screen.getByText('/api/users')).toBeInTheDocument();
      expect(screen.getByText('https://api.example.com')).toBeInTheDocument();
    });
  });

  it('should filter routes based on search query', async () => {
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
      {
        id: '2',
        path: '/api/products',
        upstream: 'https://products.example.com',
        methods: ['GET'],
        enabled: true,
        createdAt: '2026-01-28',
        updatedAt: '2026-01-28',
      },
    ];

    mockedRouteService.getRoutes.mockResolvedValue({
      success: true,
      data: mockRoutes,
    });

    render(<RouteList />);

    await waitFor(() => {
      expect(screen.getByText('/api/users')).toBeInTheDocument();
      expect(screen.getByText('/api/products')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search routes/i);
    fireEvent.change(searchInput, { target: { value: 'users' } });

    await waitFor(() => {
      expect(screen.getByText('/api/users')).toBeInTheDocument();
      expect(screen.queryByText('/api/products')).not.toBeInTheDocument();
    });
  });

  it('should open create dialog when Create Route button is clicked', async () => {
    mockedRouteService.getRoutes.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<RouteList />);

    const addButton = await screen.findByRole('button', { name: /create route/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('should toggle route enabled status', async () => {
    const mockRoute = {
      id: '1',
      path: '/api/users',
      upstream: 'https://api.example.com',
      methods: ['GET'],
      enabled: true,
      createdAt: '2026-01-28',
      updatedAt: '2026-01-28',
    };

    mockedRouteService.getRoutes.mockResolvedValue({
      success: true,
      data: [mockRoute],
    });

    mockedRouteService.toggleRoute.mockResolvedValue({
      success: true,
      data: { ...mockRoute, enabled: false },
    });

    render(<RouteList />);

    await waitFor(() => {
      expect(screen.getByText('/api/users')).toBeInTheDocument();
    });

    const toggleSwitch = screen.getByRole('switch');
    fireEvent.click(toggleSwitch);

    await waitFor(() => {
      expect(mockedRouteService.toggleRoute).toHaveBeenCalledWith('1', false);
    });
  });
});
