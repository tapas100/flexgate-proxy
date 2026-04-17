/**
 * admin-ui/src/hooks/useBenchmarkStream.ts
 *
 * React hook that wraps BenchmarkStream and exposes typed state for
 * the /benchmarks dashboard page.
 *
 * ── State exposed ────────────────────────────────────────────────────────────
 *
 *   connected      — whether the SSE socket is open
 *   runStatus      — RunStatus from the server (running, active_scenario, …)
 *   livePoints     — Record<scenario, DataPoint[]>  (ring-buffer, last 300 pts)
 *   latestPoints   — Record<scenario, DataPoint>    (most-recent per scenario)
 *   scenarios      — list of scenario names that have data
 *   error          — last SSE error (null = no error)
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const {
 *     connected, runStatus, livePoints, latestPoints,
 *   } = useBenchmarkStream();
 *
 *   // livePoints['nginx'] → BenchmarkDataPoint[] (time-ordered)
 *   // runStatus.running   → boolean
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BenchmarkStream,
  BenchmarkDataPoint,
  RunStatus,
  ScenarioProgress,
  ScenarioSummary,
  ReplayPayload,
} from '../services/benchmarkStream';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum data-points kept per scenario in the local ring-buffer. */
const RING_SIZE = 300;

const KNOWN_SCENARIOS = [
  'baseline',
  'nginx',
  'haproxy',
  'flexgate-inline',
  'flexgate-mirror',
] as const;

export type ScenarioName = typeof KNOWN_SCENARIOS[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkStreamState {
  /** True while the EventSource is open. */
  connected:    boolean;

  /** Current run lifecycle state from the server. */
  runStatus:    RunStatus | null;

  /** All buffered data-points, keyed by scenario name. */
  livePoints:   Record<string, BenchmarkDataPoint[]>;

  /** Most-recent data-point per scenario. */
  latestPoints: Record<string, BenchmarkDataPoint>;

  /** Scenario names that have received at least one data-point. */
  scenarios:    string[];

  /** Last SSE error.  Null when connected or not yet connected. */
  error:        Event | null;

  /** Number of reconnect attempts since last successful connect. */
  reconnectCount: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBenchmarkStream(): BenchmarkStreamState {
  const [connected,      setConnected]      = useState(false);
  const [runStatus,      setRunStatus]      = useState<RunStatus | null>(null);
  const [livePoints,     setLivePoints]     = useState<Record<string, BenchmarkDataPoint[]>>({});
  const [latestPoints,   setLatestPoints]   = useState<Record<string, BenchmarkDataPoint>>({});
  const [scenarios,      setScenarios]      = useState<string[]>([]);
  const [error,          setError]          = useState<Event | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Keep a stable ref to the stream so we can close it on unmount
  const streamRef = useRef<BenchmarkStream | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Append one DataPoint to the ring-buffer for its scenario. */
  const appendPoint = useCallback((dp: BenchmarkDataPoint) => {
    setLivePoints((prev) => {
      const ring = prev[dp.scenario] ?? [];
      const next = ring.length >= RING_SIZE ? ring.slice(1) : ring;
      return { ...prev, [dp.scenario]: [...next, dp] };
    });

    setLatestPoints((prev) => ({ ...prev, [dp.scenario]: dp }));

    setScenarios((prev) =>
      prev.includes(dp.scenario) ? prev : [...prev, dp.scenario]
    );
  }, []);

  /** Bulk-load historical data from the replay event. */
  const loadReplay = useCallback((payload: ReplayPayload) => {
    setLivePoints((prev) => {
      const next = { ...prev };
      for (const [scenario, points] of Object.entries(payload.data)) {
        // Honour ring size even for replay
        const ring = points.slice(-RING_SIZE);
        next[scenario] = ring;
      }
      return next;
    });

    setLatestPoints((prev) => {
      const next = { ...prev };
      for (const [scenario, points] of Object.entries(payload.data)) {
        if (points.length > 0) {
          next[scenario] = points[points.length - 1];
        }
      }
      return next;
    });

    setScenarios(Object.keys(payload.data).filter((k) => payload.data[k].length > 0));
  }, []);

  /** Wipe all local state (on "reset" event). */
  const clearAll = useCallback(() => {
    setLivePoints({});
    setLatestPoints({});
    setScenarios([]);
    setRunStatus(null);
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const stream = new BenchmarkStream({
      reconnectInterval: 5000,

      onConnected: () => {
        setConnected(true);
        setError(null);
        setReconnectCount(0);
      },

      onStatus: (status: RunStatus) => {
        setRunStatus(status);
      },

      onReplay: (payload: ReplayPayload) => {
        loadReplay(payload);
      },

      onMetric: (dp: BenchmarkDataPoint) => {
        appendPoint(dp);
      },

      onProgress: (p: ScenarioProgress) => {
        // Reflect the active scenario change in runStatus
        setRunStatus((prev) => {
          if (!prev) return prev;
          const isRunning = p.status === 'running';
          const updated: RunStatus = {
            ...prev,
            running:         isRunning,
            active_scenario: isRunning ? p.scenario : '',
          };
          // When a scenario finishes, mark it in the scenarios map immediately
          // so the table shows Passed/Failed before the summary event arrives.
          if (!isRunning) {
            const existing = prev.scenarios[p.scenario];
            updated.scenarios = {
              ...prev.scenarios,
              [p.scenario]: {
                ...(existing ?? { scenario: p.scenario, started_at: '', ended_at: '' }),
                scenario:  p.scenario,
                passed:    p.status === 'passed',
                exit_code: p.exit_code,
                ended_at:  p.ts,
              } as any,
            };
          }
          return updated;
        });
      },

      onSummary: (s: ScenarioSummary) => {
        setRunStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            scenarios: { ...prev.scenarios, [s.scenario]: s },
          };
        });
      },

      onDone: (scenarioResults: Record<string, ScenarioSummary>) => {
        setRunStatus((prev) => ({
          ...(prev ?? defaultRunStatus()),
          running:         false,
          active_scenario: '',
          scenarios:       scenarioResults,
        }));
      },

      onReset: () => {
        clearAll();
      },

      onError: (evt: Event) => {
        setConnected(false);
        setError(evt);
      },

      onReconnect: () => {
        setConnected(false);
        setReconnectCount((n) => n + 1);
      },
    });

    streamRef.current = stream;
    stream.connect();

    return () => {
      stream.close();
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return {
    connected,
    runStatus,
    livePoints,
    latestPoints,
    scenarios,
    error,
    reconnectCount,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultRunStatus(): RunStatus {
  return {
    running:         false,
    active_scenario: '',
    started_at:      '',
    scenarios:       {},
  };
}
