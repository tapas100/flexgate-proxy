/**
 * BenchmarkScenariosStep
 *
 * Stage 6 — Benchmark Scenario Selection
 *
 * Lets the operator choose which benchmark scenarios to run.
 * Defaults are computed from the detection report (Stage 5):
 *   - Baseline    → always on
 *   - HAProxy     → on if haproxy was detected and set to 'use'
 *   - Nginx       → on if nginx was detected and set to 'use'
 *   - FlexGate Inline  → always on
 *   - FlexGate Mirror  → always on
 *
 * Each row shows:
 *   - Checkbox
 *   - Icon + title + description
 *   - Availability chip (e.g. "requires HAProxy" when dep not found)
 *
 * Auto-select principle: scenarios are pre-checked based on environment;
 * the operator can freely uncheck anything.
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Divider,
  Chip,
  Fade,
  Alert,
  Tooltip,
  Paper,
  Checkbox,
  CircularProgress,
  Grid,
} from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MemoryIcon from '@mui/icons-material/Memory';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FunctionsIcon from '@mui/icons-material/Functions';
import type { DepsSelection } from './DependenciesStep';

// ── Scenario definitions ──────────────────────────────────────────────────────

export type ScenarioId =
  | 'baseline'
  | 'haproxy'
  | 'nginx'
  | 'flexgate-inline'
  | 'flexgate-mirror';

export type ScenarioSelection = Record<ScenarioId, boolean>;

interface ScenarioMeta {
  id: ScenarioId;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  /** Dep key from DepsSelection that must be 'use' for this to be auto-checked.
   *  undefined = no dep requirement (always auto-checked). */
  requiresDep?: string;
  /** Human-readable requirement label shown when dep is missing. */
  requiresLabel?: string;
}

const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'baseline',
    icon: <FunctionsIcon sx={{ fontSize: 22 }} />,
    iconColor: '#5c6bc0',
    iconBg: 'rgba(92, 107, 192, 0.12)',
    title: 'Baseline',
    description:
      'Direct upstream calls with no proxy — establishes the raw throughput ceiling.',
  },
  {
    id: 'haproxy',
    icon: <CompareArrowsIcon sx={{ fontSize: 22 }} />,
    iconColor: '#0288d1',
    iconBg: 'rgba(2, 136, 209, 0.12)',
    title: 'HAProxy',
    description:
      'Routes traffic through HAProxy — industry reference point for latency comparison.',
    requiresDep: 'haproxy',
    requiresLabel: 'HAProxy',
  },
  {
    id: 'nginx',
    icon: <SpeedIcon sx={{ fontSize: 22 }} />,
    iconColor: '#2e7d32',
    iconBg: 'rgba(46, 125, 50, 0.12)',
    title: 'Nginx',
    description:
      'Routes traffic through Nginx — measures proxy overhead vs. baseline.',
    requiresDep: 'nginx',
    requiresLabel: 'Nginx',
  },
  {
    id: 'flexgate-inline',
    icon: <MemoryIcon sx={{ fontSize: 22 }} />,
    iconColor: '#e65100',
    iconBg: 'rgba(230, 81, 0, 0.12)',
    title: 'FlexGate Inline',
    description:
      'FlexGate as a synchronous proxy — measures rule evaluation and routing overhead.',
  },
  {
    id: 'flexgate-mirror',
    icon: <VisibilityIcon sx={{ fontSize: 22 }} />,
    iconColor: '#6a1b9a',
    iconBg: 'rgba(106, 27, 154, 0.12)',
    title: 'FlexGate Mirror',
    description:
      'FlexGate in traffic-mirroring mode — upstream is unaffected; analytics run async.',
  },
];

// ── Auto-selection logic ──────────────────────────────────────────────────────

/**
 * Compute the default checked state for each scenario based on what deps are
 * available. Called once on mount; the operator can override freely.
 */
