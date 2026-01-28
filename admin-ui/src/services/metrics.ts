import { apiService } from './api';
import {
  MetricsData,
  TimeRange,
  MetricPoint,
  TimeSeriesMetric,
  SLOMetrics,
  MetricsSummary,
  ApiResponse,
} from '../types';

/**
 * Metrics Service
 * Handles fetching and processing metrics data from Prometheus/backend
 */

// Helper to get time range in milliseconds
const getTimeRangeMs = (range: TimeRange): number => {
  const ranges: Record<TimeRange, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return ranges[range];
};

// Helper to generate mock time series data
const generateMockTimeSeries = (
  range: TimeRange,
  baseValue: number,
  variance: number,
  unit: string
): TimeSeriesMetric => {
  const now = Date.now();
  const rangeMs = getTimeRangeMs(range);
  const points = 50; // Number of data points
  const interval = rangeMs / points;

  const data: MetricPoint[] = [];
  for (let i = 0; i < points; i++) {
    const timestamp = now - rangeMs + i * interval;
    const randomVariance = (Math.random() - 0.5) * variance * 2;
    const value = Math.max(0, baseValue + randomVariance);
    data.push({ timestamp, value });
  }

  return {
    name: unit,
    data,
    unit,
  };
};

// Mock SLO data
const generateMockSLO = (): SLOMetrics => {
  return {
    availability: {
      current: 99.95,
      target: 99.9,
      budget: 0.05, // 0.05% error budget remaining
    },
    latency: {
      p50: 45,
      p95: 185,
      p99: 420,
      targetP95: 200,
      targetP99: 500,
    },
    errorRate: {
      current: 0.05,
      target: 0.1,
    },
  };
};

// Mock summary data
const generateMockSummary = (): MetricsSummary => {
  return {
    totalRequests: 1234567,
    avgLatency: 78,
    errorRate: 0.05,
    uptime: 99.95,
  };
};

class MetricsService {
  /**
   * Fetch metrics data for a given time range
   */
  async fetchMetrics(timeRange: TimeRange = '24h'): Promise<ApiResponse<MetricsData>> {
    try {
      // TODO: Replace with actual API call when backend is ready
      // const response = await apiService.get<MetricsData>(`/api/metrics?range=${timeRange}`);
      // return response;

      // Mock data for development
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay

      const mockData: MetricsData = {
        summary: generateMockSummary(),
        requestRate: generateMockTimeSeries(timeRange, 150, 50, 'req/s'),
        latency: {
          p50: generateMockTimeSeries(timeRange, 45, 15, 'ms'),
          p95: generateMockTimeSeries(timeRange, 185, 30, 'ms'),
          p99: generateMockTimeSeries(timeRange, 420, 80, 'ms'),
        },
        errorRate: generateMockTimeSeries(timeRange, 0.05, 0.02, '%'),
        statusCodes: {
          '2xx': 98234,
          '3xx': 1256,
          '4xx': 423,
          '5xx': 87,
        },
        slo: generateMockSLO(),
        circuitBreakers: {
          open: 0,
          halfOpen: 1,
          closed: 12,
        },
      };

      return {
        success: true,
        data: mockData,
      };
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      return {
        success: false,
        error: 'Failed to fetch metrics data',
      };
    }
  }

  /**
   * Fetch SLO metrics
   */
  async fetchSLO(): Promise<ApiResponse<SLOMetrics>> {
    try {
      // TODO: Replace with actual API call
      // const response = await apiService.get<SLOMetrics>('/api/metrics/slo');
      // return response;

      await new Promise((resolve) => setTimeout(resolve, 300));

      return {
        success: true,
        data: generateMockSLO(),
      };
    } catch (error) {
      console.error('Failed to fetch SLO:', error);
      return {
        success: false,
        error: 'Failed to fetch SLO data',
      };
    }
  }

  /**
   * Calculate time range bounds
   */
  getTimeRangeBounds(range: TimeRange): { start: number; end: number } {
    const end = Date.now();
    const start = end - getTimeRangeMs(range);
    return { start, end };
  }
}

export const metricsService = new MetricsService();
