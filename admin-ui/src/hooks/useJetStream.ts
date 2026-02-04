import { useState, useEffect, useCallback, useRef } from 'react';

export interface MetricsData {
  summary: {
    totalRequests: number;
    avgLatency: string;
    errorRate: string;
    availability: string;
    p50Latency: string;
    p95Latency: string;
    p99Latency: string;
    serverErrors: number;
    clientErrors: number;
    successfulRequests: number;
  };
  requestRate: {
    name: string;
    data: Array<{ timestamp: string; value: string }>;
    unit: string;
  };
  statusCodes: Array<{ code: number; count: number }>;
  timestamp: string;
}

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

    // If UI runs on a different origin/port than the backend (common in dev),
    // make sure SSE connects to the backend base URL.
    const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
    const resolvedUrl = /^https?:\/\//i.test(url) ? url : `${baseUrl || ''}${url}`;

    const eventSource = new EventSource(resolvedUrl);
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
        } else if (message.type === 'error') {
          console.error('Stream error:', message.message);
          const err = new Error(message.message);
          setError(err);
          if (onError) {
            onError(err);
          }
        } else {
          // It's metrics data
          setData(message);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
        const error = err instanceof Error ? err : new Error('Failed to parse message');
        setError(error);
        if (onError) {
          onError(error);
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error('❌ EventSource error:', err);
      setConnected(false);
      const error = new Error('Connection lost');
      setError(error);
      
      if (onDisconnect) {
        onDisconnect();
      }
      if (onError) {
        onError(error);
      }

      // Cleanup and schedule reconnect
      cleanup();
      
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        connect();
      }, reconnectInterval);
    };
  }, [url, reconnectInterval, onError, onConnect, onDisconnect, cleanup]);

  useEffect(() => {
    connect();

    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  return {
    data,
    connected,
    error,
    reconnect: connect,
  };
};
