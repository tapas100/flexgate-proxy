import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetricsData as UiMetricsData, MetricPoint, TimeSeriesMetric } from '../types';

type BackendPoint = { timestamp: string | number; value: string | number };

type BackendSeries = {
  name: string;
  data: BackendPoint[];
  unit: string;
};

type BackendMetricsPayload = {
  summary?: Record<string, any>;
  requestRate?: BackendSeries;
  latency?: {
    p50?: BackendSeries;
    p95?: BackendSeries;
    p99?: BackendSeries;
  };
  errorRate?: BackendSeries;
  statusCodes?: Record<string, any> | Array<{ code: number | string; count: number | string }>;
  slo?: Record<string, any>;
  circuitBreakers?: Record<string, any>;
  timestamp?: string;
  window?: Record<string, any>;
};

interface UseLiveMetricsOptions {
  streamUrl?: string;
  pollUrl?: string;
  pollIntervalMs?: number;
}

const toNumber = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toTimestampMs = (v: any): number => {
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : Date.now();
};

const normalizeSeries = (series?: BackendSeries, fallback?: Partial<TimeSeriesMetric>): TimeSeriesMetric => {
  const base: TimeSeriesMetric = {
    name: series?.name || fallback?.name || 'Metric',
    unit: series?.unit || fallback?.unit || '',
    data: [],
  };

  const data: MetricPoint[] = (series?.data || [])
    .map((p) => ({
      timestamp: toTimestampMs(p.timestamp),
      value: toNumber(p.value),
    }))
    // Ensure charts don't blow up on unsorted points
    .sort((a, b) => a.timestamp - b.timestamp);

  return { ...base, data };
};

const normalizeStatusCodes = (statusCodes: BackendMetricsPayload['statusCodes']): UiMetricsData['statusCodes'] => {
  // Backend sometimes returns { '2xx': 1, ... } and sometimes [{code,count}, ...]
  const base: UiMetricsData['statusCodes'] = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  if (!statusCodes) return base;

  if (Array.isArray(statusCodes)) {
    for (const item of statusCodes) {
      const code = String(item.code);
      const count = toNumber(item.count);
      if (code.startsWith('2')) base['2xx'] += count;
      else if (code.startsWith('3')) base['3xx'] += count;
      else if (code.startsWith('4')) base['4xx'] += count;
      else if (code.startsWith('5')) base['5xx'] += count;
    }
    return base;
  }

  // object form
  for (const [k, v] of Object.entries(statusCodes)) {
    if (k in base) {
      // @ts-expect-error index
      base[k] = toNumber(v);
    }
  }
  return base;
};

export const normalizeBackendMetrics = (payload: BackendMetricsPayload): UiMetricsData => {
  const summary = payload.summary || {};

  const totalRequests = toNumber(
    // Prefer monotonic all-time if present
    summary.totalRequestsAllTime ?? summary.totalRequests ?? 0
  );

  // Backend uses availability (string) not uptime; UI expects uptime (%).
  const uptime = toNumber(summary.availability ?? summary.uptime ?? 0);

  const avgLatency = toNumber(summary.avgLatency ?? summary.avgResponseTime ?? 0);
  const errorRate = toNumber(summary.errorRate ?? 0);

  const p50 = normalizeSeries(payload.latency?.p50, { name: 'P50 Latency', unit: 'ms' });
  const p95 = normalizeSeries(payload.latency?.p95, { name: 'P95 Latency', unit: 'ms' });
  const p99 = normalizeSeries(payload.latency?.p99, { name: 'P99 Latency', unit: 'ms' });

  return {
    summary: {
      totalRequests,
      avgLatency,
      errorRate,
      uptime,
    },
    requestRate: normalizeSeries(payload.requestRate, { name: 'Request Rate', unit: 'req/s' }),
    latency: { p50, p95, p99 },
    errorRate: normalizeSeries(payload.errorRate, { name: 'Error Rate', unit: '%' }),
    statusCodes: normalizeStatusCodes(payload.statusCodes),
    slo: (payload.slo as any) || {
      availability: { current: uptime, target: 99.9, budget: 100 },
      latency: { p50: 0, p95: 0, p99: 0, targetP95: 200, targetP99: 500 },
      errorRate: { current: errorRate, target: 0.1 },
    },
    circuitBreakers: (payload.circuitBreakers as any) || { open: 0, halfOpen: 0, closed: 0 },
  };
};

export const useLiveMetrics = (options: UseLiveMetricsOptions = {}) => {
  const {
    streamUrl = '/api/stream/metrics',
    pollUrl = '/api/metrics/live',
    pollIntervalMs = 5000,
  } = options;

  const baseUrl = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
  const resolvedStreamUrl = /^https?:\/\//i.test(streamUrl) ? streamUrl : `${baseUrl || ''}${streamUrl}`;
  const resolvedPollUrl = /^https?:\/\//i.test(pollUrl) ? pollUrl : `${baseUrl || ''}${pollUrl}`;

  const [data, setData] = useState<UiMetricsData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    const tick = async () => {
      try {
        const res = await fetch(resolvedPollUrl);
        const json = await res.json();
        const payload = json?.data ?? json;
        setData(normalizeBackendMetrics(payload));
      } catch (e: any) {
        setError(e instanceof Error ? e : new Error('Polling failed'));
      }
    };
    // immediate
    void tick();
    pollIntervalRef.current = window.setInterval(tick, pollIntervalMs);
  }, [pollIntervalMs, resolvedPollUrl, stopPolling]);

  const connect = useCallback(() => {
    // Always prefer SSE; fall back to polling if SSE fails.
    stopPolling();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

  const es = new EventSource(resolvedStreamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'connected') return;
        if (msg?.type === 'error') {
          throw new Error(msg.message || 'Stream error');
        }
        setData(normalizeBackendMetrics(msg));
      } catch (e: any) {
        setError(e instanceof Error ? e : new Error('Failed to parse stream message'));
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError(new Error('Stream disconnected'));
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Start polling as a reliable fallback.
      startPolling();
    };
  }, [resolvedStreamUrl, startPolling, stopPolling]);

  useEffect(() => {
    connect();
    return () => {
      stopPolling();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, stopPolling]);

  return { data, connected, error, reconnect: connect };
};
