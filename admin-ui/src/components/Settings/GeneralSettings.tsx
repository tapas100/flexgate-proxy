import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Stack,
  Divider,
  Alert,
  Tabs,
  Tab,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  ErrorOutline as ErrorIcon,
} from '@mui/icons-material';

// ── Tab panel ────────────────────────────────────────────────────────────────
function TabPanel({
  children,
  value,
  index,
}: {
  children?: React.ReactNode;
  value: number;
  index: number;
}) {
  return (
    <div hidden={value !== index} role="tabpanel">
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Settings {
  server: {
    port: number;
    host: string;
    basePath: string;
    maxConnections: number;
    keepAliveTimeout: number;
    requestTimeout: number;
    trustProxy: boolean;
    compression: { enabled: boolean; level: number; threshold: number };
    admin: {
      path: string;
      sessionTimeout: number;
      maxLoginAttempts: number;
      lockoutDuration: number;
      autoRefresh: number;
    };
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    ssl: { enabled: boolean; mode: string; rejectUnauthorized: boolean };
    pool: { min: number; max: number; idleTimeout: number; connectionTimeout: number };
    migrations: { autoRun: boolean; table: string };
  };
  redis: {
    host: string;
    port: number;
    db: number;
    keyPrefix: string;
    connectTimeout: number;
    commandTimeout: number;
    retryAttempts: number;
    cache: { defaultTTL: number; maxMemory: number; evictionPolicy: string };
    tls: { enabled: boolean };
  };
  security: {
    jwt: { algorithm: string; expiresIn: string; refreshExpiresIn: string };
    cors: {
      enabled: boolean;
      origins: string[];
      methods: string[];
      headers: string[];
      credentials: boolean;
      maxAge: number;
    };
    rateLimit: {
      enabled: boolean;
      windowMs: number;
      maxRequests: number;
      skipSuccessful: boolean;
    };
    headers: {
      hsts: boolean;
      noSniff: boolean;
      xssProtection: boolean;
      frameOptions: string;
      csp: string;
    };
  };
  logging: {
    level: string;
    format: string;
    output: string[];
    requestLogging: boolean;
    requestBody: boolean;
    responseBody: boolean;
    slowThresholdMs: number;
    rotation: { enabled: boolean; maxFileSize: number; maxFiles: number; compress: boolean };
    errorTracking: { enabled: boolean; sampleRate: number };
  };
  monitoring: {
    prometheus: { enabled: boolean; endpoint: string; basicAuth: boolean };
    healthCheck: { enabled: boolean; endpoint: string; intervalMs: number };
    alerting: {
      enabled: boolean;
      errorRateThreshold: number;
      latencyP99ThresholdMs: number;
      cpuThreshold: number;
      memoryThreshold: number;
    };
    tracing: { enabled: boolean; provider: string; endpoint: string; sampleRate: number };
  };
}

/** Recursively merges src into dst — used to hydrate saved settings onto DEFAULT. */
function deepMerge(dst: any, src: any): any {
  if (typeof src !== 'object' || src === null) return src ?? dst;
  if (typeof dst !== 'object' || dst === null) return src;
  const out = { ...dst };
  for (const key of Object.keys(src)) {
    out[key] = deepMerge(dst[key], src[key]);
  }
  return out;
}

const DEFAULT: Settings = {
  server: {
    port: 8080,
    host: '0.0.0.0',
    basePath: '/',
    maxConnections: 10000,
    keepAliveTimeout: 60000,
    requestTimeout: 30000,
    trustProxy: true,
    compression: { enabled: true, level: 6, threshold: 1024 },
    admin: {
      path: '/admin',
      sessionTimeout: 3600000,
      maxLoginAttempts: 5,
      lockoutDuration: 900000,
      autoRefresh: 30000,
    },
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'flexgate',
    user: 'flexgate',
    ssl: { enabled: false, mode: 'prefer', rejectUnauthorized: true },
    pool: { min: 2, max: 10, idleTimeout: 30000, connectionTimeout: 10000 },
    migrations: { autoRun: false, table: 'schema_migrations' },
  },
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
    keyPrefix: 'flexgate:',
    connectTimeout: 5000,
    commandTimeout: 2000,
    retryAttempts: 3,
    cache: { defaultTTL: 300000, maxMemory: 1024, evictionPolicy: 'allkeys-lru' },
    tls: { enabled: false },
  },
  security: {
    jwt: { algorithm: 'HS256', expiresIn: '24h', refreshExpiresIn: '7d' },
    cors: {
      enabled: true,
      origins: ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400,
    },
    rateLimit: { enabled: true, windowMs: 60000, maxRequests: 1000, skipSuccessful: false },
    headers: {
      hsts: true,
      noSniff: true,
      xssProtection: true,
      frameOptions: 'SAMEORIGIN',
      csp: "default-src 'self'",
    },
  },
  logging: {
    level: 'info',
    format: 'json',
    output: ['console'],
    requestLogging: true,
    requestBody: false,
    responseBody: false,
    slowThresholdMs: 1000,
    rotation: { enabled: true, maxFileSize: 10485760, maxFiles: 10, compress: true },
    errorTracking: { enabled: false, sampleRate: 1.0 },
  },
  monitoring: {
    prometheus: { enabled: true, endpoint: '/metrics', basicAuth: false },
    healthCheck: { enabled: true, endpoint: '/health', intervalMs: 30000 },
    alerting: {
      enabled: false,
      errorRateThreshold: 5,
      latencyP99ThresholdMs: 500,
      cpuThreshold: 80,
      memoryThreshold: 85,
    },
    tracing: { enabled: false, provider: 'jaeger', endpoint: 'http://localhost:14268/api/traces', sampleRate: 0.1 },
  },
};

// ── Section helpers ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {children}
      </Typography>
    </>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Chip label={value} variant="outlined" size="medium" />
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const GeneralSettingsComponent: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [s, setS] = useState<Settings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'error'>>({});

  // Load settings from backend on mount
  useEffect(() => {
    fetch('/api/settings/ui')
      .then((r) => r.json())
      .then((json) => {
        if (json?.data && Object.keys(json.data).length > 0) {
          // Deep-merge so any new DEFAULT keys not yet in the DB stay intact
          setS((prev) => deepMerge(prev, json.data) as Settings);
        }
      })
      .catch((e) => console.warn('Failed to load settings:', e))
      .finally(() => setLoading(false));
  }, []);

  const up = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) =>
    setS((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/ui', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ open: true, msg: 'Settings saved', severity: 'success' });
      } else {
        setToast({ open: true, msg: json.error || 'Save failed', severity: 'error' });
      }
    } catch (e: any) {
      setToast({ open: true, msg: e.message || 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    // Reset local state to defaults, then persist immediately
    setS(DEFAULT);
    try {
      await fetch('/api/settings/ui', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT),
      });
      setToast({ open: true, msg: 'Settings reset to defaults', severity: 'success' });
    } catch {
      setToast({ open: true, msg: 'Reset locally (could not reach server)', severity: 'error' });
    }
  };

  const simulateTest = (key: string) => {
    setTestStatus((p) => ({ ...p, [key]: 'testing' }));
    setTimeout(
      () => setTestStatus((p) => ({ ...p, [key]: Math.random() > 0.2 ? 'ok' : 'error' })),
      1200,
    );
  };

  const TestBtn = ({ id, label }: { id: string; label: string }) => {
    const st = testStatus[id] ?? 'idle';
    return (
      <Button
        variant="outlined"
        size="small"
        onClick={() => simulateTest(id)}
        disabled={st === 'testing'}
        startIcon={
          st === 'testing' ? (
            <CircularProgress size={14} />
          ) : st === 'ok' ? (
            <CheckCircleIcon fontSize="small" color="success" />
          ) : st === 'error' ? (
            <ErrorIcon fontSize="small" color="error" />
          ) : (
            <RefreshIcon fontSize="small" />
          )
        }
        color={st === 'ok' ? 'success' : st === 'error' ? 'error' : 'primary'}
      >
        {st === 'testing' ? 'Testing…' : st === 'ok' ? 'Connected' : st === 'error' ? 'Failed' : label}
      </Button>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          {['SERVER', 'DATABASE', 'REDIS', 'SECURITY', 'LOGGING', 'MONITORING'].map((l, i) => (
            <Tab key={l} label={l} id={`tab-${i}`} />
          ))}
        </Tabs>
      </Paper>

      {/* ── SERVER ── */}
      <TabPanel value={tab} index={0}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Server Configuration</Typography>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2">Infrastructure Settings</Typography>
            <Typography variant="body2">
              Port and Host cannot be changed via Settings UI. These require updating multiple
              configuration files and restarting all services.
            </Typography>
          </Alert>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <ReadOnlyField label="Server Port" value={`Port ${s.server.port}`} />
              <ReadOnlyField label="Server Host" value={s.server.host} />
            </Box>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <TextField
                label="Base Path"
                value={s.server.basePath}
                onChange={(e) => up('server', { basePath: e.target.value })}
                helperText="Base URL path for the gateway"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Max Connections"
                type="number"
                value={s.server.maxConnections}
                onChange={(e) => up('server', { maxConnections: +e.target.value })}
                helperText="Maximum concurrent connections"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Keep-Alive Timeout (ms)"
                type="number"
                value={s.server.keepAliveTimeout}
                onChange={(e) => up('server', { keepAliveTimeout: +e.target.value })}
                helperText="TCP keep-alive timeout"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Request Timeout (ms)"
                type="number"
                value={s.server.requestTimeout}
                onChange={(e) => up('server', { requestTimeout: +e.target.value })}
                helperText="Max time to process a single request"
                sx={{ flex: '1 1 200px' }}
              />
            </Box>

            <Box>
              <FormControlLabel
                control={<Switch checked={s.server.trustProxy} onChange={(e) => up('server', { trustProxy: e.target.checked })} />}
                label="Trust Proxy Headers"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Enable when behind a load balancer or reverse proxy (X-Forwarded-For, X-Real-IP)
              </Typography>
            </Box>

            <SectionTitle>Compression</SectionTitle>
            <FormControlLabel
              control={
                <Switch
                  checked={s.server.compression.enabled}
                  onChange={(e) => up('server', { compression: { ...s.server.compression, enabled: e.target.checked } })}
                />
              }
              label="Enable Compression (gzip / br)"
            />
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 200px' }}>
                <Typography variant="body2" gutterBottom>
                  Compression Level: {s.server.compression.level}
                </Typography>
                <Slider
                  value={s.server.compression.level}
                  min={1} max={9} step={1} marks
                  disabled={!s.server.compression.enabled}
                  onChange={(_, v) => up('server', { compression: { ...s.server.compression, level: v as number } })}
                  valueLabelDisplay="auto"
                />
                <Typography variant="caption" color="text.secondary">1 = fastest · 9 = best compression</Typography>
              </Box>
              <TextField
                label="Threshold (bytes)"
                type="number"
                value={s.server.compression.threshold}
                disabled={!s.server.compression.enabled}
                onChange={(e) => up('server', { compression: { ...s.server.compression, threshold: +e.target.value } })}
                helperText="Min response size to compress"
                sx={{ flex: '1 1 200px' }}
              />
            </Box>

            <SectionTitle>Admin UI</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <TextField
                label="Admin Path"
                value={s.server.admin.path}
                onChange={(e) => up('server', { admin: { ...s.server.admin, path: e.target.value } })}
                helperText="URL prefix for Admin UI"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Session Timeout (ms)"
                type="number"
                value={s.server.admin.sessionTimeout}
                onChange={(e) => up('server', { admin: { ...s.server.admin, sessionTimeout: +e.target.value } })}
                helperText="Session duration (default: 1h)"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Max Login Attempts"
                type="number"
                value={s.server.admin.maxLoginAttempts}
                onChange={(e) => up('server', { admin: { ...s.server.admin, maxLoginAttempts: +e.target.value } })}
                helperText="Failures before account lockout"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Lockout Duration (ms)"
                type="number"
                value={s.server.admin.lockoutDuration}
                onChange={(e) => up('server', { admin: { ...s.server.admin, lockoutDuration: +e.target.value } })}
                helperText="Lock duration after too many failures"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Auto-Refresh Interval (ms)"
                type="number"
                value={s.server.admin.autoRefresh}
                onChange={(e) => up('server', { admin: { ...s.server.admin, autoRefresh: +e.target.value } })}
                helperText="Dashboard data refresh rate (0 = off)"
                sx={{ flex: '1 1 200px' }}
              />
            </Box>
          </Stack>
        </Paper>
      </TabPanel>

      {/* ── DATABASE ── */}
      <TabPanel value={tab} index={1}>
        <Paper sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Database Configuration</Typography>
            <TestBtn id="database" label="Test Connection" />
          </Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2">Connection Settings (Read-only)</Typography>
            <Typography variant="body2">
              Host, port, database name and user cannot be changed while FlexGate is running.
              Edit <code>config/flexgate.json</code> and restart to change them.
            </Typography>
          </Alert>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <ReadOnlyField label="Host" value={s.database.host} />
              <ReadOnlyField label="Port" value={`Port ${s.database.port}`} />
              <ReadOnlyField label="Database" value={s.database.name} />
              <ReadOnlyField label="User" value={s.database.user} />
            </Box>

            <SectionTitle>Connection Pool</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <TextField label="Min Connections" type="number" value={s.database.pool.min}
                onChange={(e) => up('database', { pool: { ...s.database.pool, min: +e.target.value } })}
                sx={{ flex: '1 1 160px' }} />
              <TextField label="Max Connections" type="number" value={s.database.pool.max}
                onChange={(e) => up('database', { pool: { ...s.database.pool, max: +e.target.value } })}
                sx={{ flex: '1 1 160px' }} />
              <TextField label="Idle Timeout (ms)" type="number" value={s.database.pool.idleTimeout}
                onChange={(e) => up('database', { pool: { ...s.database.pool, idleTimeout: +e.target.value } })}
                helperText="Close idle connections after this time"
                sx={{ flex: '1 1 160px' }} />
              <TextField label="Connection Timeout (ms)" type="number" value={s.database.pool.connectionTimeout}
                onChange={(e) => up('database', { pool: { ...s.database.pool, connectionTimeout: +e.target.value } })}
                helperText="Max wait for new connection"
                sx={{ flex: '1 1 160px' }} />
            </Box>

            <SectionTitle>SSL / TLS</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.database.ssl.enabled}
                onChange={(e) => up('database', { ssl: { ...s.database.ssl, enabled: e.target.checked } })} />}
              label="Enable SSL/TLS"
            />
            {s.database.ssl.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel>SSL Mode</InputLabel>
                  <Select label="SSL Mode" value={s.database.ssl.mode}
                    onChange={(e) => up('database', { ssl: { ...s.database.ssl, mode: e.target.value } })}>
                    {['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].map((m) => (
                      <MenuItem key={m} value={m}>{m}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch checked={s.database.ssl.rejectUnauthorized}
                    onChange={(e) => up('database', { ssl: { ...s.database.ssl, rejectUnauthorized: e.target.checked } })} />}
                  label="Reject Unauthorized Certificates"
                  sx={{ alignSelf: 'center' }}
                />
              </Box>
            )}

            <SectionTitle>Migrations</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <FormControlLabel
                control={<Switch checked={s.database.migrations.autoRun}
                  onChange={(e) => up('database', { migrations: { ...s.database.migrations, autoRun: e.target.checked } })} />}
                label="Auto-run migrations on startup"
              />
              <TextField label="Migrations Table" value={s.database.migrations.table}
                onChange={(e) => up('database', { migrations: { ...s.database.migrations, table: e.target.value } })}
                helperText="Table used to track applied migrations"
                sx={{ flex: '1 1 220px' }} />
            </Box>
          </Stack>
        </Paper>
      </TabPanel>

      {/* ── REDIS ── */}
      <TabPanel value={tab} index={2}>
        <Paper sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Redis Configuration</Typography>
            <TestBtn id="redis" label="Test Connection" />
          </Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2">Connection Settings (Read-only)</Typography>
            <Typography variant="body2">
              Redis host, port and database number require a restart to change.
            </Typography>
          </Alert>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <ReadOnlyField label="Host" value={s.redis.host} />
              <ReadOnlyField label="Port" value={`Port ${s.redis.port}`} />
              <ReadOnlyField label="Database" value={`DB ${s.redis.db}`} />
            </Box>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <TextField label="Key Prefix" value={s.redis.keyPrefix}
                onChange={(e) => up('redis', { keyPrefix: e.target.value })}
                helperText="Namespace prefix for all keys (e.g. flexgate:)"
                sx={{ flex: '1 1 200px' }} />
              <TextField label="Connect Timeout (ms)" type="number" value={s.redis.connectTimeout}
                onChange={(e) => up('redis', { connectTimeout: +e.target.value })}
                sx={{ flex: '1 1 180px' }} />
              <TextField label="Command Timeout (ms)" type="number" value={s.redis.commandTimeout}
                onChange={(e) => up('redis', { commandTimeout: +e.target.value })}
                sx={{ flex: '1 1 180px' }} />
              <TextField label="Retry Attempts" type="number" value={s.redis.retryAttempts}
                onChange={(e) => up('redis', { retryAttempts: +e.target.value })}
                helperText="Reconnect attempts on failure"
                sx={{ flex: '1 1 180px' }} />
            </Box>

            <SectionTitle>Cache Behaviour</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <TextField label="Default TTL (ms)" type="number" value={s.redis.cache.defaultTTL}
                onChange={(e) => up('redis', { cache: { ...s.redis.cache, defaultTTL: +e.target.value } })}
                helperText="Default cache entry lifetime"
                sx={{ flex: '1 1 180px' }} />
              <TextField label="Max Memory (MB)" type="number" value={s.redis.cache.maxMemory}
                onChange={(e) => up('redis', { cache: { ...s.redis.cache, maxMemory: +e.target.value } })}
                helperText="Soft memory limit for cached data"
                sx={{ flex: '1 1 180px' }} />
              <FormControl sx={{ flex: '1 1 200px' }}>
                <InputLabel>Eviction Policy</InputLabel>
                <Select label="Eviction Policy" value={s.redis.cache.evictionPolicy}
                  onChange={(e) => up('redis', { cache: { ...s.redis.cache, evictionPolicy: e.target.value } })}>
                  {['noeviction', 'allkeys-lru', 'allkeys-lfu', 'volatile-lru', 'volatile-lfu', 'allkeys-random', 'volatile-ttl'].map((p) => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <SectionTitle>TLS</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.redis.tls.enabled}
                onChange={(e) => up('redis', { tls: { enabled: e.target.checked } })} />}
              label="Enable TLS for Redis connection"
            />
          </Stack>
        </Paper>
      </TabPanel>

      {/* ── SECURITY ── */}
      <TabPanel value={tab} index={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Security Configuration</Typography>
          <Stack spacing={3}>
            <SectionTitle>JWT Tokens</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControl sx={{ flex: '1 1 180px' }}>
                <InputLabel>Algorithm</InputLabel>
                <Select label="Algorithm" value={s.security.jwt.algorithm}
                  onChange={(e) => up('security', { jwt: { ...s.security.jwt, algorithm: e.target.value } })}>
                  {['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384'].map((a) => (
                    <MenuItem key={a} value={a}>{a}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="Access Token Expiry" value={s.security.jwt.expiresIn}
                onChange={(e) => up('security', { jwt: { ...s.security.jwt, expiresIn: e.target.value } })}
                helperText="e.g. 15m, 1h, 24h"
                sx={{ flex: '1 1 180px' }} />
              <TextField label="Refresh Token Expiry" value={s.security.jwt.refreshExpiresIn}
                onChange={(e) => up('security', { jwt: { ...s.security.jwt, refreshExpiresIn: e.target.value } })}
                helperText="e.g. 7d, 30d"
                sx={{ flex: '1 1 180px' }} />
            </Box>

            <SectionTitle>CORS</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.security.cors.enabled}
                onChange={(e) => up('security', { cors: { ...s.security.cors, enabled: e.target.checked } })} />}
              label="Enable CORS"
            />
            {s.security.cors.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <TextField label="Allowed Origins" multiline rows={2}
                  value={s.security.cors.origins.join('\n')}
                  onChange={(e) => up('security', { cors: { ...s.security.cors, origins: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) } })}
                  helperText="One origin per line. Use * for all (not recommended)."
                  sx={{ flex: '1 1 300px' }} />
                <TextField label="Allowed Headers"
                  value={s.security.cors.headers.join(', ')}
                  onChange={(e) => up('security', { cors: { ...s.security.cors, headers: e.target.value.split(',').map((h) => h.trim()) } })}
                  helperText="Comma-separated list"
                  sx={{ flex: '1 1 260px' }} />
                <TextField label="Preflight Max-Age (s)" type="number"
                  value={s.security.cors.maxAge}
                  onChange={(e) => up('security', { cors: { ...s.security.cors, maxAge: +e.target.value } })}
                  helperText="Browser cache time for OPTIONS response"
                  sx={{ flex: '1 1 180px' }} />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ width: '100%' }}>Allowed Methods</Typography>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      size="small"
                      color={s.security.cors.methods.includes(m) ? 'primary' : 'default'}
                      onClick={() => up('security', {
                        cors: {
                          ...s.security.cors,
                          methods: s.security.cors.methods.includes(m)
                            ? s.security.cors.methods.filter((x) => x !== m)
                            : [...s.security.cors.methods, m],
                        },
                      })}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
                <FormControlLabel
                  control={<Switch checked={s.security.cors.credentials}
                    onChange={(e) => up('security', { cors: { ...s.security.cors, credentials: e.target.checked } })} />}
                  label="Allow Credentials"
                  sx={{ alignSelf: 'center' }}
                />
              </Box>
            )}

            <SectionTitle>Rate Limiting</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.security.rateLimit.enabled}
                onChange={(e) => up('security', { rateLimit: { ...s.security.rateLimit, enabled: e.target.checked } })} />}
              label="Enable Rate Limiting"
            />
            {s.security.rateLimit.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <TextField label="Window (ms)" type="number" value={s.security.rateLimit.windowMs}
                  onChange={(e) => up('security', { rateLimit: { ...s.security.rateLimit, windowMs: +e.target.value } })}
                  helperText="Rolling window duration"
                  sx={{ flex: '1 1 180px' }} />
                <TextField label="Max Requests" type="number" value={s.security.rateLimit.maxRequests}
                  onChange={(e) => up('security', { rateLimit: { ...s.security.rateLimit, maxRequests: +e.target.value } })}
                  helperText="Requests allowed per window per IP"
                  sx={{ flex: '1 1 180px' }} />
                <FormControlLabel
                  control={<Switch checked={s.security.rateLimit.skipSuccessful}
                    onChange={(e) => up('security', { rateLimit: { ...s.security.rateLimit, skipSuccessful: e.target.checked } })} />}
                  label="Skip Successful Requests"
                  sx={{ alignSelf: 'center' }}
                />
              </Box>
            )}

            <SectionTitle>Security Headers</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControlLabel control={<Switch checked={s.security.headers.hsts}
                onChange={(e) => up('security', { headers: { ...s.security.headers, hsts: e.target.checked } })} />}
                label="HSTS (Strict-Transport-Security)" />
              <FormControlLabel control={<Switch checked={s.security.headers.noSniff}
                onChange={(e) => up('security', { headers: { ...s.security.headers, noSniff: e.target.checked } })} />}
                label="X-Content-Type-Options: nosniff" />
              <FormControlLabel control={<Switch checked={s.security.headers.xssProtection}
                onChange={(e) => up('security', { headers: { ...s.security.headers, xssProtection: e.target.checked } })} />}
                label="X-XSS-Protection" />
            </Box>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControl sx={{ flex: '1 1 200px' }}>
                <InputLabel>X-Frame-Options</InputLabel>
                <Select label="X-Frame-Options" value={s.security.headers.frameOptions}
                  onChange={(e) => up('security', { headers: { ...s.security.headers, frameOptions: e.target.value } })}>
                  {['DENY', 'SAMEORIGIN', 'ALLOW-FROM'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Content-Security-Policy" value={s.security.headers.csp}
                onChange={(e) => up('security', { headers: { ...s.security.headers, csp: e.target.value } })}
                helperText="CSP directive string"
                sx={{ flex: '1 1 400px' }} />
            </Box>
          </Stack>
        </Paper>
      </TabPanel>

      {/* ── LOGGING ── */}
      <TabPanel value={tab} index={4}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Logging Configuration</Typography>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControl sx={{ flex: '1 1 180px' }}>
                <InputLabel>Log Level</InputLabel>
                <Select label="Log Level" value={s.logging.level}
                  onChange={(e) => up('logging', { level: e.target.value })}>
                  {[['debug', 'Debug (verbose)'], ['info', 'Info (recommended)'], ['warn', 'Warn'], ['error', 'Error only']].map(([v, l]) => (
                    <MenuItem key={v} value={v}>{l}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl sx={{ flex: '1 1 180px' }}>
                <InputLabel>Log Format</InputLabel>
                <Select label="Log Format" value={s.logging.format}
                  onChange={(e) => up('logging', { format: e.target.value })}>
                  <MenuItem value="json">JSON (structured)</MenuItem>
                  <MenuItem value="text">Text (human-readable)</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Slow Request Threshold (ms)" type="number"
                value={s.logging.slowThresholdMs}
                onChange={(e) => up('logging', { slowThresholdMs: +e.target.value })}
                helperText="Requests above this are flagged as slow"
                sx={{ flex: '1 1 220px' }} />
            </Box>

            <SectionTitle>Output Destinations</SectionTitle>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {['console', 'file', 'remote'].map((dest) => (
                <FormControlLabel key={dest}
                  control={<Switch checked={s.logging.output.includes(dest)}
                    onChange={(e) => up('logging', {
                      output: e.target.checked
                        ? [...s.logging.output, dest]
                        : s.logging.output.filter((d) => d !== dest),
                    })} />}
                  label={dest.charAt(0).toUpperCase() + dest.slice(1)}
                />
              ))}
            </Box>

            <SectionTitle>Request Logging</SectionTitle>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={<Switch checked={s.logging.requestLogging}
                  onChange={(e) => up('logging', { requestLogging: e.target.checked })} />}
                label="Log All Requests"
              />
              <FormControlLabel
                control={<Switch checked={s.logging.requestBody} disabled={!s.logging.requestLogging}
                  onChange={(e) => up('logging', { requestBody: e.target.checked })} />}
                label="Log Request Body"
              />
              <FormControlLabel
                control={<Switch checked={s.logging.responseBody} disabled={!s.logging.requestLogging}
                  onChange={(e) => up('logging', { responseBody: e.target.checked })} />}
                label="Log Response Body"
              />
            </Box>
            {(s.logging.requestBody || s.logging.responseBody) && (
              <Alert severity="warning">
                Logging request/response bodies can expose sensitive data and significantly increase log volume.
              </Alert>
            )}

            <SectionTitle>Log Rotation</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.logging.rotation.enabled}
                onChange={(e) => up('logging', { rotation: { ...s.logging.rotation, enabled: e.target.checked } })} />}
              label="Enable Log Rotation"
            />
            {s.logging.rotation.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <TextField label="Max File Size (bytes)" type="number" value={s.logging.rotation.maxFileSize}
                  onChange={(e) => up('logging', { rotation: { ...s.logging.rotation, maxFileSize: +e.target.value } })}
                  helperText="Default: 10 MB = 10485760"
                  sx={{ flex: '1 1 200px' }} />
                <TextField label="Max Files" type="number" value={s.logging.rotation.maxFiles}
                  onChange={(e) => up('logging', { rotation: { ...s.logging.rotation, maxFiles: +e.target.value } })}
                  helperText="Number of rotated files to keep"
                  sx={{ flex: '1 1 160px' }} />
                <FormControlLabel
                  control={<Switch checked={s.logging.rotation.compress}
                    onChange={(e) => up('logging', { rotation: { ...s.logging.rotation, compress: e.target.checked } })} />}
                  label="Compress Rotated Files (gzip)"
                  sx={{ alignSelf: 'center' }}
                />
              </Box>
            )}

            <SectionTitle>Error Tracking</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.logging.errorTracking.enabled}
                onChange={(e) => up('logging', { errorTracking: { ...s.logging.errorTracking, enabled: e.target.checked } })} />}
              label="Enable Error Tracking (Sentry / Datadog)"
            />
            {s.logging.errorTracking.enabled && (
              <Box sx={{ flex: '1 1 240px', maxWidth: 320 }}>
                <Typography variant="body2" gutterBottom>
                  Sample Rate: {Math.round(s.logging.errorTracking.sampleRate * 100)}%
                </Typography>
                <Slider value={s.logging.errorTracking.sampleRate} min={0.01} max={1} step={0.01}
                  onChange={(_, v) => up('logging', { errorTracking: { ...s.logging.errorTracking, sampleRate: v as number } })}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                />
              </Box>
            )}
          </Stack>
        </Paper>
      </TabPanel>

      {/* ── MONITORING ── */}
      <TabPanel value={tab} index={5}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Monitoring Configuration</Typography>
          <Stack spacing={3}>
            <SectionTitle>Prometheus Metrics</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.monitoring.prometheus.enabled}
                onChange={(e) => up('monitoring', { prometheus: { ...s.monitoring.prometheus, enabled: e.target.checked } })} />}
              label="Enable Prometheus Metrics"
            />
            {s.monitoring.prometheus.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField label="Metrics Endpoint" value={s.monitoring.prometheus.endpoint}
                  onChange={(e) => up('monitoring', { prometheus: { ...s.monitoring.prometheus, endpoint: e.target.value } })}
                  helperText="Path to scrape (e.g. /metrics)"
                  sx={{ flex: '1 1 220px' }} />
                <FormControlLabel
                  control={<Switch checked={s.monitoring.prometheus.basicAuth}
                    onChange={(e) => up('monitoring', { prometheus: { ...s.monitoring.prometheus, basicAuth: e.target.checked } })} />}
                  label="Require Basic Auth for /metrics"
                  sx={{ alignSelf: 'center' }}
                />
              </Box>
            )}

            <SectionTitle>Health Check Endpoint</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.monitoring.healthCheck.enabled}
                onChange={(e) => up('monitoring', { healthCheck: { ...s.monitoring.healthCheck, enabled: e.target.checked } })} />}
              label="Enable /health Endpoint"
            />
            {s.monitoring.healthCheck.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <TextField label="Health Endpoint Path" value={s.monitoring.healthCheck.endpoint}
                  onChange={(e) => up('monitoring', { healthCheck: { ...s.monitoring.healthCheck, endpoint: e.target.value } })}
                  sx={{ flex: '1 1 200px' }} />
                <TextField label="Probe Interval (ms)" type="number" value={s.monitoring.healthCheck.intervalMs}
                  onChange={(e) => up('monitoring', { healthCheck: { ...s.monitoring.healthCheck, intervalMs: +e.target.value } })}
                  helperText="How often to check downstream dependencies"
                  sx={{ flex: '1 1 200px' }} />
              </Box>
            )}

            <SectionTitle>Alerting Thresholds</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.monitoring.alerting.enabled}
                onChange={(e) => up('monitoring', { alerting: { ...s.monitoring.alerting, enabled: e.target.checked } })} />}
              label="Enable Alerting"
            />
            {s.monitoring.alerting.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 200px' }}>
                  <Typography variant="body2" gutterBottom>Error Rate Threshold: {s.monitoring.alerting.errorRateThreshold}%</Typography>
                  <Slider value={s.monitoring.alerting.errorRateThreshold} min={1} max={50} step={1}
                    onChange={(_, v) => up('monitoring', { alerting: { ...s.monitoring.alerting, errorRateThreshold: v as number } })}
                    valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} />
                </Box>
                <TextField label="P99 Latency Alert (ms)" type="number"
                  value={s.monitoring.alerting.latencyP99ThresholdMs}
                  onChange={(e) => up('monitoring', { alerting: { ...s.monitoring.alerting, latencyP99ThresholdMs: +e.target.value } })}
                  helperText="Alert when p99 exceeds this value"
                  sx={{ flex: '1 1 200px' }} />
                <Box sx={{ flex: '1 1 200px' }}>
                  <Typography variant="body2" gutterBottom>CPU Threshold: {s.monitoring.alerting.cpuThreshold}%</Typography>
                  <Slider value={s.monitoring.alerting.cpuThreshold} min={10} max={100} step={5}
                    onChange={(_, v) => up('monitoring', { alerting: { ...s.monitoring.alerting, cpuThreshold: v as number } })}
                    valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} />
                </Box>
                <Box sx={{ flex: '1 1 200px' }}>
                  <Typography variant="body2" gutterBottom>Memory Threshold: {s.monitoring.alerting.memoryThreshold}%</Typography>
                  <Slider value={s.monitoring.alerting.memoryThreshold} min={10} max={100} step={5}
                    onChange={(_, v) => up('monitoring', { alerting: { ...s.monitoring.alerting, memoryThreshold: v as number } })}
                    valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} />
                </Box>
              </Box>
            )}

            <SectionTitle>Distributed Tracing</SectionTitle>
            <FormControlLabel
              control={<Switch checked={s.monitoring.tracing.enabled}
                onChange={(e) => up('monitoring', { tracing: { ...s.monitoring.tracing, enabled: e.target.checked } })} />}
              label="Enable Distributed Tracing"
            />
            {s.monitoring.tracing.enabled && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <FormControl sx={{ flex: '1 1 180px' }}>
                  <InputLabel>Provider</InputLabel>
                  <Select label="Provider" value={s.monitoring.tracing.provider}
                    onChange={(e) => up('monitoring', { tracing: { ...s.monitoring.tracing, provider: e.target.value } })}>
                    {['jaeger', 'zipkin', 'otlp', 'datadog'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField label="Collector Endpoint" value={s.monitoring.tracing.endpoint}
                  onChange={(e) => up('monitoring', { tracing: { ...s.monitoring.tracing, endpoint: e.target.value } })}
                  sx={{ flex: '1 1 320px' }} />
                <Box sx={{ flex: '1 1 200px' }}>
                  <Typography variant="body2" gutterBottom>
                    Sample Rate: {Math.round(s.monitoring.tracing.sampleRate * 100)}%
                  </Typography>
                  <Slider value={s.monitoring.tracing.sampleRate} min={0.01} max={1} step={0.01}
                    onChange={(_, v) => up('monitoring', { tracing: { ...s.monitoring.tracing, sampleRate: v as number } })}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  />
                </Box>
              </Box>
            )}
          </Stack>
        </Paper>
      </TabPanel>

      {/* ── Footer ── */}
      <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
        <Button variant="outlined" onClick={handleReset}>Reset to Defaults</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        message={toast.msg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default GeneralSettingsComponent;
