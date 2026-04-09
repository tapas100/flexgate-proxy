// @ts-nocheck
import React from 'react';
import { render, screen } from '@testing-library/react';
import LogDetails from '../LogDetails';
import type { DetailedLogEntry } from '../../types';

const mockLog: DetailedLogEntry = {
  id: 'test-log-1',
  timestamp: Date.now(),
  level: 'ERROR',
  source: 'proxy',
  message: 'Test error message',
  correlationId: 'corr-123',
  requestId: 'req-456',
  request: {
    method: 'POST',
    path: '/api/users',
    headers: { 'Content-Type': 'application/json' },
    query: { page: '1' },
  },
  response: {
    statusCode: 500,
    latency: 250,
    size: 1024,
  },
  error: {
    code: 'INTERNAL_ERROR',
    details: 'Database connection failed',
    stack: 'Error: Database connection failed\n    at line 1\n    at line 2',
  },
  metadata: {
    userId: 'user-789',
    sessionId: 'session-abc',
  },
};

describe('LogDetails', () => {
  it('should render basic information', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText(mockLog.id)).toBeInTheDocument();
    expect(screen.getByText(/ERROR/i)).toBeInTheDocument();
    expect(screen.getByText(/proxy/i)).toBeInTheDocument();
  });

  it('should render correlation and request IDs', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText('corr-123')).toBeInTheDocument();
    expect(screen.getByText('req-456')).toBeInTheDocument();
  });

  it('should render message section', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should render request details', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText(/POST/i)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/users/i)).toBeInTheDocument();
  });

  it('should render response details', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument(); // Latency
    expect(screen.getByText(/1\.00 KB/)).toBeInTheDocument(); // Size
  });

  it('should render error details', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText('INTERNAL_ERROR')).toBeInTheDocument();
    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
  });

  it('should render stack trace', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText(/Error: Database connection failed/)).toBeInTheDocument();
  });

  it('should render metadata', () => {
    render(<LogDetails log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText(/user-789/)).toBeInTheDocument();
    expect(screen.getByText(/session-abc/)).toBeInTheDocument();
  });

  it('should not render sections when data is missing', () => {
    const minimalLog: DetailedLogEntry = {
      id: 'minimal-1',
      timestamp: Date.now(),
      level: 'INFO',
      source: 'system',
      message: 'Simple message',
    };

    render(<LogDetails log={minimalLog} searchQuery="" isRegex={false} />);

    expect(screen.queryByText(/Request/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Response/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
  });
});
