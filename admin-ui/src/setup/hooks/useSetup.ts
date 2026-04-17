/**
 * useSetup
 *
 * Single source of truth for the entire setup wizard.
 *
 * Stage 4 additions (additive — all previous consumers unchanged):
 *   - New step 'mode' injected between 'welcome' and 'route'
 *     → STEPS is now ['welcome', 'mode', 'route', 'test'] (4 steps)
 *   - `selectedMode` state: null | 'benchmark' | 'full'
 *   - `setSelectedMode(mode)` — update selection without saving
 *   - `saveMode()` — POST /api/setup/mode + advance; dev-mode stub on 404/500
 *   - `modeLoading` / `modeError` per-operation state
 *   - StepNumber is now 1|2|3|4
 *
 * Stage 5 additions (additive — all previous consumers unchanged):
 *   - New step 'dependencies' injected between 'mode' and 'route'
 *     → STEPS is now ['welcome', 'mode', 'dependencies', 'route', 'test'] (5 steps)
 *   - `detectionReport` — DetectionReport | null; fetched from GET /api/setup/detect
 *   - `detectLoading` / `detectError` — per-fetch state
 *   - `depsSelection` — Record<string, 'use'|'skip'> per dependency
 *   - `setDepAction(key, action)` — update a single dep without saving
 *   - `saveDeps()` — POST /api/setup/dependencies { selectedStack } + advance
 *   - `saveDepsLoading` / `saveDepsError` per-operation state
 *   - StepNumber is now 1|2|3|4|5
 *
 * Stage 6 additions (additive — all previous consumers unchanged):
 *   - New step 'benchmarks' injected between 'dependencies' and 'route'
 *     → STEPS is now ['welcome', 'mode', 'dependencies', 'benchmarks', 'route', 'test'] (6 steps)
 *   - `scenarioSelection` — Record<ScenarioId, boolean>; auto-seeded from depsSelection
 *   - `toggleScenario(id)` — flip a single scenario on/off
 *   - `saveBenchmarks()` — POST /api/setup/benchmarks { scenarios } + advance
 *   - `saveBenchmarksLoading` / `saveBenchmarksError` per-operation state
 *   - StepNumber is now 1|2|3|4|5|6
 *
 * Stage 7 additions (additive — all previous consumers unchanged):
 *   - New step 'execution' injected between 'benchmarks' and 'route'
 *     → STEPS is now ['welcome','mode','dependencies','benchmarks','execution','route','test'] (7 steps)
 *   - `execState` — ExecutionState (phase, progress, tasks, logs, errorMessage)
 *   - `startRun()` — POST /api/setup/run; sets phase='running'
 *   - `dispatchRunEvent(e)` — folds an SSE RunEvent into execState
 *   - StepNumber is now 1|2|3|4|5|6|7
 *
 * Isolation contract:
 *   - Zero imports from existing app code.
 *   - Uses plain fetch (not Axios) so no interceptors interfere.
 *   - All API base-URL resolution mirrors useSetupStatus.ts pattern.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IS_DEV_MODE } from '../useSetupStatus';
import type { SetupMode } from '../components/ModeStep';
import type { DetectionReport, DepAction, DepsSelection } from '../components/DependenciesStep';
import {
  defaultScenarioSelection,
  type ScenarioId,
  type ScenarioSelection,
} from '../components/BenchmarkScenariosStep';
import type {
  ExecutionState,
  RunEvent,
  TaskState,
  LogLine,
} from '../components/SetupExecutionStep';

// ── Step index ────────────────────────────────────────────────────────────────

export type StepId = 'welcome' | 'mode' | 'dependencies' | 'install' | 'benchmarks' | 'execution' | 'route' | 'test';

/** Human-facing step numbers (1-based) exposed alongside 0-based index. */
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEPS: StepId[] = ['welcome', 'mode', 'dependencies', 'install', 'benchmarks', 'execution', 'route', 'test'];

// ── Form state shapes ─────────────────────────────────────────────────────────

export interface WelcomeFormState {
  instanceName: string;
  adminEmail: string;
}

export interface RouteFormState {
  routePath: string;      // e.g. /api/v1
  upstreamUrl: string;    // e.g. https://httpbin.org
  enableRateLimit: boolean;
  rateLimitRpm: number;   // requests per minute
}

/**
 * Minimal route config shape exposed via `routeConfig` / `setRouteConfig`.
 * Maps directly to the fields POST /api/routes cares about.
 */
export interface RouteConfig {
  path: string;
  upstream: string;
}

export interface TestResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  /** Parsed JSON body (if upstream returned JSON). */
  responseBody: unknown | null;
  /** Raw response text (always set when a response was received). */
  rawBody: string | null;
  /** Which URL was actually called (proxy route or /api/test fallback). */
  testedUrl: string;
  /** Synthetic request log entries for display. */
  requestLog: RequestLogEntry[];
}

