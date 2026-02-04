import express, { Request, Response } from 'express';
import axios from 'axios';
import database from '../src/database/index';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MetricsPublisher } = require('../src/services/metricsPublisher');

const router = express.Router();

/**
 * Metrics API
 * Provides JSON API for Prometheus metrics for the dashboard
 * Queries the existing /metrics endpoint and formats data
 */

/**
 * GET /api/metrics
 * @desc Get metrics data for dashboard
 * @query range - Time range (1h, 6h, 24h, 7d, 30d) - currently unused, mock data
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.range as string) || '24h';
    
    // Fetch raw Prometheus metrics from /metrics endpoint
    const metricsResponse = await axios.get('http://localhost:3000/metrics');
    const metricsText = metricsResponse.data;
    
    // Parse metrics (simple text parsing)
    const metrics = parsePrometheusMetrics(metricsText);
    
    // Calculate summary statistics
    const totalRequests = getMetricValue(metrics, 'http_requests_total') || 0;
    const avgLatency = calculateAverageLatency(metrics);
    const errorRate = calculateErrorRate(metrics);
    const uptime = 100 - errorRate;
    
    // Get status code breakdown
    const statusCodes = getStatusCodeBreakdown(metrics);
    
    // Generate time series data (simplified - real implementation would query time-series DB)
    const now = Date.now();
    const rangeMs = getTimeRangeMs(timeRange);
    const points = 50;
    const interval = rangeMs / points;
    
    const requestRateData = [];
    const latencyP50Data = [];
    const latencyP95Data = [];
    const latencyP99Data = [];
    const errorRateData = [];
    
    for (let i = 0; i < points; i++) {
      const timestamp = now - rangeMs + i * interval;
      requestRateData.push({ timestamp, value: Math.max(0, totalRequests / points + Math.random() * 10) });
      latencyP50Data.push({ timestamp, value: Math.max(0, avgLatency * 0.5 + Math.random() * 10) });
      latencyP95Data.push({ timestamp, value: Math.max(0, avgLatency * 1.5 + Math.random() * 20) });
      latencyP99Data.push({ timestamp, value: Math.max(0, avgLatency * 2.0 + Math.random() * 30) });
      errorRateData.push({ timestamp, value: Math.max(0, errorRate + (Math.random() - 0.5) * 0.5) });
    }
    
    // Circuit breaker stats (mocked for now)
    const circuitBreakerStats = {
      open: 0,
      halfOpen: 0,
      closed: 2,
    };
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRequests,
          avgLatency: Math.round(avgLatency),
          errorRate: parseFloat(errorRate.toFixed(2)),
          uptime: parseFloat(uptime.toFixed(2)),
        },
        requestRate: {
          name: 'Request Rate',
          data: requestRateData,
          unit: 'req/s',
        },
        latency: {
          p50: { name: 'P50 Latency', data: latencyP50Data, unit: 'ms' },
          p95: { name: 'P95 Latency', data: latencyP95Data, unit: 'ms' },
          p99: { name: 'P99 Latency', data: latencyP99Data, unit: 'ms' },
        },
        errorRate: {
          name: 'Error Rate',
          data: errorRateData,
          unit: '%',
        },
        statusCodes,
        circuitBreakers: circuitBreakerStats,
      },
    });
  } catch (error: any) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/metrics/live
 * @desc Get live metrics derived from the database (same data shape as SSE stream payload)
 *
 * This is the easiest public JSON endpoint to validate that routes are generating metrics
 * without needing an SSE client.
 */
router.get('/live', async (_req: Request, res: Response) => {
  try {
    // Reuse the running publisher if present, otherwise create a short-lived instance.
    const globalPublisher = (global as any).metricsPublisher;
    if (globalPublisher && typeof globalPublisher.getMetrics === 'function') {
      const metrics = await globalPublisher.getMetrics();
      return res.json({ success: true, data: metrics });
    }

    // Ensure DB is initialized (safe to call multiple times)
    await database.initialize();

    const publisher = new MetricsPublisher(database.getPool());
    const metrics = await publisher.getMetrics();
    return res.json({ success: true, data: metrics });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch live metrics',
      message: error?.message,
    });
  }
});

/**
 * GET /api/metrics/slo
 * @desc Get SLO (Service Level Objectives) metrics
 */
router.get('/slo', async (_req: Request, res: Response) => {
  try {
    // Fetch raw Prometheus metrics
    const metricsResponse = await axios.get('http://localhost:3000/metrics');
    const metricsText = metricsResponse.data;
    const metrics = parsePrometheusMetrics(metricsText);
    
    // Calculate SLO metrics
    const errorRate = calculateErrorRate(metrics);
    const availability = 100 - errorRate;
    const target = 99.9;
    const budget = availability - target;
    
    const avgLatency = calculateAverageLatency(metrics);
    const p50 = Math.round(avgLatency * 0.6);
    const p95 = Math.round(avgLatency * 1.8);
    const p99 = Math.round(avgLatency * 2.5);
    
    res.json({
      success: true,
      data: {
        availability: {
          current: parseFloat(availability.toFixed(2)),
          target,
          budget: parseFloat(budget.toFixed(2)),
        },
        latency: {
          p50,
          p95,
          p99,
          targetP95: 200,
          targetP99: 500,
        },
        errorRate: {
          current: parseFloat(errorRate.toFixed(2)),
          target: 0.1,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching SLO:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SLO metrics',
      message: error.message,
    });
  }
});

// Helper functions
function parsePrometheusMetrics(text: string): Map<string, number> {
  const metrics = new Map<string, number>();
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*(?:{[^}]*})?) ([0-9.eE+-]+)/);
    if (match && match[1] && match[2]) {
      const name = match[1];
      const value = match[2];
      const metricName = name.split('{')[0] || name; // Remove labels
      const currentValue = metrics.get(metricName) || 0;
      metrics.set(metricName, currentValue + parseFloat(value));
    }
  }
  
  return metrics;
}

function getMetricValue(metrics: Map<string, number>, name: string): number {
  return metrics.get(name) || 0;
}

function calculateAverageLatency(metrics: Map<string, number>): number {
  const sum = getMetricValue(metrics, 'http_request_duration_ms_sum');
  const count = getMetricValue(metrics, 'http_request_duration_ms_count');
  return count > 0 ? sum / count : 50;
}

function calculateErrorRate(metrics: Map<string, number>): number {
  const total = getMetricValue(metrics, 'http_requests_total');
  // Note: This is simplified - would need to parse labels for actual error counting
  return total > 0 ? Math.min((Math.random() * 2), 1) : 0.5;
}

function getStatusCodeBreakdown(_metrics: Map<string, number>): Record<string, number> {
  // Simplified - would need to parse labels from Prometheus metrics
  return {
    '2xx': 980,
    '3xx': 10,
    '4xx': 8,
    '5xx': 2,
  };
}

function getTimeRangeMs(range: string): number {
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return ranges[range] || ranges['24h']!;
}

export default router;
