import { format, formatDistanceToNow } from 'date-fns';
import { MetricPoint } from '../types';

/**
 * Metrics Helper Utilities
 * Data transformation and formatting functions for metrics display
 */

/**
 * Format a metric value with appropriate unit and precision
 */
export const formatMetricValue = (value: number, unit: string): string => {
  switch (unit) {
    case 'req/s':
    case 'ms':
      return value.toFixed(1);
    case '%':
      return value.toFixed(2);
    case 'count':
      return formatLargeNumber(value);
    default:
      return value.toString();
  }
};

/**
 * Format large numbers with K, M, B suffixes
 */
export const formatLargeNumber = (num: number): string => {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

/**
 * Format timestamp to readable string
 */
export const formatTimestamp = (timestamp: number, formatStr: string = 'MMM dd, HH:mm'): string => {
  return format(new Date(timestamp), formatStr);
};

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 */
export const formatRelativeTime = (timestamp: number): string => {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
};

/**
 * Calculate trend direction and percentage change
 */
export const calculateTrend = (
  current: number,
  previous: number
): { direction: 'up' | 'down' | 'stable'; percentage: number } => {
  const diff = current - previous;
  const percentage = previous === 0 ? 0 : (diff / previous) * 100;

  let direction: 'up' | 'down' | 'stable';
  if (Math.abs(percentage) < 0.1) {
    direction = 'stable';
  } else if (diff > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return { direction, percentage: Math.abs(percentage) };
};

/**
 * Aggregate metrics by time interval
 */
export const aggregateMetrics = (
  data: MetricPoint[],
  intervalMs: number
): MetricPoint[] => {
  if (data.length === 0) return [];

  const aggregated: MetricPoint[] = [];
  const minTimestamp = data[0].timestamp;
  const maxTimestamp = data[data.length - 1].timestamp;

  for (let time = minTimestamp; time <= maxTimestamp; time += intervalMs) {
    const pointsInInterval = data.filter(
      (point) => point.timestamp >= time && point.timestamp < time + intervalMs
    );

    if (pointsInInterval.length > 0) {
      const avgValue =
        pointsInInterval.reduce((sum, point) => sum + point.value, 0) /
        pointsInInterval.length;
      aggregated.push({ timestamp: time, value: avgValue });
    }
  }

  return aggregated;
};

/**
 * Calculate percentile from array of values
 */
export const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
};

/**
 * Get SLO compliance status color
 */
export const getSLOStatusColor = (current: number, target: number): string => {
  const percentage = (current / target) * 100;
  if (percentage >= 100) return '#4caf50'; // Green
  if (percentage >= 95) return '#ff9800'; // Orange
  return '#f44336'; // Red
};

/**
 * Format duration in milliseconds to human-readable string
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

/**
 * Calculate error budget remaining
 */
export const calculateErrorBudget = (
  currentUptime: number,
  targetSLO: number,
  totalTime: number
): number => {
  const allowedDowntime = ((100 - targetSLO) / 100) * totalTime;
  const actualDowntime = ((100 - currentUptime) / 100) * totalTime;
  const budgetRemaining = allowedDowntime - actualDowntime;
  return Math.max(0, budgetRemaining);
};
