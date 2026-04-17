/**
 * LiteRoutesPage  — /routes  (Lite / benchmark mode)
 *
 * A read-only view of all configured proxy routes for Lite mode users.
 * Full management (create / edit / delete / toggle) is unlocked in Full mode.
 *
 * Story:
 *   "Here are the routes your proxy is currently serving.
 *    Upgrade to Full mode to manage, add, or edit them."
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CallSplit as RouteIcon,
  CheckCircleOutline as EnabledIcon,
  ErrorOutline as DisabledIcon,
  Lock as LockIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RouteRow {
  id: string;
  path: string;
  upstream: string;
  enabled: boolean;
  methods: string[];
  strip_path?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  GET: 'primary',
  POST: 'success',
  PUT: 'warning',
  DELETE: 'error',
  PATCH: 'warning',
};

// ── LiteRoutesPage ────────────────────────────────────────────────────────────

const LiteRoutesPage: React.FC = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.get<
        { routes?: RouteRow[]; data?: RouteRow[] } | RouteRow[]
      >('/api/routes');
      if (res.success && res.data) {
        const raw = res.data;
        const list: RouteRow[] = Array.isArray(raw)
          ? raw
          : (raw.routes ?? raw.data ?? []);
        setRoutes(list);
      } else {
        setError('Could not load routes.');
      }
    } catch {
      setError('Could not load routes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const activeCount = routes.filter((r) => r.enabled).length;

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Proxy Routes
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {loading
              ? 'Loading routes…'
              : `${routes.length} route${routes.length !== 1 ? 's' : ''} configured · ${activeCount} active`}
          </Typography>
        </Box>

        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={fetchRoutes} disabled={loading} size="small">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* ── Upgrade callout ─────────────────────────────────────────────── */}
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          borderColor: 'warning.main',
          bgcolor: 'warning.50',
          borderStyle: 'dashed',
        }}
      >
        <CardContent
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            py: '12px !important',
          }}
        >
          <LockIcon sx={{ color: 'warning.dark', flexShrink: 0 }} />
          <Box flex={1} minWidth={200}>
            <Typography variant="subtitle2" fontWeight={700} color="warning.dark">
              Read-only in Lite mode
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You can see your active routes here, but creating, editing, toggling, or
              deleting routes requires <strong>Full mode</strong>.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            color="warning"
            onClick={() => navigate('/setup/full')}
            sx={{ flexShrink: 0, fontWeight: 700 }}
          >
            Upgrade to Full →
          </Button>
        </CardContent>
      </Card>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && routes.length === 0 && !error && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <RouteIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No routes configured yet
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Routes define how FlexGate proxies incoming requests to upstream services.
              Upgrade to Full mode to create your first route.
            </Typography>
            <Button
              variant="contained"
              color="warning"
              onClick={() => navigate('/setup/full')}
            >
              Upgrade to Full mode →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Route list ──────────────────────────────────────────────────── */}
      {!loading && routes.length > 0 && (
        <Stack spacing={1.5}>
          {routes.map((route) => (
            <Card
              key={route.id}
              variant="outlined"
              sx={{
                opacity: route.enabled ? 1 : 0.6,
                transition: 'opacity 0.2s',
              }}
            >
              <CardContent sx={{ py: '12px !important', px: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Status icon */}
                  <Tooltip title={route.enabled ? 'Active' : 'Disabled'}>
                    {route.enabled ? (
                      <EnabledIcon
                        fontSize="small"
                        sx={{ color: 'success.main', flexShrink: 0 }}
                      />
                    ) : (
                      <DisabledIcon
                        fontSize="small"
                        sx={{ color: 'text.disabled', flexShrink: 0 }}
                      />
                    )}
                  </Tooltip>

                  {/* Path */}
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    fontFamily="monospace"
                    sx={{ minWidth: 0, flex: '1 1 160px' }}
                    noWrap
                    title={route.path}
                  >
                    {route.path}
                  </Typography>

                  {/* Arrow + upstream */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      flex: '2 1 200px',
                      minWidth: 0,
                    }}
                  >
                    <Typography variant="caption" color="text.disabled" flexShrink={0}>
                      →
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      title={route.upstream}
                      sx={{ minWidth: 0 }}
                    >
                      {route.upstream}
                    </Typography>
                  </Box>

                  {/* Methods */}
                  <Stack direction="row" spacing={0.5} flexShrink={0}>
                    {(route.methods ?? []).slice(0, 4).map((m) => (
                      <Chip
                        key={m}
                        label={m}
                        size="small"
                        color={METHOD_COLORS[m] ?? 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                      />
                    ))}
                  </Stack>

                  {/* Read-only lock hint */}
                  <Tooltip title="Upgrade to Full mode to manage routes">
                    <LockIcon
                      fontSize="small"
                      sx={{ color: 'text.disabled', flexShrink: 0 }}
                    />
                  </Tooltip>
                </Box>

                {/* Strip-path label if present */}
                {route.strip_path && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.disabled">
                      strip prefix: <code>{route.strip_path}</code>
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* ── Bottom upgrade CTA ───────────────────────────────────────────── */}
      {!loading && routes.length > 0 && (
        <Box
          sx={{
            mt: 4,
            p: 3,
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
            textAlign: 'center',
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Want to add, edit or delete routes?
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Full mode unlocks complete route management — path rules, strip prefixes,
            per-method controls, and live toggle.
          </Typography>
          <Button
            variant="outlined"
            color="warning"
            onClick={() => navigate('/setup/full')}
          >
            Unlock Full Mode →
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default LiteRoutesPage;
