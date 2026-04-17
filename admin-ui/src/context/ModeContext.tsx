/**
 * ModeContext
 *
 * Stage 11 — Mode-Based Dashboards, Stage 1: Mode Detection
 *
 * Derives the product-level mode ("lite" | "full" | "unknown") from the
 * single shared SetupStatusContext.  Consumers never touch the raw setup
 * internals — they only call useMode().
 *
 * Mapping (server → product):
 *   server mode = "benchmark"  →  product mode = "lite"
 *   server mode = "full"       →  product mode = "full"
 *   phase = "loading"          →  product mode = "unknown" (resolving)
 *   phase = "required"|"error" →  product mode = "unknown" (not set up yet)
 *   server mode = ""           →  product mode = "unknown"
 *
 * Architecture notes:
 *   - Zero duplicate fetches: reads from SetupStatusContext which already
 *     owns the single GET /api/setup/status call.
 *   - ModeProvider MUST be rendered inside SetupStatusProvider.
 *   - useMode() throws a clear error if used outside ModeProvider so
 *     misconfigured trees fail loudly in development.
 *
 * Usage:
 *   // In App.tsx (already has SetupStatusProvider):
 *   <SetupStatusProvider>
 *     <ModeProvider>
 *       <SetupGuard>…</SetupGuard>
 *     </ModeProvider>
 *   </SetupStatusProvider>
 *
 *   // In any component:
 *   const { mode, isLite, isFull, isResolved } = useMode();
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useSetupContext } from '../setup/SetupStatusContext';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The two product-level modes plus an "unknown" sentinel used while the
 * status is still loading or when setup has not been completed yet.
 */
export type AppMode = 'lite' | 'full' | 'unknown';

export interface ModeContextValue {
  /** Current product mode. */
  mode: AppMode;

  /** True when mode === 'lite' (benchmark setup). */
  isLite: boolean;

  /** True when mode === 'full' (full proxy setup). */
  isFull: boolean;

  /**
   * True once the mode has been determined from the API.
   * False while loading or when setup is not complete.
   */
  isResolved: boolean;

  /**
   * The canonical home route for this mode.
   *   lite    → '/lite'
   *   full    → '/dashboard'
   *   unknown → '/setup'  (not yet configured)
   */
  homeRoute: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Maps the raw server mode string to the product AppMode. */
function toAppMode(serverMode: string, isComplete: boolean): AppMode {
  if (!isComplete) return 'unknown';
  if (serverMode === 'benchmark') return 'lite';
  if (serverMode === 'full') return 'full';
  return 'unknown';
}

function toHomeRoute(mode: AppMode): string {
  if (mode === 'lite') return '/lite';
  if (mode === 'full') return '/dashboard';
  return '/setup';
}

// ── Context ───────────────────────────────────────────────────────────────────

const ModeContext = createContext<ModeContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Derives and publishes the AppMode.
 * Must be rendered inside <SetupStatusProvider>.
 */
export function ModeProvider({ children }: { children: React.ReactNode }) {
  // Single source of truth — no extra fetch.
  const { mode: serverMode, isComplete, phase } = useSetupContext();

  const value = useMemo<ModeContextValue>(() => {
    const mode = toAppMode(serverMode, isComplete);
    return {
      mode,
      isLite: mode === 'lite',
      isFull: mode === 'full',
      // "resolved" means we have a definitive answer from the API.
      isResolved: phase === 'complete' && mode !== 'unknown',
      homeRoute: toHomeRoute(mode),
    };
  }, [serverMode, isComplete, phase]);

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Returns the current AppMode and derived helpers.
 *
 * @throws If called outside of <ModeProvider> — misconfigured tree.
 */
export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useMode() must be used inside <ModeProvider>');
  }
  return ctx;
}