export interface RequestLogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number | null;
  latencyMs: number | null;
  upstream: string;
  /** 'proxy' = called via FlexGate route; 'fallback' = called /api/test directly */
  via: 'proxy' | 'fallback';
}

// ── POST /api/routes response shape ──────────────────────────────────────────

interface SaveRouteResponse {
  id: string;
  path?: string;
  upstream?: string;
  enabled?: boolean;
}

// ── Hook return type ──────────────────────────────────────────────────────────

export interface UseSetupReturn {
  // ── Navigation (Stage 2 API — unchanged) ──────────────────────────────────
  currentStep: StepId;
  currentStepIndex: number;
  totalSteps: number;
  canGoBack: boolean;
  goNext: () => void;
  goBack: () => void;

  // ── Navigation (Stage 3 aliases) ──────────────────────────────────────────
  /** 1-based step number for display ("Step 1 of 3"). */
  step: StepNumber;
  /** Alias for goNext(). */
  nextStep: () => void;
  /** Alias for goBack(). */
  prevStep: () => void;

  // ── Welcome form ──────────────────────────────────────────────────────────
  welcomeForm: WelcomeFormState;
  setWelcomeForm: React.Dispatch<React.SetStateAction<WelcomeFormState>>;

  // ── Mode selection (Stage 4) ──────────────────────────────────────────────
  /** The mode the operator has selected (null = not yet chosen). */
  selectedMode: SetupMode | null;
  /** Update the local selection without hitting the network. */
  setSelectedMode: (mode: SetupMode) => void;
  /**
   * POST /api/setup/mode then advance to the next step.
   * Idempotent — if mode was already saved this session it just calls goNext().
   * Does NOT throw; check modeError instead.
   */
  saveMode: () => Promise<void>;
  modeLoading: boolean;
  modeError: string | null;

  // ── Dependencies (Stage 5) ────────────────────────────────────────────────
  /**
   * Detection report from GET /api/setup/detect.
   * - null  → not yet fetched (or fetch in-flight)
   * - undefined → fetch failed (detectError is set)
   */
  detectionReport: DetectionReport | null | undefined;
  /** True while GET /api/setup/detect is in-flight. */
  detectLoading: boolean;
  /** Error message from GET /api/setup/detect, if any. */
  detectError: string | null;
  /** Per-tool selection: 'use' | 'skip'. Defaults to 'skip' for all tools. */
  depsSelection: DepsSelection;
  /** Update a single tool's action without persisting. */
  setDepAction: (key: string, action: DepAction) => void;
  /**
   * POST /api/setup/dependencies { selectedStack: keys where action==='use' }
   * then advance to the next step.
   * Does NOT throw; check saveDepsError instead.
   */
  saveDeps: () => Promise<void>;
  saveDepsLoading: boolean;
  saveDepsError: string | null;

  // ── Dependency installation (new) ─────────────────────────────────────────
  /** Per-dep install state driving InstallDepsStep. */
  installDeps: import('../components/InstallDepsStep').DepInstallState[];
  /** Whether the install step should be shown (any required dep missing). */
  needsInstallStep: boolean;
  /** Start streaming install for one dep. */
  installDep: (key: string, method: import('../components/InstallDepsStep').InstallMethod) => void;
  /** Mark a dep as skipped so the user can proceed without installing. */
  skipInstallDep: (key: string) => void;

  // ── Benchmark scenarios (Stage 6) ─────────────────────────────────────────
  /**
   * Per-scenario selection: true = include, false = exclude.
   * Auto-seeded from depsSelection when the benchmarks step is first entered.
   */
  scenarioSelection: ScenarioSelection;
  /** Flip a single scenario on/off without persisting. */
  toggleScenario: (id: ScenarioId) => void;
  /**
   * POST /api/setup/benchmarks { scenarios: id[] where value===true }
   * then advance to the next step.
   * Does NOT throw; check saveBenchmarksError instead.
   */
  saveBenchmarks: () => Promise<void>;
  saveBenchmarksLoading: boolean;
  saveBenchmarksError: string | null;

  // ── Setup execution (Stage 7) ─────────────────────────────────────────────
  /** Full execution state — drives SetupExecutionStep. */
  execState: ExecutionState;
  /**
   * POST /api/setup/run — starts the execution engine.
   * Sets execState.phase to 'running'.  Does NOT throw.
   */
  startRun: () => void;
  /**
   * Fold one SSE RunEvent into execState.
   * Called by SetupExecutionStep as events arrive from the SSE stream.
   */
  dispatchRunEvent: (e: RunEvent) => void;

  // ── Route form (Stage 2 API — unchanged) ──────────────────────────────────
  routeForm: RouteFormState;
  setRouteForm: React.Dispatch<React.SetStateAction<RouteFormState>>;
  /** Full save — does NOT auto-advance (used by RouteStep's own button). */
  saveRoute: () => Promise<void>;
  saveLoading: boolean;
  saveError: string | null;
  savedRouteId: string | null;

