// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Logs from '../Logs';
import { logService } from '../../services/logs';

// Mock the log service
jest.mock('../../services/logs', () => ({
  logService: {
    fetchLogs: jest.fn(),
    fetchLogStats: jest.fn(),
    exportLogs: jest.fn(),
    connectWebSocket: jest.fn(),
    disconnectWebSocket: jest.fn(),
  },
}));

const mockLogsResponse = {
  success: true,
  data: {
    logs: [
      {
        id: 'log-1',
        timestamp: Date.now(),
        level: 'INFO',
        source: 'proxy',
        message: 'Request processed',
        request: { method: 'GET', path: '/api/test' },
        response: { statusCode: 200, latency: 50 },
      },
      {
        id: 'log-2',
        timestamp: Date.now() - 1000,
        level: 'ERROR',
        source: 'auth',
        message: 'Authentication failed',
        request: { method: 'POST', path: '/auth/login' },
        response: { statusCode: 401, latency: 100 },
      },
    ],
    total: 2,
  },
};

const mockStatsResponse = {
  success: true,
  data: {
    total: 100,
    byLevel: { DEBUG: 10, INFO: 50, WARN: 30, ERROR: 9, FATAL: 1 },
    bySource: { proxy: 40, auth: 30, metrics: 10, admin: 10, system: 10 },
    errorRate: 10.0,
    avgLatency: 125.5,
  },
};

describe('Logs Page Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logService.fetchLogs as jest.Mock).mockResolvedValue(mockLogsResponse);
    (logService.fetchLogStats as jest.Mock).mockResolvedValue(mockStatsResponse);
    (logService.exportLogs as jest.Mock).mockResolvedValue('blob:mock-url');
  });

  afterEach(() => {
    logService.disconnectWebSocket();
  });

  it('should load and display logs on mount', async () => {
    render(<Logs />);

    // Should show loading state initially
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Should load logs
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalled();
      expect(logService.fetchLogStats).toHaveBeenCalled();
    });

    // Should display logs
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });
  });

  it('should display statistics panel', async () => {
    render(<Logs />);

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument(); // Total logs
      expect(screen.getByText(/10\.0%/)).toBeInTheDocument(); // Error rate
    });
  });

  it('should filter logs when filter changes', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalled();
    });

    jest.clearAllMocks();

    // Change filter
    const levelSelect = screen.getByLabelText(/Levels/i);
    fireEvent.mouseDown(levelSelect);

    const errorOption = screen.getByText('ERROR');
    fireEvent.click(errorOption);

    // Should fetch logs with new filter
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalled();
    });
  });

  it('should search logs with search query', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Enter search query
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'error' } });

    // Should filter logs
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ searchQuery: 'error' })
      );
    });
  });

  it('should toggle streaming mode', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Find streaming toggle button (initially "Start streaming")
    const streamingButton = screen.getByLabelText(/start streaming/i);
    fireEvent.click(streamingButton);

    // Should connect WebSocket
    await waitFor(() => {
      expect(logService.connectWebSocket).toHaveBeenCalled();
    });

    // Toggle off (now button says "Pause streaming")
    const pauseButton = screen.getByLabelText(/pause streaming/i);
    fireEvent.click(pauseButton);

    // Should disconnect WebSocket
    await waitFor(() => {
      expect(logService.disconnectWebSocket).toHaveBeenCalled();
    });
  });

  it('should refresh logs manually', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalled();
    });

    jest.clearAllMocks();

    // Click refresh button
    const refreshButton = screen.getByLabelText(/refresh/i);
    fireEvent.click(refreshButton);

    // Should fetch logs again
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalled();
      expect(logService.fetchLogStats).toHaveBeenCalled();
    });
  });

  it('should export logs to JSON', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Click export JSON button
    const exportJsonButton = screen.getByLabelText(/export as json/i);
    fireEvent.click(exportJsonButton);

    // Should call export service
    await waitFor(() => {
      expect(logService.exportLogs).toHaveBeenCalledWith('json', expect.any(Object));
    });
  });

  it('should export logs to CSV', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Click export CSV button
    const exportCsvButton = screen.getByLabelText(/export as csv/i);
    fireEvent.click(exportCsvButton);

    // Should call export service
    await waitFor(() => {
      expect(logService.exportLogs).toHaveBeenCalledWith('csv', expect.any(Object));
    });
  });

  it('should clear logs', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Click clear button
    const clearButton = screen.getByLabelText(/clear logs/i);
    fireEvent.click(clearButton);

    // Should clear logs and refetch
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalledTimes(2); // Initial + after clear
    });
  });

  it('should handle error state', async () => {
    (logService.fetchLogs as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch logs',
    });

    render(<Logs />);

    // Should display error message
    await waitFor(() => {
      expect(screen.getByText(/failed to fetch logs/i)).toBeInTheDocument();
    });
  });

  it('should show streaming indicator when streaming is active', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Enable streaming
    const streamingButton = screen.getByLabelText(/start streaming/i);
    fireEvent.click(streamingButton);

    // Should show streaming indicator
    await waitFor(() => {
      expect(screen.getByText(/live streaming enabled/i)).toBeInTheDocument();
    });
  });

  it('should filter by time range', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    jest.clearAllMocks();

    // Click 24H time range
    const timeRangeButton = screen.getByText('24H');
    fireEvent.click(timeRangeButton);

    // Should fetch logs with time range filter
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ timeRange: '24h' })
      );
    });
  });

  it('should handle regex search toggle', async () => {
    render(<Logs />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Request processed')).toBeInTheDocument();
    });

    // Enter search query
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'error|failed' } });

    // Toggle regex
    const regexCheckbox = screen.getByLabelText(/regex/i);
    fireEvent.click(regexCheckbox);

    // Should fetch logs with regex enabled
    await waitFor(() => {
      expect(logService.fetchLogs).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ isRegex: true })
      );
    });
  });
});
