import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Grid,
  Divider,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Save as SaveIcon, Refresh as RefreshIcon } from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface GeneralSettings {
  server: {
    port: number;
    host: string;
    basePath: string;
    maxConnections: number;
    keepAliveTimeout: number;
    trustProxy: boolean;
    compression: {
      enabled: boolean;
      level: number;
      threshold: number;
    };
  };
  admin: {
    enabled: boolean;
    path: string;
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    theme: 'auto' | 'light' | 'dark';
    autoRefresh: number;
  };
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    ssl: {
      enabled: boolean;
      mode: string;
    };
    pool: {
      min: number;
      max: number;
      idleTimeout: number;
    };
  };
  redis: {
    host: string;
    port: number;
    db: number;
    keyPrefix: string;
    cache: {
      defaultTTL: number;
      maxMemory: number;
    };
  };
  security: {
    jwt: {
      algorithm: string;
      expiresIn: string;
    };
    cors: {
      enabled: boolean;
      origins: string[];
      methods: string[];
      credentials: boolean;
    };
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    maxFileSize: number;
    maxFiles: number;
  };
  monitoring: {
    prometheus: {
      enabled: boolean;
      endpoint: string;
    };
    tracing: {
      enabled: boolean;
      sampleRate: number;
    };
  };
}

const GeneralSettingsComponent: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const [settings, setSettings] = useState<GeneralSettings>({
    server: {
      port: 3000,
      host: '0.0.0.0',
      basePath: '/',
      maxConnections: 10000,
      keepAliveTimeout: 60000,
      trustProxy: true,
      compression: {
        enabled: true,
        level: 6,
        threshold: 1024,
      },
    },
    admin: {
      enabled: true,
      path: '/admin',
      sessionTimeout: 3600000,
      maxLoginAttempts: 5,
      lockoutDuration: 900000,
      theme: 'auto',
      autoRefresh: 30000,
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'flexgate',
      user: 'flexgate',
      ssl: {
        enabled: false,
        mode: 'prefer',
      },
      pool: {
        min: 2,
        max: 10,
        idleTimeout: 30000,
      },
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
      keyPrefix: 'flexgate:',
      cache: {
        defaultTTL: 300000,
        maxMemory: 1024,
      },
    },
    security: {
      jwt: {
        algorithm: 'HS256',
        expiresIn: '24h',
      },
      cors: {
        enabled: true,
        origins: ['http://localhost:3000'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
      },
    },
    logging: {
      level: 'info',
      format: 'json',
      maxFileSize: 10485760,
      maxFiles: 10,
    },
    monitoring: {
      prometheus: {
        enabled: true,
        endpoint: '/metrics',
      },
      tracing: {
        enabled: false,
        sampleRate: 0.1,
      },
    },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      // TODO: Fetch settings from API
      // const response = await fetch('/api/settings');
      // const data = await response.json();
      // setSettings(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load settings');
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // TODO: Save settings to API
      // await fetch('/api/settings', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(settings),
      // });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setSaving(false);
    } catch (err) {
      setError('Failed to save settings');
      setSaving(false);
    }
  };

  const testConnection = async (type: 'database' | 'redis') => {
    try {
      setTestingConnection(type);
      // TODO: Test connection
      // await fetch(`/api/settings/test/${type}`);
      setTimeout(() => setTestingConnection(null), 2000);
    } catch (err) {
      setError(`Failed to connect to ${type}`);
      setTestingConnection(null);
    }
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
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          Settings saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Server" />
          <Tab label="Database" />
          <Tab label="Redis" />
          <Tab label="Security" />
          <Tab label="Logging" />
          <Tab label="Monitoring" />
        </Tabs>
      </Paper>

      {/* Server Settings */}
      <TabPanel value={tabValue} index={0}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Server Configuration
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={settings.server.port}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    server: { ...settings.server, port: parseInt(e.target.value) },
                  })
                }
                helperText="Port number for FlexGate to listen on"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Host"
                value={settings.server.host}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    server: { ...settings.server, host: e.target.value },
                  })
                }
                helperText="Network interface to bind to (0.0.0.0 for all)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Base Path"
                value={settings.server.basePath}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    server: { ...settings.server, basePath: e.target.value },
                  })
                }
                helperText="Base URL path for the gateway"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max Connections"
                type="number"
                value={settings.server.maxConnections}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    server: { ...settings.server, maxConnections: parseInt(e.target.value) },
                  })
                }
                helperText="Maximum concurrent connections"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.server.trustProxy}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        server: { ...settings.server, trustProxy: e.target.checked },
                      })
                    }
                  />
                }
                label="Trust Proxy Headers"
              />
              <Typography variant="caption" display="block" color="text.secondary">
                Enable when behind a load balancer or reverse proxy
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Compression
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.server.compression.enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        server: {
                          ...settings.server,
                          compression: {
                            ...settings.server.compression,
                            enabled: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                }
                label="Enable Compression"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Compression Level"
                type="number"
                value={settings.server.compression.level}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    server: {
                      ...settings.server,
                      compression: {
                        ...settings.server.compression,
                        level: parseInt(e.target.value),
                      },
                    },
                  })
                }
                inputProps={{ min: 1, max: 9 }}
                helperText="1 (fast) to 9 (best compression)"
                disabled={!settings.server.compression.enabled}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Admin UI
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Admin UI Path"
                value={settings.admin.path}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    admin: { ...settings.admin, path: e.target.value },
                  })
                }
                helperText="URL path for Admin UI (e.g., /admin)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Session Timeout (ms)"
                type="number"
                value={settings.admin.sessionTimeout}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    admin: { ...settings.admin, sessionTimeout: parseInt(e.target.value) },
                  })
                }
                helperText="Session duration in milliseconds"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max Login Attempts"
                type="number"
                value={settings.admin.maxLoginAttempts}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    admin: { ...settings.admin, maxLoginAttempts: parseInt(e.target.value) },
                  })
                }
                helperText="Failed attempts before lockout"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Lockout Duration (ms)"
                type="number"
                value={settings.admin.lockoutDuration}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    admin: { ...settings.admin, lockoutDuration: parseInt(e.target.value) },
                  })
                }
                helperText="Account lockout time in milliseconds"
              />
            </Grid>
          </Grid>
        </Paper>
      </TabPanel>

      {/* Database Settings */}
      <TabPanel value={tabValue} index={1}>
        <Paper sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Database Configuration
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => testConnection('database')}
              disabled={testingConnection === 'database'}
              startIcon={testingConnection === 'database' ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              Test Connection
            </Button>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Host"
                value={settings.database.host}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: { ...settings.database, host: e.target.value },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={settings.database.port}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: { ...settings.database, port: parseInt(e.target.value) },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Database Name"
                value={settings.database.database}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: { ...settings.database, database: e.target.value },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="User"
                value={settings.database.user}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: { ...settings.database, user: e.target.value },
                  })
                }
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Connection Pool
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Min Connections"
                type="number"
                value={settings.database.pool.min}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: {
                      ...settings.database,
                      pool: { ...settings.database.pool, min: parseInt(e.target.value) },
                    },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Max Connections"
                type="number"
                value={settings.database.pool.max}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: {
                      ...settings.database,
                      pool: { ...settings.database.pool, max: parseInt(e.target.value) },
                    },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Idle Timeout (ms)"
                type="number"
                value={settings.database.pool.idleTimeout}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    database: {
                      ...settings.database,
                      pool: { ...settings.database.pool, idleTimeout: parseInt(e.target.value) },
                    },
                  })
                }
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.database.ssl.enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        database: {
                          ...settings.database,
                          ssl: { ...settings.database.ssl, enabled: e.target.checked },
                        },
                      })
                    }
                  />
                }
                label="Enable SSL/TLS"
              />
            </Grid>
          </Grid>
        </Paper>
      </TabPanel>

      {/* Redis Settings */}
      <TabPanel value={tabValue} index={2}>
        <Paper sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Redis Configuration
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => testConnection('redis')}
              disabled={testingConnection === 'redis'}
              startIcon={testingConnection === 'redis' ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              Test Connection
            </Button>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Host"
                value={settings.redis.host}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    redis: { ...settings.redis, host: e.target.value },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={settings.redis.port}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    redis: { ...settings.redis, port: parseInt(e.target.value) },
                  })
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Database Number"
                type="number"
                value={settings.redis.db}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    redis: { ...settings.redis, db: parseInt(e.target.value) },
                  })
                }
                helperText="Redis database number (0-15)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Key Prefix"
                value={settings.redis.keyPrefix}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    redis: { ...settings.redis, keyPrefix: e.target.value },
                  })
                }
                helperText="Prefix for all Redis keys"
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Cache Settings
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Default TTL (ms)"
                type="number"
                value={settings.redis.cache.defaultTTL}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    redis: {
                      ...settings.redis,
                      cache: { ...settings.redis.cache, defaultTTL: parseInt(e.target.value) },
                    },
                  })
                }
                helperText="Default cache lifetime in milliseconds"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max Memory (MB)"
                type="number"
                value={settings.redis.cache.maxMemory}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    redis: {
                      ...settings.redis,
                      cache: { ...settings.redis.cache, maxMemory: parseInt(e.target.value) },
                    },
                  })
                }
                helperText="Maximum cache memory"
              />
            </Grid>
          </Grid>
        </Paper>
      </TabPanel>

      {/* Security Settings */}
      <TabPanel value={tabValue} index={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Security Configuration
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                JWT Settings
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Algorithm"
                value={settings.security.jwt.algorithm}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    security: {
                      ...settings.security,
                      jwt: { ...settings.security.jwt, algorithm: e.target.value },
                    },
                  })
                }
                select
                SelectProps={{ native: true }}
              >
                <option value="HS256">HS256</option>
                <option value="HS384">HS384</option>
                <option value="HS512">HS512</option>
                <option value="RS256">RS256</option>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Token Expiration"
                value={settings.security.jwt.expiresIn}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    security: {
                      ...settings.security,
                      jwt: { ...settings.security.jwt, expiresIn: e.target.value },
                    },
                  })
                }
                helperText="e.g., 24h, 7d, 30d"
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                CORS Settings
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.security.cors.enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        security: {
                          ...settings.security,
                          cors: { ...settings.security.cors, enabled: e.target.checked },
                        },
                      })
                    }
                  />
                }
                label="Enable CORS"
              />
            </Grid>

            {settings.security.cors.enabled && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Allowed Origins"
                    value={settings.security.cors.origins.join(', ')}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        security: {
                          ...settings.security,
                          cors: {
                            ...settings.security.cors,
                            origins: e.target.value.split(',').map((s) => s.trim()),
                          },
                        },
                      })
                    }
                    helperText="Comma-separated list of allowed origins"
                    multiline
                    rows={2}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Allowed Methods
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap">
                      {settings.security.cors.methods.map((method) => (
                        <Chip key={method} label={method} size="small" />
                      ))}
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.security.cors.credentials}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            security: {
                              ...settings.security,
                              cors: { ...settings.security.cors, credentials: e.target.checked },
                            },
                          })
                        }
                      />
                    }
                    label="Allow Credentials"
                  />
                </Grid>
              </>
            )}
          </Grid>
        </Paper>
      </TabPanel>

      {/* Logging Settings */}
      <TabPanel value={tabValue} index={4}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Logging Configuration
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Log Level"
                value={settings.logging.level}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    logging: { ...settings.logging, level: e.target.value as any },
                  })
                }
                select
                SelectProps={{ native: true }}
              >
                <option value="debug">Debug (Verbose)</option>
                <option value="info">Info (Recommended)</option>
                <option value="warn">Warn (Warnings only)</option>
                <option value="error">Error (Errors only)</option>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Log Format"
                value={settings.logging.format}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    logging: { ...settings.logging, format: e.target.value as any },
                  })
                }
                select
                SelectProps={{ native: true }}
              >
                <option value="json">JSON</option>
                <option value="text">Text</option>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max File Size (bytes)"
                type="number"
                value={settings.logging.maxFileSize}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    logging: { ...settings.logging, maxFileSize: parseInt(e.target.value) },
                  })
                }
                helperText="Log rotation size (default: 10MB)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max Files"
                type="number"
                value={settings.logging.maxFiles}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    logging: { ...settings.logging, maxFiles: parseInt(e.target.value) },
                  })
                }
                helperText="Number of log files to retain"
              />
            </Grid>
          </Grid>
        </Paper>
      </TabPanel>

      {/* Monitoring Settings */}
      <TabPanel value={tabValue} index={5}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Monitoring Configuration
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Prometheus
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.monitoring.prometheus.enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        monitoring: {
                          ...settings.monitoring,
                          prometheus: {
                            ...settings.monitoring.prometheus,
                            enabled: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                }
                label="Enable Prometheus Metrics"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Metrics Endpoint"
                value={settings.monitoring.prometheus.endpoint}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    monitoring: {
                      ...settings.monitoring,
                      prometheus: {
                        ...settings.monitoring.prometheus,
                        endpoint: e.target.value,
                      },
                    },
                  })
                }
                disabled={!settings.monitoring.prometheus.enabled}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Distributed Tracing
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.monitoring.tracing.enabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        monitoring: {
                          ...settings.monitoring,
                          tracing: {
                            ...settings.monitoring.tracing,
                            enabled: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                }
                label="Enable Tracing"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Sample Rate"
                type="number"
                value={settings.monitoring.tracing.sampleRate}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    monitoring: {
                      ...settings.monitoring,
                      tracing: {
                        ...settings.monitoring.tracing,
                        sampleRate: parseFloat(e.target.value),
                      },
                    },
                  })
                }
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                helperText="0.1 = 10% of requests"
                disabled={!settings.monitoring.tracing.enabled}
              />
            </Grid>
          </Grid>
        </Paper>
      </TabPanel>

      {/* Save Button */}
      <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
        <Button variant="outlined" onClick={loadSettings}>
          Reset
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>
    </Box>
  );
};

export default GeneralSettingsComponent;
