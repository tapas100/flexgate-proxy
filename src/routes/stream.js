const express = require('express');
const { jetStreamService } = require('../services/jetstream');
const { logger } = require('../logger');
const { v4: uuidv4 } = require('uuid');
const { database } = require('../database');
const { MetricsPublisher } = require('../services/metricsPublisher');

const router = express.Router();

/**
 * Server-Sent Events endpoint for real-time metrics
 * GET /api/stream/metrics
 */
router.get('/metrics', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const clientId = uuidv4();
  logger.info(`Client ${clientId} connected to metrics stream`);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  let isConnected = true;
  let lastSentTimestampMs = 0;

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (isConnected) {
      res.write(': heartbeat\n\n');
    }
  }, 30000); // Every 30 seconds

  /**
   * Fallback: Poll database directly when JetStream is not available
   */
  const pollMetrics = async () => {
    logger.info(`Client ${clientId} using polling fallback (JetStream unavailable)`);
    
    const sendMetrics = async () => {
      if (!isConnected) return;
      
      try {
        const metrics = await collectMetrics();
        const ts = Date.parse(metrics?.timestamp || '') || Date.now();

        // Prevent sending older snapshots after newer ones
        if (ts < lastSentTimestampMs) return;
        lastSentTimestampMs = ts;

        res.write(`data: ${JSON.stringify(metrics)}\n\n`);
      } catch (error) {
        logger.error(`Error polling metrics for client ${clientId}:`, error);
      }
    };

    // Send initial metrics
    await sendMetrics();

    // Poll every 5 seconds
    const pollInterval = setInterval(sendMetrics, 5000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
    });

    return pollInterval;
  };

  /**
   * Collect metrics in a single consistent way.
   * This should match /api/metrics/live to avoid confusing differences.
   */
  const collectMetrics = async () => {
    // Prefer the running publisher if present (single source of truth)
    const globalPublisher = global.metricsPublisher;
    if (globalPublisher && typeof globalPublisher.getMetrics === 'function') {
      return globalPublisher.getMetrics();
    }

    // Ensure DB is initialized and create a short-lived publisher
    await database.initialize();
    const publisher = new MetricsPublisher(database.getPool());
    return publisher.getMetrics();
  };

  /**
   * Stream metrics using JetStream
   */
  const consumeMetrics = async () => {
    try {
      if (!jetStreamService.isConnected()) {
        logger.warn(`Client ${clientId}: JetStream not connected, using polling fallback`);
        await pollMetrics();
        return;
      }

      logger.info(`Client ${clientId} using JetStream streaming`);

      // Get the JetStream client
      const js = jetStreamService.js;
      if (!js) {
        logger.warn(`Client ${clientId}: JetStream client not initialized, using polling fallback`);
        await pollMetrics();
        return;
      }

      // Subscribe to metrics stream with ephemeral consumer
      const consumer = await js.consumers.get('METRICS', 'metrics-consumer');
      const messages = await consumer.consume({
        max_messages: -1, // Infinite
        expires: 300000, // 5 minutes
      });

      for await (const msg of messages) {
        if (!isConnected) {
          messages.close();
          break;
        }

        try {
          // Decode message
          const data = JSON.parse(new TextDecoder().decode(msg.data));

          const ts = Date.parse(data?.timestamp || '') || Date.now();

          // Prevent sending older snapshots after newer ones (can happen on reconnects)
          if (ts < lastSentTimestampMs) {
            msg.ack();
            continue;
          }
          lastSentTimestampMs = ts;
          
          // Send to client
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          
          // Acknowledge message
          msg.ack();
        } catch (error) {
          logger.error('Error processing message:', error);
          msg.nak(); // Negative acknowledgment
        }
      }
    } catch (error) {
      logger.error(`Stream error for client ${clientId}:`, error);
      logger.info(`Client ${clientId}: Falling back to polling`);
      await pollMetrics();
    } finally {
      isConnected = false;
      clearInterval(heartbeat);
      logger.info(`Client ${clientId} stream ended`);
      if (res.writable) {
        res.end();
      }
    }
  };

  // Start consuming (will auto-fallback to polling if JetStream unavailable)
  consumeMetrics().catch(err => {
    logger.error('Consume metrics error:', err);
    isConnected = false;
    clearInterval(heartbeat);
    if (res.writable) {
      res.end();
    }
  });

  // Cleanup on client disconnect
  req.on('close', () => {
    isConnected = false;
    clearInterval(heartbeat);
    logger.info(`Client ${clientId} disconnected from metrics stream`);
    res.end();
  });
});

