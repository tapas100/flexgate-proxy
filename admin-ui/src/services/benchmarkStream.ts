/**
 * admin-ui/src/services/benchmarkStream.ts
 *
 * Thin wrapper around the browser's native EventSource API that connects to
 * GET /api/stream/benchmarks and exposes typed callbacks for each SSE event
 * the Go server emits.
 *
 * ── SSE event types ──────────────────────────────────────────────────────────
 *
 *   connected   → stream is live; carries current subscriber count
 *   status      → current RunStatus (running/idle + per-scenario results)
 *   replay      → full historical buffer (sent once on connect)
 *   metric      → one live DataPoint from a running scenario
 *   progress    → scenario status change (running | passed | failed)
 *   summary     → final per-scenario aggregate
 *   done        → entire run finished
 *   reset       → store was cleared; frontend should wipe its charts
 *   heartbeat   → keep-alive ping every 15 s
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   import { createBenchmarkStream } from '../services/benchmarkStream';
 *
 *   const stream = createBenchmarkStream({
 *     onMetric:   (dp) => appendDataPoint(dp),
 *     onProgress: (p)  => setScenarioStatus(p),
 *     onDone:     ()   => setRunComplete(true),
 *   });
 *
 *   stream.connect();
 *   // later:
 *   stream.close();
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** One 1-second metric snapshot from a running k6 scenario. */
export interface BenchmarkDataPoint {
  scenario:  string;
  rps:       number;
  p50:       number;
  p95:       number;
  p99:       number;
  errors:    number;  // error rate [0, 1]
  vus:       number;
  timestamp: string;  // ISO-8601
}

/** Lifecycle status of a single scenario. */
export interface ScenarioProgress {
  scenario:  string;
  status:    'running' | 'passed' | 'failed';
  exit_code: number;
  ts:        string;
}

/** Final summary for one completed scenario. */
export interface ScenarioSummary {
  scenario:   string;
  passed:     boolean;
  exit_code:  number;
  started_at: string;
  ended_at:   string;
  summary?: {
    rps_mean:       number;
    p50:            number;
    p95:            number;
    p99:            number;
    error_rate_pct: number;
  };
}

/** Current run lifecycle state sent on connect + on each status change. */
export interface RunStatus {
  running:         boolean;
  active_scenario: string;
  started_at:      string;
  completed_at?:   string;
  scenarios:       Record<string, ScenarioSummary>;
}

/** Full historical replay payload sent once on connect. */
export interface ReplayPayload {
  type: 'replay';
  data: Record<string, BenchmarkDataPoint[]>;
  ts:   string;
}

export interface BenchmarkStreamCallbacks {
  onConnected?:  (subscribers: number) => void;
  onStatus?:     (status: RunStatus) => void;
  onReplay?:     (payload: ReplayPayload) => void;
  onMetric?:     (dp: BenchmarkDataPoint) => void;
  onProgress?:   (p: ScenarioProgress) => void;
  onSummary?:    (s: ScenarioSummary) => void;
  onDone?:       (scenarios: Record<string, ScenarioSummary>) => void;
  onReset?:      () => void;
  onHeartbeat?:  (ts: string, subscribers: number) => void;
  onError?:      (err: Event) => void;
  onReconnect?:  () => void;
}

export interface BenchmarkStreamOptions extends BenchmarkStreamCallbacks {
  /** Base URL of the Go backend.  Defaults to REACT_APP_API_URL or ''. */
  baseUrl?:          string;
  /** Milliseconds between reconnect attempts on error.  Default: 5000 */
  reconnectInterval?: number;
  /** Maximum reconnect attempts before giving up.  0 = unlimited.  Default: 0 */
  maxReconnects?:    number;
}

// ── BenchmarkStream class ─────────────────────────────────────────────────────

export class BenchmarkStream {
  private readonly url:               string;
  private readonly callbacks:         BenchmarkStreamCallbacks;
  private readonly reconnectInterval: number;
  private readonly maxReconnects:     number;

  private es:               EventSource | null = null;
  private reconnectTimer:   ReturnType<typeof setTimeout> | null = null;
  private reconnectCount:   number = 0;
  private closed:           boolean = false;

  constructor(opts: BenchmarkStreamOptions) {
    const base = (opts.baseUrl ?? (process.env.REACT_APP_API_URL ?? '')).replace(/\/$/, '');
    this.url               = `${base}/api/stream/benchmarks`;
    this.reconnectInterval = opts.reconnectInterval ?? 5000;
    this.maxReconnects     = opts.maxReconnects     ?? 0;
    this.callbacks         = opts;
  }

  /** Open the SSE connection. */
  connect(): void {
    if (this.closed) return;
    this._clearReconnectTimer();
    this._open();
  }

  /** Close the SSE connection permanently (no more reconnects). */
  close(): void {
    this.closed = true;
    this._clearReconnectTimer();
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  /** Whether an EventSource is currently open. */
  get isConnected(): boolean {
    return this.es !== null && this.es.readyState === EventSource.OPEN;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _open(): void {
    const es = new EventSource(this.url);
    this.es  = es;

    // ── Named event listeners ─────────────────────────────────────────────

    es.addEventListener('connected', (e: MessageEvent) => {
      this.reconnectCount = 0;
      const d = this._parse(e.data);
      this.callbacks.onConnected?.(d?.subscribers ?? 0);
    });

    es.addEventListener('status', (e: MessageEvent) => {
      const d = this._parse(e.data);
      if (d?.status) this.callbacks.onStatus?.(d.status as RunStatus);
    });

    es.addEventListener('replay', (e: MessageEvent) => {
      const d = this._parse(e.data) as ReplayPayload | null;
      if (d) this.callbacks.onReplay?.(d);
    });

    es.addEventListener('metric', (e: MessageEvent) => {
      const d = this._parse(e.data) as BenchmarkDataPoint | null;
      if (d) this.callbacks.onMetric?.(d);
    });

    es.addEventListener('progress', (e: MessageEvent) => {
      const d = this._parse(e.data) as ScenarioProgress | null;
      if (d) this.callbacks.onProgress?.(d);
    });

    es.addEventListener('summary', (e: MessageEvent) => {
      const d = this._parse(e.data) as ScenarioSummary | null;
      if (d) this.callbacks.onSummary?.(d);
    });

    es.addEventListener('done', (e: MessageEvent) => {
      const d = this._parse(e.data);
      this.callbacks.onDone?.(d?.scenarios ?? {});
    });

    es.addEventListener('reset', (_: MessageEvent) => {
      this.callbacks.onReset?.();
    });

    es.addEventListener('heartbeat', (e: MessageEvent) => {
      const d = this._parse(e.data);
      this.callbacks.onHeartbeat?.(d?.ts ?? '', d?.subscribers ?? 0);
    });

    // ── Error / reconnect ─────────────────────────────────────────────────
    es.onerror = (evt) => {
      this.callbacks.onError?.(evt);
      es.close();
      this.es = null;

      if (this.closed) return;
      if (this.maxReconnects > 0 && this.reconnectCount >= this.maxReconnects) return;

      this.reconnectCount += 1;
      this.reconnectTimer = setTimeout(() => {
        if (this.closed) return;
        this.callbacks.onReconnect?.();
        this._open();
      }, this.reconnectInterval);
    };
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _parse(raw: string): Record<string, any> | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

/** Factory helper — creates and opens a BenchmarkStream in one call. */
export function createBenchmarkStream(opts: BenchmarkStreamOptions): BenchmarkStream {
  const stream = new BenchmarkStream(opts);
  stream.connect();
  return stream;
}
