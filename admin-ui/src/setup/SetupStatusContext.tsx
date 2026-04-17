/**
 * SetupStatusContext
 *
 * Stage 10 — Dashboard Guard
 *
 * Provides the result of GET /api/setup/status to the entire React tree via
 * context so every consumer shares a single fetch — no duplicate requests.
 *
 * Consumers:
 *   - SetupGuard           (already exists — switches to this instead of its
 *                           own useSetupStatus call)
 *   - FeatureGuard         (new — blocks individual protected routes)
 *   - useSetupContext()    (convenience hook exported from this file)
 *
 * Isolation contract:
 *   - Does NOT import any existing page, service, or component.
 *   - Uses the same IS_DEV_MODE flag from useSetupStatus so behaviour is
 *     consistent across every consumer.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { IS_DEV_MODE, SetupStatusResult } from './useSetupStatus';

// ── Context type ──────────────────────────────────────────────────────────────

export interface SetupContextValue extends SetupStatusResult {
  /**
   * Re-fetches /api/setup/status and updates all consumers.
   * Used by FeatureGuard's "Complete setup" CTA and by handleReset in
   * SetupGuard so the whole tree reacts without a page reload.
   */
  refresh: () => Promise<void>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function modeToRedirect(mode: string): string {
  return mode === 'benchmark' ? '/benchmarks' : '/dashboard';
}

const LOADING: SetupStatusResult = {
  phase: 'loading',
  isComplete: false,
  mode: '',
  redirectTo: '/dashboard',
};

const REQUIRED: SetupStatusResult = {
  phase: 'required',
  isComplete: false,
  mode: '',
  redirectTo: '/dashboard',
};

async function fetchStatus(): Promise<SetupStatusResult> {
  const baseUrl = (process.env.REACT_APP_API_URL ?? '').replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/api/setup/status`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    // Non-2xx → fail-open (treat as error, never block the user).
    return { phase: 'error', isComplete: false, mode: '', redirectTo: '/dashboard' };
  }

  const body: { isSetupComplete: boolean; mode?: string } = await res.json();
  const mode = body.mode ?? '';
  return body.isSetupComplete
    ? { phase: 'complete', isComplete: true, mode, redirectTo: modeToRedirect(mode) }
    : { phase: 'required', isComplete: false, mode, redirectTo: modeToRedirect(mode) };
}

// ── Context ───────────────────────────────────────────────────────────────────

const SetupStatusContext = createContext<SetupContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function SetupStatusProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<SetupStatusResult>(
    IS_DEV_MODE ? REQUIRED : LOADING,
  );

  // Track whether a fetch is in-flight so refresh() never runs concurrently.
  const fetchingRef = useRef(false);

  const load = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const result = await fetchStatus();
      setValue(result);
    } catch {
      setValue({ phase: 'error', isComplete: false, mode: '', redirectTo: '/dashboard' });
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (IS_DEV_MODE) return; // fast-path: stay at REQUIRED
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setValue((prev) => ({ ...prev, phase: 'loading' }));
    await load();
  }, [load]);

  const ctx: SetupContextValue = { ...value, refresh };

  return (
    <SetupStatusContext.Provider value={ctx}>
      {children}
    </SetupStatusContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/** Returns the current setup status shared across the whole app. */
export function useSetupContext(): SetupContextValue {
  const ctx = useContext(SetupStatusContext);
  if (!ctx) {
    throw new Error('useSetupContext must be used inside <SetupStatusProvider>');
  }
  return ctx;
}
