// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LogRow from '../LogRow';
import type { DetailedLogEntry } from '../../types';

const mockLog: DetailedLogEntry = {
  id: 'test-log-1',
  timestamp: Date.now(),
  level: 'ERROR',
  source: 'proxy',
  message: 'Test error message',
  request: {
    method: 'GET',
    path: '/api/test',
  },
  response: {
    statusCode: 500,
    latency: 150,
  },
};

describe('LogRow', () => {
  it('should render log entry correctly', () => {
    render(<LogRow log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.getByText(/proxy/i)).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should display timestamp', () => {
    render(<LogRow log={mockLog} searchQuery="" isRegex={false} />);

    // Timestamp should be displayed in some format
    const timestampElements = screen.getAllByText(/:/);
    expect(timestampElements.length).toBeGreaterThan(0);
  });

  it('should display request method and path', () => {
    render(<LogRow log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText(/GET/i)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/test/i)).toBeInTheDocument();
  });

  it('should display status code', () => {
    render(<LogRow log={mockLog} searchQuery="" isRegex={false} />);

    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('should expand and collapse on click', async () => {
    render(<LogRow log={mockLog} searchQuery="" isRegex={false} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();
    });

    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    });
  });

  it('should show copy button', () => {
    render(<LogRow log={mockLog} searchQuery="" isRegex={false} />);

    const copyButton = screen.getByLabelText(/copy/i);
    expect(copyButton).toBeInTheDocument();
  });

  it('should truncate long messages', () => {
    const longLog = {
      ...mockLog,
      message: 'A'.repeat(200),
    };

    render(<LogRow log={longLog} searchQuery="" isRegex={false} />);

    const messageElement = screen.getByText(/A+/);
    expect(messageElement.textContent.length).toBeLessThan(200);
  });
});
