# NATS JetStream Real-Time Metrics Implementation Plan
## Using Podman (Docker Alternative) - No Docker Required!

## Overview
Replace the current polling-based metrics updates with **NATS JetStream** for real-time streaming of metrics data to the admin UI. Using **Podman** as a Docker alternative for running NATS server.

## Architecture

### Current State (Polling)
```
Admin UI (React) 
  → HTTP GET /api/metrics every 30s 
  → Express API 
  → PostgreSQL
```

**Problems:**
- Unnecessary HTTP requests every 30 seconds
- Delayed updates (up to 30 seconds old)
- Increased server load
- Not scalable for multiple admin users

### Proposed State (NATS JetStream)
```
FlexGate Proxy 
  → Publish metrics to NATS JetStream 
  → NATS Server (via Podman container)
  → Admin UI subscribes via Server-Sent Events
  → Real-time updates (< 100ms latency)
```

**Benefits:**
- Real-time updates (push-based)
- Reduced server load
- Better scalability
- Message history with JetStream persistence
- Support for multiple admin UI clients
- Message replay capability
- **Uses Podman** (rootless, daemonless, Docker alternative)

**Why NATS JetStream?**
- ✅ Production-grade message streaming
- ✅ Built-in persistence and replay
- ✅ Consumer groups and scalability
- ✅ Lightweight (50-100MB RAM)
- ✅ Cloud-native and Kubernetes-ready
- ✅ Better than Redis Streams for complex workflows

**Why Podman?**
- ✅ Drop-in Docker replacement
- ✅ Rootless containers (better security)
- ✅ Daemonless (no background process)
- ✅ Compatible with Docker Compose (via podman-compose)
- ✅ Native systemd integration
- ✅ No licensing issues

---

## Implementation Plan

### Phase 1: Infrastructure Setup with Podman

#### 1.1 Install Podman
```bash
# macOS (Homebrew)
brew install podman

# Initialize Podman machine (creates a VM for containers)
podman machine init
podman machine start

# Verify installation
podman --version
podman ps
```

#### 1.2 Run NATS Server with JetStream using Podman
```bash
# Create a directory for NATS data persistence
mkdir -p ~/flexgate-data/nats

# Run NATS with JetStream enabled
podman run -d \
  --name flexgate-nats \
  -p 4222:4222 \
  -p 8222:8222 \
  -p 6222:6222 \
  -v ~/flexgate-data/nats:/data:Z \
  nats:2.10-alpine \
  --jetstream \
  --store_dir=/data \
  --http_port=8222 \
  --max_memory_store=1GB \
  --max_file_store=10GB

# Verify NATS is running
podman ps
curl http://localhost:8222/varz

# View logs
podman logs flexgate-nats

# NATS monitoring UI
open http://localhost:8222
```

#### 1.3 Alternative: Use Podman Compose (Docker Compose compatible)
```bash
# Install podman-compose
pip3 install podman-compose

# Or via Homebrew
brew install podman-compose
```

Create `podman-compose.yml`:
```yaml
version: '3.8'

services:
  nats:
    image: nats:2.10-alpine
    container_name: flexgate-nats
    ports:
      - "4222:4222"    # Client connections
      - "8222:8222"    # HTTP monitoring
      - "6222:6222"    # Cluster routes
    command: 
      - "--jetstream"
      - "--store_dir=/data"
      - "--http_port=8222"
      - "--max_memory_store=1GB"
      - "--max_file_store=10GB"
    volumes:
      - nats-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "nats-server", "--signal", "reload"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  nats-data:
    driver: local
```

Start with:
```bash
podman-compose -f podman-compose.yml up -d

# Or use Podman's native compose support (Podman 4.1+)
podman compose -f podman-compose.yml up -d
```

#### 1.4 Alternative: Coolify Deployment

If you're using **Coolify** for container orchestration:

1. **Add NATS as a new service in Coolify**:
   - Service Type: Generic
   - Image: `nats:2.10-alpine`
   - Ports: `4222:4222, 8222:8222, 6222:6222`
   - Command: `--jetstream --store_dir=/data --http_port=8222`
   - Volumes: Mount persistent storage to `/data`

