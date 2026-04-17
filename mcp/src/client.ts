/**
 * Flexgate API client.
 *
 * A thin HTTP wrapper around the Flexgate admin API (port 9090).
 * All methods return typed responses or throw a `FlexgateAPIError`.
 *
 * Design notes:
 * - Uses the built-in `fetch` (Node 18+), no extra deps.
 * - Auth is injected at construction time so tool handlers stay clean.
 * - Every public method is independently testable via dependency injection.
 */

import type { MCPConfig } from './config.js';

// ── error type ────────────────────────────────────────────────────────────────

export class FlexgateAPIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'FlexgateAPIError';
  }
}

// ── response shapes (mirrors Go handler outputs) ──────────────────────────────

export interface ProxyHealth {
  status: string;
  uptime_seconds?: number;
  version?: string;
  checks?: Record<string, { status: string; latency_ms?: number }>;
}

export interface ProxySetting {
  id: number;
  log_level: string;
  log_format: string;
  cors_enabled: boolean;
  cors_allow_origins: string[];
  max_request_size_bytes: number;
  rate_limit_rps: number;
  updated_at: string;
}

export interface RouteConfig {
  id: number;
  name: string;
  path: string;
  upstream: string;
  methods: string[];
  strip_path: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LogEntry {
  id?: string;
  timestamp: string;
  level: string;
  method?: string;
  path?: string;
  status?: number;
  latency_ms?: number;
  client_ip?: string;
  message?: string;
  [key: string]: unknown;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogStatsSummary {
  total_requests: number;
  error_rate: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  requests_per_second: number;
}

export interface AIIncident {
  incident_id: string;
  event_type: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  metrics: Record<string, unknown>;
  context: Record<string, unknown>;
  status: string;
  detected_at: string;
  resolved_at?: string;
  resolution_time_seconds?: number;
  user_rating?: number;
}

export interface IncidentListResponse {
  incidents: AIIncident[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnalyticsSummary {
  incidents: {
    total_incidents: number;
    resolved_count: number;
    open_count: number;
    false_positive_count: number;
    avg_resolution_time_seconds: number;
    avg_user_rating: number;
    resolution_rate: number;
  };
  recommendations: {
    total_recommendations: number;
    accepted_count: number;
    rejected_count: number;
    acceptance_rate: number;
  };
}

export interface MetricsSample {
  timestamp: string;
  [metric: string]: unknown;
}

// ── client ────────────────────────────────────────────────────────────────────

export class FlexgateClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: MCPConfig) {
    this.baseUrl = config.apiUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs;

    this.headers = { 'Content-Type': 'application/json' };

    if (config.apiKey) {
      this.headers['X-Api-Key'] = config.apiKey;
    }
    if (config.apiCredentials) {
      const encoded = Buffer.from(config.apiCredentials).toString('base64');
      this.headers['Authorization'] = `Basic ${encoded}`;
    }
  }

  // ── private helpers ─────────────────────────────────────────────────────────

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...this.headers, ...(init?.headers ?? {}) },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new FlexgateAPIError(`Network error calling ${url}: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new FlexgateAPIError(
        `Flexgate API ${res.status} on ${path}`,
        res.status,
        body,
      );
    }

    return res.json() as Promise<T>;
  }

  private qs(params: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  // ── public API ──────────────────────────────────────────────────────────────

  async getHealth(): Promise<ProxyHealth> {
    const res = await this.request<{ status?: string; data?: ProxyHealth }>('/health');
    // /health returns a flat object; /api/health returns { data: ... }
    return (res as unknown as ProxyHealth).status ? (res as unknown as ProxyHealth) : ((res as { data: ProxyHealth }).data ?? res as unknown as ProxyHealth);
  }

  async getSettings(): Promise<ProxySetting> {
    const res = await this.request<{ data: ProxySetting }>('/api/settings');
    return res.data;
  }

  async listRoutes(): Promise<RouteConfig[]> {
    const res = await this.request<{ data: RouteConfig[] }>('/api/routes');
    return res.data ?? [];
  }

  async getLogs(opts: {
    limit?: number;
    offset?: number;
    level?: string;
    search?: string;
  } = {}): Promise<LogsResponse> {
    const q = this.qs({ limit: opts.limit, offset: opts.offset, level: opts.level, search: opts.search });
    const res = await this.request<{ data: LogsResponse }>(`/api/logs${q}`);
    return res.data;
  }

  async getLogStats(): Promise<LogStatsSummary> {
    const res = await this.request<{ data: LogStatsSummary }>('/api/logs/stats/summary');
    return res.data;
  }

  async listIncidents(opts: {
    status?: string;
    event_type?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<IncidentListResponse> {
    const q = this.qs(opts as Record<string, string | number | undefined>);
    const res = await this.request<{ data: IncidentListResponse }>(`/api/ai-incidents${q}`);
    return res.data;
  }

  async getIncident(id: string): Promise<{ incident: AIIncident; recommendations: unknown[]; outcomes: unknown[] }> {
    const res = await this.request<{ data: { incident: AIIncident; recommendations: unknown[]; outcomes: unknown[] } }>(`/api/ai-incidents/${id}`);
    return res.data;
  }

  async analyzeIncident(id: string): Promise<{ analysis: string; metadata: Record<string, unknown> }> {
    const res = await this.request<{ success: boolean; analysis: string; metadata: Record<string, unknown> }>(
      `/api/ai-incidents/${id}/analyze`,
      { method: 'POST' },
    );
    return { analysis: res.analysis, metadata: res.metadata };
  }

  async getAnalyticsSummary(days = 30): Promise<AnalyticsSummary> {
    const res = await this.request<{ data: AnalyticsSummary }>(
      `/api/ai-incidents/analytics/summary?days=${days}`,
    );
    return res.data;
  }

  async getUISettings(): Promise<Record<string, unknown>> {
    const res = await this.request<{ data: Record<string, unknown> }>('/api/settings/ui');
    return res.data ?? {};
  }
}
