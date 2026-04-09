// @ts-nocheck
import React from 'react';
import { render, screen } from '@testing-library/react';
import LogStats from '../LogStats';
import type { LogStats as LogStatsType } from '../../types';

const mockStats: LogStatsType = {
  total: 1000,
  byLevel: {
    DEBUG: 200,
    INFO: 500,
    WARN: 200,
    ERROR: 90,
    FATAL: 10,
  },
  bySource: {
    proxy: 400,
    auth: 250,
    metrics: 150,
    admin: 100,
    system: 100,
  },
  errorRate: 10.0,
  avgLatency: 125.5,
};

describe('LogStats', () => {
  it('should render total log count', () => {
    render(<LogStats stats={mockStats} />);

    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  it('should render counts by log level', () => {
    render(<LogStats stats={mockStats} />);

    expect(screen.getByText(/200.*DEBUG/i)).toBeInTheDocument();
    expect(screen.getByText(/500.*INFO/i)).toBeInTheDocument();
    expect(screen.getByText(/200.*WARN/i)).toBeInTheDocument();
    expect(screen.getByText(/90.*ERROR/i)).toBeInTheDocument();
    expect(screen.getByText(/10.*FATAL/i)).toBeInTheDocument();
  });

  it('should render counts by source', () => {
    render(<LogStats stats={mockStats} />);

    expect(screen.getByText(/400.*proxy/i)).toBeInTheDocument();
    expect(screen.getByText(/250.*auth/i)).toBeInTheDocument();
    expect(screen.getByText(/150.*metrics/i)).toBeInTheDocument();
    expect(screen.getByText(/100.*admin/i)).toBeInTheDocument();
    expect(screen.getByText(/100.*system/i)).toBeInTheDocument();
  });

  it('should render error rate', () => {
    render(<LogStats stats={mockStats} />);

    expect(screen.getByText(/10\.0%/)).toBeInTheDocument();
  });

  it('should render average latency', () => {
    render(<LogStats stats={mockStats} />);

    expect(screen.getByText(/125\.50 ms/)).toBeInTheDocument();
  });

  it('should color-code error rate based on threshold', () => {
    const highErrorStats: LogStatsType = {
      ...mockStats,
      errorRate: 15.0,
    };

    const { rerender } = render(<LogStats stats={highErrorStats} />);

    // High error rate should show error color
    const errorRateElement = screen.getByText(/15\.0%/);
    expect(errorRateElement.closest('.MuiChip-root')).toHaveClass('MuiChip-colorError');

    // Low error rate should show success color
    const lowErrorStats: LogStatsType = {
      ...mockStats,
      errorRate: 2.0,
    };

    rerender(<LogStats stats={lowErrorStats} />);

    const lowErrorRateElement = screen.getByText(/2\.0%/);
    expect(lowErrorRateElement.closest('.MuiChip-root')).toHaveClass('MuiChip-colorSuccess');
  });

  it('should render with zero values', () => {
    const zeroStats: LogStatsType = {
      total: 0,
      byLevel: {
        DEBUG: 0,
        INFO: 0,
        WARN: 0,
        ERROR: 0,
        FATAL: 0,
      },
      bySource: {
        proxy: 0,
        auth: 0,
        metrics: 0,
        admin: 0,
        system: 0,
      },
      errorRate: 0,
      avgLatency: 0,
    };

    render(<LogStats stats={zeroStats} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('should format large numbers correctly', () => {
    const largeStats: LogStatsType = {
      ...mockStats,
      total: 1000000,
      avgLatency: 5000.123,
    };

    render(<LogStats stats={largeStats} />);

    expect(screen.getByText('1,000,000')).toBeInTheDocument();
    expect(screen.getByText(/5\.00 s/)).toBeInTheDocument(); // Converts ms to s
  });
});