2. **Environment Variables**:
   ```
   NATS_MAX_MEMORY=1GB
   NATS_MAX_FILE=10GB
   ```

3. **Health Check**:
   ```
   HTTP GET http://localhost:8222/healthz
   ```

#### 1.5 Install NATS Client Dependencies
```bash
# In your FlexGate project
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
npm install nats
npm install --save-dev @types/nats
```

---

### Phase 2: Backend Implementation

#### 2.1 NATS JetStream Service (`src/services/jetstream.ts`)
```typescript
import { connect, NatsConnection, JetStreamClient, JetStreamManager, StreamConfig } from 'nats';
import { logger } from '../logger';

export class JetStreamService {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  async connect(servers: string[] = ['nats://localhost:4222']): Promise<void> {
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

  private setupEventHandlers(): void {
    if (!this.nc) return;

    (async () => {
      for await (const status of this.nc!.status()) {
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

  private async setupStreams(): Promise<void> {
    if (!this.jsm) throw new Error('JetStream manager not initialized');

    // Metrics stream configuration
    const metricsStreamConfig: Partial<StreamConfig> = {
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
    const alertsStreamConfig: Partial<StreamConfig> = {
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
    } catch (error: any) {
      if (error.message?.includes('stream name already in use')) {
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
    } catch (error: any) {
      if (error.message?.includes('stream name already in use')) {
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

  async publishMetrics(metrics: any): Promise<void> {
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

  async publishAlert(alert: any): Promise<void> {
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
  async getStreamInfo(streamName: string = 'METRICS'): Promise<any> {
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
  async createConsumer(streamName: string = 'METRICS', consumerName: string = 'metrics-consumer'): Promise<void> {
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
```

#### 2.2 Metrics Publisher (`src/services/metricsPublisher.ts`)
```typescript
import { jetStreamService } from './jetstream';
import { logger } from '../logger';
import { MetricsData } from '../types';
import { pool } from '../database';

export class MetricsPublisher {
  private publishInterval: NodeJS.Timeout | null = null;
  private readonly PUBLISH_INTERVAL_MS = 5000; // Publish every 5 seconds

  async start(): Promise<void> {
    logger.info('Starting metrics publisher');
    
    // Publish immediately
    await this.publishMetrics();

    // Then publish at regular intervals
    this.publishInterval = setInterval(async () => {
      try {
        await this.publishMetrics();
      } catch (error) {
        logger.error('Error publishing metrics:', error);
      }
    }, this.PUBLISH_INTERVAL_MS);
  }

  private async publishMetrics(): Promise<void> {
    try {
      if (!jetStreamService.isConnected()) {
        logger.warn('JetStream not connected, skipping metrics publish');
        return;
      }

      const metrics = await this.collectMetrics();
      await jetStreamService.publishMetrics(metrics);
      logger.debug('Metrics published to JetStream');
    } catch (error) {
      logger.error('Error in publishMetrics:', error);
    }
  }

  private async collectMetrics(): Promise<MetricsData> {
    // Aggregate metrics from PostgreSQL
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get summary stats
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_requests,
        AVG(response_time) as avg_latency,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as error_rate
      FROM logs
      WHERE created_at >= $1
    `;
    const summaryResult = await pool.query(summaryQuery, [oneDayAgo]);
    const summary = {
      totalRequests: parseInt(summaryResult.rows[0]?.total_requests || 0),
      avgLatency: parseFloat(summaryResult.rows[0]?.avg_latency || 0),
      errorRate: parseFloat(summaryResult.rows[0]?.error_rate || 0),
      uptime: process.uptime(),
    };

    // Get request rate time series (last hour, 5-min buckets)
    const requestRateQuery = `
      SELECT 
        date_trunc('minute', created_at) as time,
        COUNT(*) as value
      FROM logs
      WHERE created_at >= $1
      GROUP BY date_trunc('minute', created_at)
      ORDER BY time ASC
    `;
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const requestRateResult = await pool.query(requestRateQuery, [oneHourAgo]);
    const requestRate = {
      name: 'Request Rate',
      data: requestRateResult.rows.map(row => ({
        timestamp: row.time.toISOString(),
        value: parseInt(row.value),
      })),
      unit: 'req/min',
    };

    // Get status code distribution
    const statusQuery = `
      SELECT 
        CASE 
          WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
          WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
          WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
          WHEN status_code >= 500 THEN '5xx'
        END as status_group,
        COUNT(*) as count
      FROM logs
      WHERE created_at >= $1
      GROUP BY status_group
    `;
    const statusResult = await pool.query(statusQuery, [oneDayAgo]);
    const statusCodes = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    };
    statusResult.rows.forEach(row => {
      if (row.status_group) {
        statusCodes[row.status_group] = parseInt(row.count);
      }
    });

    return {
      summary,
      requestRate,
      statusCodes,
      latency: {
        p50: { name: 'P50', data: [], unit: 'ms' },
        p95: { name: 'P95', data: [], unit: 'ms' },
        p99: { name: 'P99', data: [], unit: 'ms' },
      },
      slo: {
        availability: { target: 99.9, current: 99.5, status: 'warning' },
        latency: { target: 200, current: summary.avgLatency, status: 'ok' },
        errorRate: { target: 1, current: summary.errorRate * 100, status: 'ok' },
      },
      circuitBreakers: {
        closed: 0,
        halfOpen: 0,
        open: 0,
      },
    };
  }

  stop(): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
      logger.info('Stopped metrics publisher');
    }
  }
}

