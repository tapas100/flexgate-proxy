/**
 * useSetupStatus
 *
 * Fetches GET /api/setup/status once on mount.
 * Returns a SetupStatusResult so consumers can gate routing correctly.
 *
 * Stage 9 — Skip Setup:
 *   When isSetupComplete is true on app start, SetupGuard redirects to the
 *   correct destination (/benchmarks for benchmark mode, /dashboard otherwise).
 *   If the user navigates directly to /setup while setup is already complete
 *   they see an "Already completed" screen with options to continue or re-run.
 *
 * Isolation contract:
 *   - Does NOT import any existing hook, service, or component.
 *   - Does NOT touch localStorage.
 *   - Uses plain fetch so it works before Axios interceptors are wired.
 */

import { useEffect, useState } from 'react';

export type SetupPhase = 'loading' | 'complete' | 'required' | 'error';

export interface SetupStatusResult {
  /** High-level phase used for guard logic. */
  phase: SetupPhase;
  /** True once isSetupComplete === true is confirmed from the API. */
  isComplete: boolean;
  /** The mode stored on the server ("" | "benchmark" | "full"). */
  mode: string;
  /** Where to navigate after completion — derived from mode. */
  redirectTo: string;
}

interface SetupStatusResponse {
  isSetupComplete: boolean;
  mode?: string;
}

// ── Dev-mode detection ────────────────────────────────────────────────────────

/**
 * True when the app is running on localhost (127.0.0.1 or ::1).
 * Exported so other setup modules can use the same definition.
 */
export function isLocalhost(): boolean {
  const { hostname } = window.location;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

/** True when the current session is a local dev run. */
export const IS_DEV_MODE =
  isLocalhost() && process.env.REACT_APP_FORCE_SETUP_CHECK !== 'true';

function modeToRedirect(mode: string): string {
  return mode === 'benchmark' ? '/benchmarks' : '/dashboard';
}

const LOADING_RESULT: SetupStatusResult = {
  phase: 'loading',
  isComplete: false,
  mode: '',
  redirectTo: '/dashboard',
};

const REQUIRED_RESULT: SetupStatusResult = {
  phase: 'required',
  isComplete: false,
  mode: '',
  redirectTo: '/dashboard',
};

export function useSetupStatus(): SetupStatusResult {
  // Dev fast-path: assume setup is required so the wizard opens immediately.
  const [result, setResult] = useState<SetupStatusResult>(
    IS_DEV_MODE ? REQUIRED_RESULT : LOADING_RESULT,
  );

  useEffect(() => {
    // In dev mode we already set 'required' synchronously — skip the fetch.
    if (IS_DEV_MODE) return;

    let cancelled = false;

    const check = async () => {
      try {
        const baseUrl = (process.env.REACT_APP_API_URL ?? '').replace(/\/$/, '');
        const url = `${baseUrl}/api/setup/status`;

        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000),
        });

        if (!res.ok) {
          // Non-2xx → fail-open (treat as error, render app normally).
          if (!cancelled) setResult({ phase: 'error', isComplete: false, mode: '', redirectTo: '/dashboard' });
          return;
        }

        const body: SetupStatusResponse = await res.json();
        const mode = body.mode ?? '';

        if (!cancelled) {
          if (body.isSetupComplete === false) {
            setResult({ phase: 'required', isComplete: false, mode, redirectTo: modeToRedirect(mode) });
          } else {
            setResult({ phase: 'complete', isComplete: true, mode, redirectTo: modeToRedirect(mode) });
          }
        }
      } catch {
        // Network error, timeout, or JSON parse failure → fail-open.
        if (!cancelled) setResult({ phase: 'error', isComplete: false, mode: '', redirectTo: '/dashboard' });
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
