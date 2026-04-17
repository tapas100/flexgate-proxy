/**
 * DependenciesStep
 *
 * Stage 5 — Dependency Selection
 *
 * Fetches GET /api/setup/detect on mount to learn what's already installed,
 * then lets the operator choose which tools to use or skip.
 *
 * Selection model per dependency:
 *   'use'  — tool is installed and operator wants FlexGate to use it
 *   'skip' — operator wants to ignore this tool for now
 *
 * Port status is informational only (no checkboxes).
 *
 * Zero friction principle: nothing is forced — every item can be skipped.
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Divider,
  Chip,
  Fade,
  Alert,
  Tooltip,
  Grid,
  Paper,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { SetupMode } from './ModeStep';

// ── Wire types (mirrors detector.Report) ─────────────────────────────────────

export interface ToolResult {
  installed: boolean;
  version: string;
  error: string;
}

export interface PortResult {
  port: number;
  status: 'free' | 'in_use' | 'unknown';
  error: string;
}

export interface DetectionReport {
  nginx:    ToolResult;
  haproxy:  ToolResult;
  docker:   ToolResult;
  podman:   ToolResult;
  postgres: ToolResult;
  redis:    ToolResult;
  nats:     ToolResult;
  ports:    Record<string, PortResult>;
  detectedAt: string;
}

// ── DepsSelection — key = tool name, value = action ──────────────────────────

export type DepAction = 'use' | 'skip';
export type DepsSelection = Record<string, DepAction>;

// ── Dependency metadata ───────────────────────────────────────────────────────

interface DepMeta {
  key: string;       // matches field in DetectionReport
  label: string;
  description: string;
  relevantModes: SetupMode[];  // modes where this dep is shown
  /**
   * When true the dep is pre-selected and shown with a "required" badge
   * for the relevant mode. The operator can still override to 'skip'.
   */
  requiredFor?: SetupMode[];
}

