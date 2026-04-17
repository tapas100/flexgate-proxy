/**
 * FeatureGuard
 *
 * Stage 10 — Dashboard Guard (route-level blocking)
 * Stage 11.4 — upgraded to understand product AppMode vocabulary
 *
 * Two prop styles — pick whichever fits the call-site:
 *
 *   A) Server-mode style (backward-compat, used in App.tsx):
 *      <FeatureGuard requiredMode="full">…</FeatureGuard>
 *      requiredMode: "any" | "full" | "benchmark"
 *
 *   B) Product-mode style (new, preferred for new code):
 *      <FeatureGuard required="full">…</FeatureGuard>
 *      required: "any" | "full" | "lite"
 *
 *   When both are supplied, `required` (product style) takes precedence.
 *
 * Behaviour matrix:
 *   phase=loading                   → spinner
 *   phase=required (not set up)     → "Complete setup" screen → /setup
 *   phase=complete, wrong mode      → "Not available in Lite/Full mode" screen
 *                                     → "Upgrade to Full" (lite→full) or /setup
 *   phase=complete, correct mode    → render children
 *   phase=error                     → render children (fail-open)
 *
 * Also exports:
 *   useFeatureFlag(required)  — returns boolean for inline guards (hide a
 *                               button / sidebar item without a full block)
 *
 * Isolation contract:
 *   - Reads from SetupStatusContext + ModeContext (no extra fetches).
 *   - Does NOT import any page or service outside src/setup/ or src/context/.
 *   - Uses only @mui/material, @mui/icons-material, react-router-dom.
 */

import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useSetupContext } from './SetupStatusContext';
import { useMode, type AppMode } from '../context/ModeContext';
import { useUpgrade } from '../hooks/useUpgrade';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Server-mode vocabulary (backward-compat). */
export type RequiredMode = 'any' | 'full' | 'benchmark';

/** Product-mode vocabulary (new, preferred). */
export type RequiredFeature = 'any' | 'full' | 'lite';

export interface FeatureGuardProps {
  /**
   * Product-mode style (preferred for new code).
   * "full" → only accessible in Full mode.
   * "lite" → only accessible in Lite (benchmark) mode.
   * "any"  → accessible once setup is complete in any mode.
   *
   * When supplied, takes precedence over `requiredMode`.
   */
  required?: RequiredFeature;

  /**
   * Server-mode style (backward-compat, used in App.tsx route wrappers).
   * "full"      → server mode must be "full".
   * "benchmark" → server mode must be "benchmark".
   * "any"       → any completed setup is acceptable.
   */
  requiredMode?: RequiredMode;

  /**
   * Stage 7 — Fallback redirect.
   *
   * When `true`, a mode mismatch silently redirects the user to their mode's
   * home route instead of rendering the upgrade / wrong-mode blocked screen.
   *
   * Use this on **route wrappers** in App.tsx so a Lite user typing
   * `/dashboard` in the address bar is silently bounced to `/lite` rather
   * than seeing an interstitial.
   *
   * Leave `false` (default) for inline guards inside pages where you WANT the
   * upgrade call-to-action to be visible (e.g. a locked section within a page
   * that the user is allowed to see but not interact with).
   */
  redirect?: boolean;

