/**
 * LiteDashboard  — /lite
 *
 * Stage 11 — Mode-Based Dashboards, Stage 3: Lite Dashboard
 *
 * The home page for benchmark (Lite) mode users.
 * Intentionally minimal: quick-glance stats, benchmark status, a one-click
 * test-API action, and a list of active proxy routes.
 *
 * Data sources (no new dependencies):
 *   useBenchmarkStream()   — live RPS / latency / status (SSE, already in bundle)
 *   apiService.get()       — GET /api/routes for the route list
 *
 * Upgrade path:
 *   UpgradeBanner at the top always shows the path to Full mode.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircleOutline as OkIcon,
  ErrorOutline as ErrIcon,
  FiberManualRecord as DotIcon,
  OpenInNew as OpenInNewIcon,
  Refresh as RefreshIcon,
  RocketLaunch as RocketIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

import { useBenchmarkStream } from '../hooks/useBenchmarkStream';
import { apiService } from '../services/api';
import { UpgradeBanner } from '../components/upgrade/UpgradeBanner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RouteRow {
  id: string;
  path: string;
  upstream: string;
  enabled: boolean;
  methods: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | undefined, decimals = 0): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function fmtMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single quick-stat card. */
function StatCard({
  label,
  value,
  unit,
  loading,
  color = 'text.primary',
}: {
  label: string;
  value: string;
  unit?: string;
  loading?: boolean;
  color?: string;
}) {
  return (
    <Card variant="outlined" sx={{ flex: '1 1 160px', minWidth: 140 }}>
      <CardContent sx={{ pb: '12px !important', pt: 1.5, px: 2 }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton width={60} height={36} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
            <Typography variant="h5" fontWeight={700} color={color}>
              {value}
            </Typography>
            {unit && (
              <Typography variant="caption" color="text.secondary">
                {unit}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const LiteDashboard: React.FC = () => {
  // ── Benchmark stream ──────────────────────────────────────────────────────
  const { connected, runStatus, latestPoints, scenarios, error: streamError } =
    useBenchmarkStream();

  // Pick the best available scenario for the headline stats.
  // Prefer flexgate-inline → flexgate-mirror → first available.
  const primaryScenario = useMemo(() => {
    const preferred = ['flexgate-inline', 'flexgate-mirror'];
    return (
      preferred.find((s) => scenarios.includes(s)) ??
      scenarios[0] ??
      null
    );
  }, [scenarios]);

  const primary = primaryScenario ? latestPoints[primaryScenario] : undefined;

  // ── Routes list ───────────────────────────────────────────────────────────
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const fetchRoutes = useCallback(async () => {
    setRoutesLoading(true);
    setRoutesError(null);
    try {
      const res = await apiService.get<{ routes?: RouteRow[]; data?: RouteRow[] } | RouteRow[]>('/api/routes');
      if (res.success && res.data) {
        const raw = res.data;
        const list: RouteRow[] = Array.isArray(raw)
          ? raw
          : (raw.routes ?? raw.data ?? []);
        setRoutes(list.slice(0, 8)); // cap at 8 for the lite view
      } else {
        setRoutesError('Could not load routes.');
      }
    } catch {
      setRoutesError('Could not load routes.');
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  // ── Test-API action ───────────────────────────────────────────────────────
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTestApi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiService.get<unknown>('/api/health');
      setTestResult({ ok: res.success, message: res.success ? 'API is healthy ✓' : 'API returned an error' });
    } catch {
      setTestResult({ ok: false, message: 'API unreachable' });
    } finally {
      setTesting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const statsLoading = !connected && scenarios.length === 0;

  return (
    <Box>
      {/* Page header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Lite Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Benchmark mode — real-time proxy performance
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          {/* Stream status badge */}
          <Chip
            size="small"
            icon={
              <DotIcon
                sx={{
                  fontSize: '10px !important',
                  color: connected ? 'success.main' : 'error.main',
                }}
              />
            }
            label={connected ? 'Live' : 'Disconnected'}
            variant="outlined"
            color={connected ? 'success' : 'default'}
          />
        </Stack>
      </Box>

      {/* Upgrade banner — canonical component, self-contained */}
      <Box mb={3}>
        <UpgradeBanner
          variant="strip"
          featureHint="routing, metrics, logs and AI analytics"
        />
      </Box>

      {/* Stream error */}
      {streamError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Benchmark stream disconnected. Stats may be stale.
        </Alert>
      )}

      {/* ── Quick stats ────────────────────────────────────────────────── */}
      <Typography variant="overline" color="text.secondary">
        Live Stats
        {primaryScenario && (
          <Typography component="span" variant="caption" color="text.disabled" ml={1}>
            ({primaryScenario})
          </Typography>
        )}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          mt: 1,
          mb: 3,
        }}
      >
        <StatCard
          label="Requests / sec"
          value={fmt(primary?.rps)}
          unit="rps"
          loading={statsLoading}
          color={primary?.rps ? 'primary.main' : 'text.primary'}
        />
        <StatCard
          label="P50 Latency"
          value={fmtMs(primary?.p50)}
          loading={statsLoading}
        />
        <StatCard
          label="P95 Latency"
          value={fmtMs(primary?.p95)}
          loading={statsLoading}
        />
        <StatCard
          label="Error Rate"
          value={primary?.errors !== undefined ? `${fmt(primary.errors * 100, 2)}%` : '—'}
          loading={statsLoading}
          color={
            primary?.errors !== undefined
              ? primary.errors > 0.01
                ? 'error.main'
                : 'success.main'
              : 'text.primary'
          }
        />
        <StatCard
          label="Active Scenarios"
          value={String(scenarios.length)}
          loading={statsLoading}
        />
        <StatCard
          label="Run Status"
          value={runStatus?.running ? 'Running' : 'Idle'}
          loading={statsLoading}
          color={runStatus?.running ? 'success.main' : 'text.secondary'}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── Two-column row: Test API + Routes ──────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px 1fr' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        {/* Test API panel */}
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <RocketIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight={700}>
                Test API
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" mb={2}>
              Send a health-check request to verify the proxy is reachable.
            </Typography>

            <Box
              component="button"
              onClick={handleTestApi}
              disabled={testing}
              sx={{
                width: '100%',
                py: 0.75,
                px: 2,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'primary.main',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                cursor: testing ? 'not-allowed' : 'pointer',
                opacity: testing ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                typography: 'button',
                mb: 0,
              }}
            >
              {testing ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <SpeedIcon fontSize="small" />
              )}
              {testing ? 'Testing…' : 'Run Health Check'}
            </Box>

            {testResult && (
              <Box
                sx={{
                  mt: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                }}
              >
                {testResult.ok ? (
                  <OkIcon fontSize="small" color="success" />
                ) : (
                  <ErrIcon fontSize="small" color="error" />
                )}
                <Typography
                  variant="caption"
                  color={testResult.ok ? 'success.main' : 'error.main'}
                >
                  {testResult.message}
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Want to see full API metrics and logs?
            </Typography>
            <UpgradeBanner variant="inline" featureHint="metrics, logs and AI analytics" />
          </CardContent>
        </Card>

        {/* Routes panel */}
        <Card variant="outlined">
          <CardContent sx={{ pb: '8px !important' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
              }}
            >
              <Typography variant="subtitle2" fontWeight={700}>
                Active Routes
              </Typography>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={fetchRoutes} disabled={routesLoading}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {routesError && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {routesError}
              </Alert>
            )}

            {routesLoading ? (
              <Stack spacing={1}>
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} height={44} variant="rounded" />
                ))}
              </Stack>
            ) : routes.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" mb={1.5}>
                  No routes configured.
                </Typography>
                <UpgradeBanner variant="inline" featureHint="route management" />
              </Box>
            ) : (
              <Stack divider={<Divider />} spacing={0}>
                {routes.map((route) => (
                  <Box
                    key={route.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Chip
                          size="small"
                          label={route.enabled ? 'on' : 'off'}
                          color={route.enabled ? 'success' : 'default'}
                          sx={{ height: 18, fontSize: 10 }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          noWrap
                          title={route.path}
                          sx={{ maxWidth: 220 }}
                        >
                          {route.path}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        display="block"
                        title={route.upstream}
                      >
                        → {route.upstream}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={0.5} flexShrink={0}>
                      {(route.methods ?? []).slice(0, 3).map((m) => (
                        <Chip
                          key={m}
                          label={m}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}

            {routes.length > 0 && (
              <Box sx={{ mt: 1.5, textAlign: 'right' }}>
                <UpgradeBanner variant="inline" featureHint="full route management" />
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* ── Benchmark link card ────────────────────────────────────────── */}
      <Card
        variant="outlined"
        sx={{ mt: 3, borderColor: 'primary.light', bgcolor: 'primary.50' }}
      >
        <CardActionArea href="/benchmarks" sx={{ px: 2.5, py: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Full Benchmark Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Live charts, latency percentiles, error rates, and scenario comparison.
              </Typography>
            </Box>
            <OpenInNewIcon color="primary" />
          </Box>
        </CardActionArea>
      </Card>

      {/* Test result toast */}
      <Snackbar
        open={testResult !== null}
        autoHideDuration={4000}
        onClose={() => setTestResult(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {testResult ? (
          <Alert
            severity={testResult.ok ? 'success' : 'error'}
            onClose={() => setTestResult(null)}
            variant="filled"
          >
            {testResult.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export default LiteDashboard;
