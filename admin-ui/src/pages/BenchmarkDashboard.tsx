// @ts-nocheck
/**
 * admin-ui/src/pages/BenchmarkDashboard.tsx
 *
 * Real-time benchmark dashboard — Stage 8.
 *
 * Data sources (priority order):
 *   1. SSE stream  GET /api/stream/benchmarks  → via useBenchmarkStream()
 *   2. HTTP poll   GET /api/benchmarks          → fallback when stream is down
 *   3. Static seed data                         → shown until first real data arrives
 *
 * Charts:
 *   • Live RPS        — LineChart, one line per active scenario
 *   • Live Latency    — LineChart P50 / P95 / P99, one line per scenario
 *   • Error Rate      — AreaChart, one area per scenario
 *   • Comparison      — BarChart + summary table (latest snapshot per scenario)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Fade,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as MuiTooltip,
  Typography,
} from '@mui/material';
import {
  ArrowForward as ArrowForwardIcon,
  AutoFixHigh as AutoFixIcon,
  CheckCircle as CheckCircleIcon,
  EmojiEvents as TrophyIcon,
  ErrorOutline as ErrorIcon,
  FiberManualRecord as DotIcon,
  FlashOn as LightningIcon,
  InfoOutlined as InfoIcon,
  NewReleases as NewReleasesIcon, // eslint-disable-line @typescript-eslint/no-unused-vars
  Refresh as RefreshIcon,
  Security as ShieldIcon,
  Speed as SpeedIcon,
  StackedLineChart as OverviewIcon,
  TableChart as TableChartIcon,
  Timer as TimerIcon,
  TrendingDown as WorstIcon,
  TrendingUp as TrendingUpIcon,
  Tune as TuneIcon,
  WifiOff as OfflineIcon,
} from '@mui/icons-material';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useBenchmarkStream } from '../hooks/useBenchmarkStream';
import { apiService }         from '../services/api';
import type { BenchmarkDataPoint, RunStatus } from '../services/benchmarkStream'; // eslint-disable-line @typescript-eslint/no-unused-vars

// ── Palette & grouping ────────────────────────────────────────────────────────

/**
 * SCENARIO_GROUPS defines the three conceptual groups and their display order.
 * Charts, legends, and tables all derive from this single source of truth.
 *
 *  Reference  — raw ceiling (no proxy)
 *  Industry   — established proxies used as comparison baselines
 *  FlexGate   — the two FlexGate deployment modes under evaluation
 */

type GroupKey = 'reference' | 'industry' | 'flexgate';

interface GroupMeta {
  label:       string;
  color:       string;   // group accent color
  bgLight:     string;   // chip / badge background (light mode)
  bgDark:      string;   // chip / badge background (dark mode)
  description: string;
}

const GROUP_META: Record<GroupKey, GroupMeta> = {
  reference: {
    label:       'Reference',
    color:       '#757575',
    bgLight:     '#f5f5f5',
    bgDark:      'rgba(117,117,117,0.15)',
    description: 'Raw ceiling — no proxy overhead',
  },
  industry: {
    label:       'Industry',
    color:       '#1565c0',
    bgLight:     '#e3f2fd',
    bgDark:      'rgba(21,101,192,0.15)',
    description: 'Production-grade proxy baselines',
  },
  flexgate: {
    label:       'FlexGate',
    color:       '#6a1b9a',
    bgLight:     '#f3e5f5',
    bgDark:      'rgba(106,27,154,0.15)',
    description: 'FlexGate deployment modes',
  },
};

// Which group each scenario belongs to
const SCENARIO_GROUP: Record<string, GroupKey> = {
  baseline:          'reference',
  nginx:             'industry',
  haproxy:           'industry',
  'flexgate-inline': 'flexgate',
  'flexgate-mirror': 'flexgate',
};

// Order scenarios so groups appear together: Reference → Industry → FlexGate
const SCENARIO_GROUP_ORDER: string[] = [
  'baseline',
  'nginx',
  'haproxy',
  'flexgate-inline',
  'flexgate-mirror',
];

// Per-scenario line/bar colors — purple family for FlexGate, blue for industry, gray for reference
const COLORS: Record<string, string> = {
  baseline:          '#9e9e9e',   // reference gray
  nginx:             '#42a5f5',   // industry blue-light
  haproxy:           '#1565c0',   // industry blue-dark
  'flexgate-inline': '#8e24aa',   // flexgate purple-dark  (inline = more invasive)
  'flexgate-mirror': '#ce93d8',   // flexgate purple-light (mirror = lighter touch)
};

// Full human-readable labels — used everywhere in the UI
const SCENARIO_LABELS: Record<string, string> = {
  baseline:          'Baseline',
  nginx:             'Nginx',
  haproxy:           'HAProxy',
  'flexgate-inline': 'FlexGate (Inline Mode)',
  'flexgate-mirror': 'FlexGate (Mirror Mode)',
};

// Short labels for charts with limited horizontal space (axes, chips)
const SCENARIO_SHORT_LABELS: Record<string, string> = {
  baseline:          'Baseline',
  nginx:             'Nginx',
  haproxy:           'HAProxy',
  'flexgate-inline': 'FG Inline',
  'flexgate-mirror': 'FG Mirror',
};

const ALL_SCENARIOS = SCENARIO_GROUP_ORDER;

// ── Scenario tooltip metadata ─────────────────────────────────────────────────

/**
 * Rich per-scenario explainer content surfaced via <ScenarioTooltip />.
 * Each entry has a one-line summary and an optional set of detail bullets.
 */
interface ScenarioInfo {
  summary:  string;           // one-liner shown in compact tooltip
  details:  string[];         // bullet points shown in full popover
  port:     string;           // which port k6 hits
  chain:    string;           // request chain diagram
}

const SCENARIO_INFO: Record<string, ScenarioInfo> = {
  baseline: {
    summary: 'Direct backend call. Best possible performance.',
    details: [
      'k6 hits the echo server directly on :9000',
      'No proxy layer — establishes the raw throughput ceiling',
      'All other scenarios are measured relative to this number',
    ],
    port:  ':9000',
    chain: 'k6 → echo',
  },
  nginx: {
    summary: 'Industry-standard reverse proxy. C-based, battle-hardened.',
    details: [
      'Nginx proxies :9001 → echo :9000',
      'Represents the established production-proxy baseline',
      'Expected ~5–10% RPS overhead vs baseline',
    ],
    port:  ':9001',
    chain: 'k6 → Nginx → echo',
  },
  haproxy: {
    summary: 'High-performance load balancer used as the base layer.',
    details: [
      'HAProxy proxies :9002 → echo :9000',
      'Typically the lowest-overhead proxy at pure HTTP routing',
      'Used as the gold-standard comparison target',
    ],
    port:  ':9002',
    chain: 'k6 → HAProxy → echo',
  },
  'flexgate-inline': {
    summary: 'Adds validation, security, and routing logic to every request.',
    details: [
      'k6 → HAProxy :9003 → FlexGate :8080 → echo :9000',
      'Every request passes through FlexGate\'s full rule engine',
      'Enables rate limiting, auth, header rewrites, and observability',
      'P99 overhead ~2–3 ms vs baseline at 50 VUs',
    ],
    port:  ':9003',
    chain: 'k6 → HAProxy → FlexGate → echo',
  },
  'flexgate-mirror': {
    summary: 'Observes traffic without impacting it. Zero-risk deployment path.',
    details: [
      'k6 hits FlexGate directly on :8081 → echo :9000',
      'Traffic is not intercepted in production — shadow copy only',
      'Enables safe evaluation before promoting to Inline mode',
      'Latency matches HAProxy — near-zero overhead',
    ],
    port:  ':8081',
    chain: 'k6 → FlexGate → echo',
  },
};

// ── Use-case labels ───────────────────────────────────────────────────────────

/**
 * Short, action-oriented use-case string shown in the table's "Use Case" column.
 * Tells operators *when* to care about each scenario, not just what it is.
 */
interface UseCaseMeta {
  label:       string;   // chip label
  color:       string;   // chip accent (matches group color family)
  icon:        React.ReactElement;
}

const SCENARIO_USE_CASE: Record<string, UseCaseMeta> = {
  baseline: {
    label: 'Reference only',
    color: '#757575',
    icon:  <InfoIcon />,
  },
  nginx: {
    label: 'Standard proxy',
    color: '#1565c0',
    icon:  <SpeedIcon />,
  },
  haproxy: {
    label: 'High performance',
    color: '#1565c0',
    icon:  <TrendingUpIcon />,
  },
  'flexgate-inline': {
    label: 'Full control',
    color: '#6a1b9a',
    icon:  <LightningIcon />,
  },
  'flexgate-mirror': {
    label: 'Safe adoption',
    color: '#00838f',
    icon:  <ShieldIcon />,
  },
};

// ── Best / worst ranking helpers ──────────────────────────────────────────────

/** Returns a map of scenario → rank info for a given metric field.
 *  higherIsBetter=true  → highest value = best  (RPS)
 *  higherIsBetter=false → lowest value  = best  (latency, errors)
 */
function rankScenarios(
  latest: Record<string, BenchmarkDataPoint>,
  field: keyof BenchmarkDataPoint,
  higherIsBetter: boolean,
): Record<string, 'best' | 'worst' | 'mid'> {
  const entries = ALL_SCENARIOS
    .map((name) => ({ name, val: latest[name]?.[field] as number | undefined }))
    .filter((e) => e.val != null && !isNaN(e.val));

  if (entries.length < 2) return {};

  entries.sort((a, b) => higherIsBetter ? b.val - a.val : a.val - b.val);

  const result: Record<string, 'best' | 'worst' | 'mid'> = {};
  entries.forEach((e, i) => {
    if (i === 0)                     result[e.name] = 'best';
    else if (i === entries.length - 1) result[e.name] = 'worst';
    else                             result[e.name] = 'mid';
  });
  return result;
}

/** Cell background color based on rank */
const RANK_BG: Record<'best' | 'worst' | 'mid', string> = {
  best:  'rgba(46, 125, 50, 0.10)',
  worst: 'rgba(198, 40, 40, 0.09)',
  mid:   'transparent',
};
const RANK_COLOR: Record<'best' | 'worst' | 'mid', string> = {
  best:  '#1b5e20',
  worst: '#b71c1c',
  mid:   'inherit',
};



