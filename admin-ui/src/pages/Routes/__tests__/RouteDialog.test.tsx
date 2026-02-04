import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteDialog from '../RouteDialog';
import { routeService } from '../../../services/routes';

// Mock the route service
jest.mock('../../../services/routes');

const mockedRouteService = routeService as jest.Mocked<typeof routeService>;

describe('RouteDialog Component', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render create mode with empty form', () => {
    render(
      <RouteDialog
        open={true}
        route={null}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/create route/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/path/i)).toHaveValue('');
    expect(screen.getByLabelText(/upstream url/i)).toHaveValue('');
  });

  it('should render edit mode with pre-filled data', () => {
    const existingRoute = {
      id: '1',
      path: '/api/users',
      upstream: 'https://api.example.com',
      methods: ['GET', 'POST'],
      enabled: true,
      createdAt: '2026-01-28',
      updatedAt: '2026-01-28',
    };

    render(
      <RouteDialog
        open={true}
        route={existingRoute}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/edit route/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/path/i)).toHaveValue('/api/users');
    expect(screen.getByLabelText(/upstream url/i)).toHaveValue('https://api.example.com');
  });

  it('should show validation error for invalid path', async () => {
    render(
      <RouteDialog
        open={true}
        route={null}
        onClose={mockOnClose}
      />
    );

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: 'invalid-path' } });

    const upstreamInput = screen.getByLabelText(/upstream url/i);
    fireEvent.change(upstreamInput, { target: { value: 'https://api.example.com' } });

    const saveButton = screen.getByRole('button', { name: /create/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/path must start with/i)).toBeInTheDocument();
    });
  });

  it('should show validation error for invalid upstream URL', async () => {
    render(
      <RouteDialog
        open={true}
        route={null}
        onClose={mockOnClose}
      />
    );

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: '/api/users' } });

    const upstreamInput = screen.getByLabelText(/upstream url/i);
    fireEvent.change(upstreamInput, { target: { value: 'not-a-url' } });

    const saveButton = screen.getByRole('button', { name: /create/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid url format/i)).toBeInTheDocument();
    });
  });

  it('should submit form with valid data in create mode', async () => {
    mockedRouteService.createRoute.mockResolvedValue({
      success: true,
      data: {
        id: '1',
        path: '/api/users',
        upstream: 'https://api.example.com',
        methods: ['GET'],
        enabled: true,
        createdAt: '2026-01-28',
        updatedAt: '2026-01-28',
      },
    });

    render(
      <RouteDialog
        open={true}
        route={null}
        onClose={mockOnClose}
      />
    );

    fireEvent.change(screen.getByLabelText(/path/i), {
      target: { value: '/api/users' },
    });
    fireEvent.change(screen.getByLabelText(/upstream url/i), {
      target: { value: 'https://api.example.com' },
    });

    const saveButton = screen.getByRole('button', { name: /create/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedRouteService.createRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/users',
          upstream: 'https://api.example.com',
        })
      );
      expect(mockOnClose).toHaveBeenCalledWith(true);
    });
  });

  it('should close dialog on cancel', () => {
    render(
      <RouteDialog
        open={true}
        route={null}
        onClose={mockOnClose}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledWith(false);
  });
});
