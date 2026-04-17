/**
 * SetupGuard
 *
 * Wraps the entire router tree.  Responsibilities:
 *
 *   1. While setup status is loading → render a minimal full-screen spinner
 *      so the user never sees a flash of the app or a premature redirect.
 *
 *   2. If setup is required AND the user is NOT already on /setup* →
 *      hard-redirect to /setup.
 *
 *   3. Stage 9 — Skip Setup:
 *      If setup is COMPLETE AND the user is NOT on /setup* →
 *      redirect them to /benchmarks (benchmark mode) or /dashboard (full).
 *
 *      If setup is COMPLETE AND the user IS on /setup* →
 *      show AlreadyCompleteScreen with "Go to Dashboard" / "Re-run Setup".
 *
 *   4. In all other states (error, or already on /setup and not complete) →
 *      render children as-is.
 *
 * Stage 6 addition:
 *   - Module-level `bypassSetupGuard` flag.  SetupPage calls
 *     `markSetupComplete()` right before navigate('/dashboard').
 *     This prevents a brief re-mount of SetupGuard from re-fetching
 *     /api/setup/status and flashing back to /setup before the backend
 *     has fully committed the "setup complete" state.
 *
 * Isolation contract:
 *   - Does NOT import any existing page, hook, service, or component.
 *   - Does NOT modify the children it wraps.
 *   - Uses only react-router-dom (already a dependency) and MUI primitives
 *     that are already in the bundle.
 *   - The only side-effect is a <Navigate> redirect — never a window.location
 *     mutation, so React Router's history stack stays consistent.
 */

import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useSetupContext } from './SetupStatusContext';
import { AlreadyCompleteScreen } from './components/AlreadyCompleteScreen';

// ── Module-level bypass ───────────────────────────────────────────────────────
// Set this to true immediately before navigating to /dashboard so that
// SetupGuard never redirects back to /setup during the transition.
let bypassSetupGuard = false;

/** Call once, right before navigate('/dashboard'), to unblock the guard. */
export function markSetupComplete(): void {
  bypassSetupGuard = true;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SetupGuardProps {
  children: React.ReactNode;
}

const SetupGuard: React.FC<SetupGuardProps> = ({ children }) => {
  const { phase, mode, redirectTo, refresh } = useSetupContext();
  const location = useLocation();
  const navigate = useNavigate();

  // Bypass flag set by SetupPage right before redirect — treat as complete.
  if (bypassSetupGuard) {
    return <>{children}</>;
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">
          Starting FlexGate…
        </Typography>
      </Box>
    );
  }

  const onSetupPath = location.pathname.startsWith('/setup');

  // ── Stage 9: Setup already complete ──────────────────────────────────────
  if (phase === 'complete') {
    // User is NOT on /setup → send them straight to their destination.
    if (!onSetupPath) {
      return <Navigate to={redirectTo} replace />;
    }

    // User navigated directly to /setup even though setup is done →
    // show the "Already completed" interstitial.
    const handleNavigate = () => {
      markSetupComplete(); // keep bypass active so the guard won't fire again
      navigate(redirectTo, { replace: true });
    };

    const handleReset = async () => {
      const baseUrl = (process.env.REACT_APP_API_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/setup/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Reset failed (HTTP ${res.status})`);
      }
      // Navigate to /setup — guard will now see phase='required' after reload.
      navigate('/setup', { replace: true });
      // Refresh context state so the whole tree reacts without a page reload.
      await refresh();
    };

    return (
      <AlreadyCompleteScreen
        mode={mode}
        onNavigate={handleNavigate}
        onReset={handleReset}
      />
    );
  }

  // ── Setup required ────────────────────────────────────────────────────────
  // Already on /setup or any sub-path → don't redirect again (prevents loop).
  if (phase === 'required' && !onSetupPath) {
    return <Navigate to="/setup" replace />;
  }

  // ── Normal / error / already on setup path ────────────────────────────────
  return <>{children}</>;
};

export default SetupGuard;
