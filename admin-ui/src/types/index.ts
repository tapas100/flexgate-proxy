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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
