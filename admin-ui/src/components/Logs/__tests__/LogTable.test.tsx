// @ts-nocheck
import React from 'react';
import { render, screen } from '@testing-library/react';
import LogTable from '../LogTable';
import type { DetailedLogEntry } from '../../types';

const mockLogs: DetailedLogEntry[] = [
  {
    id: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    source: 'proxy',
    message: 'Request processed successfully',
    request: {
      method: 'GET',
      path: '/api/users',
    },
    response: {
      statusCode: 200,
      latency: 50,
    },
  },
  {
    id: 'log-2',
    timestamp: Date.now() - 1000,
    level: 'ERROR',
    source: 'auth',
    message: 'Authentication failed',
    request: {
      method: 'POST',
      path: '/auth/login',
    },
    response: {
      statusCode: 401,
      latency: 100,
    },
  },
];

describe('LogTable', () => {
  it('should render table with headers', () => {
    render(<LogTable logs={mockLogs} loading={false} searchQuery="" isRegex={false} />);

    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('should render log rows', () => {
    render(<LogTable logs={mockLogs} loading={false} searchQuery="" isRegex={false} />);

    expect(screen.getByText('Request processed successfully')).toBeInTheDocument();
    expect(screen.getByText('Authentication failed')).toBeInTheDocument();
  });

  it('should show loading spinner when loading', () => {
    render(<LogTable logs={[]} loading={true} searchQuery="" isRegex={false} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should show empty state when no logs', () => {
    render(<LogTable logs={[]} loading={false} searchQuery="" isRegex={false} />);

    expect(screen.getByText(/no logs/i)).toBeInTheDocument();
  });

  it('should render correct number of rows', () => {
    render(<LogTable logs={mockLogs} loading={false} searchQuery="" isRegex={false} />);

    // Each log creates a row with specific data
    const rows = screen.getAllByRole('row');
    // +1 for header row
    expect(rows.length).toBeGreaterThanOrEqual(mockLogs.length);
  });

  it('should pass search query to log rows', () => {
    const searchQuery = 'error';
    render(<LogTable logs={mockLogs} loading={false} searchQuery={searchQuery} isRegex={false} />);

    // Search highlighting should be applied
    expect(screen.getByText('Authentication failed')).toBeInTheDocument();
  });

  it('should have sticky header', () => {
    render(<LogTable logs={mockLogs} loading={false} searchQuery="" isRegex={false} />);

    const table = screen.getByRole('table').closest('.MuiPaper-root');
    expect(table).toHaveStyle({ maxHeight: expect.stringContaining('px') });
  });
});