  children: React.ReactNode;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map product RequiredFeature → server RequiredMode for the existing isAllowed logic. */
function featureToMode(f: RequiredFeature): RequiredMode {
  if (f === 'full') return 'full';
  if (f === 'lite') return 'benchmark';
  return 'any';
}

function isAllowed(serverMode: string, required: RequiredMode): boolean {
  if (required === 'any') return true;
  return serverMode === required;
}

/** Human-readable label for the current AppMode shown in blocked screens. */
function appModeLabel(mode: AppMode): string {
  if (mode === 'lite') return 'Lite';
  if (mode === 'full') return 'Full';
  return 'current';
}

/** Human-readable label for what mode IS required. */
function requiredLabel(req: RequiredMode): string {
  if (req === 'full') return 'Full';
  if (req === 'benchmark') return 'Lite (Benchmark)';
  return 'any';
}

// ── Blocked screen ────────────────────────────────────────────────────────────

interface BlockedScreenProps {
  title: string;
  description: string;
  /** Primary CTA — "Upgrade to Full" or "Go to Setup". */
  ctaLabel: string;
  ctaIcon?: React.ReactNode;
  onCta: () => void | Promise<void>;
  /** Secondary CTA shown only when user is in wrong mode (not unset). */
  secondaryCta?: { label: string; onClick: () => void };
  variant: 'incomplete' | 'wrong-mode';
}

function BlockedScreen({
  title,
  description,
  ctaLabel,
  ctaIcon,
  onCta,
  secondaryCta,
  variant,
}: BlockedScreenProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onCta();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Box
      role="main"
      aria-label="Feature locked"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        px: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: 520,
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: variant === 'incomplete' ? 'warning.light' : 'action.disabledBackground',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LockOutlinedIcon
            sx={{
              fontSize: 36,
              color: variant === 'incomplete' ? 'warning.dark' : 'text.disabled',
            }}
            aria-hidden="true"
          />
        </Box>

        {/* Text */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h6" component="h1" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>

        {/* Error */}
        {err && (
          <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>
            {err}
          </Alert>
        )}

        <Divider sx={{ width: '100%' }} />

        {/* CTAs */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleClick}
            disabled={busy}
            startIcon={
              busy
                ? <CircularProgress size={16} color="inherit" />
                : ctaIcon
            }
          >
            {busy ? 'Please wait…' : ctaLabel}
          </Button>

          {secondaryCta && (
            <Button
              variant="text"
              size="small"
              color="inherit"
              onClick={secondaryCta.onClick}
              sx={{ color: 'text.secondary' }}
            >
              {secondaryCta.label}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ── FeatureGuard ──────────────────────────────────────────────────────────────

export function FeatureGuard({
  required,
  requiredMode = 'any',
  redirect = false,
  children,
}: FeatureGuardProps) {
  const { phase, mode: serverMode } = useSetupContext();
  const { mode: appMode, homeRoute } = useMode();
  const navigate = useNavigate();
  const { upgrade } = useUpgrade();

  // Resolve effective required mode — product prop takes precedence.
  const effectiveRequired: RequiredMode = required
    ? featureToMode(required)
    : requiredMode;

  // ── Still loading ─────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 2,
          flexDirection: 'column',
        }}
      >
        <CircularProgress size={36} />
        <Typography variant="body2" color="text.secondary">
          Checking setup status…
        </Typography>
      </Box>
    );
  }

  // ── Error — fail-open, never block the user ───────────────────────────────
  if (phase === 'error') {
    return <>{children}</>;
  }

  // ── Setup not complete ────────────────────────────────────────────────────
  if (phase === 'required') {
    return (
      <BlockedScreen
        variant="incomplete"
        title="Complete setup to unlock this feature"
        description="FlexGate hasn't been configured yet. Run the setup wizard to enable routing, metrics, logs, and all advanced features."
        ctaLabel="Go to Setup"
        onCta={() => navigate('/setup', { replace: true })}
      />
    );
  }

  // ── Setup complete but mode doesn't satisfy the requirement ──────────────
  if (phase === 'complete' && !isAllowed(serverMode, effectiveRequired)) {
    // Stage 7 — redirect prop: silently bounce to the user's home route
    // instead of showing an interstitial.  Used on all App.tsx route wrappers
    // so address-bar trespass (e.g. Lite user typing /dashboard) is seamless.
    if (redirect) {
      return <Navigate to={homeRoute} replace />;
    }

    const isUpgradePath =
      appMode === 'lite' && effectiveRequired === 'full';

    return (
      <BlockedScreen
        variant="wrong-mode"
        title={
          isUpgradePath
            ? 'Full Mode feature'
            : `Not available in ${appModeLabel(appMode)} mode`
        }
        description={
          isUpgradePath
            ? 'This feature is only available in Full mode. Upgrade your FlexGate setup to unlock routing, metrics, logs, AI analytics, and more.'
            : `This feature requires ${requiredLabel(effectiveRequired)} mode. Re-run setup to change your configuration.`
        }
        ctaLabel={isUpgradePath ? 'Upgrade to Full Mode' : 'Re-run Setup'}
        ctaIcon={isUpgradePath ? <StarBorderIcon /> : undefined}
        onCta={upgrade}
        secondaryCta={
          isUpgradePath
            ? { label: `Back to Lite dashboard`, onClick: () => navigate(homeRoute) }
            : undefined
        }
      />
    );
  }

  // ── All checks passed ─────────────────────────────────────────────────────
  return <>{children}</>;
}

// ── useFeatureFlag ────────────────────────────────────────────────────────────

/**
 * Inline feature flag hook — returns true when the current mode satisfies
 * `required`.  Use this to conditionally hide UI elements (sidebar items,
 * buttons, menu entries) without rendering a full blocked screen.
 *
 * @example
 *   const canViewAI = useFeatureFlag('full');
 *   // In JSX:
 *   {canViewAI && <Button onClick={() => navigate('/ai-incidents')}>AI</Button>}
 *
 * Always returns true while loading or on error (fail-open) so the UI
 * doesn't flicker items in/out after the first render.
 */
export function useFeatureFlag(required: RequiredFeature | RequiredMode): boolean {
  const { phase, mode: serverMode } = useSetupContext();
  const { isResolved } = useMode();

  // Fail-open while loading or on error.
  if (phase === 'loading' || phase === 'error' || !isResolved) return true;

  // Map product vocab to server vocab if needed.
  const resolved: RequiredMode =
    required === 'lite' ? 'benchmark'
    : (required as RequiredMode);

  return isAllowed(serverMode, resolved);
}