export const metricsPublisher = new MetricsPublisher();
```

#### 2.3 Server-Sent Events Endpoint (`src/routes/stream.ts`)
```typescript
import { Router, Request, Response } from 'express';
import { jetStreamService } from '../services/jetstream';
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * Server-Sent Events endpoint for real-time metrics
 * GET /api/stream/metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
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

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (isConnected) {
      res.write(': heartbeat\n\n');
    }
  }, 30000); // Every 30 seconds

  // Create JetStream consumer
  const consumeMetrics = async () => {
    try {
      if (!jetStreamService.isConnected()) {
        throw new Error('JetStream not connected');
      }

      const js = jetStreamService['js']; // Access private js client
      if (!js) throw new Error('JetStream client not initialized');

      // Subscribe to metrics stream
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
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
    } finally {
      isConnected = false;
      clearInterval(heartbeat);
      logger.info(`Client ${clientId} stream ended`);
      res.end();
    }
  };

  // Start consuming
  consumeMetrics().catch(err => {
    logger.error('Consume metrics error:', err);
    isConnected = false;
    clearInterval(heartbeat);
    res.end();
  });

  // Cleanup on client disconnect
  req.on('close', () => {
    isConnected = false;
    clearInterval(heartbeat);
    logger.info(`Client ${clientId} disconnected from metrics stream`);
    res.end();
  });
});