const SEED_LATEST: Record<string, BenchmarkDataPoint> = {
  baseline:         { scenario: 'baseline',         rps: 18200, p50: 0.4, p95: 0.6, p99: 0.8,  errors: 0,     vus: 200, timestamp: '' },
  nginx:            { scenario: 'nginx',            rps: 16500, p50: 0.9, p95: 1.4, p99: 1.9,  errors: 0,     vus: 200, timestamp: '' },
  haproxy:          { scenario: 'haproxy',          rps: 17200, p50: 0.6, p95: 0.9, p99: 1.2,  errors: 0,     vus: 200, timestamp: '' },
  'flexgate-inline':{ scenario: 'flexgate-inline',  rps: 12000, p50: 1.8, p95: 2.6, p99: 3.4,  errors: 0.002, vus: 200, timestamp: '' },
  'flexgate-mirror':{ scenario: 'flexgate-mirror',  rps: 17000, p50: 0.5, p95: 0.9, p99: 1.2,  errors: 0,     vus: 200, timestamp: '' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt1  = (n: number)  => n != null ? n.toFixed(1) : '—';
const fmt0  = (n: number)  => n != null ? Math.round(n).toLocaleString() : '—';
const fmtPct= (n: number)  => n != null ? `${(n * 100).toFixed(2)}%` : '—';
const fmtTs = (iso: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
};

// ── Sub-components ────────────────────────────────────────────────────────────

// ── ScenarioTooltip ───────────────────────────────────────────────────────────

/**
 * Wraps any child element with a rich MUI Tooltip that explains what the
 * scenario is, what it measures, and the request chain.
 *
 * Usage:
 *   <ScenarioTooltip scenario="flexgate-inline">
 *     <span>FlexGate (Inline Mode)</span>
 *   </ScenarioTooltip>
 *
 * Props:
 *   scenario  — one of the 5 scenario keys
 *   placement — MUI Tooltip placement (default: "right")
 */
const ScenarioTooltip: React.FC<{
  scenario: string;
  placement?: React.ComponentProps<typeof MuiTooltip>['placement'];
  children: React.ReactElement;
}> = ({ scenario, placement = 'right', children }) => {
  const info    = SCENARIO_INFO[scenario];
  const color   = COLORS[scenario]          ?? '#757575';
  const label   = SCENARIO_LABELS[scenario] ?? scenario;
  const gk      = SCENARIO_GROUP[scenario]  ?? 'reference';
  const gm      = GROUP_META[gk];

  if (!info) return children;

  const tooltipContent = (
    <Box sx={{ p: 0.5, maxWidth: 280 }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: color,
            flexShrink: 0,
          }}
        />
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Box sx={{ ml: 'auto', flexShrink: 0 }}>
          <Chip
            label={gm.label}
            size="small"
            sx={{
              height: 16,
              fontSize: 9,
              fontWeight: 700,
              bgcolor: `${color}25`,
              color,
              border: `1px solid ${color}50`,
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Box>
      </Box>

      {/* ── Summary ── */}
      <Typography variant="body2" sx={{ fontSize: 12, mb: 1, lineHeight: 1.5, color: 'text.primary' }}>
        {info.summary}
      </Typography>

      {/* ── Request chain ── */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.4,
          mb: 1,
          borderRadius: 1,
          bgcolor: `${color}12`,
          border: `1px solid ${color}30`,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            fontSize: 10,
            color,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {info.chain}
        </Typography>
      </Box>

      {/* ── Detail bullets ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
        {info.details.map((d, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
            <Box
              sx={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                bgcolor: color,
                mt: '5px',
                flexShrink: 0,
                opacity: 0.7,
              }}
            />
            <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.5 }}>
              {d}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Port badge ── */}
      <Box sx={{ mt: 1, pt: 0.75, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>
          Port
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 700,
            color: 'text.secondary',
          }}
        >
          {info.port}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <MuiTooltip
      title={tooltipContent}
      placement={placement}
      arrow
      componentsProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color:   'text.primary',
            boxShadow: (theme) => theme.shadows[8],
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            p: 1.5,
            maxWidth: 320,
          },
        },
        arrow: {
          sx: {
            color: 'background.paper',
            '&::before': {
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        },
      }}
    >
      {children}
    </MuiTooltip>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

// ── GroupedLegend ─────────────────────────────────────────────────────────────

/**
 * Renders scenario legend items clustered under their group header.
 * Drop-in replacement for Recharts' built-in <Legend> — sits above charts.
 *
 * Props:
 *   scenarios  — which scenarios are currently active (may be a subset)
 *   compact    — if true, renders inline on one row (for chart headers)
 */
const GroupedLegend: React.FC<{
  scenarios?: string[];
  compact?: boolean;
}> = ({ scenarios = ALL_SCENARIOS, compact = false }) => {
  // Build groups that have at least one active scenario
  const groupOrder: GroupKey[] = ['reference', 'industry', 'flexgate'];
  const groups = groupOrder
    .map((gk) => ({
      key: gk,
      meta: GROUP_META[gk],
      items: SCENARIO_GROUP_ORDER.filter(
        (s) => SCENARIO_GROUP[s] === gk && scenarios.includes(s),
      ),
    }))
    .filter((g) => g.items.length > 0);

  if (compact) {
    // One flat row: "● Group  ● Scen  ● Scen  |  ● Group  ..."
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
        {groups.map((g, gi) => (
          <React.Fragment key={g.key}>
            {gi > 0 && (
              <Box sx={{ width: '1px', height: 14, bgcolor: 'divider', mx: 1.5, flexShrink: 0 }} />
            )}
            {/* Group label */}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: g.meta.color,
                mr: 0.75,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 10,
              }}
            >
              {g.meta.label}
            </Typography>
            {/* Scenario dots — each wrapped in ScenarioTooltip */}
            {g.items.map((s) => (
              <ScenarioTooltip key={s} scenario={s} placement="bottom">
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mr: 1.25,
                    cursor: 'help',
                    borderRadius: 0.75,
                    px: 0.5,
                    py: 0.25,
                    '&:hover': { bgcolor: 'action.hover' },
                    transition: 'background 0.15s',
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: COLORS[s] ?? '#aaa',
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                    {SCENARIO_SHORT_LABELS[s] ?? s}
                  </Typography>
                </Box>
              </ScenarioTooltip>
            ))}
          </React.Fragment>
        ))}
      </Box>
    );
  }

  // Full block layout: group header chip + scenario rows beneath
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {groups.map((g) => (
        <Box key={g.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 140 }}>
          {/* Group header */}
          <Chip
            label={g.meta.label}
            size="small"
            sx={{
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.05em',
              bgcolor: g.meta.bgLight,
              color: g.meta.color,
              border: `1px solid ${g.meta.color}40`,
              alignSelf: 'flex-start',
            }}
          />
          {/* Scenario items — each wrapped in ScenarioTooltip */}
          {g.items.map((s) => (
            <ScenarioTooltip key={s} scenario={s} placement="right">
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  pl: 0.5,
                  cursor: 'help',
                  borderRadius: 0.75,
                  pr: 0.75,
                  py: 0.25,
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background 0.15s',
                }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: COLORS[s] ?? '#aaa',
                    flexShrink: 0,
                    border: `2px solid ${COLORS[s] ?? '#aaa'}40`,
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.4 }}>
                  {SCENARIO_LABELS[s] ?? s}
                </Typography>
              </Box>
            </ScenarioTooltip>
          ))}
          {/* Group description — only in full mode */}
          <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', pl: 0.5, mt: 0.25 }}>
            {g.meta.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

// ── BenchmarkStoryHeader ──────────────────────────────────────────────────────

/**
 * Storytelling header that explains FlexGate's two deployment modes in plain
 * English — reducing cognitive load before the user sees any numbers.
 */
const BenchmarkStoryHeader: React.FC = () => (
  <Paper
    elevation={0}
    sx={{
      mb: 3,
      p: { xs: 2.5, sm: 3.5 },
      background: (theme) =>
        theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(25,118,210,0.12) 0%, rgba(38,198,218,0.08) 100%)'
          : 'linear-gradient(135deg, #e8f0fe 0%, #e0f7fa 100%)',
      border: '1px solid',
      borderColor: (theme) =>
        theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.25)' : 'rgba(25,118,210,0.15)',
      borderRadius: 2,
    }}
  >
    {/* ── Title row ── */}
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant="h5"
        fontWeight={700}
        sx={{ letterSpacing: '-0.3px', mb: 0.5 }}
      >
        Understand Your Proxy Performance
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 620 }}>
        These benchmarks measure FlexGate in two real-world deployment modes against
        industry baselines (direct echo, Nginx, HAProxy). Here's what each mode means for you.
      </Typography>
    </Box>

    {/* ── Mode cards ── */}
    <Grid container spacing={2} sx={{ mb: 2.5 }}>

      {/* Mirror Mode */}
      <Grid item xs={12} sm={6}>
        <Box
          sx={{
            p: 2,
            borderRadius: 1.5,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(38,198,218,0.3)' : 'rgba(38,198,218,0.35)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(38,198,218,0.15)' : '#e0f7fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldIcon sx={{ fontSize: 20, color: '#00acc1' }} />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                FG Mirror Mode
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Port :8081 — direct FlexGate hit
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto' }}>
              <Chip
                label="Zero risk"
                size="small"
                sx={{
                  height: 20,
                  fontSize: 11,
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(38,198,218,0.15)' : '#e0f7fa',
                  color: '#00838f',
                  fontWeight: 700,
                  border: '1px solid rgba(0,172,193,0.3)',
                }}
              />
            </Box>
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <CheckCircleIcon sx={{ fontSize: 15, color: '#2e7d32', mt: '2px', flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Zero traffic impact</strong> — runs alongside your existing stack, not in the request path
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <CheckCircleIcon sx={{ fontSize: 15, color: '#2e7d32', mt: '2px', flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Safe to enable today</strong> — observe FlexGate behavior without any user impact
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <CheckCircleIcon sx={{ fontSize: 15, color: '#2e7d32', mt: '2px', flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Near-baseline latency</strong> — overhead matches HAProxy at production load
              </Typography>
            </Box>
          </Box>
        </Box>
      </Grid>

      {/* Inline Mode */}
      <Grid item xs={12} sm={6}>
        <Box
          sx={{
            p: 2,
            borderRadius: 1.5,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.3)' : 'rgba(25,118,210,0.25)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.15)' : '#e8f0fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LightningIcon sx={{ fontSize: 20, color: '#1976d2' }} />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                FG Inline Mode
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Port :9003 — via HAProxy → FlexGate
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto' }}>
              <Chip
                label="Full control"
                size="small"
                sx={{
                  height: 20,
                  fontSize: 11,
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.15)' : '#e8f0fe',
                  color: '#1565c0',
                  fontWeight: 700,
                  border: '1px solid rgba(25,118,210,0.3)',
                }}
              />
            </Box>
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <LightningIcon sx={{ fontSize: 15, color: '#1976d2', mt: '2px', flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Full request control</strong> — every request passes through FlexGate's rule engine
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <LightningIcon sx={{ fontSize: 15, color: '#1976d2', mt: '2px', flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Small, measurable overhead</strong> — P99 adds ~2–3 ms vs baseline at 50 VUs
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <LightningIcon sx={{ fontSize: 15, color: '#1976d2', mt: '2px', flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">
                <strong>Rate limiting, auth, rewrites</strong> — all FlexGate features active in this path
              </Typography>
            </Box>
          </Box>
        </Box>
      </Grid>
    </Grid>

    {/* ── CTA banner ── */}
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 1.5,
        borderRadius: 1.5,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(46,125,50,0.12)' : 'rgba(46,125,50,0.07)',
        border: '1px solid',
        borderColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(46,125,50,0.35)' : 'rgba(46,125,50,0.2)',
        flexWrap: 'wrap',
        gap: { xs: 1, sm: 1.5 },
      }}
    >
      <ShieldIcon sx={{ fontSize: 20, color: '#2e7d32', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} color="success.dark" sx={{ lineHeight: 1.3 }}>
          Recommended: Start with Mirror Mode
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Enable FG Mirror on a shadow copy of traffic first. Once you're confident in the numbers, promote to Inline.
        </Typography>
      </Box>
      <Chip
        icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
        label="Low-risk path to production"
        size="small"
        color="success"
        variant="outlined"
        sx={{ fontWeight: 600, flexShrink: 0 }}
      />
    </Box>
  </Paper>
);

// ─────────────────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  title: string; value: string; subtitle: string;
  icon: React.ReactElement; color?: string; live?: boolean;
  rank?: 'best' | 'worst' | 'mid';
  loading?: boolean;
}> = ({ title, value, subtitle, icon, color = '#1976d2', live, rank, loading }) => (
  <Card
    sx={{
      height:     '100%',
      outline:    rank === 'best'  ? '2px solid #2e7d32' :
                  rank === 'worst' ? '2px solid #c62828' : undefined,
      background: rank === 'best'  ? 'rgba(46,125,50,0.04)'  :
                  rank === 'worst' ? 'rgba(198,40,40,0.04)'  : undefined,
      transition: 'box-shadow 0.2s ease, transform 0.15s ease',
      '&:hover':  { boxShadow: 4, transform: 'translateY(-1px)' },
    }}
  >
    <CardContent>
      {loading ? (
        /* ── Skeleton loading state — reserves identical height ── */
        <Box>
          <Skeleton variant="text" width="55%" height={18} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width="70%" height={40} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width="45%" height={16} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary" noWrap>{title}</Typography>
              {live && (
                <DotIcon sx={{ fontSize: 10, color: '#2e7d32', animation: 'pulse 2s infinite' }} />
              )}
              {rank === 'best' && (
                <MuiTooltip title="Best performer">
                  <TrophyIcon sx={{ fontSize: 14, color: '#2e7d32' }} />
                </MuiTooltip>
              )}
              {rank === 'worst' && (
                <MuiTooltip title="Worst performer">
                  <WorstIcon sx={{ fontSize: 14, color: '#c62828' }} />
                </MuiTooltip>
              )}
            </Box>
            {/* key={value} forces a CSS re-trigger when the number changes */}
            <Typography
              key={value}
              variant="h4"
              sx={{
                fontWeight:  700,
                color,
                lineHeight:  1.2,
                animation:   'countIn 0.3s ease',
              }}
            >
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
          <Box
            sx={{
              color,
              opacity:    0.65,
              ml:         1,
              mt:         0.5,
              flexShrink: 0,
              transition: 'opacity 0.2s, transform 0.2s',
              '.MuiCard-root:hover &': { opacity: 1, transform: 'scale(1.08)' },
            }}
          >
            {icon}
          </Box>
        </Box>
      )}
    </CardContent>
  </Card>
);

const SectionTitle: React.FC<{ children: React.ReactNode; badge?: React.ReactNode }> = ({ children, badge }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
    <Typography variant="h6" sx={{ fontWeight: 600 }}>{children}</Typography>
    {badge}
  </Box>
);

const LiveBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
    {active && (
      <Box
        sx={{
          position: 'absolute',
          inset: -3,
          borderRadius: 2,
          border: '1.5px solid #2e7d32',
          animation: 'ringPulse 2s ease infinite',
          pointerEvents: 'none',
        }}
      />
    )}
    <Chip
      label={active ? 'LIVE' : 'PAUSED'}
      size="small"
      color={active ? 'success' : 'default'}
      icon={<DotIcon sx={{ fontSize: '10px !important' }} />}
      sx={{ height: 20, fontSize: 10, position: 'relative' }}
    />
  </Box>
);

// ── PageSection ───────────────────────────────────────────────────────────────

/**
 * Named page section with a full-width divider+title bar to create clear
 * visual separation between the three main content zones:
 *   • Recommended Usage (story header + stat cards + insights)
 *   • Performance Overview (live charts)
 *   • Scenario Comparison (comparison table)
 *
 * Props:
 *   title   — display name shown inline with the divider
 *   icon    — small icon tile to the left of the title
 *   sx      — forwarded to the outer wrapper Box (use for mb/mt overrides)
 *   children — section content
 */
const PageSection: React.FC<{
  title:    string;
  icon:     React.ReactElement;
  accent?:  string;
  children: React.ReactNode;
  sx?:      object;
}> = ({ title, icon, accent = '#1976d2', children, sx }) => (
  <Box sx={{ mb: 5, ...sx }}>
    {/* ── Section label bar ── */}
    <Box
      sx={{
        display:     'flex',
        alignItems:  'center',
        gap:         1.5,
        mb:          3,
        pb:          1.25,
        borderBottom: '2px solid',
        borderColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
      }}
    >
      {/* Icon tile */}
      <Box
        sx={{
          width:           32,
          height:          32,
          borderRadius:    1,
          bgcolor:         `${accent}14`,
          border:          `1px solid ${accent}25`,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
          color:           accent,
          '& svg':         { fontSize: 17, transition: 'transform 0.2s ease' },
          transition:      'background 0.2s, box-shadow 0.2s',
          '&:hover':       { bgcolor: `${accent}22`, boxShadow: `0 0 0 3px ${accent}18`, '& svg': { transform: 'scale(1.15)' } },
        }}
      >
        {icon}
      </Box>

      <Typography
        variant="overline"
        sx={{
          fontWeight:     800,
          fontSize:       11,
          letterSpacing:  '0.1em',
          color:          accent,
          lineHeight:     1,
        }}
      >
        {title}
      </Typography>

      {/* Decorative trailing line */}
      <Box sx={{ flex: 1, height: '1px', bgcolor: `${accent}20`, ml: 0.5 }} />
    </Box>

    {children}
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────

/** Generic chart tooltip paper — glassmorphism style */
const ChartTooltipPaper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Paper
    elevation={0}
    sx={{
      p: 1.5,
      fontSize: 13,
      lineHeight: 1.6,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1.5,
      boxShadow: (theme) => theme.shadows[6],
      backdropFilter: 'blur(8px)',
      bgcolor: (theme) =>
        theme.palette.mode === 'dark'
          ? 'rgba(18,18,18,0.92)'
          : 'rgba(255,255,255,0.96)',
    }}
  >
    {children}
  </Paper>
);

/** Prominent "Running benchmark…" banner shown while a run is active */
const RunningBanner: React.FC<{
  activeScenario: string;
  completedCount: number;
  totalCount: number;
}> = ({ activeScenario, completedCount, totalCount }) => {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return (
    <Paper
      elevation={3}
      sx={{
        p: 2.5,
        mb: 3,
        background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 60%, #1976d2 100%)',
        color: '#fff',
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Animated shimmer bar */}
      <Box sx={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
        animation: 'shimmer 2s linear infinite',
        backgroundSize: '200% 100%',
      }} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <CircularProgress size={28} thickness={4} sx={{ color: '#fff', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            Running benchmark…
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            Active scenario: <strong>{SCENARIO_LABELS[activeScenario] ?? activeScenario}</strong>
            &nbsp;·&nbsp;{completedCount} / {totalCount} complete
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', minWidth: 64 }}>
          <Typography variant="h5" fontWeight={700}>{pct}%</Typography>
          <Typography variant="caption" sx={{ opacity: 0.75 }}>overall</Typography>
        </Box>
      </Box>

      <Box sx={{ mt: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.2)',
            '& .MuiLinearProgress-bar': { bgcolor: '#fff', borderRadius: 3 },
          }}
        />
      </Box>

      {/* Per-scenario chips — grouped by color family */}
      <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
        {ALL_SCENARIOS.map((name, idx) => {
          const isActive    = name === activeScenario;
          const isDone      = idx < completedCount;
          const groupColor  = GROUP_META[SCENARIO_GROUP[name]]?.color ?? '#fff';
          return (
            <Chip
              key={name}
              label={SCENARIO_SHORT_LABELS[name] ?? name}
              size="small"
              icon={
                isActive ? <DotIcon sx={{ fontSize: '10px !important', animation: 'pulse 1s infinite' }} /> :
                isDone   ? <CheckCircleIcon sx={{ fontSize: '14px !important' }} /> : undefined
              }
              sx={{
                bgcolor: isActive ? 'rgba(255,255,255,0.25)'
                        : isDone  ? 'rgba(255,255,255,0.15)'
                        :           'rgba(255,255,255,0.07)',
                color:   '#fff',
                fontWeight: isActive ? 700 : 400,
                border: isActive
                  ? `1px solid rgba(255,255,255,0.5)`
                  : isDone
                  ? `1px solid ${groupColor}60`
                  : '1px solid transparent',
                '& .MuiChip-icon': { color: '#fff' },
              }}
            />
          );
        })}
      </Box>
    </Paper>
  );
};

// ── Chart data transforms ─────────────────────────────────────────────────────

/** Build the last N points from livePoints as a merged time-series for Recharts. */
function buildTimeSeries(
  livePoints: Record<string, BenchmarkDataPoint[]>,
  field: keyof BenchmarkDataPoint,
  scenarios: string[],
  tail = 60,
): Record<string, any>[] {
  const tsSet = new Set<string>();
  for (const name of scenarios) {
    for (const pt of (livePoints[name] ?? []).slice(-tail)) {
      tsSet.add(pt.timestamp);
    }
  }
  const tsSorted = Array.from(tsSet).sort();
  const lookup: Record<string, Record<string, number>> = {};
  for (const name of scenarios) {
    lookup[name] = {};
    for (const pt of (livePoints[name] ?? []).slice(-tail)) {
      lookup[name][pt.timestamp] = pt[field] as number;
    }
  }
  return tsSorted.map((ts) => {
    const row: Record<string, any> = { time: fmtTs(ts) };
    for (const name of scenarios) {
      row[`${name}_${String(field)}`] = lookup[name][ts] ?? null;
    }
    return row;
  });
}

/** Build comparison bar data from latest points */
function buildComparisonBars(
  latest: Record<string, BenchmarkDataPoint>,
  rpsRank: Record<string, string> = {},
  p99Rank: Record<string, string> = {},
  errorRank: Record<string, string> = {},
) {
  return ALL_SCENARIOS.map((name) => {
    const pt = latest[name] ?? SEED_LATEST[name];
    return {
      scenario:   name,
      label:      SCENARIO_LABELS[name]       ?? name,  // full label (tooltip)
      shortLabel: SCENARIO_SHORT_LABELS[name] ?? name,  // short label (XAxis)
      group:      SCENARIO_GROUP[name],
      rps:      pt?.rps    ?? 0,
      p50:      pt?.p50    ?? 0,
      p95:      pt?.p95    ?? 0,
      p99:      pt?.p99    ?? 0,
      errors:   (pt?.errors ?? 0) * 100,
      // Per-metric rank colors for Cell fill
      fillRps:    rpsRank[name]   === 'best' ? '#2e7d32' : rpsRank[name]   === 'worst' ? '#c62828' : (COLORS[name] ?? '#aaa'),
      fillP99:    p99Rank[name]   === 'best' ? '#2e7d32' : p99Rank[name]   === 'worst' ? '#c62828' : (COLORS[name] ?? '#aaa'),
      fillErrors: errorRank[name] === 'best' ? '#2e7d32' : errorRank[name] === 'worst' ? '#c62828' : (COLORS[name] ?? '#aaa'),
      fill:       COLORS[name] ?? '#aaa',
    };
  });
}

// ── Custom Recharts tooltips ──────────────────────────────────────────────────

const RpsTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipPaper>
      <strong>{label}</strong>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {SCENARIO_LABELS[p.name] ?? p.name}: {fmt0(p.value)} req/s
        </div>
      ))}
    </ChartTooltipPaper>
  );
};

const LatencyTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipPaper>
      <strong>{label}</strong>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {SCENARIO_LABELS[p.name] ?? p.name}: {fmt1(p.value)} ms
        </div>
      ))}
    </ChartTooltipPaper>
  );
};

const ErrorTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipPaper>
      <strong>{label}</strong>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {SCENARIO_LABELS[p.name] ?? p.name}: {fmt1(p.value)}%
        </div>
      ))}
    </ChartTooltipPaper>
  );
};

const CompBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <ChartTooltipPaper>
      <strong>{label}</strong>
      <div>RPS: {fmt0(d.rps)}</div>
      <div>P50: {fmt1(d.p50)} ms</div>
      <div>P95: {fmt1(d.p95)} ms</div>
      <div>P99: {fmt1(d.p99)} ms</div>
      <div>Errors: {fmt1(d.errors)}%</div>
    </ChartTooltipPaper>
  );
};

// ── Smart Insights ────────────────────────────────────────────────────────────

/**
 * Derived insight descriptor — one card in the insights panel.
 */
interface Insight {
  id:       string;
  icon:     React.ReactElement;
  headline: string;          // bold one-liner
  detail:   string;          // supporting sentence
  accent:   string;          // hex color for left border + icon tint
  badge?:   string;          // optional small chip label
}

/**
 * deriveInsights — pure function, no side effects.
 * Takes the latest data snapshot + rank maps and returns up to 4 insight cards.
 * All thresholds and copy are documented inline.
 */
function deriveInsights(
  latest:     Record<string, BenchmarkDataPoint>,
  rpsRank:    Record<string, 'best' | 'worst' | 'mid'>,
  p99Rank:    Record<string, 'best' | 'worst' | 'mid'>,
  errorRank:  Record<string, 'best' | 'worst' | 'mid'>,
): Insight[] {
  const insights: Insight[] = [];

  const base    = latest['baseline'];
  const mirror  = latest['flexgate-mirror'];
  const inline  = latest['flexgate-inline'];
  const haproxy = latest['haproxy'];

  // ── 1. Best throughput ────────────────────────────────────────────────────
  // Who has the highest RPS? Show the winner and its advantage vs baseline.
  const rpsWinner = ALL_SCENARIOS.find((s) => rpsRank[s] === 'best');
  if (rpsWinner && latest[rpsWinner]) {
    const winnerRps  = latest[rpsWinner].rps;
    const baseRps    = base?.rps ?? winnerRps;
    const pct        = baseRps > 0 ? Math.round(((winnerRps - baseRps) / baseRps) * 100) : 0;
    const label      = SCENARIO_LABELS[rpsWinner] ?? rpsWinner;
    const isBaseline = rpsWinner === 'baseline';
    insights.push({
      id:       'best-rps',
      icon:     <TrophyIcon />,
      headline: isBaseline
        ? `Baseline leads at ${fmt0(winnerRps)} req/s`
        : `${label} leads at ${fmt0(winnerRps)} req/s`,
      detail: isBaseline
        ? 'This is your theoretical maximum — all proxy scenarios are measured against it.'
        : `${Math.abs(pct)}% ${pct >= 0 ? 'above' : 'below'} direct baseline throughput.`,
      accent: '#2e7d32',
      badge:  'Top RPS',
    });
  }

  // ── 2. Lowest P99 latency ─────────────────────────────────────────────────
  // Who has the best (lowest) P99? Exclude baseline to make it more useful.
  const latWinner = ALL_SCENARIOS
    .filter((s) => s !== 'baseline')
    .sort((a, b) => (latest[a]?.p99 ?? 999) - (latest[b]?.p99 ?? 999))[0];
  if (latWinner && latest[latWinner]) {
    const winP99  = latest[latWinner].p99;
    const baseP99 = base?.p99 ?? winP99;
    const delta   = +(winP99 - baseP99).toFixed(1);
    insights.push({
      id:       'lowest-latency',
      icon:     <TimerIcon />,
      headline: `${SCENARIO_LABELS[latWinner]} has the lowest proxy P99: ${fmt1(winP99)} ms`,
      detail:   delta <= 0.5
        ? `Only +${fmt1(delta)} ms over direct baseline — effectively transparent.`
        : `+${fmt1(delta)} ms overhead vs baseline. Still within acceptable SLO range.`,
      accent: '#6a1b9a',
      badge:  'Lowest Latency',
    });
  }

  // ── 3. Safest deployment mode ─────────────────────────────────────────────
  // Mirror mode specifically — highlight its zero-impact story.
  if (mirror) {
    const mirrorRps   = mirror.rps;
    const haproxyRps  = haproxy?.rps ?? mirrorRps;
    const rpsRatio    = haproxyRps > 0 ? Math.round((mirrorRps / haproxyRps) * 100) : 100;
    const errPct      = (mirror.errors ?? 0) * 100;
    const isClean     = errPct < 0.01;
    insights.push({
      id:       'safe-mode',
      icon:     <ShieldIcon />,
      headline: `FlexGate Mirror delivers near-zero overhead`,
      detail:   isClean
        ? `${rpsRatio}% of HAProxy throughput, ${fmt1(mirror.p99)} ms P99, 0% errors. Safe to enable now.`
        : `${rpsRatio}% of HAProxy throughput, ${fmt1(mirror.p99)} ms P99. Monitor error rate before promotion.`,
      accent: '#00838f',
      badge:  'Recommended Start',
    });
  }

  // ── 4. Recommended action ─────────────────────────────────────────────────
  // Compare inline vs mirror overhead; suggest promotion path or flag concern.
  if (inline && mirror) {
    const inlineP99  = inline.p99;
    const mirrorP99  = mirror.p99;
    const diffMs     = +(inlineP99 - mirrorP99).toFixed(1);
    const inlineErr  = (inline.errors ?? 0) * 100;
    const hasErrConcern = inlineErr > 0.1;

    if (hasErrConcern) {
      // Error rate above SLO — caution card
      insights.push({
        id:       'recommendation',
        icon:     <ErrorIcon />,
        headline: `Inline mode error rate above SLO (${fmt1(inlineErr)}%)`,
        detail:   `Stay on Mirror mode until the error source is resolved. Check upstream health and rate-limit config.`,
        accent:   '#c62828',
        badge:    'Action Required',
      });
    } else if (diffMs <= 2) {
      // Very small inline overhead — promote
      insights.push({
        id:       'recommendation',
        icon:     <LightningIcon />,
        headline: `Inline mode overhead is minimal (+${fmt1(diffMs)} ms vs Mirror)`,
        detail:   `You're ready to promote from Mirror to Inline. Full rule engine with negligible latency cost.`,
        accent:   '#1565c0',
        badge:    'Ready to Promote',
      });
    } else {
      // Larger overhead — explain the trade-off
      insights.push({
        id:       'recommendation',
        icon:     <LightningIcon />,
        headline: `Inline mode adds +${fmt1(diffMs)} ms vs Mirror — trade-off for full control`,
        detail:   `This overhead comes from route evaluation, auth checks, and observability hooks. Tune rule count to reduce it.`,
        accent:   '#1565c0',
        badge:    'Inline Trade-off',
      });
    }
  }

  return insights;
}

