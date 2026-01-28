import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RequestRateChart from '../RequestRateChart';
import { TimeSeriesMetric } from '../../../types';

describe('RequestRateChart', () => {
  const mockData: TimeSeriesMetric = {
    name: 'Request Rate',
    unit: 'req/s',
    data: [
      { timestamp: Date.now() - 3600000, value: 100 },
      { timestamp: Date.now() - 1800000, value: 150 },
      { timestamp: Date.now(), value: 200 },
    ],
  };

  it('should render without crashing', () => {
    render(<RequestRateChart data={mockData} />);
    expect(screen.getByText(/request rate/i)).toBeInTheDocument();
  });

  it('should display chart title', () => {
    render(<RequestRateChart data={mockData} />);
    expect(screen.getByText('Request Rate Over Time')).toBeInTheDocument();
  });

  it('should render with empty data', () => {
    const emptyData: TimeSeriesMetric = {
      name: 'Request Rate',
      unit: 'req/s',
      data: [],
    };
    render(<RequestRateChart data={emptyData} />);
    expect(screen.getByText('Request Rate Over Time')).toBeInTheDocument();
  });

  it('should handle single data point', () => {
    const singlePoint: TimeSeriesMetric = {
      name: 'Request Rate',
      unit: 'req/s',
      data: [{ timestamp: Date.now(), value: 100 }],
    };
    render(<RequestRateChart data={singlePoint} />);
    expect(screen.getByText('Request Rate Over Time')).toBeInTheDocument();
  });
});
