const { jetStreamService } = require('./jetstream');
const { logger } = require('../logger');

class MetricsPublisher {
  constructor(db) {
    this.db = db;
    this.publishInterval = null;
    this.PUBLISH_INTERVAL_MS = 5000; // 5 seconds
    this.isRunning = false;
  }

  /**
   * Start publishing metrics periodically
   */
  start() {
    if (this.isRunning) {
      logger.warn('MetricsPublisher already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting MetricsPublisher');

    // Publish immediately
    this.publishMetrics();

    // Then publish every 5 seconds
    this.publishInterval = setInterval(() => {
      this.publishMetrics();
    }, this.PUBLISH_INTERVAL_MS);
  }

  /**
   * Stop publishing
   */
  stop() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }
    this.isRunning = false;
    logger.info('🛑 Stopped MetricsPublisher');
  }

  /**
   * Collect and publish metrics to JetStream
   */
  async publishMetrics() {
    try {
      if (!jetStreamService.isConnected()) {
        logger.warn('JetStream not connected, skipping metrics publish');
        return;
      }

      const metrics = await this.collectMetrics();
      await jetStreamService.publishMetrics(metrics);
      
      logger.debug('Published metrics:', {
        totalRequests: metrics.summary.totalRequests,
        avgLatency: metrics.summary.avgLatency,
        errorRate: metrics.summary.errorRate,
      });
    } catch (error) {
      logger.error('Error publishing metrics:', error);
    }
  }

  /**
   * Collect metrics from database
   */
  async collectMetrics() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // All-time totals (monotonic) - useful for showing a "never decreases" totalRequests
    const allTimeQuery = `
      SELECT
        COUNT(*) as total_requests_all_time,
        COUNT(CASE WHEN status_code >= 500 THEN 1 END) as server_errors_all_time,
        COUNT(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 END) as client_errors_all_time,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests_all_time
      FROM requests
    `;

    // Summary metrics (last 24 hours)
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_requests,
        AVG(response_time_ms) as avg_latency,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_latency,
        COUNT(CASE WHEN status_code >= 500 THEN 1 END) as server_errors,
        COUNT(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 END) as client_errors,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests
      FROM requests
      WHERE timestamp >= $1
    `;

    // Request rate (last hour, grouped by 5-minute buckets)
    // We bucket into 5-minute intervals and then compute req/s as:
    //   requests_in_bucket / 300
    const requestRateQuery = `
      SELECT
        (DATE_TRUNC('hour', timestamp) + (FLOOR(EXTRACT(MINUTE FROM timestamp) / 5) * INTERVAL '5 minutes')) AS time_bucket,
        COUNT(*)::float / 300.0 as requests_per_second
      FROM requests
      WHERE timestamp >= $1
      GROUP BY time_bucket
      ORDER BY time_bucket DESC
      LIMIT 12
    `;

    // Latency percentiles time-series (last hour, same 5-minute buckets as requestRate)
    const latencySeriesQuery = `
      SELECT
        (DATE_TRUNC('hour', timestamp) + (FLOOR(EXTRACT(MINUTE FROM timestamp) / 5) * INTERVAL '5 minutes')) AS time_bucket,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_latency
      FROM requests
      WHERE timestamp >= $1
      GROUP BY time_bucket
      ORDER BY time_bucket DESC
      LIMIT 12
    `;

    // Error rate time-series (last hour, same 5-minute buckets)
    const errorRateSeriesQuery = `
      SELECT
        (DATE_TRUNC('hour', timestamp) + (FLOOR(EXTRACT(MINUTE FROM timestamp) / 5) * INTERVAL '5 minutes')) AS time_bucket,
        (COUNT(CASE WHEN status_code >= 500 THEN 1 END)::float / NULLIF(COUNT(*), 0)::float) * 100.0 as error_rate
      FROM requests
      WHERE timestamp >= $1
      GROUP BY time_bucket
      ORDER BY time_bucket DESC
      LIMIT 12
    `;

    // Status code distribution
    const statusCodesQuery = `
      SELECT 
        status_code,
        COUNT(*) as count
      FROM requests
      WHERE timestamp >= $1
      GROUP BY status_code
      ORDER BY count DESC
    `;

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [allTimeResult, summaryResult, requestRateResult, latencySeriesResult, errorRateSeriesResult, statusCodesResult] = await Promise.all([
      this.db.query(allTimeQuery, []),
      this.db.query(summaryQuery, [oneDayAgo.toISOString()]),
      this.db.query(requestRateQuery, [oneHourAgo.toISOString()]),
      this.db.query(latencySeriesQuery, [oneHourAgo.toISOString()]),
      this.db.query(errorRateSeriesQuery, [oneHourAgo.toISOString()]),
      this.db.query(statusCodesQuery, [oneDayAgo.toISOString()]),
    ]);

    const allTime = allTimeResult.rows[0] || {};
    const totalRequestsAllTime = parseInt(allTime.total_requests_all_time || '0');

    const summary = summaryResult.rows[0];
    const totalRequests = parseInt(summary.total_requests || '0');
    const serverErrors = parseInt(summary.server_errors || '0');
    const errorRate = totalRequests > 0 ? (serverErrors / totalRequests) * 100 : 0;
    const successfulRequests = parseInt(summary.successful_requests || '0');
    const availability = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

  const latencySeriesRows = latencySeriesResult.rows || [];
  const errorRateSeriesRows = errorRateSeriesResult.rows || [];

    return {
      summary: {
        totalRequests,
        totalRequestsAllTime,
        avgLatency: parseFloat(summary.avg_latency || '0').toFixed(2),
        errorRate: errorRate.toFixed(4),
        availability: availability.toFixed(4),
        p50Latency: parseFloat(summary.p50_latency || '0').toFixed(2),
        p95Latency: parseFloat(summary.p95_latency || '0').toFixed(2),
        p99Latency: parseFloat(summary.p99_latency || '0').toFixed(2),
        serverErrors,
        clientErrors: parseInt(summary.client_errors || '0'),
        successfulRequests,
      },
      window: {
        name: '24h',
        start: oneDayAgo.toISOString(),
        end: now.toISOString(),
      },
      requestRate: {
        name: 'Request Rate',
        data: requestRateResult.rows.map(row => ({
          timestamp: new Date(row.time_bucket).toISOString(),
          value: parseFloat(row.requests_per_second || '0').toFixed(2),
        })).reverse(),
        unit: 'req/s',
      },
      latency: {
        p50: {
          name: 'P50 Latency',
          data: latencySeriesRows.map(row => ({
            timestamp: new Date(row.time_bucket).toISOString(),
            value: parseFloat(row.p50_latency || '0').toFixed(2),
          })).reverse(),
          unit: 'ms',
        },
        p95: {
          name: 'P95 Latency',
          data: latencySeriesRows.map(row => ({
            timestamp: new Date(row.time_bucket).toISOString(),
            value: parseFloat(row.p95_latency || '0').toFixed(2),
          })).reverse(),
          unit: 'ms',
        },
        p99: {
          name: 'P99 Latency',
          data: latencySeriesRows.map(row => ({
            timestamp: new Date(row.time_bucket).toISOString(),
            value: parseFloat(row.p99_latency || '0').toFixed(2),
          })).reverse(),
          unit: 'ms',
        },
      },
      // Prefer the canonical key `errorRate` (what the Admin UI expects).
      errorRate: {
        name: 'Error Rate',
        data: errorRateSeriesRows.map(row => ({
          timestamp: new Date(row.time_bucket).toISOString(),
          value: parseFloat(row.error_rate || '0').toFixed(4),
        })).reverse(),
        unit: '%',
      },
      statusCodes: statusCodesResult.rows.map(row => ({
        code: row.status_code,
        count: parseInt(row.count),
      })),
      timestamp: now.toISOString(),
    };
  }

  /**
   * Get metrics on demand (for API endpoint fallback)
   */
  async getMetrics() {
    return this.collectMetrics();
  }
}

module.exports = { MetricsPublisher };
