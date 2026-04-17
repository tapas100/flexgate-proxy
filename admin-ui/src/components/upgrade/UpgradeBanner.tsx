/**
 * UpgradeBanner
 *
 * Stage 11.5 — Upgrade UI
 *
 * Canonical, reusable "Upgrade to Full Mode" banner for all Lite-mode surfaces.
 * Replaces the inline UpgradeBanner inside LiteDashboard and the ad-hoc
 * upgrade buttons scattered across Sidebar and FeatureGuard.
 *
 * Variants:
 *   "strip"   — single horizontal bar, minimal vertical space (default)
 *               Used in: LiteDashboard top, any page header
 *
 *   "card"    — standalone card with icon, copy, and button
 *               Used in: empty state panels, inline locked-feature spots
 *
 *   "inline"  — just the button, no surrounding chrome
 *               Used in: table footers, compact CTAs
 *
 * All three variants use useUpgrade() internally — zero prop-drilling of
 * reset logic, no duplicate fetch code.
 *
 * Props shared across all variants:
 *   variant?       "strip" | "card" | "inline"  (default: "strip")
 *   featureHint?   Short description of what the user is missing, e.g.
 *                  "AI Analytics, routing, metrics, and logs"
 *   onUpgradeStart? Optional callback fired before the async upgrade starts.
 *   onUpgradeError? Optional callback fired when upgrade throws.
 */

import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { useUpgrade } from '../../hooks/useUpgrade';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UpgradeBannerVariant = 'strip' | 'card' | 'inline';

export interface UpgradeBannerProps {
  variant?: UpgradeBannerVariant;
  /** What the user unlocks. Shown in supporting copy. */
  featureHint?: string;
  onUpgradeStart?: () => void;
  onUpgradeError?: (err: Error) => void;
}

// ── Shared upgrade button ─────────────────────────────────────────────────────

interface UpgradeButtonProps {
  upgrading: boolean;
  onClick: () => void;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
}

function UpgradeButton({ upgrading, onClick, size = 'small', fullWidth }: UpgradeButtonProps) {
  return (
    <Button
      variant="contained"
      color="warning"
      size={size}
      disabled={upgrading}
      onClick={onClick}
      fullWidth={fullWidth}
      endIcon={upgrading ? <CircularProgress size={14} color="inherit" /> : <ArrowForwardIcon />}
      sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}
    >
      {upgrading ? 'Upgrading…' : 'Upgrade to Full Mode'}
    </Button>
  );
}

// ── Strip variant ─────────────────────────────────────────────────────────────

function StripBanner({ featureHint, upgrading, error, onUpgrade }: {
  featureHint?: string;
  upgrading: boolean;
  error: string | null;
  onUpgrade: () => void;
}) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          px: 2.5,
          py: 1.25,
          borderRadius: 2,
          bgcolor: 'warning.light',
          border: '1px solid',
          borderColor: 'warning.main',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <StarBorderIcon sx={{ color: 'warning.dark', fontSize: 20, flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={600} color="warning.dark" noWrap>
            You're in Lite Mode.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {featureHint
              ? `Unlock ${featureHint} and more.`
              : 'Unlock routing, metrics, logs, AI analytics and more.'}
          </Typography>
        </Box>
        <UpgradeButton upgrading={upgrading} onClick={onUpgrade} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 1, borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

// ── Card variant ──────────────────────────────────────────────────────────────

function CardBanner({ featureHint, upgrading, error, onUpgrade }: {
  featureHint?: string;
  upgrading: boolean;
  error: string | null;
  onUpgrade: () => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{ borderColor: 'warning.main', bgcolor: 'warning.50' }}
    >
      <CardContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 2,
          py: 3,
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'warning.light',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RocketLaunchIcon sx={{ color: 'warning.dark', fontSize: 28 }} />
        </Box>

        <Box>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Upgrade to Full Mode
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {featureHint
              ? `Get access to ${featureHint} and the complete FlexGate feature set.`
              : 'Get access to routing, metrics, logs, AI analytics, webhooks, and more.'}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        <UpgradeButton upgrading={upgrading} onClick={onUpgrade} size="medium" fullWidth />
      </CardContent>
    </Card>
  );
}

// ── Inline variant ────────────────────────────────────────────────────────────

function InlineBanner({ upgrading, error, onUpgrade }: {
  upgrading: boolean;
  error: string | null;
  onUpgrade: () => void;
}) {
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: 0.5 }}>
      <UpgradeButton upgrading={upgrading} onClick={onUpgrade} />
      {error && (
        <Typography variant="caption" color="error.main">
          {error}
        </Typography>
      )}
    </Box>
  );
}

// ── UpgradeBanner ─────────────────────────────────────────────────────────────

export function UpgradeBanner({
  variant = 'strip',
  featureHint,
  onUpgradeStart,
  onUpgradeError,
}: UpgradeBannerProps) {
  const { upgrade, upgrading, error } = useUpgrade();

  const handleUpgrade = async () => {
    onUpgradeStart?.();
    try {
      await upgrade();
    } catch (e: unknown) {
      onUpgradeError?.(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const shared = { featureHint, upgrading, error, onUpgrade: handleUpgrade };

  if (variant === 'card') return <CardBanner {...shared} />;
  if (variant === 'inline') return <InlineBanner upgrading={upgrading} error={error} onUpgrade={handleUpgrade} />;
  return <StripBanner {...shared} />;
}
