// @ts-nocheck - Grid component type issues with MUI version
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Tooltip,
  Grid,
  Collapse,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Send as SendIcon,
  Visibility as VisibilityIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';

// Types
interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  description?: string;
  secret: string;
  retryConfig?: {
    maxRetries: number;
    initialDelay: number;
    backoffMultiplier: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface DeliveryLog {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  responseStatus?: number;
  responseBody?: string;
  attempt: number;
  success: boolean;
  error?: string;
  timestamp: string;
  duration?: number;
}

interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageResponseTime: number;
  lastDelivery?: string;
}

const EVENT_TYPES = [
  'circuit_breaker.opened',
  'circuit_breaker.closed',
  'circuit_breaker.half_open',
  'rate_limit.exceeded',
  'rate_limit.approaching',
  'proxy.request_started',
  'proxy.request_completed',
  'proxy.request_failed',
  'health.check_failed',
  'health.check_recovered',
  'config.updated',
  'config.validation_failed',
];

const Webhooks: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<Record<string, DeliveryLog[]>>({});
  const [stats, setStats] = useState<Record<string, WebhookStats>>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Form state
  const [formData, setFormData] = useState({
    url: '',
    events: [] as string[],
    enabled: true,
    description: '',
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
  });

  // Load webhooks
  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/webhooks');
      if (!response.ok) throw new Error('Failed to fetch webhooks');
      const data = await response.json();
      setWebhooks(data.webhooks || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookLogs = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/webhooks/${webhookId}/logs`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      setDeliveryLogs(prev => ({ ...prev, [webhookId]: data.logs || [] }));
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  const fetchWebhookStats = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/webhooks/${webhookId}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      if (data.webhook && data.webhook.stats) {
        setStats(prev => ({ ...prev, [webhookId]: data.webhook.stats }));
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleCreate = async () => {
    try {
      const payload = {
        url: formData.url,
        events: formData.events,
        enabled: formData.enabled,
        description: formData.description,
        retryConfig: {
          maxRetries: formData.maxRetries,
          initialDelay: formData.initialDelay,
          backoffMultiplier: formData.backoffMultiplier,
        },
      };

      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to create webhook');
      
      const data = await response.json();
      setSnackbar({ open: true, message: `Webhook created! Secret: ${data.webhook.secret}`, severity: 'success' });
      setOpenDialog(false);
      resetForm();
      fetchWebhooks();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to create webhook', severity: 'error' });
    }
  };

  const handleUpdate = async () => {
    if (!editingWebhook) return;

    try {
      const payload = {
        url: formData.url,
        events: formData.events,
        enabled: formData.enabled,
        description: formData.description,
        retryConfig: {
          maxRetries: formData.maxRetries,
          initialDelay: formData.initialDelay,
          backoffMultiplier: formData.backoffMultiplier,
        },
      };

      const response = await fetch(`/api/webhooks/${editingWebhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to update webhook');
      
      setSnackbar({ open: true, message: 'Webhook updated successfully', severity: 'success' });
      setOpenDialog(false);
      setEditingWebhook(null);
      resetForm();
      fetchWebhooks();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to update webhook', severity: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const response = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete webhook');
      
      setSnackbar({ open: true, message: 'Webhook deleted successfully', severity: 'success' });
      fetchWebhooks();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to delete webhook', severity: 'error' });
    }
  };

  const handleTest = async (id: string) => {
    try {
      const response = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to test webhook');
      
      setSnackbar({ open: true, message: 'Test webhook sent successfully', severity: 'success' });
      setTimeout(() => fetchWebhookLogs(id), 1000); // Refresh logs after a delay
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to test webhook', severity: 'error' });
    }
  };

  const handleEdit = (webhook: WebhookConfig) => {
    setEditingWebhook(webhook);
    setFormData({
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      description: webhook.description || '',
      maxRetries: webhook.retryConfig?.maxRetries || 3,
      initialDelay: webhook.retryConfig?.initialDelay || 1000,
      backoffMultiplier: webhook.retryConfig?.backoffMultiplier || 2,
    });
    setOpenDialog(true);
  };

  const handleOpenDialog = () => {
    resetForm();
    setEditingWebhook(null);
    setOpenDialog(true);
  };

  const resetForm = () => {
    setFormData({
      url: '',
      events: [],
      enabled: true,
      description: '',
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2,
    });
  };

  const toggleLogs = (webhookId: string) => {
    if (expandedLogs === webhookId) {
      setExpandedLogs(null);
    } else {
      setExpandedLogs(webhookId);
      if (!deliveryLogs[webhookId]) {
        fetchWebhookLogs(webhookId);
      }
      if (!stats[webhookId]) {
        fetchWebhookStats(webhookId);
      }
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setSnackbar({ open: true, message: 'Secret copied to clipboard', severity: 'success' });
  };

  const handleEventToggle = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Webhooks</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenDialog}
        >
          Create Webhook
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {webhooks.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center">
              No webhooks configured. Create your first webhook to receive event notifications.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>URL</TableCell>
                <TableCell>Events</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Stats</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {webhooks.map((webhook) => (
                <React.Fragment key={webhook.id}>
                  <TableRow>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {webhook.url}
                      </Typography>
                      {webhook.description && (
                        <Typography variant="caption" color="text.secondary">
                          {webhook.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {webhook.events.slice(0, 2).map(event => (
                          <Chip key={event} label={event} size="small" />
                        ))}
                        {webhook.events.length > 2 && (
                          <Chip label={`+${webhook.events.length - 2}`} size="small" variant="outlined" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={webhook.enabled ? 'Enabled' : 'Disabled'}
                        color={webhook.enabled ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {stats[webhook.id] ? (
                        <Box>
                          <Typography variant="caption" display="block">
                            {stats[webhook.id].successfulDeliveries}/{stats[webhook.id].totalDeliveries} successful
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Avg: {stats[webhook.id].averageResponseTime}ms
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No deliveries yet
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="View Logs">
                        <IconButton onClick={() => toggleLogs(webhook.id)} size="small">
                          {expandedLogs === webhook.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Test Webhook">
                        <IconButton onClick={() => handleTest(webhook.id)} size="small">
                          <SendIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton onClick={() => handleEdit(webhook)} size="small">
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton onClick={() => handleDelete(webhook.id)} size="small" color="error">
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Copy Secret">
                        <IconButton onClick={() => copySecret(webhook.secret)} size="small">
                          <CopyIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0 }}>
                      <Collapse in={expandedLogs === webhook.id} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography variant="h6" gutterBottom>
                            Delivery Logs
                          </Typography>
                          {deliveryLogs[webhook.id] && deliveryLogs[webhook.id].length > 0 ? (
                            <TableContainer>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Timestamp</TableCell>
                                    <TableCell>Event</TableCell>
                                    <TableCell>Attempt</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Response</TableCell>
                                    <TableCell>Duration</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {deliveryLogs[webhook.id].map((log) => (
                                    <TableRow key={log.id}>
                                      <TableCell>
                                        {new Date(log.timestamp).toLocaleString()}
                                      </TableCell>
                                      <TableCell>
                                        <Chip label={log.eventType} size="small" />
                                      </TableCell>
                                      <TableCell>{log.attempt}</TableCell>
                                      <TableCell>
                                        {log.success ? (
                                          <Chip icon={<CheckIcon />} label="Success" color="success" size="small" />
                                        ) : (
                                          <Chip icon={<CloseIcon />} label="Failed" color="error" size="small" />
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {log.responseStatus || 'N/A'}
                                        {log.error && (
                                          <Typography variant="caption" color="error" display="block">
                                            {log.error}
                                          </Typography>
                                        )}
                                      </TableCell>
                                      <TableCell>{log.duration ? `${log.duration}ms` : 'N/A'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No delivery logs yet
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingWebhook ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Webhook URL"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://your-server.com/webhook"
              fullWidth
              required
              helperText="Must be HTTPS in production"
            />

            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <FormControl component="fieldset">
              <Typography variant="subtitle2" gutterBottom>
                Events to Subscribe
              </Typography>
              <FormGroup>
                <Grid container>
                  {EVENT_TYPES.map((event) => (
                    <Grid item xs={12} sm={6} key={event}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={formData.events.includes(event)}
                            onChange={() => handleEventToggle(event)}
                          />
                        }
                        label={event}
                      />
                    </Grid>
                  ))}
                </Grid>
              </FormGroup>
            </FormControl>

            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              }
              label="Enabled"
            />

            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Retry Configuration
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={4}>
                <TextField
                  label="Max Retries"
                  type="number"
                  value={formData.maxRetries}
                  onChange={(e) => setFormData({ ...formData, maxRetries: parseInt(e.target.value) })}
                  fullWidth
                  inputProps={{ min: 0, max: 10 }}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  label="Initial Delay (ms)"
                  type="number"
                  value={formData.initialDelay}
                  onChange={(e) => setFormData({ ...formData, initialDelay: parseInt(e.target.value) })}
                  fullWidth
                  inputProps={{ min: 100, max: 10000 }}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  label="Backoff Multiplier"
                  type="number"
                  value={formData.backoffMultiplier}
                  onChange={(e) => setFormData({ ...formData, backoffMultiplier: parseFloat(e.target.value) })}
                  fullWidth
                  inputProps={{ min: 1, max: 5, step: 0.1 }}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={editingWebhook ? handleUpdate : handleCreate}
            variant="contained"
            disabled={!formData.url || formData.events.length === 0}
          >
            {editingWebhook ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Webhooks;
