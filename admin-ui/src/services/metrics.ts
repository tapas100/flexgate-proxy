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

// Fallback mock SLO data (in case backend doesn't provide it)
const generateMockSLO = (): SLOMetrics => {
  return {
    availability: {
      current: 99.95,
      target: 99.9,
      budget: 0.05,
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

class MetricsService {
  /**
   * Fetch metrics data for a given time range
   */
  async fetchMetrics(timeRange: TimeRange = '24h'): Promise<ApiResponse<MetricsData>> {
    try {
      // Fetch real metrics from backend API
      const response = await apiService.get<MetricsData>(`/api/metrics?range=${timeRange}`);
      return response;
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
      // SLO data is included in the main metrics response
      const response = await this.fetchMetrics();
      if (response.success && response.data?.slo) {
        return {
          success: true,
          data: response.data.slo,
        };
      }
      
      // Fallback to mock data if SLO not available
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
