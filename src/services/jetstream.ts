import { connect, NatsConnection, JetStreamClient, JetStreamManager } from 'nats';
import { logger } from '../logger';

interface MetricsPayload {
  [key: string]: unknown;
}

interface AlertPayload {
  severity?: string;
  [key: string]: unknown;
}

interface StreamInfo {
  name: string;
  subjects: string[] | undefined;
  messages: number;
  bytes: number;
  firstSeq: number;
  lastSeq: number;
  consumerCount: number;
}

class JetStreamService {
  private nc: NatsConnection | null;
  private js: JetStreamClient | null;
  private jsm: JetStreamManager | null;
  private reconnectAttempts: number;

  constructor() {
    this.nc = null;
    this.js = null;
    this.jsm = null;
    this.reconnectAttempts = 0;
  }

  async connect(servers: string[] = ['nats://localhost:4222']): Promise<void> {
    try {
      this.nc = await connect({
        servers,
        name: 'flexgate-proxy',
        maxReconnectAttempts: -1, // Infinite reconnection
        reconnectTimeWait: 2000,  // 2 seconds between reconnects
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

      this.setupEventHandlers();
      await this.setupStreams();

      logger.info('✅ Connected to NATS JetStream');
      this.reconnectAttempts = 0;
    } catch (error) {
      logger.error('❌ Failed to connect to NATS:', { error });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.nc) return;

    (async () => {
      for await (const status of this.nc!.status()) {
        logger.info(`NATS status: ${status.type} - ${(status as any).data || ''}`);

        if (status.type === 'disconnect') {
          logger.warn('NATS disconnected');
        } else if (status.type === 'reconnect') {
          logger.info('NATS reconnected');
          this.reconnectAttempts = 0;
        } else if (status.type === 'error') {
          logger.error('NATS error:', { data: (status as any).data });
        }
      }
    })();
  }

  private async setupStreams(): Promise<void> {
    if (!this.jsm) throw new Error('JetStream manager not initialized');

    const metricsStreamConfig = {
      name: 'METRICS',
      subjects: ['metrics.>'],
      retention: 'limits' as const,
      max_age: 24 * 60 * 60 * 1_000_000_000, // 24 hours in nanoseconds
      max_msgs: 100000,
      max_bytes: 1024 * 1024 * 1024, // 1GB
      storage: 'file' as const,
      discard: 'old' as const,
      duplicate_window: 120_000_000_000, // 2 minutes in nanoseconds
    };

    const alertsStreamConfig = {
      name: 'ALERTS',
      subjects: ['alerts.>'],
      retention: 'limits' as const,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days
      max_msgs: 10000,
      max_bytes: 100 * 1024 * 1024, // 100MB
      storage: 'file' as const,
      discard: 'old' as const,
    };

    for (const [streamConfig, label] of [
      [metricsStreamConfig, 'METRICS'],
      [alertsStreamConfig, 'ALERTS'],
    ] as const) {
      try {
        await this.jsm.streams.add(streamConfig as any);
        logger.info(`✅ JetStream ${label} stream created`);
      } catch (error: any) {
        if (error.message?.includes('stream name already in use')) {
          logger.info(`ℹ️  JetStream ${label} stream already exists`);
          try {
            await this.jsm.streams.update(label, streamConfig as any);
            logger.info(`✅ JetStream ${label} stream updated`);
          } catch (updateError) {
            logger.warn(`Could not update ${label} stream:`, { updateError });
          }
        } else {
          throw error;
        }
      }
    }
  }

  async publishMetrics(metricsData: MetricsPayload): Promise<void> {
    if (!this.js) throw new Error('JetStream not initialized');

    const subject = 'metrics.summary';
    const data = JSON.stringify({ ...metricsData, timestamp: new Date().toISOString() });

    try {
      const ack = await this.js.publish(subject, new TextEncoder().encode(data));
      logger.debug(`Published metrics to JetStream: seq=${ack.seq}, stream=${ack.stream}`);
    } catch (error) {
      logger.error('Error publishing metrics to JetStream:', { error });
      throw error;
    }
  }

  async publishAlert(alert: AlertPayload): Promise<void> {
    if (!this.js) throw new Error('JetStream not initialized');

    const subject = `alerts.${alert.severity ?? 'info'}`;
    const data = JSON.stringify({ ...alert, timestamp: new Date().toISOString() });

    try {
      const ack = await this.js.publish(subject, new TextEncoder().encode(data));
      logger.debug(`Published alert to JetStream: seq=${ack.seq}`);
    } catch (error) {
      logger.error('Error publishing alert to JetStream:', { error });
      throw error;
    }
  }

  async getStreamInfo(streamName = 'METRICS'): Promise<StreamInfo | null> {
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
      logger.error(`Error getting stream info for ${streamName}:`, { error });
      return null;
    }
  }

  async createConsumer(streamName = 'METRICS', consumerName = 'metrics-consumer'): Promise<void> {
    if (!this.jsm) throw new Error('JetStream manager not initialized');

    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        // eslint-disable-next-line -- nats ConsumerConfig types require cast
        ack_policy: 'explicit' as any,
        // eslint-disable-next-line -- nats ConsumerConfig types require cast
        deliver_policy: 'all' as any,
        filter_subject: 'metrics.>',
        max_deliver: 3,
        ack_wait: 30_000_000_000, // 30 seconds in nanoseconds
      });
      logger.info(`✅ Created consumer ${consumerName} for stream ${streamName}`);
    } catch (error: any) {
      if (error.message?.includes('consumer name already in use')) {
        logger.info(`ℹ️  Consumer ${consumerName} already exists`);
      } else {
        throw error;
      }
    }
  }

  isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }

  async close(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      logger.info('🔌 Disconnected from NATS JetStream');
    }
  }
}

// Singleton instance
export const jetStreamService = new JetStreamService();
export { JetStreamService };