// ── Recommendation engine ─────────────────────────────────────────────────────

/**
 * RecommendationVariant controls the visual treatment of the card.
 *
 *   'start'    — brand-new user, no live data; guide them to Mirror first
 *   'mirror'   — live data present; Mirror looks healthy, suggest it as next step
 *   'promote'  — Mirror proven healthy; inline overhead is small; ready to promote
 *   'latency'  — Inline P99 is high; suggest tuning before promoting
 *   'error'    — Inline error rate above SLO; hold on Mirror and investigate
 */
type RecommendationVariant = 'start' | 'mirror' | 'promote' | 'latency' | 'error';

interface Recommendation {
  variant:   RecommendationVariant;
  headline:  string;        // bold one-liner — the "what to do"
  rationale: string;        // supporting sentence — the "why"
  action:    string;        // CTA button label
  steps:     string[];      // ordered bullet steps
  accent:    string;        // card left-border + icon tint
  icon:      React.ReactElement;
  badge:     string;        // chip label in top-right corner
  badgeColor: string;       // chip background tint
}

// ── Thresholds ────────────────────────────────────────────────────────────────
// Documented in one place so they are easy to calibrate.

/** Inline P99 (ms) above which we flag a latency concern */
const LATENCY_WARN_MS   = 5;
/** Inline error rate (fraction) above which we hold the user on Mirror */
const ERROR_SLO         = 0.001;   // 0.1%
/** Inline overhead vs Mirror (ms) small enough to call "ready to promote" */
const PROMOTE_THRESHOLD = 2;
/** Mirror RPS as a fraction of HAProxy below which mirror itself looks troubled */
const MIRROR_FLOOR_RATIO = 0.85; // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * deriveRecommendation — pure function, called via useMemo.
 *
 * Decision tree (evaluated top-to-bottom, first match wins):
 *
 *   1. No live data at all          → 'start'   (first-time user)
 *   2. Inline error > SLO           → 'error'   (hold on Mirror, investigate)
 *   3. Inline P99 > LATENCY_WARN_MS → 'latency' (tune before promoting)
 *   4. Inline overhead ≤ PROMOTE_THRESHOLD → 'promote' (go Inline now)
 *   5. Otherwise                    → 'mirror'  (continue validating on Mirror)
 */
