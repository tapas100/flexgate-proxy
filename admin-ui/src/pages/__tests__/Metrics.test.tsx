import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Metrics from '../Metrics';
import { metricsService } from '../../services/metrics';

// Mock the metrics service
jest.mock('../../services/metrics');

const mockMetricsData = {
  summary: {
    totalRequests: 1500000,
    avgLatency: 45.23,
    errorRate: 0.5,
    uptime: 99.95,
  },
  requestRate: {
    name: 'Request Rate',
    unit: 'req/s',
    data: [
      { timestamp: Date.now() - 3600000, value: 100 },
      { timestamp: Date.now() - 1800000, value: 150 },
      { timestamp: Date.now(), value: 200 },
    ],
  },
  latency: {
    p50: {
      name: 'p50',
      unit: 'ms',
      data: [
        { timestamp: Date.now() - 3600000, value: 40 },
        { timestamp: Date.now() - 1800000, value: 45 },
        { timestamp: Date.now(), value: 50 },
      ],
    },
    p95: {
      name: 'p95',
      unit: 'ms',
      data: [
        { timestamp: Date.now() - 3600000, value: 150 },
        { timestamp: Date.now() - 1800000, value: 160 },
        { timestamp: Date.now(), value: 170 },
      ],
    },
    p99: {
      name: 'p99',
      unit: 'ms',
      data: [
        { timestamp: Date.now() - 3600000, value: 300 },
        { timestamp: Date.now() - 1800000, value: 320 },
        { timestamp: Date.now(), value: 340 },
      ],
    },
  },
  errorRate: {
    name: 'Error Rate',
    unit: '%',
    data: [
      { timestamp: Date.now() - 3600000, value: 0.3 },
      { timestamp: Date.now() - 1800000, value: 0.4 },
      { timestamp: Date.now(), value: 0.5 },
    ],
  },
  statusCodes: [
    { name: '2xx', value: 1400000 },
    { name: '3xx', value: 50000 },
    { name: '4xx', value: 40000 },
    { name: '5xx', value: 10000 },
  ],
  slo: {
    availability: {
      current: 99.95,
      target: 99.9,
      budget: 21600000,
    },
    latency: {
      p50: 45,
      p95: 120,
      p99: 250,
      targetP95: 200,
      targetP99: 500,
    },
    errorRate: {
      current: 0.5,
      target: 1.0,
    },
  },
  circuitBreakers: {
    open: 2,
    halfOpen: 1,
    closed: 47,
  },
};

describe('Metrics Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (metricsService.fetchMetrics as jest.Mock).mockResolvedValue({
      success: true,
      data: mockMetricsData,
    });
  });

  it('should render without crashing', async () => {
    render(<Metrics />);
    expect(screen.getByText(/system metrics/i)).toBeInTheDocument();
  });

  it('should display loading state initially', () => {
    render(<Metrics />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should load and display metrics data', async () => {
    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText(/1.5M/i)).toBeInTheDocument(); // Total Requests
      expect(screen.getByText(/45.23ms/i)).toBeInTheDocument(); // Avg Latency
      expect(screen.getByText(/99.95%/i)).toBeInTheDocument(); // Uptime
    });
  });

  it('should display all chart components', async () => {
    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText('Request Rate Over Time')).toBeInTheDocument();
      expect(screen.getByText('Latency Percentiles Over Time')).toBeInTheDocument();
      expect(screen.getByText('Status Code Distribution')).toBeInTheDocument();
      expect(screen.getByText('SLO Compliance')).toBeInTheDocument();
    });
  });

  it('should handle time range changes', async () => {
    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText(/1.5M/i)).toBeInTheDocument();
    });

    const button6H = screen.getByRole('button', { name: /6h/i });
    fireEvent.click(button6H);

    await waitFor(() => {
      expect(metricsService.fetchMetrics).toHaveBeenCalledWith('6h');
    });
  });

  it('should handle refresh button click', async () => {
    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText(/1.5M/i)).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(metricsService.fetchMetrics).toHaveBeenCalledTimes(2);
    });
  });

  it('should display error state on fetch failure', async () => {
    (metricsService.fetchMetrics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch metrics',
    });

    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch metrics/i)).toBeInTheDocument();
    });
  });

  it('should handle error retry', async () => {
    (metricsService.fetchMetrics as jest.Mock)
      .mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch metrics',
      })
      .mockResolvedValueOnce({
        success: true,
        data: mockMetricsData,
      });

    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch metrics/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText(/1.5M/i)).toBeInTheDocument();
    });
  });

  it('should display circuit breaker status', async () => {
    render(<Metrics />);

    await waitFor(() => {
      expect(screen.getByText(/circuit breakers/i)).toBeInTheDocument();
      expect(screen.getByText(/open: 2/i)).toBeInTheDocument();
      expect(screen.getByText(/half-open: 1/i)).toBeInTheDocument();
      expect(screen.getByText(/closed: 47/i)).toBeInTheDocument();
    });
  });

  it('should display time range selector', async () => {
    render(<Metrics />);

    expect(screen.getByRole('button', { name: /1h/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /6h/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /24h/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /7d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /30d/i })).toBeInTheDocument();
  });

  it('should display auto-refresh selector', async () => {
    render(<Metrics />);

    expect(screen.getByRole('button', { name: /30s/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1m/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5m/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /off/i })).toBeInTheDocument();
  });
});