/**
 * Get stream statistics
 * GET /api/stream/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const metricsInfo = await redisStreamsService.getStreamInfo('metrics:stream');
    const alertsInfo = await redisStreamsService.getStreamInfo('alerts:stream');

    res.json({
      success: true,
      data: {
        metrics: metricsInfo,
        alerts: alertsInfo,
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

export default router;
```

---

### Phase 3: Frontend Implementation

#### 3.1 JetStream Hook (`admin-ui/src/hooks/useJetStream.ts`)
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { MetricsData } from '../types';

interface UseJetStreamOptions {
  url: string;
  reconnectInterval?: number;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const useJetStream = (options: UseJetStreamOptions) => {
  const { url, reconnectInterval = 5000, onError, onConnect, onDisconnect } = options;
  const [data, setData] = useState<MetricsData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('✅ Connected to JetStream');
      setConnected(true);
      setError(null);
      if (onConnect) {
        onConnect();
      }
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'connected') {
          console.log(`Stream connection confirmed. Client ID: ${message.clientId}`);
          return;
        }

        if (message.type === 'error') {
          console.error('❌ Stream error:', message.message);
          return;
        }

        // Update metrics data
        setData(message);
      } catch (err) {
        console.error('Error parsing stream data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      const error = new Error('Stream connection error');
      setError(error);
      setConnected(false);
      
      if (onError) {
        onError(error);
      }

      if (onDisconnect) {
        onDisconnect();
      }

      cleanup();

      // Attempt to reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Attempting to reconnect to Redis stream...');
        connect();
      }, reconnectInterval);
    };

    return eventSource;
  }, [url, reconnectInterval, onError, onConnect, onDisconnect, cleanup]);

  useEffect(() => {
    connect();

    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  return { data, connected, error };
};
```

#### 3.2 Update Dashboard Component (`admin-ui/src/pages/Dashboard.tsx`)
```typescript
import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
} from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Error as ErrorIcon,
  WifiOff,
} from '@mui/icons-material';
import { useJetStream } from '../hooks/useJetStream';

const Dashboard: React.FC = () => {
  const { data: metricsData, connected, error } = useJetStream({
    url: '/api/stream/metrics',
    reconnectInterval: 5000,
    onError: (err) => console.error('Stream error:', err),
    onConnect: () => console.log('Dashboard stream connected'),
    onDisconnect: () => console.log('Dashboard stream disconnected'),
  });

  // Format number helper
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const stats = useMemo(() => {
    if (!metricsData) {
      return [
        { title: 'Total Requests', value: '...', icon: <TrendingUp />, color: '#1976d2' },
        { title: 'Avg Response Time', value: '...', icon: <Speed />, color: '#2e7d32' },
        { title: 'Success Rate', value: '...', icon: <CheckCircle />, color: '#ed6c02' },
        { title: 'Error Rate', value: '...', icon: <ErrorIcon />, color: '#d32f2f' },
      ];
    }

    return [
      {
        title: 'Total Requests',
        value: formatNumber(metricsData.summary?.totalRequests || 0),
        icon: <TrendingUp />,
        color: '#1976d2',
      },
      {
        title: 'Avg Response Time',
        value: `${Math.round(metricsData.summary?.avgLatency || 0)}ms`,
        icon: <Speed />,
        color: '#2e7d32',
      },
      {
        title: 'Success Rate',
        value: `${((1 - (metricsData.summary?.errorRate || 0)) * 100).toFixed(1)}%`,
        icon: <CheckCircle />,
        color: '#ed6c02',
      },
      {
        title: 'Error Rate',
        value: `${((metricsData.summary?.errorRate || 0) * 100).toFixed(1)}%`,
        icon: <ErrorIcon />,
        color: '#d32f2f',
      },
    ];
  }, [metricsData]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Dashboard</Typography>
        <Chip 
          label={connected ? 'Live' : 'Disconnected'}
          color={connected ? 'success' : 'error'}
          size="small"
          variant="outlined"
          icon={connected ? undefined : <WifiOff />}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Connection error. Attempting to reconnect...
        </Alert>
      )}

      {!connected && !metricsData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Connecting to real-time metrics stream...
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 3, mb: 3 }}>
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    {stat.title}
                  </Typography>
                  <Typography variant="h4">{stat.value}</Typography>
                </Box>
                <Box sx={{ color: stat.color, fontSize: 40 }}>
                  {stat.icon}
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {metricsData?.timestamp && (
        <Typography variant="caption" color="text.secondary">
          Last updated: {new Date(metricsData.timestamp).toLocaleTimeString()}
        </Typography>
      )}
    </Box>
  );
};

export default Dashboard;
```

#### 3.3 Update Metrics Page (`admin-ui/src/pages/Metrics.tsx`)
```typescript
import React from 'react';
import { Box, Typography, Chip, Alert } from '@mui/material';
import { WifiOff } from '@mui/icons-material';
import { useRedisStream } from '../hooks/useRedisStream';
import RequestRateChart from '../components/Charts/RequestRateChart';
import SLOGauge from '../components/Charts/SLOGauge';
// ... other imports

const Metrics: React.FC = () => {
  const { data: metricsData, connected, error } = useRedisStream({
    url: '/api/stream/metrics',
    reconnectInterval: 5000,
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Metrics</Typography>
        <Chip 
          label={connected ? 'Live Stream' : 'Disconnected'}
          color={connected ? 'success' : 'error'}
          size="small"
          variant="outlined"
          icon={connected ? undefined : <WifiOff />}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Stream error. Reconnecting...
        </Alert>
      )}

      {/* Use metricsData directly - no more polling! */}
      <RequestRateChart 
        data={metricsData?.requestRate || { name: 'Request Rate', data: [], unit: 'req/min' }}
      />
      <SLOGauge 
        data={metricsData?.slo || {
          availability: { target: 99.9, current: 0, status: 'ok' },
          latency: { target: 200, current: 0, status: 'ok' },
          errorRate: { target: 1, current: 0, status: 'ok' },
        }}
      />
      {/* ... other charts */}
    </Box>
  );
};

