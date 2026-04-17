/**
 * AlreadyCompleteScreen
 *
 * Stage 9 — Skip Setup
 *
 * Shown inside SetupGuard when the user navigates to /setup but the backend
 * reports isSetupComplete === true.  Gives them two choices:
 *
 *   1. "Go to Dashboard" (or "Go to Benchmarks" in benchmark mode)
 *      → calls onNavigate(), which redirects them to the right destination.
 *
 *   2. "Re-run Setup"
 *      → calls POST /api/setup/reset, then navigates to /setup so the wizard
 *        restarts fresh.
 *
 * Isolation contract:
 *   - Only imports from @mui/*, react, and react-router-dom.
 *   - Does NOT import from any existing app service, hook, or context.
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

export interface AlreadyCompleteScreenProps {
  /** Mode returned by GET /api/setup/status ("benchmark" | "full" | ""). */
  mode: string;
  /** Called when the user clicks "Go to Dashboard / Benchmarks". */
  onNavigate: () => void;
  /** Called when the user confirms they want to re-run setup. */
  onReset: () => Promise<void>;
}

export function AlreadyCompleteScreen({
  mode,
  onNavigate,
  onReset,
}: AlreadyCompleteScreenProps) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const isBenchmark = mode === 'benchmark';
  const destination = isBenchmark ? 'Benchmarks' : 'Dashboard';

  const handleReset = async () => {
    setResetting(true);
    setResetError(null);
    try {
      await onReset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed. Please try again.';
      setResetError(msg);
      setResetting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {/* Icon */}
        <CheckCircleOutlineIcon
          sx={{ fontSize: 72, color: 'success.main' }}
          aria-hidden="true"
        />

        {/* Heading */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h5" component="h1" fontWeight={700}>
            Setup Already Completed
          </Typography>
          <Typography variant="body1" color="text.secondary">
            FlexGate is configured and ready to use.
            {isBenchmark
              ? ' Your benchmark environment is up and running.'
              : ' Your proxy routes and settings are in place.'}
          </Typography>
        </Box>

        {/* Error alert (only visible after a failed reset attempt) */}
        {resetError && (
          <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>
            {resetError}
          </Alert>
        )}

        {/* Actions */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            width: '100%',
          }}
        >
          {/* Primary CTA */}
          <Button
            variant="contained"
            size="large"
            onClick={onNavigate}
            disabled={resetting}
            sx={{ flex: 1 }}
          >
            Go to {destination}
          </Button>

          {/* Secondary CTA */}
          <Button
            variant="outlined"
            size="large"
            onClick={handleReset}
            disabled={resetting}
            startIcon={resetting ? <CircularProgress size={16} /> : undefined}
            sx={{ flex: 1 }}
          >
            {resetting ? 'Resetting…' : 'Re-run Setup'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