function deriveRecommendation(
  latest:    Record<string, BenchmarkDataPoint>,
  hasLiveData: boolean,
): Recommendation {

  const mirror  = latest['flexgate-mirror'];
  const inline  = latest['flexgate-inline'];
  const haproxy = latest['haproxy'];

  // ── Branch 1 — No live data ────────────────────────────────────────────────
  if (!hasLiveData || (!mirror && !inline)) {
    return {
      variant:   'start',
      headline:  'Start with FlexGate Mirror Mode',
      rationale: 'No live benchmark data yet. Mirror Mode is the safest first step — it observes your traffic without touching the request path.',
      action:    'Run benchmarks to see live data',
      steps: [
        'Enable FG Mirror on a shadow copy of traffic',
        'Let it run for at least one benchmark cycle',
        'Review the Performance Overview charts',
        'When comfortable, promote to Inline Mode',
      ],
      accent:     '#00838f',
      icon:       <ShieldIcon />,
      badge:      'First-time setup',
      badgeColor: '#00838f',
    };
  }

  const inlineErr = (inline?.errors ?? 0);
  const inlineP99 = inline?.p99 ?? 0;
  const mirrorP99 = mirror?.p99 ?? 0;
  const diffMs    = +(inlineP99 - mirrorP99).toFixed(1);
  const errPct    = +(inlineErr * 100).toFixed(2);

  // ── Branch 2 — Inline error rate above SLO ────────────────────────────────
  if (inlineErr > ERROR_SLO) {
    return {
      variant:   'error',
      headline:  `Hold on Mirror — Inline error rate is ${errPct}% (SLO: 0.1%)`,
      rationale: `FlexGate Inline is returning errors above the acceptable threshold. Stay on Mirror while you investigate the root cause.`,
      action:    'Check upstream health',
      steps: [
        `Inspect PM2 logs: pm2 logs flexgate --lines 100`,
        'Review rate-limit and auth rule config for false positives',
        'Check upstream echo-server health on :9000',
        'Re-run benchmarks once the error source is resolved',
        'Promote to Inline only after error rate drops below 0.1%',
      ],
      accent:     '#c62828',
      icon:       <ErrorIcon />,
      badge:      'Action required',
      badgeColor: '#c62828',
    };
  }

  // ── Branch 3 — Inline P99 above warning threshold ─────────────────────────
  if (inlineP99 > LATENCY_WARN_MS) {
    const mirrorRps   = mirror?.rps ?? 0;
    const haproxyRps  = haproxy?.rps ?? mirrorRps;
    const mirrorRatio = haproxyRps > 0 ? Math.round((mirrorRps / haproxyRps) * 100) : 100;
    return {
      variant:   'latency',
      headline:  `Inline P99 is ${inlineP99.toFixed(1)} ms — optimise before promoting`,
      rationale: `Inline adds +${diffMs} ms over Mirror. Mirror is healthy at ${mirrorRatio}% of HAProxy throughput. Reduce rule complexity first.`,
      action:    'Review rule configuration',
      steps: [
        `Target: Inline P99 < ${LATENCY_WARN_MS} ms before promoting`,
        'Audit active FlexGate rules — remove unused auth/rewrite steps',
        'Enable route-level caching for high-frequency paths',
        'Re-run benchmarks after each change to track improvement',
        'Stay on Mirror Mode until P99 drops below the threshold',
      ],
      accent:     '#e65100',
      icon:       <TuneIcon />,
      badge:      'Optimise first',
      badgeColor: '#e65100',
    };
  }

  // ── Branch 4 — Inline overhead small enough to promote ────────────────────
  if (diffMs <= PROMOTE_THRESHOLD) {
    return {
      variant:   'promote',
      headline:  `Ready to promote — Inline overhead is only +${diffMs} ms vs Mirror`,
      rationale: `FlexGate Inline shows ${errPct}% errors and ${inlineP99.toFixed(1)} ms P99. This is within production-safe tolerances.`,
      action:    'Enable Inline on critical routes',
      steps: [
        'Start with a single low-risk production route',
        'Apply FlexGate Inline rule set to that route only',
        'Monitor error rate and P99 for 30 minutes',
        'Expand coverage route-by-route as confidence grows',
        'Keep Mirror running in parallel during the transition',
      ],
      accent:     '#1565c0',
      icon:       <LightningIcon />,
      badge:      'Ready to promote',
      badgeColor: '#1565c0',
    };
  }

  // ── Branch 5 — Default: continue validating on Mirror ─────────────────────
  const mirrorRps   = mirror?.rps ?? 0;
  const haproxyRps  = haproxy?.rps ?? mirrorRps;
  const mirrorRatio = haproxyRps > 0 ? Math.round((mirrorRps / haproxyRps) * 100) : 100;
  return {
    variant:   'mirror',
    headline:  `Continue on Mirror Mode — Inline adds +${diffMs} ms overhead`,
    rationale: `Mirror is running at ${mirrorRatio}% of HAProxy throughput with ${mirrorP99.toFixed(1)} ms P99. Inline overhead of +${diffMs} ms is manageable but not yet minimal.`,
    action:    'Keep benchmarking',
    steps: [
      'Let Mirror run across multiple load cycles for stability data',
      `Work to bring Inline overhead below +${PROMOTE_THRESHOLD} ms`,
      'Check if fewer active rules reduce latency',
      'Compare P99 trend across runs to confirm improvement',
      'Promote to Inline when overhead drops below threshold',
    ],
    accent:     '#2e7d32',
    icon:       <AutoFixIcon />,
    badge:      'Validating',
    badgeColor: '#2e7d32',
  };
}

// ── RecommendationCard ────────────────────────────────────────────────────────

/**
 * Full-width recommendation card rendered at the top of Section 1.
 * Derived from benchmark data by deriveRecommendation() above.
 *
 * Anatomy:
 *   ┌─[accent border]──────────────────────────────────────────────────────┐
 *   │  [icon tile]  BADGE          headline                       [CTA btn] │
 *   │               rationale                                               │
 *   │  ── Step-by-step guide ──────────────────────────────────────────── │
 *   │  ① step   ② step   ③ step   ④ step   ⑤ step                        │
 *   └──────────────────────────────────────────────────────────────────────┘
 */
