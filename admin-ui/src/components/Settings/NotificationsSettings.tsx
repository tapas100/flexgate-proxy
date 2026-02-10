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
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  Webhook as WebhookIcon,
  Notifications as NotificationsIcon,
  Send as SendIcon,
} from '@mui/icons-material';

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  enabled: boolean;
}

interface EmailRecipient {
  id: string;
  email: string;
  events: string[];
  enabled: boolean;
}

interface NotificationSettings {
  email: {
    enabled: boolean;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      from: string;
    };
    recipients: EmailRecipient[];
  };
  webhooks: WebhookConfig[];
  events: {
    routeErrors: boolean;
    rateLimitExceeded: boolean;
    circuitBreakerOpen: boolean;
    healthCheckFailure: boolean;
    configChanges: boolean;
    adminLogin: boolean;
    criticalErrors: boolean;
  };
  alertThresholds: {
    errorRate: number;
    responseTime: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

const NotificationsSettingsComponent: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const [newWebhook, setNewWebhook] = useState<Partial<WebhookConfig>>({
    url: '',
    events: [],
    enabled: true,
  });

  const [newEmail, setNewEmail] = useState<Partial<EmailRecipient>>({
    email: '',
    events: [],
    enabled: true,
  });

  const [settings, setSettings] = useState<NotificationSettings>({
    email: {
      enabled: false,
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: true,
        user: '',
        from: 'flexgate@example.com',
      },
      recipients: [],
    },
    webhooks: [],
    events: {
      routeErrors: true,
      rateLimitExceeded: true,
      circuitBreakerOpen: true,
      healthCheckFailure: true,
      configChanges: true,
      adminLogin: false,
      criticalErrors: true,
    },
    alertThresholds: {
      errorRate: 5.0,
      responseTime: 1000,
      cpuUsage: 80,
      memoryUsage: 85,
    },
  });

  const availableEvents = [
    'route.error',
    'route.created',
    'route.updated',
    'route.deleted',
    'ratelimit.exceeded',
    'circuit.open',
    'circuit.halfopen',
    'circuit.closed',
    'health.failure',
    'health.recovery',
    'config.changed',
    'admin.login',
    'admin.logout',
    'error.critical',
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      // TODO: Fetch settings from API
      // const response = await fetch('/api/settings/notifications');
      // const data = await response.json();
      // setSettings(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load notification settings');
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // TODO: Save settings to API
      // await fetch('/api/settings/notifications', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(settings),
      // });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setSaving(false);
    } catch (err) {
      setError('Failed to save notification settings');
      setSaving(false);
    }
  };

  const handleAddWebhook = () => {
    if (!newWebhook.url) {
      setError('Webhook URL is required');
      return;
    }

    const webhook: WebhookConfig = {
      id: Date.now().toString(),
      url: newWebhook.url,
      events: newWebhook.events || [],
      enabled: newWebhook.enabled || true,
      headers: {},
    };

    setSettings({
      ...settings,
      webhooks: [...settings.webhooks, webhook],
    });

    setNewWebhook({ url: '', events: [], enabled: true });
    setWebhookDialogOpen(false);
  };

  const handleDeleteWebhook = (id: string) => {
    setSettings({
      ...settings,
      webhooks: settings.webhooks.filter((w) => w.id !== id),
    });
  };

  const handleAddEmail = () => {
    if (!newEmail.email) {
      setError('Email address is required');
      return;
    }

    const recipient: EmailRecipient = {
      id: Date.now().toString(),
      email: newEmail.email,
      events: newEmail.events || [],
      enabled: newEmail.enabled || true,
    };

    setSettings({
      ...settings,
      email: {
        ...settings.email,
        recipients: [...settings.email.recipients, recipient],
      },
    });

    setNewEmail({ email: '', events: [], enabled: true });
    setEmailDialogOpen(false);
  };

  const handleDeleteEmail = (id: string) => {
    setSettings({
      ...settings,
      email: {
        ...settings.email,
        recipients: settings.email.recipients.filter((r) => r.id !== id),
      },
    });
  };

  const testWebhook = async (webhook: WebhookConfig) => {
    try {
      setTestingWebhook(webhook.id);
      // TODO: Test webhook
      // await fetch('/api/webhooks/test', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ url: webhook.url }),
      // });
      setTimeout(() => setTestingWebhook(null), 2000);
    } catch (err) {
      setError('Failed to test webhook');
      setTestingWebhook(null);
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
          Notification settings saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Email Settings */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <EmailIcon />
          <Typography variant="h6">Email Notifications</Typography>
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={settings.email.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  email: { ...settings.email, enabled: e.target.checked },
                })
              }
            />
          }
          label="Enable Email Notifications"
        />

        {settings.email.enabled && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" gutterBottom>
              SMTP Configuration
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="SMTP Host"
                  value={settings.email.smtp.host}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      email: {
                        ...settings.email,
                        smtp: { ...settings.email.smtp, host: e.target.value },
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="SMTP Port"
                  type="number"
                  value={settings.email.smtp.port}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      email: {
                        ...settings.email,
                        smtp: { ...settings.email.smtp, port: parseInt(e.target.value) },
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="SMTP User"
                  value={settings.email.smtp.user}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      email: {
                        ...settings.email,
                        smtp: { ...settings.email.smtp, user: e.target.value },
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="From Address"
                  value={settings.email.smtp.from}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      email: {
                        ...settings.email,
                        smtp: { ...settings.email.smtp, from: e.target.value },
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.email.smtp.secure}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          email: {
                            ...settings.email,
                            smtp: { ...settings.email.smtp, secure: e.target.checked },
                          },
                        })
                      }
                    />
                  }
                  label="Use TLS/SSL"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1">Email Recipients</Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setEmailDialogOpen(true)}
              >
                Add Recipient
              </Button>
            </Box>

            <List>
              {settings.email.recipients.map((recipient) => (
                <ListItem key={recipient.id} divider>
                  <ListItemText
                    primary={recipient.email}
                    secondary={
                      <Box display="flex" gap={0.5} flexWrap="wrap" mt={1}>
                        {recipient.events.map((event) => (
                          <Chip key={event} label={event} size="small" />
                        ))}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      edge="end"
                      checked={recipient.enabled}
                      onChange={(e) => {
                        const updated = settings.email.recipients.map((r) =>
                          r.id === recipient.id ? { ...r, enabled: e.target.checked } : r
                        );
                        setSettings({
                          ...settings,
                          email: { ...settings.email, recipients: updated },
                        });
                      }}
                    />
                    <IconButton
                      edge="end"
                      onClick={() => handleDeleteEmail(recipient.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Paper>

      {/* Webhook Settings */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <WebhookIcon />
          <Typography variant="h6">Webhooks</Typography>
        </Box>

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="body2" color="text.secondary">
            Configure webhooks to receive real-time notifications
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setWebhookDialogOpen(true)}
          >
            Add Webhook
          </Button>
        </Box>

        <List>
          {settings.webhooks.map((webhook) => (
            <ListItem key={webhook.id} divider>
              <ListItemText
                primary={webhook.url}
                secondary={
                  <Box display="flex" gap={0.5} flexWrap="wrap" mt={1}>
                    {webhook.events.map((event) => (
                      <Chip key={event} label={event} size="small" />
                    ))}
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  onClick={() => testWebhook(webhook)}
                  disabled={testingWebhook === webhook.id}
                >
                  {testingWebhook === webhook.id ? (
                    <CircularProgress size={20} />
                  ) : (
                    <SendIcon />
                  )}
                </IconButton>
                <Switch
                  edge="end"
                  checked={webhook.enabled}
                  onChange={(e) => {
                    const updated = settings.webhooks.map((w) =>
                      w.id === webhook.id ? { ...w, enabled: e.target.checked } : w
                    );
                    setSettings({ ...settings, webhooks: updated });
                  }}
                />
                <IconButton edge="end" onClick={() => handleDeleteWebhook(webhook.id)}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* Event Configuration */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <NotificationsIcon />
          <Typography variant="h6">Event Configuration</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" mb={2}>
          Choose which events trigger notifications
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.routeErrors}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, routeErrors: e.target.checked },
                    })
                  }
                />
              }
              label="Route Errors"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.rateLimitExceeded}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, rateLimitExceeded: e.target.checked },
                    })
                  }
                />
              }
              label="Rate Limit Exceeded"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.circuitBreakerOpen}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, circuitBreakerOpen: e.target.checked },
                    })
                  }
                />
              }
              label="Circuit Breaker Open"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.healthCheckFailure}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, healthCheckFailure: e.target.checked },
                    })
                  }
                />
              }
              label="Health Check Failures"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.configChanges}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, configChanges: e.target.checked },
                    })
                  }
                />
              }
              label="Configuration Changes"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.adminLogin}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, adminLogin: e.target.checked },
                    })
                  }
                />
              }
              label="Admin Login Events"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.events.criticalErrors}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      events: { ...settings.events, criticalErrors: e.target.checked },
                    })
                  }
                />
              }
              label="Critical Errors"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Alert Thresholds */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Alert Thresholds
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Configure thresholds for automatic alerts
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Error Rate (%)"
              type="number"
              value={settings.alertThresholds.errorRate}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  alertThresholds: {
                    ...settings.alertThresholds,
                    errorRate: parseFloat(e.target.value),
                  },
                })
              }
              inputProps={{ min: 0, max: 100, step: 0.1 }}
              helperText="Alert when error rate exceeds this percentage"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Response Time (ms)"
              type="number"
              value={settings.alertThresholds.responseTime}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  alertThresholds: {
                    ...settings.alertThresholds,
                    responseTime: parseInt(e.target.value),
                  },
                })
              }
              helperText="Alert when response time exceeds this value"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="CPU Usage (%)"
              type="number"
              value={settings.alertThresholds.cpuUsage}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  alertThresholds: {
                    ...settings.alertThresholds,
                    cpuUsage: parseInt(e.target.value),
                  },
                })
              }
              inputProps={{ min: 0, max: 100 }}
              helperText="Alert when CPU usage exceeds this percentage"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Memory Usage (%)"
              type="number"
              value={settings.alertThresholds.memoryUsage}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  alertThresholds: {
                    ...settings.alertThresholds,
                    memoryUsage: parseInt(e.target.value),
                  },
                })
              }
              inputProps={{ min: 0, max: 100 }}
              helperText="Alert when memory usage exceeds this percentage"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Save Button */}
      <Box display="flex" justifyContent="flex-end" gap={2}>
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

      {/* Add Webhook Dialog */}
      <Dialog
        open={webhookDialogOpen}
        onClose={() => setWebhookDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Webhook</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Webhook URL"
              value={newWebhook.url}
              onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
              placeholder="https://your-server.com/webhook"
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth>
              <InputLabel>Events</InputLabel>
              <Select
                multiple
                value={newWebhook.events || []}
                onChange={(e) =>
                  setNewWebhook({ ...newWebhook, events: e.target.value as string[] })
                }
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as string[]).map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {availableEvents.map((event) => (
                  <MenuItem key={event} value={event}>
                    {event}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWebhookDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddWebhook} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Email Dialog */}
      <Dialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Email Recipient</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={newEmail.email}
              onChange={(e) => setNewEmail({ ...newEmail, email: e.target.value })}
              placeholder="user@example.com"
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth>
              <InputLabel>Events</InputLabel>
              <Select
                multiple
                value={newEmail.events || []}
                onChange={(e) =>
                  setNewEmail({ ...newEmail, events: e.target.value as string[] })
                }
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as string[]).map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {availableEvents.map((event) => (
                  <MenuItem key={event} value={event}>
                    {event}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddEmail} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NotificationsSettingsComponent;
