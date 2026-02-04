const { connect } = require('nats');
const { logger } = require('../logger');

class JetStreamService {
  constructor() {
    this.nc = null;
    this.js = null;
    this.jsm = null;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECT_ATTEMPTS = 10;
  }

  async connect(servers = ['nats://localhost:4222']) {
    try {
      this.nc = await connect({ 
        servers,
        name: 'flexgate-proxy',
        maxReconnectAttempts: -1, // Infinite reconnection
        reconnectTimeWait: 2000,   // 2 seconds between reconnects
        reconnectJitter: 100,
        reconnectDelayHandler: () => {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectAttempts * 1000, 30000);
          logger.warn(`NATS reconnecting (attempt ${this.reconnectAttempts}), delay: ${delay}ms`);
          return delay;
        },
      });

      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      await this.setupStreams();
      logger.info('✅ Connected to NATS JetStream');
      this.reconnectAttempts = 0;
    } catch (error) {
      logger.error('❌ Failed to connect to NATS:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.nc) return;

    (async () => {
      for await (const status of this.nc.status()) {
        logger.info(`NATS status: ${status.type} - ${status.data || ''}`);
        
        if (status.type === 'disconnect') {
          logger.warn('NATS disconnected');
        } else if (status.type === 'reconnect') {
          logger.info('NATS reconnected');
          this.reconnectAttempts = 0;
        } else if (status.type === 'error') {
          logger.error('NATS error:', status.data);
        }
      }
    })();
  }

  async setupStreams() {
    if (!this.jsm) throw new Error('JetStream manager not initialized');

    // Metrics stream configuration
    const metricsStreamConfig = {
      name: 'METRICS',
      subjects: ['metrics.>'],
      retention: 'limits',
      max_age: 24 * 60 * 60 * 1_000_000_000, // 24 hours in nanoseconds
      max_msgs: 100000,
      max_bytes: 1024 * 1024 * 1024, // 1GB
      storage: 'file',
      discard: 'old',
      duplicate_window: 120_000_000_000, // 2 minutes in nanoseconds
    };

    // Alerts stream configuration
    const alertsStreamConfig = {
      name: 'ALERTS',
      subjects: ['alerts.>'],
      retention: 'limits',
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days
      max_msgs: 10000,
      max_bytes: 100 * 1024 * 1024, // 100MB
      storage: 'file',
      discard: 'old',
    };

    // Create metrics stream
    try {
      await this.jsm.streams.add(metricsStreamConfig);
      logger.info('✅ JetStream METRICS stream created');
    } catch (error) {
      if (error.message && error.message.includes('stream name already in use')) {
        logger.info('ℹ️  JetStream METRICS stream already exists');
        // Update stream if needed
        try {
          await this.jsm.streams.update('METRICS', metricsStreamConfig);
          logger.info('✅ JetStream METRICS stream updated');
        } catch (updateError) {
          logger.warn('Could not update METRICS stream:', updateError);
        }
      } else {
        throw error;
      }
    }

    // Create alerts stream
    try {
      await this.jsm.streams.add(alertsStreamConfig);
      logger.info('✅ JetStream ALERTS stream created');
    } catch (error) {
      if (error.message && error.message.includes('stream name already in use')) {
        logger.info('ℹ️  JetStream ALERTS stream already exists');
        try {
          await this.jsm.streams.update('ALERTS', alertsStreamConfig);
          logger.info('✅ JetStream ALERTS stream updated');
        } catch (updateError) {
          logger.warn('Could not update ALERTS stream:', updateError);
        }
      } else {
        throw error;
      }
    }
  }

  async publishMetrics(metrics) {
    if (!this.js) throw new Error('JetStream not initialized');

    const subject = 'metrics.summary';
    const data = JSON.stringify({
      ...metrics,
      timestamp: new Date().toISOString(),
    });

    try {
      const ack = await this.js.publish(subject, new TextEncoder().encode(data));
      logger.debug(`Published metrics to JetStream: seq=${ack.seq}, stream=${ack.stream}`);
    } catch (error) {
      logger.error('Error publishing metrics to JetStream:', error);
      throw error;
    }
  }

  async publishAlert(alert) {
    if (!this.js) throw new Error('JetStream not initialized');

    const subject = `alerts.${alert.severity || 'info'}`;
    const data = JSON.stringify({
      ...alert,
      timestamp: new Date().toISOString(),
    });

    try {
      const ack = await this.js.publish(subject, new TextEncoder().encode(data));
      logger.debug(`Published alert to JetStream: seq=${ack.seq}`);
    } catch (error) {
      logger.error('Error publishing alert to JetStream:', error);
      throw error;
    }
  }

  /**
   * Get stream info for monitoring
   */
  async getStreamInfo(streamName = 'METRICS') {
    if (!this.jsm) throw new Error('JetStream manager not initialized');

    try {
      const info = await this.jsm.streams.info(streamName);
      return {
        name: info.config.name,
        subjects: info.config.subjects,
        messages: info.state.messages,
        bytes: info.state.bytes,
        firstSeq: info.state.first_seq,
        lastSeq: info.state.last_seq,
        consumerCount: info.state.consumer_count,
      };
    } catch (error) {
      logger.error(`Error getting stream info for ${streamName}:`, error);
      return null;
    }
  }

  /**
   * Create a durable consumer for the metrics stream
   */
  async createConsumer(streamName = 'METRICS', consumerName = 'metrics-consumer') {
    if (!this.jsm) throw new Error('JetStream manager not initialized');

    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: 'explicit',
        deliver_policy: 'all',
        filter_subject: 'metrics.>',
        max_deliver: 3,
        ack_wait: 30_000_000_000, // 30 seconds in nanoseconds
      });
      logger.info(`✅ Created consumer ${consumerName} for stream ${streamName}`);
    } catch (error) {
      if (error.message && error.message.includes('consumer name already in use')) {
        logger.info(`ℹ️  Consumer ${consumerName} already exists`);
      } else {
        throw error;
      }
    }
  }

  isConnected() {
    return this.nc !== null && !this.nc.isClosed();
  }

  async close() {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      logger.info('🔌 Disconnected from NATS JetStream');
    }
  }
}

// Singleton instance
const jetStreamService = new JetStreamService();

module.exports = { jetStreamService, JetStreamService };
