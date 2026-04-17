/**
 * InstallDepsStep
 *
 * Wizard step that appears between "Dependencies" and "Benchmarks" ONLY when
 * one or more required dependencies are missing.
 *
 * Per-dep UX:
 *   - Already installed → green ✔, no action needed
 *   - Missing           → "Install" button + method selector (brew/podman/apt)
 *   - Installing        → streaming log output, spinner
 *   - Install failed    → error message + retry
 *   - Skipped           → user can mark "Skip anyway" and continue
 *
 * The "Next" button is enabled once every dep is either installed or explicitly skipped.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SkipNextIcon from '@mui/icons-material/SkipNext';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InstallMethod = 'auto' | 'brew' | 'apt' | 'podman';

export interface DepInstallState {
  key: string;
  label: string;
  alreadyInstalled: boolean;
  status: 'idle' | 'installing' | 'done' | 'failed' | 'skipped';
  logs: string[];
  error: string | null;
  method: InstallMethod;
}

export interface InstallDepsStepProps {
  deps: DepInstallState[];
  onInstall: (key: string, method: InstallMethod) => void;
  onSkip: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<InstallMethod, string> = {
  auto: 'Auto',
  brew: 'Homebrew',
  apt: 'apt-get',
  podman: 'Container',
};

function canProceed(deps: DepInstallState[]): boolean {
  return deps.every(
    (d) => d.alreadyInstalled || d.status === 'done' || d.status === 'skipped',
  );
}

// ── DepRow ────────────────────────────────────────────────────────────────────

interface DepRowProps {
  dep: DepInstallState;
  onInstall: (method: InstallMethod) => void;
  onSkip: () => void;
}

const DepRow: React.FC<DepRowProps> = ({ dep, onInstall, onSkip }) => {
  const [showLog, setShowLog] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<InstallMethod>(dep.method);
  const logRef = useRef<HTMLDivElement>(null);

  const busy = dep.status === 'installing';

  // Status chip
  const statusChip = () => {
    if (dep.alreadyInstalled || dep.status === 'done') {
      return <Chip icon={<CheckCircleOutlineIcon />} label="Installed" color="success" size="small" />;
    }
    if (dep.status === 'installing') {
      return <Chip icon={<CircularProgress size={12} />} label="Installing…" color="primary" size="small" />;
    }
    if (dep.status === 'failed') {
      return <Chip icon={<ErrorOutlineIcon />} label="Failed" color="error" size="small" />;
    }
    if (dep.status === 'skipped') {
      return <Chip label="Skipped" size="small" sx={{ bgcolor: 'grey.200' }} />;
    }
    return <Chip label="Not installed" size="small" variant="outlined" color="warning" />;
  };

  const showActions = !dep.alreadyInstalled && dep.status !== 'done';

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor:
          dep.alreadyInstalled || dep.status === 'done'
            ? 'success.light'
            : dep.status === 'failed'
            ? 'error.light'
            : dep.status === 'skipped'
            ? 'divider'
            : 'warning.light',
        transition: 'border-color 0.2s',
      }}
    >
      <CardContent sx={{ py: '12px !important', px: 2 }}>
        {/* ── Header row ──────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <BuildIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />

          <Typography variant="body2" fontWeight={700} sx={{ flex: '1 1 120px' }}>
            {dep.label}
          </Typography>

          {statusChip()}

          {/* Log toggle when there are log lines */}
          {dep.logs.length > 0 && (
            <Tooltip title={showLog ? 'Hide output' : 'Show output'}>
              <IconButton size="small" onClick={() => setShowLog((v) => !v)}>
                {showLog ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* ── Error message ────────────────────────────────────────────── */}
        {dep.status === 'failed' && dep.error && (
          <Alert severity="error" sx={{ mt: 1.5, fontSize: 12 }}>
            {dep.error}
          </Alert>
        )}

        {/* ── Log output ───────────────────────────────────────────────── */}
        <Collapse in={showLog && dep.logs.length > 0}>
          <Box
            ref={logRef}
            sx={{
              mt: 1.5,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'grey.900',
              maxHeight: 200,
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            {dep.logs.map((line, i) => (
              <Box key={i} component="div" sx={{ color: 'grey.100', lineHeight: 1.6 }}>
                {line}
              </Box>
            ))}
          </Box>
        </Collapse>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        {showActions && (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Method selector */}
            <ButtonGroup size="small" disabled={busy}>
              {(['auto', 'brew', 'podman', 'apt'] as InstallMethod[]).map((m) => (
                <Button
                  key={m}
                  variant={selectedMethod === m ? 'contained' : 'outlined'}
                  onClick={() => setSelectedMethod(m)}
                  sx={{ fontSize: 11, py: 0.4 }}
                >
                  {METHOD_LABELS[m]}
                </Button>
              ))}
            </ButtonGroup>

            {/* Install button */}
            <Button
              variant="contained"
              size="small"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
              onClick={() => {
                setShowLog(true);
                onInstall(selectedMethod);
              }}
            >
              {busy ? 'Installing…' : dep.status === 'failed' ? 'Retry' : 'Install'}
            </Button>

            {/* Skip button */}
            <Button
              variant="text"
              size="small"
              color="inherit"
              disabled={busy}
              startIcon={<SkipNextIcon fontSize="small" />}
              onClick={onSkip}
              sx={{ color: 'text.secondary', fontSize: 11 }}
            >
              Skip
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

// ── InstallDepsStep ───────────────────────────────────────────────────────────

const InstallDepsStep: React.FC<InstallDepsStepProps> = ({
  deps,
  onInstall,
  onSkip,
  onNext,
  onBack,
}) => {
  const missingCount = deps.filter((d) => !d.alreadyInstalled && d.status !== 'done').length;
  const skippedCount = deps.filter((d) => d.status === 'skipped').length;
  const ready = canProceed(deps);

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Install Dependencies
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The following required services are not running on this host.
          Click <strong>Install</strong> to set them up automatically, or{' '}
          <strong>Skip</strong> to configure them manually before continuing.
        </Typography>
      </Box>

      {/* ── Summary alert ───────────────────────────────────────────────── */}
      {missingCount > 0 && !ready && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {missingCount} service{missingCount !== 1 ? 's' : ''} still need
          {missingCount === 1 ? 's' : ''} to be installed or skipped before you can continue.
        </Alert>
      )}
      {ready && skippedCount > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {skippedCount} service{skippedCount !== 1 ? 's were' : ' was'} skipped — make sure
          {skippedCount !== 1 ? ' they are' : ' it is'} running before FlexGate starts.
        </Alert>
      )}
      {ready && skippedCount === 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>
          All required services are installed and ready.
        </Alert>
      )}

      {/* ── Dep list ────────────────────────────────────────────────────── */}
      <Stack spacing={1.5} mb={3}>
        {deps.map((dep) => (
          <DepRow
            key={dep.key}
            dep={dep}
            onInstall={(method) => onInstall(dep.key, method)}
            onSkip={() => onSkip(dep.key)}
          />
        ))}
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outlined" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={onNext}
          disabled={!ready}
        >
          {ready ? 'Continue' : `${missingCount} remaining…`}
        </Button>
      </Box>
    </Box>
  );
};

export default InstallDepsStep;
