import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LatencyChart from '../LatencyChart';
import { TimeSeriesMetric } from '../../../types';

describe('LatencyChart', () => {
  const mockP50: TimeSeriesMetric = {
    name: 'p50',
    unit: 'ms',
    data: [
      { timestamp: Date.now() - 3600000, value: 50 },
      { timestamp: Date.now() - 1800000, value: 55 },
      { timestamp: Date.now(), value: 60 },
    ],
  };

  const mockP95: TimeSeriesMetric = {
    name: 'p95',
    unit: 'ms',
    data: [
      { timestamp: Date.now() - 3600000, value: 150 },
      { timestamp: Date.now() - 1800000, value: 160 },
      { timestamp: Date.now(), value: 170 },
    ],
  };

  const mockP99: TimeSeriesMetric = {
    name: 'p99',
    unit: 'ms',
    data: [
      { timestamp: Date.now() - 3600000, value: 300 },
      { timestamp: Date.now() - 1800000, value: 320 },
      { timestamp: Date.now(), value: 340 },
    ],
  };

  it('should render without crashing', () => {
    render(<LatencyChart p50={mockP50} p95={mockP95} p99={mockP99} />);
    expect(screen.getByText(/latency percentiles/i)).toBeInTheDocument();
  });

  it('should display chart title', () => {
    render(<LatencyChart p50={mockP50} p95={mockP95} p99={mockP99} />);
    expect(screen.getByText('Latency Percentiles Over Time')).toBeInTheDocument();
  });

  it('should render with empty data', () => {
    const emptyData: TimeSeriesMetric = {
      name: 'p50',
      unit: 'ms',
      data: [],
    };
    render(<LatencyChart p50={emptyData} p95={emptyData} p99={emptyData} />);
    expect(screen.getByText('Latency Percentiles Over Time')).toBeInTheDocument();
  });
});