const RecommendationCard: React.FC<{
  recommendation: Recommendation;
  isLive:         boolean;
}> = ({ recommendation: rec, isLive }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      sx={{
        mb:           3,
        borderRadius: 2,
        border:       '1px solid',
        borderColor:  (theme) =>
          theme.palette.mode === 'dark' ? `${rec.accent}35` : `${rec.accent}25`,
        borderLeft:   `4px solid ${rec.accent}`,
        bgcolor:      (theme) =>
          theme.palette.mode === 'dark'
            ? `${rec.accent}0d`
            : `${rec.accent}07`,
        overflow:     'hidden',
        transition:   'box-shadow 0.2s',
        '&:hover':    { boxShadow: 4 },
      }}
    >
      {/* ── Top row ── */}
      <Box
        sx={{
          display:    'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap:        2,
          p:          { xs: 2, sm: 2.5 },
          flexWrap:   'wrap',
        }}
      >
        {/* Icon tile */}
        <Box
          sx={{
            width:          44,
            height:         44,
            borderRadius:   1.5,
            bgcolor:        `${rec.accent}18`,
            border:         `1px solid ${rec.accent}30`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
            color:          rec.accent,
            '& svg':        { fontSize: 24 },
          }}
        >
          {rec.icon}
        </Box>

        {/* Text block */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Badge row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={rec.badge}
              size="small"
              sx={{
                height:     20,
                fontSize:   10,
                fontWeight: 800,
                bgcolor:    `${rec.badgeColor}18`,
                color:      rec.badgeColor,
                border:     `1px solid ${rec.badgeColor}35`,
                letterSpacing: '0.04em',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
            {isLive && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <DotIcon sx={{ fontSize: 8, color: '#2e7d32', animation: 'pulse 2s infinite' }} />
                <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>
                  live data
                </Typography>
              </Box>
            )}
          </Box>

          {/* Headline */}
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ lineHeight: 1.3, color: 'text.primary', fontSize: { xs: 14, sm: 15 } }}
          >
            {rec.headline}
          </Typography>

          {/* Rationale */}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.4, lineHeight: 1.55, fontSize: 13 }}
          >
            {rec.rationale}
          </Typography>
        </Box>

        {/* CTA button */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75, flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            endIcon={
              <ArrowForwardIcon
                sx={{
                  fontSize:   '14px !important',
                  transition: 'transform 0.2s',
                  transform:  expanded ? 'rotate(90deg)' : 'none',
                }}
              />
            }
            onClick={() => setExpanded((x) => !x)}
            sx={{
              borderColor:  rec.accent,
              color:        rec.accent,
              fontWeight:   700,
              fontSize:     12,
              whiteSpace:   'nowrap',
              transition:   'background 0.15s, box-shadow 0.15s',
              '&:hover': {
                borderColor: rec.accent,
                bgcolor:     `${rec.accent}12`,
                boxShadow:   `0 0 0 3px ${rec.accent}18`,
              },
            }}
          >
            {expanded ? 'Hide steps' : rec.action}
          </Button>
        </Box>
      </Box>

      {/* ── Step-by-step guide — smooth Collapse ── */}
      <Collapse in={expanded} timeout={220}>
        <Box
          sx={{
            mx:          { xs: 2, sm: 2.5 },
            mb:          2.5,
            pt:          2,
            borderTop:   '1px solid',
            borderColor: (theme) =>
              theme.palette.mode === 'dark' ? `${rec.accent}25` : `${rec.accent}20`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display:       'block',
              fontWeight:    700,
              fontSize:      10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color:         rec.accent,
              mb:            1.25,
            }}
          >
            Step-by-step guide
          </Typography>

          <Box
            sx={{
              display:             'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(auto-fill, minmax(220px, 1fr))' },
              gap:                 1,
            }}
          >
            {rec.steps.map((step, idx) => (
              <Box
                key={idx}
                sx={{
                  display:     'flex',
                  alignItems:  'flex-start',
                  gap:         1,
                  p:           1.25,
                  borderRadius: 1,
                  bgcolor:     (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)',
                  border:      '1px solid',
                  borderColor: (theme) =>
                    theme.palette.mode === 'dark' ? `${rec.accent}20` : `${rec.accent}15`,
                  transition:  'background 0.15s, box-shadow 0.15s',
                  '&:hover':   {
                    bgcolor:   (theme) =>
                      theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#fff',
                    boxShadow: 1,
                  },
                  // staggered entrance
                  animation:      'slideUp 0.25s ease both',
                  animationDelay: `${idx * 40}ms`,
                }}
              >
                {/* Step number bubble */}
                <Box
                  sx={{
                    width:          22,
                    height:         22,
                    borderRadius:   '50%',
                    bgcolor:        `${rec.accent}18`,
                    border:         `1px solid ${rec.accent}35`,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    flexShrink:     0,
                    mt:             '1px',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ fontSize: 10, fontWeight: 800, color: rec.accent, lineHeight: 1 }}
                  >
                    {idx + 1}
                  </Typography>
                </Box>

                <Typography
                  variant="caption"
                  sx={{
                    fontSize:   12,
                    lineHeight: 1.5,
                    color:      'text.secondary',
                    fontFamily: step.startsWith('pm2') || step.includes(':') ? 'monospace' : 'inherit',
                  }}
                >
                  {step}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

// ── InsightCard ───────────────────────────────────────────────────────────────

const InsightCard: React.FC<{ insight: Insight; isLive: boolean }> = ({ insight, isLive }) => (
  <Box
    sx={{
      display:       'flex',
      flexDirection: 'column',
      gap:           1,
      p:             2,
      borderRadius:  1.5,
      bgcolor:       'background.paper',
      border:        '1px solid',
      borderColor:   'divider',
      borderLeft:    `3px solid ${insight.accent}`,
      height:        '100%',
      animation:     'slideUp 0.3s ease both',
      transition:    'box-shadow 0.2s ease, transform 0.15s ease',
      '&:hover':     { boxShadow: 4, transform: 'translateY(-2px)' },
    }}
  >
    {/* ── Top row: icon + badge ── */}
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Box
        sx={{
          width:          32,
          height:         32,
          borderRadius:   1,
          bgcolor:        `${insight.accent}15`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          color:          insight.accent,
          transition:     'background 0.2s, transform 0.2s',
          '& svg':        { fontSize: 18, transition: 'transform 0.2s' },
          '.MuiBox-root:hover &': { bgcolor: `${insight.accent}25`, '& svg': { transform: 'scale(1.12)' } },
        }}
      >
        {insight.icon}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto' }}>
        {isLive && (
          <DotIcon sx={{ fontSize: 8, color: '#2e7d32', animation: 'pulse 2s infinite', flexShrink: 0 }} />
        )}
        {insight.badge && (
          <Chip
            label={insight.badge}
            size="small"
            sx={{
              height:    18,
              fontSize:  10,
              fontWeight: 700,
              bgcolor:   `${insight.accent}15`,
              color:     insight.accent,
              border:    `1px solid ${insight.accent}35`,
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        )}
      </Box>
    </Box>

    {/* ── Headline ── */}
    <Typography
      variant="body2"
      fontWeight={700}
      sx={{ lineHeight: 1.35, color: 'text.primary', fontSize: 13 }}
    >
      {insight.headline}
    </Typography>

    {/* ── Detail ── */}
    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, fontSize: 11 }}>
      {insight.detail}
    </Typography>
  </Box>
);

// ── BenchmarkInsights ─────────────────────────────────────────────────────────

/**
 * Renders 2–4 smart insight cards derived from the latest benchmark snapshot.
 * All logic lives in deriveInsights() above — this component is pure display.
 */
const BenchmarkInsights: React.FC<{
  latest:    Record<string, BenchmarkDataPoint>;
  rpsRank:   Record<string, 'best' | 'worst' | 'mid'>;
  p99Rank:   Record<string, 'best' | 'worst' | 'mid'>;
  errorRank: Record<string, 'best' | 'worst' | 'mid'>;
  isLive:    boolean;
}> = ({ latest, rpsRank, p99Rank, errorRank, isLive }) => {
  const insights = useMemo(
    () => deriveInsights(latest, rpsRank, p99Rank, errorRank),
    [latest, rpsRank, p99Rank, errorRank],
  );

  if (insights.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      {/* ── Section header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <TrophyIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="subtitle2" fontWeight={700} color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>
          Smart Insights
        </Typography>
        {isLive && (
          <Chip label="Live" size="small" color="success"
            icon={<DotIcon sx={{ fontSize: '8px !important' }} />}
            sx={{ height: 18, fontSize: 10, ml: 0.5 }} />
        )}
      </Box>

      {/* ── Cards grid — staggered entrance via animationDelay ── */}
      <Grid container spacing={2}>
        {insights.map((ins, idx) => (
          <Fade key={ins.id} in timeout={300 + idx * 80}>
            <Grid item xs={12} sm={6} md={3}
              sx={{ animationDelay: `${idx * 60}ms` }}
            >
              <InsightCard insight={ins} isLive={isLive} />
            </Grid>
          </Fade>
        ))}
      </Grid>
    </Box>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const BenchmarkDashboard: React.FC = () => {
  // ── SSE stream ──────────────────────────────────────────────────────────────
  const {
    connected,
    runStatus,
    livePoints,
    latestPoints,
    scenarios: liveScenarios,
    error:     streamError,
    reconnectCount,
  } = useBenchmarkStream();

  // ── Mount animation ─────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── HTTP fallback state ─────────────────────────────────────────────────────
  const [httpLatest, setHttpLatest]   = useState<Record<string, BenchmarkDataPoint>>({});
  const [httpLoading, setHttpLoading] = useState(false);
  const [httpError,   setHttpError]   = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHttp = useCallback(async () => {
    setHttpLoading(true);
    try {
      const res = await apiService.get<Record<string, BenchmarkDataPoint[]>>('/api/benchmarks');
      if (res.success && res.data) {
        const latest: Record<string, BenchmarkDataPoint> = {};
        for (const [name, pts] of Object.entries(res.data)) {
          if (pts.length > 0) latest[name] = pts[pts.length - 1];
        }
        setHttpLatest(latest);
        setHttpError(null);
      }
    } catch (e: any) {
      setHttpError(e?.message ?? 'Failed to fetch benchmarks');
    } finally {
      setHttpLoading(false);
    }
  }, []);

  // Poll HTTP only when SSE is down
  useEffect(() => {
    if (!connected) {
      fetchHttp();
      pollRef.current = setInterval(fetchHttp, 10_000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [connected, fetchHttp]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const effectiveLatest = useMemo((): Record<string, BenchmarkDataPoint> => {
    if (Object.keys(latestPoints).length > 0) return latestPoints;
    if (Object.keys(httpLatest).length > 0)   return httpLatest;
    return SEED_LATEST;
  }, [latestPoints, httpLatest]);

  const hasLiveData      = liveScenarios.length > 0;
  const activeScenarios  = hasLiveData ? liveScenarios : ALL_SCENARIOS;
  const isLive           = connected && (runStatus?.running ?? false);

  const rpsTimeSeries = useMemo(
    () => hasLiveData ? buildTimeSeries(livePoints, 'rps', activeScenarios, 60) : [],
    [livePoints, activeScenarios, hasLiveData],
  );
  const p99TimeSeries = useMemo(
    () => hasLiveData ? buildTimeSeries(livePoints, 'p99', activeScenarios, 60) : [],
    [livePoints, activeScenarios, hasLiveData],
  );
  const p95TimeSeries = useMemo(
    () => hasLiveData ? buildTimeSeries(livePoints, 'p95', activeScenarios, 60) : [],
    [livePoints, activeScenarios, hasLiveData],
  );
  const p50TimeSeries = useMemo(
    () => hasLiveData ? buildTimeSeries(livePoints, 'p50', activeScenarios, 60) : [],
    [livePoints, activeScenarios, hasLiveData],
  );
  const errTimeSeries = useMemo(
    () => hasLiveData
      ? buildTimeSeries(livePoints, 'errors', activeScenarios, 60).map(row => {
          const next = { ...row };
          for (const s of activeScenarios) {
            const k = `${s}_errors`;
            if (next[k] != null) next[k] = (next[k] as number) * 100;
          }
          return next;
        })
      : [],
    [livePoints, activeScenarios, hasLiveData],
  );

  // ── Rankings — must be declared BEFORE compBars which depends on them ───────
  const rpsRank    = useMemo(() => rankScenarios(effectiveLatest, 'rps',    true),  [effectiveLatest]);
  const p99Rank    = useMemo(() => rankScenarios(effectiveLatest, 'p99',    false), [effectiveLatest]);
  const errorRank  = useMemo(() => rankScenarios(effectiveLatest, 'errors', false), [effectiveLatest]);

  const compBars = useMemo(
    () => buildComparisonBars(effectiveLatest, rpsRank, p99Rank, errorRank),
    [effectiveLatest, rpsRank, p99Rank, errorRank],
  );

  // Best overall = wins most categories
  const overallBest = useMemo(() => {
    const score: Record<string, number> = {};
    for (const name of ALL_SCENARIOS) score[name] = 0;
    for (const ranks of [rpsRank, p99Rank, errorRank]) {
      for (const [name, r] of Object.entries(ranks)) {
        if (r === 'best') score[name] += 2;
        else if (r === 'mid') score[name] += 1;
      }
    }
    return Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [rpsRank, p99Rank, errorRank]);

  // ── Recommendation engine ────────────────────────────────────────────────────
  const recommendation = useMemo(
    () => deriveRecommendation(effectiveLatest, hasLiveData),
    [effectiveLatest, hasLiveData],
  );

  // ── Running state helpers ────────────────────────────────────────────────────
  const completedScenarios = useMemo(() => {
    if (!runStatus?.scenarios) return 0;
    return Object.values(runStatus.scenarios).filter((s: any) => s.passed !== undefined).length;
  }, [runStatus]);

  // ── UI toggles ──────────────────────────────────────────────────────────────
  const [latencyMetric, setLatencyMetric] = useState<'p99' | 'p95' | 'p50'>('p99');
  const [compMetric,    setCompMetric]    = useState<'rps' | 'p99' | 'errors'>('rps');

  const selectedLatSeries = useMemo(() => {
    if (latencyMetric === 'p50') return p50TimeSeries;
    if (latencyMetric === 'p95') return p95TimeSeries;
    return p99TimeSeries;
  }, [latencyMetric, p99TimeSeries, p95TimeSeries, p50TimeSeries]);

  // Stat card values
  const fgInline  = effectiveLatest['flexgate-inline'];
  const baselinePt= effectiveLatest['baseline'];
  const fgP99     = fgInline?.p99    ?? 3.4;
  const baseP99   = baselinePt?.p99  ?? 0.8;
  const overhead  = fgP99 - baseP99;
  const fgRps     = fgInline?.rps    ?? 12000;
  const fgErr     = fgInline?.errors ?? 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Fade in={mounted} timeout={400}>
    <Box sx={{ pb: 6 }}>

      {/* ── Page header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ letterSpacing: '-0.5px' }}>
            Benchmark Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Real-time k6 load test results — 5 scenarios, 1-second resolution
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {connected
            ? <Chip icon={<DotIcon sx={{ fontSize: '10px !important' }} />} label="SSE Connected" color="success" size="small" />
            : <Chip icon={<OfflineIcon sx={{ fontSize: 14 }} />} label={reconnectCount > 0 ? `Reconnecting (${reconnectCount})` : 'Connecting…'} size="small" />
          }
          <MuiTooltip title="Refresh HTTP fallback data">
            <span>
              <IconButton size="small" onClick={fetchHttp} disabled={httpLoading || connected}>
                {httpLoading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </MuiTooltip>
        </Box>
      </Box>

      {/* ── System banners — only rendered when relevant ── */}
      {streamError && (
        <Alert severity="warning" sx={{ mb: 2 }} icon={<OfflineIcon />}>
          SSE stream disconnected — showing HTTP-polled data. Reconnecting automatically.
        </Alert>
      )}
      {httpError && !connected && (
        <Alert severity="error" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={fetchHttp}>Retry</Button>}>
          {httpError}
        </Alert>
      )}
      {!hasLiveData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing reference data from <code>docs/benchmarks.md</code>.
          Run <code>npm run benchmark</code> to see live results.
        </Alert>
      )}
      {isLive && runStatus?.active_scenario ? (
        <RunningBanner
          activeScenario={runStatus.active_scenario}
          completedCount={completedScenarios}
          totalCount={ALL_SCENARIOS.length}
        />
      ) : runStatus && !runStatus.running && hasLiveData && (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircleIcon />}>
          Benchmark run complete — {completedScenarios}/{ALL_SCENARIOS.length} scenarios finished.
          {overallBest && <> Best overall performer: <strong>{SCENARIO_LABELS[overallBest] ?? overallBest}</strong>.</>}
        </Alert>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — RECOMMENDED USAGE
          Story header + key metric stat cards + smart insight cards.
          Goal: give operators enough context to act before they see raw numbers.
      ══════════════════════════════════════════════════════════════════════ */}
      <PageSection
        title="Recommended Usage"
        icon={<ShieldIcon />}
        accent="#00838f"
      >
        {/* Story header: explains Mirror vs Inline in plain English */}
        <BenchmarkStoryHeader />

        {/* ── Recommendation engine — contextual action card ── */}
        <RecommendationCard recommendation={recommendation} isLive={isLive} />

        {/* Key metric stat cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="FG Inline P99"
              value={`${fmt1(fgP99)} ms`}
              subtitle="FlexGate inline, current window"
              icon={<TimerIcon fontSize="large" />}
              color="#1976d2"
              live={isLive}
              rank={p99Rank['flexgate-inline']}
              loading={httpLoading && !hasLiveData}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="P99 Overhead"
              value={`+${fmt1(overhead)} ms`}
              subtitle="vs direct baseline"
              icon={<SpeedIcon fontSize="large" />}
              color="#f57c00"
              live={isLive}
              loading={httpLoading && !hasLiveData}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="FG Inline RPS"
              value={fmt0(fgRps)}
              subtitle="Requests per second"
              icon={<TrendingUpIcon fontSize="large" />}
              color="#1976d2"
              live={isLive}
              rank={rpsRank['flexgate-inline']}
              loading={httpLoading && !hasLiveData}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Error Rate"
              value={fmtPct(fgErr)}
              subtitle="FlexGate inline, current window"
              icon={fgErr > 0.01 ? <ErrorIcon fontSize="large" /> : <CheckCircleIcon fontSize="large" />}
              color={fgErr > 0.01 ? '#c62828' : '#2e7d32'}
              live={isLive}
              rank={errorRank['flexgate-inline']}
              loading={httpLoading && !hasLiveData}
            />
          </Grid>
        </Grid>

        {/* Smart Insights */}
        <BenchmarkInsights
          latest={effectiveLatest}
          rpsRank={rpsRank}
          p99Rank={p99Rank}
          errorRank={errorRank}
          isLive={isLive}
        />
      </PageSection>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — PERFORMANCE OVERVIEW
          Four time-series / snapshot charts.
          Goal: show live behaviour; fallback to reference bars when no run active.
      ══════════════════════════════════════════════════════════════════════ */}
      <PageSection
        title="Performance Overview"
        icon={<OverviewIcon />}
        accent="#1565c0"
      >
        <Grid container spacing={3}>

          {/* ── Chart 1: Live RPS ── */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', transition: 'box-shadow 0.2s ease', '&:hover': { boxShadow: 4 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <SectionTitle badge={<LiveBadge active={isLive} />}>Live RPS</SectionTitle>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Requests per second — last 60 s per scenario.
              </Typography>
              <GroupedLegend compact scenarios={activeScenarios} />
              <Box sx={{ mt: 2 }}>
                {hasLiveData && rpsTimeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={rpsTimeSeries} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip content={<RpsTooltip />} />
                      {activeScenarios.map((name) => (
                        <Line key={name} type="monotone" dataKey={`${name}_rps`} name={name}
                          stroke={COLORS[name] ?? '#aaa'} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={compBars} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CompBarTooltip />} />
                      <Bar dataKey="rps" name="RPS" radius={[4, 4, 0, 0]}>
                        {compBars.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* ── Chart 2: Live Latency ── */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', transition: 'box-shadow 0.2s ease', '&:hover': { boxShadow: 4 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                <SectionTitle badge={<LiveBadge active={isLive} />}>Live Latency</SectionTitle>
                <ToggleButtonGroup value={latencyMetric} exclusive size="small"
                  onChange={(_, v) => v && setLatencyMetric(v)}>
                  <ToggleButton value="p50">P50</ToggleButton>
                  <ToggleButton value="p95">P95</ToggleButton>
                  <ToggleButton value="p99">P99</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {latencyMetric.toUpperCase()} latency — last 60 s per scenario.
              </Typography>
              <GroupedLegend compact scenarios={activeScenarios} />
              <Box sx={{ mt: 2 }}>
                {hasLiveData && selectedLatSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={selectedLatSeries} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis unit=" ms" tick={{ fontSize: 11 }} />
                      <Tooltip content={<LatencyTooltip />} />
                      {activeScenarios.map((name) => (
                        <Line key={name} type="monotone" dataKey={`${name}_${latencyMetric}`} name={name}
                          stroke={COLORS[name] ?? '#aaa'} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={compBars} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                      <YAxis unit=" ms" tick={{ fontSize: 11 }} />
                      <Tooltip content={<LatencyTooltip />} />
                      <Bar dataKey="p50" name="P50" fill="#80cbc4" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="p95" name="P95" fill="#42a5f5" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="p99" name="P99" fill="#6a1b9a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* ── Chart 3: Error Rate ── */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', transition: 'box-shadow 0.2s ease', '&:hover': { boxShadow: 4 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <SectionTitle badge={<LiveBadge active={isLive} />}>Error Rate</SectionTitle>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Failed requests % — last 60 s per scenario. Red line = SLO limit (0.1%).
              </Typography>
              <GroupedLegend compact scenarios={activeScenarios} />
              <Box sx={{ mt: 2 }}>
                {hasLiveData && errTimeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={errTimeSeries} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        {activeScenarios.map((name) => (
                          <linearGradient key={name} id={`errGrad_${name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={COLORS[name] ?? '#aaa'} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={COLORS[name] ?? '#aaa'} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip content={<ErrorTooltip />} />
                      <ReferenceLine y={0.1} stroke="#c62828" strokeDasharray="4 3"
                        label={{ value: 'SLO', fontSize: 10, fill: '#c62828', position: 'insideTopRight' }} />
                      {activeScenarios.map((name) => (
                        <Area key={name} type="monotone" dataKey={`${name}_errors`} name={name}
                          stroke={COLORS[name] ?? '#aaa'} fill={`url(#errGrad_${name})`}
                          strokeWidth={2} connectNulls />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={compBars} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${fmt1(v)}%`, 'Error %']} />
                      <ReferenceLine y={0.1} stroke="#c62828" strokeDasharray="4 3" />
                      <Bar dataKey="errors" name="Error %" radius={[4, 4, 0, 0]}>
                        {compBars.map((e, i) => (
                          <Cell key={i} fill={e.errors > 0.1 ? '#c62828' : e.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* ── Chart 4: Scenario Snapshot ── */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', transition: 'box-shadow 0.2s ease', '&:hover': { boxShadow: 4 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
                <SectionTitle>Scenario Snapshot</SectionTitle>
                <ToggleButtonGroup value={compMetric} exclusive size="small"
                  onChange={(_, v) => v && setCompMetric(v)}>
                  <ToggleButton value="rps">RPS</ToggleButton>
                  <ToggleButton value="p99">P99</ToggleButton>
                  <ToggleButton value="errors">Errors</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {hasLiveData ? 'Latest snapshot per scenario.' : 'Reference — run benchmarks to update.'}
              </Typography>
              <GroupedLegend compact />
              <Box sx={{ mt: 2 }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={compBars} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={
                        compMetric === 'rps'   ? (v) => `${Math.round(v / 1000)}k`
                        : compMetric === 'p99' ? (v) => `${v} ms`
                        : (v) => `${v}%`
                      }
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<CompBarTooltip />} />
                    <Bar dataKey={compMetric} name={compMetric.toUpperCase()} radius={[4, 4, 0, 0]}>
                      {compBars.map((e, i) => (
                        <Cell key={i} fill={
                          compMetric === 'rps'    ? e.fillRps    :
                          compMetric === 'p99'    ? e.fillP99    :
                          compMetric === 'errors' ? e.fillErrors : e.fill
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

        </Grid>
      </PageSection>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — SCENARIO COMPARISON
          Full comparison table with Use Case column, metric badges, and
          FlexGate row highlights. One row per scenario, grouped by category.
      ══════════════════════════════════════════════════════════════════════ */}
      <PageSection
        title="Scenario Comparison"
        icon={<TableChartIcon />}
        accent="#6a1b9a"
        sx={{ mb: 2 }}
      >
        {/* ── Comparison Table Paper ── */}
        <Paper sx={{ p: 3 }}>
          {/* ── Table header ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <SectionTitle>Comparison Table</SectionTitle>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {overallBest && (
                <Chip
                  icon={<TrophyIcon sx={{ fontSize: '14px !important' }} />}
                  label={`Best: ${SCENARIO_SHORT_LABELS[overallBest] ?? overallBest}`}
                  size="small" color="success" variant="outlined"
                />
              )}
              {hasLiveData && <Chip label="Live data" size="small" color="success" variant="outlined" />}
            </Box>
          </Box>

          {/* Grouped scenario legend */}
          <Box sx={{ mb: 2 }}>
            <GroupedLegend />
          </Box>

          {/* Legend key */}
          <Box sx={{ display: 'flex', gap: 2, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: RANK_BG.best, border: '1px solid #2e7d32' }} />
              <Typography variant="caption" color="text.secondary">Best in metric</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: RANK_BG.worst, border: '1px solid #c62828' }} />
              <Typography variant="caption" color="text.secondary">Worst in metric</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrophyIcon sx={{ fontSize: 12, color: '#2e7d32' }} />
              <Typography variant="caption" color="text.secondary">Overall best</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 3, height: 16, borderRadius: 0.5, bgcolor: '#6a1b9a' }} />
              <Typography variant="caption" color="text.secondary">FlexGate row</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <InfoIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">Hover name for details</Typography>
            </Box>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{
                    '& th': { fontWeight: 700 },
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
                  }}
                >
                  <TableCell sx={{ minWidth: 200 }}>Scenario</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Use Case</TableCell>
                  <TableCell align="right">RPS</TableCell>
                  <TableCell align="right">P50 (ms)</TableCell>
                  <TableCell align="right">P95 (ms)</TableCell>
                  <TableCell align="right">P99 (ms)</TableCell>
                  <TableCell align="right">Error rate</TableCell>
                  <TableCell align="right">VUs</TableCell>
                  <TableCell align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(['reference', 'industry', 'flexgate'] as GroupKey[]).map((gk) => {
                  const groupScenarios = SCENARIO_GROUP_ORDER.filter((s) => SCENARIO_GROUP[s] === gk);
                  const gm = GROUP_META[gk];
                  return (
                    <React.Fragment key={gk}>
                      {/* ── Group separator row ── */}
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          sx={{
                            py: 0.75,
                            px: 1.5,
                            bgcolor: (theme) =>
                              theme.palette.mode === 'dark' ? gm.bgDark : gm.bgLight,
                            borderBottom: `2px solid ${gm.color}30`,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: gm.color, flexShrink: 0 }} />
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, color: gm.color, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}
                            >
                              {gm.label}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                              — {gm.description}
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>

                      {/* ── Scenario rows ── */}
                      {groupScenarios.map((name) => {
                        const pt         = effectiveLatest[name];
                        const result     = runStatus?.scenarios?.[name];
                        const isActive   = runStatus?.active_scenario === name;
                        const isBestAll  = name === overallBest;
                        const isFG       = gk === 'flexgate';
                        const useCase    = SCENARIO_USE_CASE[name];

                        const rowBg = isActive  ? 'rgba(25,118,210,0.06)'
                                    : isBestAll ? 'rgba(46,125,50,0.05)'
                                    : isFG      ? (theme) =>
                                        theme.palette.mode === 'dark'
                                          ? 'rgba(106,27,154,0.05)'
                                          : 'rgba(106,27,154,0.02)'
                                    : undefined;

                        return (
                          <TableRow
                            key={name}
                            sx={{
                              '&:last-child td': { border: 0 },
                              background: rowBg,
                              ...(isFG && {
                                '& td:first-of-type': {
                                  borderLeft: `3px solid ${COLORS[name]}`,
                                },
                              }),
                              '&:hover': {
                                bgcolor: (theme) =>
                                  theme.palette.mode === 'dark'
                                    ? 'rgba(255,255,255,0.04)'
                                    : 'rgba(0,0,0,0.02)',
                              },
                              transition: 'background 0.15s',
                            }}
                          >
                            <TableCell>
                              <ScenarioTooltip scenario={name} placement="right">
                                <Box
                                  sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    pl: isFG ? 0.5 : 1,
                                    cursor: 'help',
                                    borderRadius: 1,
                                    pr: 1,
                                    py: 0.25,
                                    '&:hover': { bgcolor: 'action.hover' },
                                    transition: 'background 0.15s',
                                  }}
                                >
                                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLORS[name] ?? '#aaa', flexShrink: 0 }} />
                                  <Typography variant="body2" fontWeight={isBestAll ? 700 : isFG ? 600 : 500}>
                                    {SCENARIO_LABELS[name] ?? name}
                                  </Typography>
                                  {isActive   && <DotIcon   sx={{ fontSize: 10, color: '#2e7d32', animation: 'pulse 1.5s infinite' }} />}
                                  {isBestAll && !isActive && <TrophyIcon sx={{ fontSize: 14, color: '#2e7d32' }} />}
                                  <InfoIcon sx={{ fontSize: 13, color: 'text.disabled', opacity: 0.6, ml: 'auto', flexShrink: 0 }} />
                                </Box>
                              </ScenarioTooltip>
                            </TableCell>

                            {/* Use Case */}
                            <TableCell>
                              {useCase && (
                                <Chip
                                  icon={React.cloneElement(useCase.icon, {
                                    sx: { fontSize: '13px !important', color: `${useCase.color} !important` },
                                  })}
                                  label={useCase.label}
                                  size="small"
                                  sx={{
                                    height: 22, fontSize: 11, fontWeight: 600,
                                    bgcolor: `${useCase.color}12`, color: useCase.color,
                                    border: `1px solid ${useCase.color}30`,
                                    '& .MuiChip-label': { px: 0.75 },
                                    '& .MuiChip-icon':  { ml: 0.5 },
                                  }}
                                />
                              )}
                            </TableCell>

                            {/* RPS */}
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', background: RANK_BG[rpsRank[name]] ?? undefined, color: RANK_COLOR[rpsRank[name]] ?? 'inherit', fontWeight: rpsRank[name] === 'best' ? 700 : undefined }}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, justifyContent: 'flex-end' }}>
                                {pt ? fmt0(pt.rps) : '—'}
                                {rpsRank[name] === 'best'  && <MuiTooltip title="Best RPS" placement="top"><TrophyIcon sx={{ fontSize: 12, color: '#2e7d32' }} /></MuiTooltip>}
                                {rpsRank[name] === 'worst' && <MuiTooltip title="Lowest RPS" placement="top"><WorstIcon sx={{ fontSize: 12, color: '#c62828' }} /></MuiTooltip>}
                              </Box>
                            </TableCell>

                            {/* P50 */}
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{pt ? fmt1(pt.p50) : '—'}</TableCell>

                            {/* P95 */}
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{pt ? fmt1(pt.p95) : '—'}</TableCell>

                            {/* P99 */}
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', background: RANK_BG[p99Rank[name]] ?? undefined, color: (pt?.p99 ?? 0) > 10 ? '#c62828' : RANK_COLOR[p99Rank[name]] ?? 'inherit', fontWeight: p99Rank[name] === 'best' ? 700 : 600 }}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, justifyContent: 'flex-end' }}>
                                {pt ? fmt1(pt.p99) : '—'}
                                {p99Rank[name] === 'best'  && <MuiTooltip title="Lowest P99 latency" placement="top"><TrophyIcon sx={{ fontSize: 12, color: '#2e7d32' }} /></MuiTooltip>}
                                {p99Rank[name] === 'worst' && <MuiTooltip title="Highest P99 latency" placement="top"><WorstIcon sx={{ fontSize: 12, color: '#c62828' }} /></MuiTooltip>}
                              </Box>
                            </TableCell>

                            {/* Error rate */}
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', background: RANK_BG[errorRank[name]] ?? undefined, color: ((pt?.errors ?? 0) * 100) > 0.1 ? '#c62828' : RANK_COLOR[errorRank[name]] ?? 'inherit', fontWeight: errorRank[name] === 'best' ? 700 : undefined }}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, justifyContent: 'flex-end' }}>
                                {pt ? fmtPct(pt.errors) : '—'}
                                {errorRank[name] === 'best'  && <MuiTooltip title="Lowest error rate" placement="top"><TrophyIcon sx={{ fontSize: 12, color: '#2e7d32' }} /></MuiTooltip>}
                                {errorRank[name] === 'worst' && <MuiTooltip title="Highest error rate" placement="top"><WorstIcon sx={{ fontSize: 12, color: '#c62828' }} /></MuiTooltip>}
                              </Box>
                            </TableCell>

                            {/* VUs */}
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{pt?.vus ?? '—'}</TableCell>

                            {/* Status */}
                            <TableCell align="center">
                              {isActive ? (
                                <Chip label="Running" size="small" color="primary"
                                  icon={<CircularProgress size={10} sx={{ color: 'inherit !important' }} />} />
                              ) : result ? (
                                <Chip
                                  label={result.passed ? 'Passed' : 'Failed'}
                                  size="small"
                                  color={result.passed ? 'success' : 'error'}
                                  icon={result.passed
                                    ? <CheckCircleIcon sx={{ fontSize: '13px !important' }} />
                                    : <ErrorIcon      sx={{ fontSize: '13px !important' }} />
                                  }
                                />
                              ) : hasLiveData ? (
                                <Chip label="Pending" size="small" variant="outlined" />
                              ) : (
                                <Chip label="Reference" size="small" variant="outlined" sx={{ color: 'text.disabled' }} />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </PageSection>

      {/* ── Footer ── */}
      <Divider sx={{ mt: 4, mb: 2 }} />
      <Typography variant="caption" color="text.secondary">
        {hasLiveData
          ? `Live data via SSE · last point ${fmtTs(Object.values(effectiveLatest)[0]?.timestamp ?? '')}`
          : <>Reference data from <code>docs/benchmarks.md</code> (loopback hardware). Run <code>npm run benchmark</code> to populate with real results.</>
        }
      </Typography>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes countIn {
          from { opacity: 0.4; transform: scale(0.96); }
          to   { opacity: 1;   transform: scale(1); }
        }
        @keyframes ringPulse {
          0%   { opacity: 0.8; transform: scale(1); }
          60%  { opacity: 0;   transform: scale(1.5); }
          100% { opacity: 0;   transform: scale(1.5); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
    </Fade>
  );
};

export default BenchmarkDashboard;

