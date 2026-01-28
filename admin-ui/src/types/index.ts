// Core type definitions for FlexGate Admin UI

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface Route {
  id: string;
  path: string;
  upstream: string;
  methods: string[];
  rateLimit?: {
    requests: number;
    window: string;
  };
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Metric {
  name: string;
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface MetricsDashboard {
  totalRequests: number;
  activeConnections: number;
  errorRate: number;
  avgResponseTime: number;
  uptime: number;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Advanced Metrics Types
export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface TimeSeriesMetric {
  name: string;
  data: MetricPoint[];
  unit: string; // 'req/s', 'ms', '%', etc.
}

export interface MetricsSummary {
  totalRequests: number;
  avgLatency: number;
  errorRate: number;
  uptime: number;
}

export interface SLOMetrics {
  availability: {
    current: number; // Current uptime %
    target: number; // Target SLO (99.9%)
    budget: number; // Error budget remaining
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    targetP95: number; // Target (200ms)
    targetP99: number; // Target (500ms)
  };
  errorRate: {
    current: number; // Current error %
    target: number; // Max allowed (0.1%)
  };
}

export interface MetricsData {
  summary: MetricsSummary;
  requestRate: TimeSeriesMetric;
  latency: {
    p50: TimeSeriesMetric;
    p95: TimeSeriesMetric;
    p99: TimeSeriesMetric;
  };
  errorRate: TimeSeriesMetric;
  statusCodes: {
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };
  slo: SLOMetrics;
  circuitBreakers: {
    open: number;
    halfOpen: number;
    closed: number;
  };
}

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
export type RefreshInterval = '30s' | '1m' | '5m' | 'off';