// Live logs stream (SSE)
// Sends newline-delimited JSON log entries as `data:` events.
// Note: this is a lightweight implementation intended for the Admin UI Log Viewer.
router.get('/logs', async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ type: 'logs', connected: true, ts: Date.now() })}\n\n`);

  const intervalMs = Math.max(250, Math.min(5000, parseInt(req.query.interval, 10) || 1000));
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
  let lastTotal = -1;

  const readLogs = async () => {
    try {
      // Use the existing logs API to avoid duplicating file parsing logic.
      // We call it internally via a direct import to keep this endpoint stable.
      const logsRouter = require('../../routes/logs').default || require('../../routes/logs');
      // If we can't resolve the router (unexpected), just noop.
      if (!logsRouter) return;
    } catch {
      // ignore
    }
  };

  // Simple internal fetch via filesystem by reusing the same logic as routes/logs.ts is not trivial in JS.
  // Instead, we implement a minimal tail-like reader here.
  const fs = require('fs');
  const path = require('path');
  const LOG_DIR = path.join(process.cwd(), 'logs');
  const COMBINED_LOG = path.join(LOG_DIR, 'combined.log');
  const ERROR_LOG = path.join(LOG_DIR, 'error.log');

  const parseLines = (content) => {
    const lines = content.split('\n').filter((l) => l.trim());
    return lines
      .map((line, index) => {
        try {
          const parsed = JSON.parse(line);
          return {
            id: `log-${Date.now()}-${index}`,
            timestamp: parsed.timestamp || new Date().toISOString(),
            level: (parsed.level || 'INFO').toUpperCase(),
            message: parsed.message || line,
            correlationId: parsed.correlationId,
            service: parsed.service || 'proxy-server',
            hostname: parsed.hostname,
            pid: parsed.pid,
            ...parsed,
          };
        } catch {
          return {
            id: `log-${Date.now()}-${index}`,
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: line,
            service: 'proxy-server',
          };
        }
      })
      .reverse();
  };

  const tick = async () => {
    try {
      const level = (req.query.level || '').toString().toUpperCase();
      const search = (req.query.search || '').toString().toLowerCase();
      const logPath = level === 'ERROR' || level === 'FATAL' ? ERROR_LOG : COMBINED_LOG;

      let content = '';
      try {
        content = fs.readFileSync(logPath, 'utf-8');
      } catch {
        content = '';
      }

      let logs = content ? parseLines(content) : [];
      if (level) logs = logs.filter((l) => l.level === level);
      if (search) logs = logs.filter((l) => JSON.stringify(l).toLowerCase().includes(search));

      const total = logs.length;
      const page = logs.slice(0, limit);

      // only push when something changes to reduce noise
      if (total !== lastTotal) {
        lastTotal = total;
        res.write(`event: logs\n`);
        res.write(`data: ${JSON.stringify({ logs: page, total, limit, ts: Date.now() })}\n\n`);
      }
    } catch (err) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Failed to stream logs', message: err?.message, ts: Date.now() })}\n\n`);
    }
  };

  const timer = setInterval(tick, intervalMs);
  tick();

  req.on('close', () => {
    clearInterval(timer);
  });
});

/**
 * Get stream statistics
 * GET /api/stream/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const metricsInfo = await jetStreamService.getStreamInfo('METRICS');
    const alertsInfo = await jetStreamService.getStreamInfo('ALERTS');

    res.json({
      success: true,
      data: {
        metrics: metricsInfo,
        alerts: alertsInfo,
        connected: jetStreamService.isConnected(),
      },
    });
  } catch (error) {
    logger.error('Error getting stream stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stream statistics',
    });
  }
});

module.exports = router;