export default Metrics;
```

---

### Phase 4: Integration & Configuration

#### 4.1 Update App Initialization (`app.ts`)
```typescript
import { redisStreamsService } from './services/redisStreams';
import { metricsPublisher } from './services/metricsPublisher';
import streamRouter from './routes/stream';

// ... existing imports and setup

async function startServer() {
  try {
    // ... existing initialization

    // Create consumer group for metrics stream
    await redisStreamsService.createConsumerGroup('metrics:stream', 'metrics-consumers');
    
    // Start metrics publisher
    await metricsPublisher.start();
    logger.info('Metrics publisher started');

    // Add stream routes
    app.use('/api/stream', streamRouter);
    logger.info('Stream routes registered');

    // ... start HTTP server

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      
      metricsPublisher.stop();
      await redisStreamsService.disconnect();
      await pool.end();
      
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

#### 4.2 Environment Configuration (`.env`)
```bash
# Redis Configuration (Already exists!)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Metrics Publishing
METRICS_PUBLISH_INTERVAL=5000  # 5 seconds
METRICS_STREAM_MAX_LENGTH=10000  # Keep last 10k messages
ALERTS_STREAM_MAX_LENGTH=1000    # Keep last 1k alerts

# Stream Settings
STREAM_BLOCK_TIMEOUT=5000  # 5 seconds
```

#### 4.3 No Docker Required! ✅

Redis Streams is available in Redis 5.0+ which you already have installed.

**Verify your Redis version:**
```bash
redis-cli INFO server | grep redis_version
```

If you're running Redis < 5.0, upgrade with:
```bash
# macOS (Homebrew)
brew upgrade redis

# Or download from redis.io
```

---

## Migration Strategy

### Step 1: Run Both Systems in Parallel
- Keep existing polling endpoints active
- Deploy JetStream infrastructure
- Add stream endpoints alongside REST endpoints
- Monitor JetStream performance

### Step 2: Gradual Migration
- Update Dashboard to use JetStream (with fallback)
- Monitor for issues
- Update Metrics page
- Update other real-time components

### Step 3: Remove Polling (After Validation)
- Remove `useEffect` polling intervals
- Deprecate REST polling endpoints
- Remove unnecessary API calls

---

## Performance Considerations

### Expected Improvements
| Metric | Before (Polling) | After (JetStream) |
|--------|------------------|-------------------|
| Update Latency | 0-30 seconds | < 100ms |
| HTTP Requests/min | 2 per client | 0 (WebSocket/SSE) |
| Server CPU | Moderate | Low |
| Network Traffic | High | Low |
| Concurrent Clients | Limited | Highly Scalable |

### Resource Requirements
- **NATS Server**: ~50-100MB RAM baseline
- **Storage**: ~10GB for 24-hour metrics history
- **Network**: Minimal bandwidth (compressed JSON)

---

## Testing Plan

### Unit Tests
```typescript
describe('JetStreamService', () => {
  it('should connect to NATS server', async () => {
    await jetStreamService.connect(['nats://localhost:4222']);
    expect(jetStreamService.isConnected()).toBe(true);
  });

  it('should publish metrics', async () => {
    const metrics = { summary: { totalRequests: 1000 } };
    await jetStreamService.publishMetrics(metrics);
    // Assert message was published
  });
});
```

### Integration Tests
```typescript
describe('Metrics Stream', () => {
  it('should stream metrics to SSE clients', async () => {
    const response = await fetch('http://localhost:3000/api/stream/metrics');
    const reader = response.body.getReader();
    
    const { value } = await reader.read();
    const data = new TextDecoder().decode(value);
    
    expect(data).toContain('data:');
    expect(JSON.parse(data.split('data:')[1])).toHaveProperty('summary');
  });
});
```

### Load Tests
```bash
# Simulate 100 concurrent clients
npm install -g artillery
artillery quick --count 100 --num 10 http://localhost:3000/api/stream/metrics
```

---

## Monitoring & Observability

### NATS Monitoring Dashboard
Access at `http://localhost:8222/streaming/channelsz`

### Key Metrics to Monitor
- Message publish rate
- Consumer lag
- Stream message count
- Client connections
- Memory/disk usage

### Prometheus Metrics
```typescript
// Add custom metrics
const metricsPublished = new promClient.Counter({
  name: 'jetstream_metrics_published_total',
  help: 'Total metrics messages published to JetStream',
});

const streamConnections = new promClient.Gauge({
  name: 'jetstream_stream_connections',
  help: 'Number of active stream connections',
});
```

---

## Security Considerations

### Authentication
```typescript
// Add JWT token validation for stream endpoints
router.get('/metrics', authenticateToken, async (req, res) => {
  // Only authenticated users can subscribe
});
```

### Rate Limiting
```typescript
// Limit number of concurrent connections per user
const connectionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // Max 5 connections per minute
});

router.get('/metrics', connectionLimiter, async (req, res) => {
  // ...
});
```

### Data Sanitization
- Ensure metrics don't leak sensitive information
- Filter PII from published data
- Implement field-level access control

---

## Rollback Plan

If issues arise:
1. **Immediate**: Revert frontend to polling (feature flag)
2. **Backend**: Disable metrics publisher, keep JetStream running
3. **Full Rollback**: Remove JetStream, restore polling-only system

Feature flag example:
```typescript
const USE_JETSTREAM = process.env.FEATURE_JETSTREAM === 'true';

if (USE_JETSTREAM) {
  // Use stream
} else {
  // Use polling
}
```

---

## Timeline Estimate

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1: Infrastructure | 2 days | Docker setup, NATS config, testing |
| Phase 2: Backend | 3-4 days | JetStream service, publisher, stream routes |
| Phase 3: Frontend | 2-3 days | Hooks, Dashboard update, Metrics update |
| Phase 4: Integration | 2 days | E2E testing, monitoring setup |
| **Total** | **9-11 days** | With testing and documentation |

---

## Next Steps

1. **Approve Plan** - Review and approve this implementation
2. **Setup Environment** - Deploy NATS in dev environment
3. **Prototype** - Build minimal viable stream for one metric
4. **Iterate** - Expand to full metrics suite
5. **Production Deploy** - Gradual rollout with monitoring

---

## Questions to Address

1. **High Availability**: Do we need NATS clustering for HA?
2. **Multi-Tenancy**: Should different organizations get isolated streams?
3. **Historical Data**: Keep JetStream history or rely on PostgreSQL?
4. **Bandwidth**: What's acceptable message frequency? (current: 5s)
5. **Browser Support**: All target browsers support EventSource/WebSocket?

---

## References

- [NATS JetStream Documentation](https://docs.nats.io/nats-concepts/jetstream)
- [Server-Sent Events (SSE) MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [NATS Node.js Client](https://github.com/nats-io/nats.js)