  // ── Route config (Stage 3 shorthand) ──────────────────────────────────────
  /** Shorthand view: { path, upstream } derived from routeForm. */
  routeConfig: RouteConfig;
  /** Partial-merge setter — only updates path and/or upstream. */
  setRouteConfig: (partial: Partial<RouteConfig>) => void;
  /**
   * Idempotent save + auto-advance.
   * - If the route was already saved (savedRouteId is set) it skips the
   *   network call and just calls goNext().
   * - On network error it increments retryCount and sets saveError;
   *   does NOT throw so callers don't need try/catch.
   */
  submitRoute: () => Promise<void>;
  retryCount: number;
  /** Clear saveError so the user can attempt submitRoute again. */
  resetRouteSubmit: () => void;

  // ── Test step ─────────────────────────────────────────────────────────────
  runTest: () => Promise<void>;
  testLoading: boolean;
  testResult: TestResult | null;

  // ── Completion ────────────────────────────────────────────────────────────
  completeSetup: () => Promise<void>;
  completeLoading: boolean;
  completeError: string | null;
  /** True once completeSetup() has resolved successfully this session. */
  setupDone: boolean;
  /**
   * The redirect destination suggested by the backend after completion.
   * '/benchmarks' for benchmark mode, '/dashboard' for full mode.
   * Null until completeSetup() resolves.
   */
  redirectTo: string | null;

