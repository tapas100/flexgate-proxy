import { metricsService } from '../metrics';
import { TimeRange } from '../../types';

describe('MetricsService', () => {
  describe('fetchMetrics', () => {
    it('should fetch metrics successfully', async () => {
      const response = await metricsService.fetchMetrics('24h');
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.summary).toBeDefined();
      expect(response.data?.requestRate).toBeDefined();
      expect(response.data?.latency).toBeDefined();
      expect(response.data?.errorRate).toBeDefined();
      expect(response.data?.statusCodes).toBeDefined();
      expect(response.data?.slo).toBeDefined();
      expect(response.data?.circuitBreakers).toBeDefined();
    });

    it('should fetch metrics for different time ranges', async () => {
      const timeRanges: TimeRange[] = ['1h', '6h', '24h', '7d', '30d'];
      
      for (const range of timeRanges) {
        const response = await metricsService.fetchMetrics(range);
        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
      }
    });

    it('should return valid summary data', async () => {
      const response = await metricsService.fetchMetrics('24h');
      
      expect(response.data?.summary.totalRequests).toBeGreaterThan(0);
      expect(response.data?.summary.avgLatency).toBeGreaterThanOrEqual(0);
      expect(response.data?.summary.errorRate).toBeGreaterThanOrEqual(0);
      expect(response.data?.summary.uptime).toBeGreaterThanOrEqual(0);
      expect(response.data?.summary.uptime).toBeLessThanOrEqual(100);
    });

    it('should return valid time series data', async () => {
      const response = await metricsService.fetchMetrics('24h');
      
      expect(response.data?.requestRate.data.length).toBeGreaterThan(0);
      expect(response.data?.requestRate.unit).toBe('req/s');
      
      const firstPoint = response.data?.requestRate.data[0];
      expect(firstPoint?.timestamp).toBeGreaterThan(0);
      expect(firstPoint?.value).toBeGreaterThanOrEqual(0);
    });

    it('should return valid SLO data', async () => {
      const response = await metricsService.fetchMetrics('24h');
      
      const slo = response.data?.slo;
      expect(slo?.availability.current).toBeGreaterThanOrEqual(0);
      expect(slo?.availability.target).toBe(99.9);
      expect(slo?.latency.targetP95).toBe(200);
      expect(slo?.latency.targetP99).toBe(500);
    });

    it('should return valid circuit breaker data', async () => {
      const response = await metricsService.fetchMetrics('24h');
      
      const cb = response.data?.circuitBreakers;
      expect(cb?.open).toBeGreaterThanOrEqual(0);
      expect(cb?.halfOpen).toBeGreaterThanOrEqual(0);
      expect(cb?.closed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fetchSLO', () => {
    it('should fetch SLO metrics successfully', async () => {
      const response = await metricsService.fetchSLO();
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.availability).toBeDefined();
      expect(response.data?.latency).toBeDefined();
      expect(response.data?.errorRate).toBeDefined();
    });

    it('should return valid availability SLO', async () => {
      const response = await metricsService.fetchSLO();
      
      expect(response.data?.availability.current).toBeGreaterThanOrEqual(0);
      expect(response.data?.availability.current).toBeLessThanOrEqual(100);
      expect(response.data?.availability.target).toBe(99.9);
      expect(response.data?.availability.budget).toBeGreaterThanOrEqual(0);
    });

    it('should return valid latency SLO', async () => {
      const response = await metricsService.fetchSLO();
      
      const latency = response.data?.latency;
      expect(latency).toBeDefined();
      if (latency) {
        expect(latency.p50).toBeGreaterThan(0);
        expect(latency.p95).toBeGreaterThan(latency.p50);
        expect(latency.p99).toBeGreaterThan(latency.p95);
        expect(latency.targetP95).toBe(200);
        expect(latency.targetP99).toBe(500);
      }
    });
  });

  describe('getTimeRangeBounds', () => {
    it('should calculate correct time range bounds', () => {
      const { start, end } = metricsService.getTimeRangeBounds('1h');
      
      expect(end).toBeGreaterThan(start);
      expect(end - start).toBe(60 * 60 * 1000); // 1 hour in ms
    });

    it('should calculate bounds for all time ranges', () => {
      const timeRanges: TimeRange[] = ['1h', '6h', '24h', '7d', '30d'];
      const expectedDurations = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };

      timeRanges.forEach(range => {
        const { start, end } = metricsService.getTimeRangeBounds(range);
        expect(end - start).toBe(expectedDurations[range]);
      });
    });
  });
});