export function defaultScenarioSelection(depsSelection: DepsSelection): ScenarioSelection {
  const result = {} as ScenarioSelection;
  for (const sc of SCENARIOS) {
    if (!sc.requiresDep) {
      result[sc.id] = true; // no dep needed — always on by default
    } else {
      result[sc.id] = depsSelection[sc.requiresDep] === 'use';
    }
  }
  return result;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BenchmarkScenariosStepProps {
  /** Dep selections from Stage 5 — used for auto-check logic and availability chips. */
  depsSelection: DepsSelection;
  /** Current scenario selection (controlled). */
  scenarioSelection: ScenarioSelection;
  /** Toggle a single scenario on/off. */
  onToggle: (id: ScenarioId) => void;
  /** Called when user clicks Continue — triggers POST /api/setup/benchmarks. */
  onNext: () => Promise<void>;
  /** Called when user clicks Back. */
  onBack: () => void;
  /** True while POST /api/setup/benchmarks is in-flight. */
  saving: boolean;
  /** Error from POST /api/setup/benchmarks, if any. */
  saveError: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

const BenchmarkScenariosStep: React.FC<BenchmarkScenariosStepProps> = ({
  depsSelection,
  scenarioSelection,
  onToggle,
  onNext,
  onBack,
  saving,
  saveError,
}) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const selectedCount = Object.values(scenarioSelection).filter(Boolean).length;

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Fade in timeout={200}>
        <Box mb={3}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Benchmark Scenarios
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose which scenarios to include in the benchmark run. Scenarios
            that require a tool you skipped are pre-deselected — you can still
            enable them if you change your mind.
          </Typography>
        </Box>
      </Fade>

      {/* ── Scenario rows ─────────────────────────────────────────────────── */}
      <Box mb={3}>
        {SCENARIOS.map((sc, idx) => {
          const checked = scenarioSelection[sc.id] ?? false;
          const depMissing =
            !!sc.requiresDep && depsSelection[sc.requiresDep] !== 'use';

          return (
            <Fade key={sc.id} in={visible} timeout={180 + idx * 70}>
              <Paper
                variant="outlined"
                onClick={() => onToggle(sc.id)}
                sx={{
                  mb: 1.5,
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 2,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderColor: checked ? 'primary.main' : 'divider',
                  bgcolor: checked ? 'primary.50' : 'background.paper',
                  transition: 'border-color 0.15s, background-color 0.15s',
                  '&:hover': {
                    borderColor: checked ? 'primary.dark' : 'grey.400',
                  },
                }}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(sc.id);
                  }
                }}
              >
                <Grid container alignItems="center" spacing={1.5}>
                  {/* Checkbox */}
                  <Grid size={{ xs: 'auto' }}>
                    <Checkbox
                      checked={checked}
                      onChange={() => onToggle(sc.id)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                      sx={{ p: 0 }}
                      inputProps={{ 'aria-label': sc.title }}
                    />
                  </Grid>

                  {/* Icon */}
                  <Grid size={{ xs: 'auto' }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1.5,
                        bgcolor: sc.iconBg,
                        color: sc.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {sc.icon}
                    </Box>
                  </Grid>

                  {/* Text */}
                  <Grid size={{ xs: 12, sm: 'grow' }}>
                    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: checked ? 'text.primary' : 'text.secondary' }}
                      >
                        {sc.title}
                      </Typography>

                      {depMissing && (
                        <Tooltip
                          title={`${sc.requiresLabel} was not found or was skipped in the previous step`}
                        >
                          <Chip
                            label={`requires ${sc.requiresLabel}`}
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ height: 18, fontSize: 11 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.25 }}
                    >
                      {sc.description}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Fade>
          );
        })}
      </Box>

      {/* ── Selection summary ─────────────────────────────────────────────── */}
      <Fade in={visible} timeout={500}>
        <Box mb={2}>
          <Typography variant="caption" color="text.secondary">
            {selectedCount === 0
              ? 'No scenarios selected — at least one is recommended.'
              : `${selectedCount} of ${SCENARIOS.length} scenario${selectedCount !== 1 ? 's' : ''} selected`}
          </Typography>
        </Box>
      </Fade>

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
          disabled={saving}
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

export default BenchmarkScenariosStep;
