/**
 * useUpgrade
 *
 * Stage 11.5 — Upgrade UI
 *
 * Single source of truth for the Lite → Full upgrade flow.
 * All upgrade CTAs (banner, sidebar, blocked screen) call this hook so the
 * reset+redirect logic lives in exactly one place.
 *
 * Flow:
 *   1. POST /api/setup/reset   — wipes the completed setup state server-side
 *   2. context.refresh()       — re-fetches /api/setup/status so the whole
 *                                tree reacts without a page reload
 *   3. navigate('/setup/full') — sends the user into the wizard with the
 *                                full-mode pre-selection signal
 *
 * Returns:
 *   upgrade()   — async function, throws on network error (caller handles UI)
 *   upgrading   — true while the reset request is in-flight
 *   error       — string | null, last error message
 *   clearError  — resets error to null
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetupContext } from '../setup/SetupStatusContext';

export interface UseUpgradeResult {
  /** Trigger the full upgrade flow. Throws on failure. */
  upgrade: () => Promise<void>;
  /** True while the reset request is in-flight. */
  upgrading: boolean;
  /** Last error message, or null if no error. */
  error: string | null;
  /** Clear the error state. */
  clearError: () => void;
}

export function useUpgrade(): UseUpgradeResult {
  const navigate = useNavigate();
  const { refresh } = useSetupContext();

  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upgrade = useCallback(async () => {
    setUpgrading(true);
    setError(null);

    try {
      const baseUrl = (process.env.REACT_APP_API_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/setup/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Reset failed (HTTP ${res.status})`);
      }

      // Re-fetch status so the whole context tree updates cleanly.
      await refresh();

      // Navigate to the full-mode setup entry point.
      navigate('/setup/full', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upgrade failed. Please try again.';
      setError(msg);
      throw e; // re-throw so callers can react if needed
    } finally {
      setUpgrading(false);
    }
  }, [navigate, refresh]);

  const clearError = useCallback(() => setError(null), []);

  return { upgrade, upgrading, error, clearError };
}