  // ── Unified loading / error (Stage 3) ─────────────────────────────────────
  /** True while ANY async operation is in-flight. */
  loading: boolean;
  /** The most-recent error from any operation, or null. */
  error: string | null;
  /** True when running on localhost (dev mode). */
  isDevMode: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  const base = (process.env.REACT_APP_API_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}

/**
 * proxyUrl — builds a URL that hits the FlexGate *traffic* port directly.
 *
 * The CRA dev server proxy (package.json "proxy") forwards /api/* to the
 * admin API (port 9090).  Proxy routes (user traffic) are served on port 8080.
 * We must bypass the CRA proxy for the test probe or it will hit the admin API
 * and return 404 for any user-defined route path like /api/posts/1.
 *
 * In production the traffic and admin ports merge behind a load-balancer, so
 * REACT_APP_PROXY_URL can be left empty and the relative path will work.
 */
function proxyUrl(path: string): string {
  const base = (process.env.REACT_APP_PROXY_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  return `${base}${path}`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // In dev mode, treat non-fatal HTTP errors as stub successes so the
    // wizard can advance even when the backend has no database connected:
    //   404/405 — endpoint not yet wired
    //   500     — backend up but DB unavailable (no Postgres in local dev)
    if (IS_DEV_MODE && (res.status === 404 || res.status === 405 || res.status === 500)) {
      return {} as T;
    }
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Derive a slug-style route_id from a URL path.
 *  e.g. "/api/*" → "api-wildcard", "/health" → "health" */
function pathToRouteId(path: string): string {
  return path
    .replace(/^\/+/, '')           // strip leading slashes
    .replace(/\*/g, 'wildcard')    // * → wildcard
    .replace(/[^a-zA-Z0-9]+/g, '-') // non-alphanum → dash
    .replace(/^-+|-+$/g, '')       // trim dashes
    .toLowerCase()
    || 'route';
}

/** Build the POST /api/routes payload from a RouteFormState. */
function buildRoutePayload(form: RouteFormState): object {
  // Derive the strip_prefix from the route path:
  // "/api/*" → strip_prefix "/api"  so upstream receives "/" + remainder
  // "/health" → no strip_prefix (exact path forwarded as-is)
  const base = form.routePath.replace(/\/\*$/, '').replace(/\/$/, '');
  const stripPrefix = base || '';

  return {
    route_id: pathToRouteId(form.routePath),
    path: form.routePath,
    upstream: form.upstreamUrl,
    strip_path: stripPrefix,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    enabled: true,
    ...(form.enableRateLimit && {
      rateLimit: {
        requests: form.rateLimitRpm,
        window: '1m',
      },
    }),
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSetup(): UseSetupReturn {

  // ── Step navigation ───────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(0);

  // Tracks whether the 'install' step was actually shown (i.e. saveDeps found
  // missing required deps and navigated +1 instead of +2).
  const installStepShownRef = useRef(false);

  const goNext = useCallback(
    () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1)),
    [],
  );

  // goBack skips the 'install' step when going back from 'benchmarks' only
  // if the install step was never shown (all required deps were already present).
  const goBack = useCallback(
    () =>
      setStepIndex((i) => {
        const prev = Math.max(i - 1, 0);
        // If we'd land on 'install' and the step was bypassed, skip it too.
        if (STEPS[prev] === 'install' && !installStepShownRef.current) {
          return Math.max(prev - 1, 0);
        }
        return prev;
      }),
    [],
  );

  // Stage 3 aliases
  const nextStep = goNext;
  const prevStep = goBack;

  // ── Welcome form ──────────────────────────────────────────────────────────
  const [welcomeForm, setWelcomeForm] = useState<WelcomeFormState>({
    instanceName: 'My FlexGate',
    adminEmail: '',
  });

  // ── Mode selection (Stage 4) ──────────────────────────────────────────────
  const [selectedMode, setSelectedMode] = useState<SetupMode | null>(null);
  const [modeSaved, setModeSaved] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  const saveMode = useCallback(async () => {
    if (!selectedMode) return;
    // Idempotent — skip network if already saved this session.
    if (modeSaved) {
      goNext();
      return;
    }
    setModeLoading(true);
    setModeError(null);
    try {
      await postJson<{ success: boolean; mode: string }>(
        '/api/setup/mode',
        { mode: selectedMode },
      );
      setModeSaved(true);
      goNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save mode';
      setModeError(msg);
      // Does NOT re-throw — caller checks modeError.
    } finally {
      setModeLoading(false);
    }
  }, [selectedMode, modeSaved, goNext]);

  // ── Dependencies (Stage 5) ───────────────────────────────────────────────
  const [detectionReport, setDetectionReport] = useState<DetectionReport | null | undefined>(null);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [depsSelection, setDepsSelection] = useState<DepsSelection>({});
  const [depsSaved, setDepsSaved] = useState(false);
  const [saveDepsLoading, setSaveDepsLoading] = useState(false);
  const [saveDepsError, setSaveDepsError] = useState<string | null>(null);

  // Fetch detection report whenever the dependencies step becomes active.
  const currentStepForEffect = STEPS[stepIndex];
  useEffect(() => {
    if (currentStepForEffect !== 'dependencies') return;
    if (detectionReport !== null || detectLoading) return; // already fetched or in-flight

    let cancelled = false;
    setDetectLoading(true);
    setDetectError(null);

    fetch(apiUrl('/api/setup/detect'), {
      signal: AbortSignal.timeout(15_000),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res.json() as Promise<DetectionReport>;
      })
      .then((report) => {
        if (cancelled) return;
        setDetectionReport(report);
        // Auto-select:
        //   - installed tools → 'use'
        //   - missing tools   → 'skip'
        //   - Full-mode required services (postgres, redis, nats) → always 'use'
        //     regardless of detection result (they may run in containers)
        const auto: DepsSelection = {};
        const toolKeys = ['nginx', 'haproxy', 'docker', 'podman', 'postgres', 'redis', 'nats'] as const;
        for (const key of toolKeys) {
          const tool = (report as unknown as Record<string, { installed: boolean }>)[key];
          auto[key] = tool?.installed ? 'use' : 'skip';
        }
        // Core Full-mode services: pre-select 'use' unconditionally so the
        // runner always checks them. User can override to 'skip' if needed.
        if (selectedMode === 'full') {
          auto['postgres'] = 'use';
          auto['redis']    = 'use';
          auto['nats']     = 'use';
        }
        setDepsSelection((prev) => ({ ...auto, ...prev }));
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Detection failed';
        setDetectError(msg);
        setDetectionReport(undefined); // signals "fetch attempted but failed"
      })
      .finally(() => {
        if (!cancelled) setDetectLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepForEffect]);

  const setDepAction = useCallback((key: string, action: DepAction) => {
    setDepsSelection((prev) => ({ ...prev, [key]: action }));
    // Reset idempotency flag when selection changes so saveDeps re-POSTs.
    setDepsSaved(false);
  }, []);

  const saveDeps = useCallback(async () => {
    // Idempotent — skip network if already saved this session with same selection.
    if (depsSaved) {
      goNext();
      return;
    }
    setSaveDepsLoading(true);
    setSaveDepsError(null);
    try {
      const selectedStack = Object.entries(depsSelection)
        .filter(([, action]) => action === 'use')
        .map(([key]) => key);
      await postJson<{ success: boolean; stack: string[] }>(
        '/api/setup/dependencies',
        { selectedStack },
      );
      setDepsSaved(true);
      // Skip the install step if all required deps are already installed.
      const anyMissing =
        selectedMode === 'full' &&
        (['postgres', 'redis', 'nats'] as const).some((k) => {
          const tool = (
            detectionReport as unknown as Record<string, { installed: boolean }> | null
          )?.[k];
          return !tool?.installed;
        });
      // Record whether the install step will be shown so goBack can decide.
      installStepShownRef.current = anyMissing;
      // Jump by 1 (→ install step) or 2 (skip install → benchmarks).
      setStepIndex((i) => Math.min(i + (anyMissing ? 1 : 2), STEPS.length - 1));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save dependencies';
      setSaveDepsError(msg);
      // Does NOT re-throw — caller checks saveDepsError.
    } finally {
      setSaveDepsLoading(false);
    }
  }, [depsSelection, depsSaved, goNext]);

  // ── Dependency installation ───────────────────────────────────────────────
  // Required Full-mode deps that must be installed (or skipped) before continuing.
  const REQUIRED_FULL_DEPS: Array<{ key: string; label: string }> = [
    { key: 'postgres', label: 'PostgreSQL' },
    { key: 'redis',    label: 'Redis' },
    { key: 'nats',     label: 'NATS' },
  ];

  // Compute which deps are "required but missing" based on detectionReport.
  const [installDepsState, setInstallDepsState] = useState<
    import('../components/InstallDepsStep').DepInstallState[]
  >([]);

  // Build/update installDepsState whenever the detection report changes.
  useEffect(() => {
    if (!detectionReport) return;
    if (selectedMode !== 'full') return;
    const next = REQUIRED_FULL_DEPS.map(({ key, label }) => {
      const tool = (detectionReport as unknown as Record<string, { installed: boolean }>)[key];
      const alreadyInstalled = tool?.installed ?? false;
      return {
        key,
        label,
        alreadyInstalled,
        status: (alreadyInstalled ? 'done' : 'idle') as import('../components/InstallDepsStep').DepInstallState['status'],
        logs: [] as string[],
        error: null,
        method: 'auto' as import('../components/InstallDepsStep').InstallMethod,
      };
    });
    setInstallDepsState(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionReport, selectedMode]);

  const needsInstallStep =
    selectedMode === 'full' &&
    installDepsState.some((d) => !d.alreadyInstalled);

  const skipInstallDep = useCallback((key: string) => {
    setInstallDepsState((prev) =>
      prev.map((d) => (d.key === key ? { ...d, status: 'skipped', error: null } : d)),
    );
  }, []);

  const installDep = useCallback(
    (key: string, method: import('../components/InstallDepsStep').InstallMethod) => {
      // Mark as installing.
      setInstallDepsState((prev) =>
        prev.map((d) =>
          d.key === key ? { ...d, status: 'installing', logs: [], error: null, method } : d,
        ),
      );

      const url = apiUrl('/api/setup/install');
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dep: key, method: method === 'auto' ? '' : method }),
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `HTTP ${res.status}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            // Each event is `data: {...}\n\n`
            const parts = buf.split('\n\n');
            buf = parts.pop() ?? '';
            for (const part of parts) {
              const line = part.replace(/^data:\s*/, '').trim();
              if (!line) continue;
              try {
                const evt = JSON.parse(line) as { type: string; message: string };
                if (evt.type === 'log') {
                  setInstallDepsState((prev) =>
                    prev.map((d) =>
                      d.key === key ? { ...d, logs: [...d.logs, evt.message] } : d,
                    ),
                  );
                } else if (evt.type === 'done') {
                  setInstallDepsState((prev) =>
                    prev.map((d) =>
                      d.key === key ? { ...d, status: 'done', logs: [...d.logs, evt.message] } : d,
                    ),
                  );
                } else if (evt.type === 'error') {
                  setInstallDepsState((prev) =>
                    prev.map((d) =>
                      d.key === key
                        ? { ...d, status: 'failed', error: evt.message, logs: [...d.logs, `✗ ${evt.message}`] }
                        : d,
                    ),
                  );
                }
              } catch { /* ignore parse errors */ }
            }
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Install failed';
          setInstallDepsState((prev) =>
            prev.map((d) =>
              d.key === key
                ? { ...d, status: 'failed', error: msg, logs: [...d.logs, `✗ ${msg}`] }
                : d,
            ),
          );
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [scenarioSelection, setScenarioSelection] = useState<ScenarioSelection>(
    () => defaultScenarioSelection({}),
  );
  const [benchmarksSeedDeps, setBenchmarksSeedDeps] = useState('');
  const [benchmarksSaved, setBenchmarksSaved] = useState(false);
  const [saveBenchmarksLoading, setSaveBenchmarksLoading] = useState(false);
  const [saveBenchmarksError, setSaveBenchmarksError] = useState<string | null>(null);

  // Seed scenario defaults from depsSelection when the benchmarks step becomes
  // active for the first time (or whenever depsSelection fingerprint changes).
  const currentStepForBenchmarks = STEPS[stepIndex];
  useEffect(() => {
    if (currentStepForBenchmarks !== 'benchmarks') return;
    const fingerprint = JSON.stringify(depsSelection);
    if (benchmarksSeedDeps === fingerprint) return; // already seeded for this selection
    setScenarioSelection(defaultScenarioSelection(depsSelection));
    setBenchmarksSeedDeps(fingerprint);
    setBenchmarksSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepForBenchmarks, depsSelection]);

  const toggleScenario = useCallback((id: ScenarioId) => {
    setScenarioSelection((prev) => ({ ...prev, [id]: !prev[id] }));
    setBenchmarksSaved(false);
  }, []);

  const saveBenchmarks = useCallback(async () => {
    if (benchmarksSaved) {
      goNext();
      return;
    }
    setSaveBenchmarksLoading(true);
    setSaveBenchmarksError(null);
    try {
      const scenarios = (Object.keys(scenarioSelection) as ScenarioId[]).filter(
        (id) => scenarioSelection[id],
      );
      await postJson<{ success: boolean; scenarios: string[] }>(
        '/api/setup/benchmarks',
        { scenarios },
      );
      setBenchmarksSaved(true);
      goNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save benchmark scenarios';
      setSaveBenchmarksError(msg);
    } finally {
      setSaveBenchmarksLoading(false);
    }
  }, [scenarioSelection, benchmarksSaved, goNext]);

  // ── Setup execution (Stage 7) ─────────────────────────────────────────────
  const initialExecState: ExecutionState = {
    phase: 'idle',
    progress: 0,
    tasks: [],
    logs: [],
    errorMessage: null,
  };
  const [execState, setExecState] = useState<ExecutionState>(initialExecState);

  const startRun = useCallback(() => {
    // Reset state before starting
    setExecState({ phase: 'running', progress: 0, tasks: [], logs: [], errorMessage: null });

    // POST /api/setup/run — fire and forget; SSE stream delivers progress
    fetch(apiUrl('/api/setup/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Failed to start setup run';
      setExecState((prev) => ({ ...prev, phase: 'error', errorMessage: msg }));
    });
  }, []);

  const dispatchRunEvent = useCallback((e: RunEvent) => {
    setExecState((prev) => {
      const logs: LogLine[] = [...prev.logs];
      let tasks: TaskState[] = [...prev.tasks];
      let progress = prev.progress;
      let phase = prev.phase;
      let errorMessage = prev.errorMessage;

      const ts = e.timestamp ?? new Date().toISOString();

      switch (e.type) {
        case 'task_begin': {
          if (e.taskId && e.taskName) {
            // Upsert task row
            const existing = tasks.findIndex((t) => t.id === e.taskId);
            if (existing >= 0) {
              tasks = tasks.map((t) =>
                t.id === e.taskId ? { ...t, status: 'running' } : t,
              );
            } else {
              tasks = [...tasks, { id: e.taskId, name: e.taskName, status: 'running' }];
            }
          }
          break;
        }
        case 'task_done': {
          tasks = tasks.map((t) =>
            t.id === e.taskId ? { ...t, status: 'done' } : t,
          );
          break;
        }
        case 'task_skip': {
          tasks = tasks.map((t) =>
            t.id === e.taskId ? { ...t, status: 'skipped' } : t,
          );
          if (e.message) logs.push({ ts, taskId: e.taskId, message: `⤼ [${e.taskName ?? e.taskId}] ${e.message}`, level: 'skip' });
          break;
        }
        case 'task_fail': {
          tasks = tasks.map((t) =>
            t.id === e.taskId ? { ...t, status: 'failed' } : t,
          );
          if (e.message) logs.push({ ts, taskId: e.taskId, message: `✘ [${e.taskName ?? e.taskId}] ${e.message}`, level: 'error' });
          break;
        }
        case 'log': {
          if (e.message) logs.push({ ts, taskId: e.taskId, message: e.message, level: 'info' });
          break;
        }
        case 'progress': {
          progress = e.progress ?? progress;
          break;
        }
        case 'started': {
          if (e.message) logs.push({ ts, message: e.message, level: 'info' });
          break;
        }
        case 'done': {
          phase = 'done';
          progress = 100;
          if (e.message) logs.push({ ts, message: `✔ ${e.message}`, level: 'info' });
          break;
        }
        case 'error': {
          phase = 'error';
          errorMessage = e.message ?? 'Setup run failed';
          if (e.message) logs.push({ ts, message: `✘ ${e.message}`, level: 'error' });
          break;
        }
      }

      return { phase, progress, tasks, logs, errorMessage };
    });
  }, []);

  // ── Route form ────────────────────────────────────────────────────────────
  const [routeForm, setRouteForm] = useState<RouteFormState>({
    routePath: '/api/*',
    upstreamUrl: 'https://jsonplaceholder.typicode.com',
    enableRateLimit: false,
    rateLimitRpm: 100,
  });

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ── routeConfig shorthand (Stage 3) ──────────────────────────────────────
  const routeConfig: RouteConfig = useMemo(
    () => ({ path: routeForm.routePath, upstream: routeForm.upstreamUrl }),
    [routeForm.routePath, routeForm.upstreamUrl],
  );

  const setRouteConfig = useCallback((partial: Partial<RouteConfig>) => {
    setRouteForm((prev) => ({
      ...prev,
      ...(partial.path !== undefined     && { routePath:    partial.path     }),
      ...(partial.upstream !== undefined && { upstreamUrl:  partial.upstream }),
    }));
  }, []);

  // ── saveRoute (Stage 2 — unchanged semantics) ─────────────────────────────
  // Does NOT auto-advance; throws on error so RouteStep can display inline.
  const saveRoute = useCallback(async () => {
    setSaveLoading(true);
    setSaveError(null);
    try {
      const result = await postJson<SaveRouteResponse>(
        '/api/routes',
        buildRoutePayload(routeForm),
      );
      setSavedRouteId(result.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save route';
      setSaveError(msg);
      throw err; // re-throw so RouteStep's button can stay in error state
    } finally {
      setSaveLoading(false);
    }
  }, [routeForm]);

  // ── submitRoute (Stage 3) ─────────────────────────────────────────────────
  // Idempotent: skips network if already saved. Does NOT throw.
  const submitRoute = useCallback(async () => {
    // Already saved — just advance.
    if (savedRouteId) {
      goNext();
      return;
    }

    setSaveLoading(true);
    setSaveError(null);
    try {
      const result = await postJson<SaveRouteResponse>(
        '/api/routes',
        buildRoutePayload(routeForm),
      );
      setSavedRouteId(result.id);
      goNext(); // auto-advance on success
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save route';
      setSaveError(msg);
      setRetryCount((n) => n + 1);
      // Does NOT re-throw — caller gets no exception; check saveError instead.
    } finally {
      setSaveLoading(false);
    }
  }, [routeForm, savedRouteId, goNext]);

  const resetRouteSubmit = useCallback(() => {
    setSaveError(null);
  }, []);

  // ── Test ──────────────────────────────────────────────────────────────────
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const runTest = useCallback(async () => {
    setTestLoading(true);
    setTestResult(null);

    // Build test path from the route:
    // For wildcard routes like /api/* → test /api/posts/1 (a real resource)
    // For exact routes like /health  → test /health
    const routeBase = routeForm.routePath.replace(/\/\*$/, '').replace(/\/$/, '') || '/';
    const testPath = routeForm.routePath.endsWith('/*')
      ? `${routeBase}/posts/1`
      : routeBase || '/';
    const fallbackPath = '/api/test';
    const ts = new Date().toISOString();
    const t0 = Date.now();

    /** Fire a single GET via the server-side probe endpoint to avoid CORS.
     *  The admin API (same origin via CRA proxy) fetches the target URL
     *  server-side and returns a structured JSON result.
     */
    async function probe(
      path: string,
      via: 'proxy' | 'fallback',
    ): Promise<{ res: Response; latencyMs: number; rawBody: string; responseBody: unknown | null }> {
      // Route through /api/setup/probe so the browser never makes a
      // cross-origin request to port 8080 (which has no CORS headers).
      const targetUrl = via === 'fallback' ? apiUrl(path) : proxyUrl(path);
      const probeEndpoint = apiUrl(`/api/setup/probe?url=${encodeURIComponent(targetUrl)}`);
      const res = await fetch(probeEndpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      const latencyMs = Date.now() - t0;
      const envelope = await res.json() as {
        statusCode: number;
        latencyMs: number;
        rawBody: string;
        body?: unknown;
        targetUrl: string;
        error?: string;
      };
      if (envelope.error && !envelope.statusCode) {
        throw new Error(envelope.error);
      }
      const rawBody = envelope.rawBody ?? '';
      const responseBody = envelope.body ?? null;
      // Synthesise a Response-like object so callers don't change
      const syntheticRes = new Response(rawBody, { status: envelope.statusCode });
      return { res: syntheticRes, latencyMs: envelope.latencyMs ?? latencyMs, rawBody, responseBody };
    }

    // ── primary: call through the proxy route ─────────────────────────────
    let via: 'proxy' | 'fallback' = 'proxy';
    let probeResult: Awaited<ReturnType<typeof probe>> | null = null;
    let probeError: string | null = null;

    try {
      probeResult = await probe(testPath, 'proxy');
    } catch (primaryErr) {
      // Primary failed — try /api/test as a lightweight connectivity check
      via = 'fallback';
      try {
        probeResult = await probe(fallbackPath, 'fallback');
      } catch (fallbackErr) {
        probeError = primaryErr instanceof Error ? primaryErr.message : 'Request failed';
      }
    }

    const latencyMs = Date.now() - t0;
    const testedUrl = via === 'proxy' ? proxyUrl(testPath) : apiUrl(fallbackPath);

    if (probeResult) {
      const { res, latencyMs: probeLatency, rawBody, responseBody } = probeResult;
      setTestResult({
        ok: res.ok,
        statusCode: res.status,
        latencyMs: probeLatency,
        errorMessage: res.ok ? null : `Upstream responded with ${res.status}`,
        responseBody,
        rawBody: rawBody || null,
        testedUrl,
        requestLog: [
          {
            timestamp: ts,
            method: 'GET',
            path: via === 'proxy' ? testPath : fallbackPath,
            status: res.status,
            latencyMs: probeLatency,
            upstream: routeForm.upstreamUrl,
            via,
          },
        ],
      });
    } else {
      setTestResult({
        ok: false,
        statusCode: null,
        latencyMs,
        errorMessage: probeError ?? 'Request failed',
        responseBody: null,
        rawBody: null,
        testedUrl,
        requestLog: [
          {
            timestamp: ts,
            method: 'GET',
            path: testPath,
            status: null,
            latencyMs,
            upstream: routeForm.upstreamUrl,
            via: 'proxy',
          },
        ],
      });
    }

    setTestLoading(false);
  }, [routeForm.routePath, routeForm.upstreamUrl]);

  // ── Completion ────────────────────────────────────────────────────────────
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  /** True once completeSetup has succeeded — prevents duplicate calls. */
  const [setupDone, setSetupDone] = useState(false);
  /** Backend-provided redirect target (''/benchmarks' | '/dashboard'). */
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  const completeSetup = useCallback(async () => {
    // Idempotent — if already completed this session, skip the network call.
    if (setupDone) return;

    setCompleteLoading(true);
    setCompleteError(null);
    try {
      // Derive the final selected stack: dep keys where action==='use'
      // plus all benchmark: entries already stored.
      const depStack = Object.entries(depsSelection)
        .filter(([, action]) => action === 'use')
        .map(([key]) => key);
      const benchmarkStack = (Object.keys(scenarioSelection) as ScenarioId[])
        .filter((id) => scenarioSelection[id])
        .map((id) => `benchmark:${id}`);
      const selectedStack = [...depStack, ...benchmarkStack];

      const result = await postJson<{
        token?: string;
        user?: unknown;
        sessionId?: string;
        success?: boolean;
        redirectTo?: string;
      }>('/api/setup/complete', {
        mode: selectedMode ?? 'benchmark',
        selectedStack,
        instanceName: welcomeForm.instanceName,
        adminEmail: welcomeForm.adminEmail,
        routeId: savedRouteId,
      });

      // Store the server-suggested redirect destination.
      // Fall back to client-side mode derivation if backend doesn't provide it.
      const dest =
        result.redirectTo ??
        (selectedMode === 'benchmark' ? '/benchmarks' : '/dashboard');
      setRedirectTo(dest);

      // If the backend issued an auth token (real or dev), write it so
      // ProtectedRoute.isAuthenticated() passes immediately on redirect.
      if (result.token) {
        localStorage.setItem('token', result.token);
      }
      if (result.user) {
        localStorage.setItem('user', JSON.stringify(result.user));
      }
      if (result.sessionId) {
        localStorage.setItem('sessionId', result.sessionId);
      }

      // If backend returns no token (e.g. minimal stub), write a dev bypass
      // so the session survives the navigation to /dashboard.
      if (!result.token) {
        const devUser = {
          id: 'setup-user',
          email: welcomeForm.adminEmail || 'admin@flexgate.local',
          name: welcomeForm.instanceName || 'FlexGate Admin',
          role: 'admin',
        };
        // Only set if nothing is already stored (don't overwrite real auth).
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', 'setup-bypass-token');
          localStorage.setItem('user', JSON.stringify(devUser));
        }
      }

      setSetupDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete setup';
      setCompleteError(msg);
      throw err; // re-throw so SetupPage can abort navigation
    } finally {
      setCompleteLoading(false);
    }
  }, [welcomeForm, savedRouteId, setupDone, selectedMode, depsSelection, scenarioSelection]);

  // ── Unified loading / error (Stage 3+4+5+6) ──────────────────────────────
  const loading = saveLoading || testLoading || completeLoading || modeLoading || saveDepsLoading || saveBenchmarksLoading;
  const error   = saveError ?? completeError ?? modeError ?? saveDepsError ?? saveBenchmarksError ?? null;

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    // Stage 2 navigation
    currentStep:      STEPS[stepIndex],
    currentStepIndex: stepIndex,
    totalSteps:       STEPS.length,
    canGoBack:        stepIndex > 0,
    goNext,
    goBack,

    // Stage 3 navigation aliases
    step:     (stepIndex + 1) as StepNumber,
    nextStep,
    prevStep,

    // Welcome
    welcomeForm,
    setWelcomeForm,

    // Mode (Stage 4)
    selectedMode,
    setSelectedMode,
    saveMode,
    modeLoading,
    modeError,

    // Dependencies (Stage 5)
    detectionReport,
    detectLoading,
    detectError,
    depsSelection,
    setDepAction,
    saveDeps,
    saveDepsLoading,
    saveDepsError,

    // Dependency installation
    installDeps:      installDepsState,
    needsInstallStep,
    installDep,
    skipInstallDep,

    // Benchmark scenarios (Stage 6)
    scenarioSelection,
    toggleScenario,
    saveBenchmarks,
    saveBenchmarksLoading,
    saveBenchmarksError,

    // Execution (Stage 7)
    execState,
    startRun,
    dispatchRunEvent,

    // Route (Stage 2)
    routeForm,
    setRouteForm,
    saveRoute,
    saveLoading,
    saveError,
    savedRouteId,

    // Route (Stage 3)
    routeConfig,
    setRouteConfig,
    submitRoute,
    retryCount,
    resetRouteSubmit,

    // Test
    runTest,
    testLoading,
    testResult,

    // Completion
    completeSetup,
    completeLoading,
    completeError,
    setupDone,
    redirectTo,

    // Unified (Stage 3)
    loading,
    error,

    // Dev mode (Stage 7)
    isDevMode: IS_DEV_MODE,
  };
}