const DEP_META: DepMeta[] = [
  // ── Core services (Full mode) ────────────────────────────────────────────
  {
    key: 'postgres',
    label: 'PostgreSQL',
    description: 'Primary database — stores routes, settings, metrics, and audit logs.',
    relevantModes: ['full'],
    requiredFor: ['full'],
  },
  {
    key: 'redis',
    label: 'Redis',
    description: 'Cache and pub/sub — used for rate-limiting, session storage, and live events.',
    relevantModes: ['full'],
    requiredFor: ['full'],
  },
  {
    key: 'nats',
    label: 'NATS',
    description: 'Messaging backbone for real-time log streaming and AI incident events.',
    relevantModes: ['full'],
    requiredFor: ['full'],
  },
  // ── Reverse proxies ──────────────────────────────────────────────────────
  {
    key: 'nginx',
    label: 'Nginx',
    description: 'High-performance HTTP reverse proxy and load balancer.',
    relevantModes: ['benchmark', 'full'],
  },
  {
    key: 'haproxy',
    label: 'HAProxy',
    description: 'TCP/HTTP load balancer used for proxy comparison benchmarks.',
    relevantModes: ['benchmark', 'full'],
  },
  // ── Container runtimes ───────────────────────────────────────────────────
  {
    key: 'docker',
    label: 'Docker',
    description: 'Container runtime for running FlexGate and its dependencies.',
    relevantModes: ['full'],
  },
  {
    key: 'podman',
    label: 'Podman',
    description: 'Daemonless container engine — alternative to Docker.',
    relevantModes: ['full'],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DependenciesStepProps {
  /** Mode chosen in the previous step — filters which deps are shown. */
  selectedMode: SetupMode | null;
  /** Current per-tool selection from useSetup hook. */
  depsSelection: DepsSelection;
  /** Update a single dep's action. */
  onToggle: (key: string, action: DepAction) => void;
  /** Called when user clicks Continue — triggers POST /api/setup/dependencies. */
  onNext: () => Promise<void>;
  /** Called when user clicks Back. */
  onBack: () => void;
  /** True while POST /api/setup/dependencies is in-flight. */
  saving: boolean;
  /** Error from POST /api/setup/dependencies, if any. */
  saveError: string | null;
  /** Detection report — null while loading, undefined on fetch error. */
  detectionReport: DetectionReport | null | undefined;
  /** True while GET /api/setup/detect is in-flight. */
  detectLoading: boolean;
  /** Error from GET /api/setup/detect, if any. */
  detectError: string | null;
}

// ── Port status badge colour ───────────────────────────────────────────────

function portColor(s: PortResult['status']): 'success' | 'warning' | 'default' {
  if (s === 'free')   return 'success';
  if (s === 'in_use') return 'warning';
  return 'default';
}

// ── Component ─────────────────────────────────────────────────────────────────

const DependenciesStep: React.FC<DependenciesStepProps> = ({
  selectedMode,
  depsSelection,
  onToggle,
  onNext,
  onBack,
  saving,
  saveError,
  detectionReport,
  detectLoading,
  detectError,
}) => {
  // Stagger fade-in of dep rows
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Filter deps by chosen mode (show all if mode unknown)
  const visibleDeps = DEP_META.filter(
    (d) => !selectedMode || d.relevantModes.includes(selectedMode),
  );

  function getToolResult(key: string): ToolResult | undefined {
    if (!detectionReport) return undefined;
    return (detectionReport as unknown as Record<string, ToolResult>)[key];
  }

  const portEntries = detectionReport
    ? Object.entries(detectionReport.ports ?? {})
    : [];

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Fade in timeout={200}>
        <Box mb={3}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Dependencies
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We scanned your environment. Choose which tools FlexGate should
            use — or skip anything you don&apos;t need. Nothing is installed
            automatically.
          </Typography>
        </Box>
      </Fade>

      {/* ── Detection loading / error ────────────────────────────────────── */}
      {detectLoading && (
        <Box display="flex" alignItems="center" gap={1.5} mb={3}>
          <CircularProgress size={18} thickness={4} />
          <Typography variant="body2" color="text.secondary">
            Scanning your environment…
          </Typography>
        </Box>
      )}

      {detectError && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Environment scan failed: {detectError}. You can still continue —
          selections will default to <strong>skip</strong>.
        </Alert>
      )}

      {/* ── Dependency rows ───────────────────────────────────────────────── */}
      {!detectLoading && (
        <Box mb={3}>
          {visibleDeps.map((dep, idx) => {
            const tool = getToolResult(dep.key);
            const action: DepAction = depsSelection[dep.key] ?? 'skip';

            return (
              <Fade key={dep.key} in={visible} timeout={200 + idx * 80}>
                <Paper
                  variant="outlined"
                  sx={{
                    mb: 1.5,
                    p: { xs: 2, sm: 2.5 },
                    borderRadius: 2,
                    borderColor: action === 'use' ? 'primary.main' : 'divider',
                    bgcolor: action === 'use' ? 'primary.50' : 'background.paper',
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                >
                  <Grid container alignItems="center" spacing={2}>
                    {/* Left: status icon + label + description */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Box display="flex" alignItems="flex-start" gap={1.5}>
                        {tool ? (
                          tool.installed ? (
                            <Tooltip title={`Installed: ${tool.version || 'version unknown'}`}>
                              <CheckCircleIcon
                                sx={{ color: 'success.main', mt: 0.2, flexShrink: 0 }}
                                fontSize="small"
                              />
                            </Tooltip>
                          ) : (
                            <Tooltip title="Not found on this host">
                              <CancelIcon
                                sx={{ color: 'text.disabled', mt: 0.2, flexShrink: 0 }}
                                fontSize="small"
                              />
                            </Tooltip>
                          )
                        ) : (
                          <Box
                            sx={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              bgcolor: 'grey.200',
                              flexShrink: 0,
                              mt: 0.3,
                            }}
                          />
                        )}

                        <Box>
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Typography variant="body2" fontWeight={600}>
                              {dep.label}
                            </Typography>
                            {/* Required badge — shown for Full-mode core services */}
                            {dep.requiredFor?.includes(selectedMode as SetupMode) && (
                              <Chip
                                label="required"
                                size="small"
                                color="primary"
                                sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                              />
                            )}
                            {tool?.installed && tool.version && (
                              <Chip
                                label={tool.version}
                                size="small"
                                variant="outlined"
                                sx={{
                                  height: 18,
                                  fontSize: 11,
                                  color: 'text.secondary',
                                  borderColor: 'divider',
                                }}
                              />
                            )}
                            {!tool?.installed && (
                              <Chip
                                label="not found"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: 11,
                                  bgcolor: 'grey.100',
                                  color: 'text.disabled',
                                }}
                              />
                            )}
                          </Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 0.3 }}
                          >
                            {dep.description}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>

                    {/* Right: Use / Skip toggle */}
                    <Grid
                      size={{ xs: 12, sm: 6 }}
                      sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}
                    >
                      <ToggleButtonGroup
                        value={action}
                        exclusive
                        size="small"
                        onChange={(_e, val: DepAction | null) => {
                          // ToggleButtonGroup can return null if user clicks
                          // the already-selected button — keep current value.
                          if (val !== null) onToggle(dep.key, val);
                        }}
                        aria-label={`${dep.label} action`}
                        sx={{ '& .MuiToggleButton-root': { px: 2, fontSize: 12 } }}
                      >
                        <ToggleButton
                          value="use"
                          disabled={!tool?.installed}
                          aria-label={`Use ${dep.label}`}
                          sx={{
                            '&.Mui-selected': {
                              bgcolor: 'primary.main',
                              color: 'primary.contrastText',
                              '&:hover': { bgcolor: 'primary.dark' },
                            },
                          }}
                        >
                          Use
                        </ToggleButton>
                        <ToggleButton
                          value="skip"
                          aria-label={`Skip ${dep.label}`}
                          sx={{
                            '&.Mui-selected': {
                              bgcolor: 'grey.200',
                              color: 'text.primary',
                            },
                          }}
                        >
                          Skip
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Grid>
                  </Grid>
                </Paper>
              </Fade>
            );
          })}
        </Box>
      )}

      {/* ── Port status (informational) ───────────────────────────────────── */}
      {portEntries.length > 0 && (
        <Fade in={visible} timeout={500}>
          <Box mb={3}>
            <Divider sx={{ mb: 2 }} />
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ letterSpacing: 1.2 }}
            >
              Port availability
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
              {portEntries.map(([name, pr]) => (
                <Tooltip
                  key={name}
                  title={
                    pr.status === 'in_use'
                      ? `Port ${pr.port} is already in use`
                      : pr.status === 'free'
                      ? `Port ${pr.port} is available`
                      : `Could not determine port ${pr.port} status`
                  }
                >
                  <Chip
                    label={`${name} :${pr.port}`}
                    size="small"
                    color={portColor(pr.status)}
                    variant={pr.status === 'free' ? 'filled' : 'outlined'}
                    sx={{ fontSize: 12, fontFamily: 'monospace' }}
                  />
                </Tooltip>
              ))}
            </Box>
            <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
              In-use ports may require changes to FlexGate&apos;s port configuration.
            </Typography>
          </Box>
        </Fade>
      )}

      {/* ── Save error ───────────────────────────────────────────────────── */}
      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}

      {/* ── Action row ───────────────────────────────────────────────────── */}
      <Divider sx={{ mb: 2.5 }} />
      <Box display="flex" alignItems="center">
        <Button
          variant="text"
          onClick={onBack}
          disabled={saving}
          sx={{ color: 'text.secondary' }}
        >
          Back
        </Button>

        <Button
          variant="contained"
          onClick={onNext}
          disabled={saving || detectLoading}
          sx={{ ml: 'auto', minWidth: 120 }}
          startIcon={
            saving ? (
              <CircularProgress size={16} thickness={4} color="inherit" />
            ) : undefined
          }
        >
          {saving ? 'Saving…' : 'Continue'}
        </Button>
      </Box>
    </Box>
  );
};

export default DependenciesStep;
