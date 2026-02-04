import {
  formatMetricValue,
  formatLargeNumber,
  formatTimestamp,
  formatRelativeTime,
  calculateTrend,
  aggregateMetrics,
  calculatePercentile,
  getSLOStatusColor,
  formatDuration,
  calculateErrorBudget,
} from '../metricsHelpers';
import { MetricPoint } from '../../types';

describe('metricsHelpers', () => {
  describe('formatMetricValue', () => {
    it('should format values with appropriate units', () => {
      expect(formatMetricValue(1234.567, 'ms')).toBe('1234.57ms');
      expect(formatMetricValue(45.123, 'req/s')).toBe('45.12req/s');
      expect(formatMetricValue(99.9, '%')).toBe('99.90%');
    });

    it('should handle zero values', () => {
      expect(formatMetricValue(0, 'ms')).toBe('0.00ms');
      expect(formatMetricValue(0, '%')).toBe('0.00%');
    });

    it('should handle very small values', () => {
      expect(formatMetricValue(0.001, 'ms')).toBe('0.00ms');
      expect(formatMetricValue(0.999, 'req/s')).toBe('1.00req/s');
    });
  });

  describe('formatLargeNumber', () => {
    it('should format numbers with K/M/B suffixes', () => {
      expect(formatLargeNumber(999)).toBe('999');
      expect(formatLargeNumber(1000)).toBe('1.0K');
      expect(formatLargeNumber(1500)).toBe('1.5K');
      expect(formatLargeNumber(1000000)).toBe('1.0M');
      expect(formatLargeNumber(2500000)).toBe('2.5M');
      expect(formatLargeNumber(1000000000)).toBe('1.0B');
    });

    it('should handle zero and negative values', () => {
      expect(formatLargeNumber(0)).toBe('0');
      expect(formatLargeNumber(-1000)).toBe('-1.0K');
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamps with default format', () => {
      const timestamp = new Date('2024-01-15T10:30:00').getTime();
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toMatch(/10:30/);
    });

    it('should format timestamps with custom format', () => {
      const timestamp = new Date('2024-01-15T10:30:00').getTime();
      const formatted = formatTimestamp(timestamp, 'yyyy-MM-dd');
      expect(formatted).toBe('2024-01-15');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format recent times', () => {
      const now = Date.now();
      const twoMinutesAgo = now - 2 * 60 * 1000;
      const oneHourAgo = now - 60 * 60 * 1000;

      expect(formatRelativeTime(twoMinutesAgo)).toContain('minute');
      expect(formatRelativeTime(oneHourAgo)).toContain('hour');
    });
  });

  describe('calculateTrend', () => {
    it('should detect increasing trend', () => {
      expect(calculateTrend(150, 100)).toBe('up');
      expect(calculateTrend(105, 100)).toBe('up');
    });

    it('should detect decreasing trend', () => {
      expect(calculateTrend(50, 100)).toBe('down');
      expect(calculateTrend(95, 100)).toBe('down');
    });

    it('should detect stable trend', () => {
      expect(calculateTrend(100, 100)).toBe('stable');
      expect(calculateTrend(101, 100)).toBe('stable');
      expect(calculateTrend(99, 100)).toBe('stable');
    });

    it('should handle edge cases', () => {
      expect(calculateTrend(100, 0)).toBe('up');
      expect(calculateTrend(0, 100)).toBe('down');
      expect(calculateTrend(0, 0)).toBe('stable');
    });
  });

  describe('aggregateMetrics', () => {
    const mockData: MetricPoint[] = [
      { timestamp: 1000, value: 10 },
      { timestamp: 2000, value: 20 },
      { timestamp: 3000, value: 30 },
      { timestamp: 4000, value: 40 },
      { timestamp: 5000, value: 50 },
    ];

    it('should aggregate metrics by interval', () => {
      const aggregated = aggregateMetrics(mockData, 2000);
      expect(aggregated.length).toBeLessThan(mockData.length);
    });

    it('should calculate average values in intervals', () => {
      const aggregated = aggregateMetrics(mockData, 2000);
      expect(aggregated[0].value).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const aggregated = aggregateMetrics([], 1000);
      expect(aggregated).toEqual([]);
    });
  });

  describe('calculatePercentile', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    it('should calculate p50 (median)', () => {
      const p50 = calculatePercentile(values, 50);
      expect(p50).toBe(55);
    });

    it('should calculate p95', () => {
      const p95 = calculatePercentile(values, 95);
      expect(p95).toBeGreaterThan(90);
    });

    it('should calculate p99', () => {
      const p99 = calculatePercentile(values, 99);
      expect(p99).toBeGreaterThan(95);
    });

    it('should handle edge cases', () => {
      expect(calculatePercentile([100], 50)).toBe(100);
      expect(calculatePercentile([], 50)).toBe(0);
    });
  });

  describe('getSLOStatusColor', () => {
    it('should return success color when meeting SLO', () => {
      expect(getSLOStatusColor(99.95, 99.9)).toBe('success');
      expect(getSLOStatusColor(100, 99.9)).toBe('success');
    });

    it('should return warning color when approaching SLO', () => {
      expect(getSLOStatusColor(99.9, 99.9)).toBe('warning');
      expect(getSLOStatusColor(99.85, 99.9)).toBe('warning');
    });

    it('should return error color when violating SLO', () => {
      expect(getSLOStatusColor(99.5, 99.9)).toBe('error');
      expect(getSLOStatusColor(98, 99.9)).toBe('error');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds correctly', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds correctly', () => {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(5500)).toBe('5.50s');
    });

    it('should format minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1.00m');
      expect(formatDuration(90000)).toBe('1.50m');
    });

    it('should format hours correctly', () => {
      expect(formatDuration(3600000)).toBe('1.00h');
      expect(formatDuration(7200000)).toBe('2.00h');
    });
  });

  describe('calculateErrorBudget', () => {
    it('should calculate error budget correctly', () => {
      const budget = calculateErrorBudget(99.95, 99.9, 30 * 24 * 60 * 60 * 1000);
      expect(budget).toBeGreaterThanOrEqual(0);
    });

    it('should return zero when SLO is violated', () => {
      const budget = calculateErrorBudget(99.8, 99.9, 30 * 24 * 60 * 60 * 1000);
      expect(budget).toBe(0);
    });

    it('should handle perfect uptime', () => {
      const budget = calculateErrorBudget(100, 99.9, 30 * 24 * 60 * 60 * 1000);
      expect(budget).toBeGreaterThan(0);
    });
  });
});
