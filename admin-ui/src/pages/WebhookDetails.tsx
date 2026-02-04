// @ts-nocheck - Type issues with MUI components
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  ChatBubble as ChatIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';

// Types
interface WebhookConfig {
  id: string;
  name: string;
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
  pendingDeliveries: number;
  averageAttempts?: number;
  lastDelivery?: string;
  byChannel?: { [key: string]: number };
  byEventType?: { [key: string]: number };
}

interface DeliveryChannel {
  id: string;
  name: string;
  type: 'webhook' | 'slack' | 'teams' | 'webex' | 'whatsapp';
  enabled: boolean;
  icon: React.ReactNode;
  color: string;
}

// Helper function to get event type color and icon
const getEventTypeStyle = (eventType: string): { color: string; bgcolor: string; label: string } => {
  // Config validation failed - Purple (check before generic 'failed')
  if (eventType.includes('validation')) {
    return { color: '#7b1fa2', bgcolor: '#f3e5f5', label: eventType };
  }
  // Deleted events - Gray (check before generic 'config')
  if (eventType.includes('deleted')) {
    return { color: '#616161', bgcolor: '#f5f5f5', label: eventType };
  }
  // Failed/Error events - Red
  if (eventType.includes('failed') || eventType.includes('error')) {
    return { color: '#d32f2f', bgcolor: '#ffebee', label: eventType };
  }
  // Completed/Success events - Green
  if (eventType.includes('completed') || eventType.includes('success') || eventType.includes('recovered') || eventType.includes('closed')) {
    return { color: '#2e7d32', bgcolor: '#e8f5e9', label: eventType };
  }
  // Started/Created/Updated events - Blue
  if (eventType.includes('started') || eventType.includes('created') || eventType.includes('updated')) {
    return { color: '#1976d2', bgcolor: '#e3f2fd', label: eventType };
  }
  // Warning events (opened, exceeded, approaching) - Orange
  if (eventType.includes('opened') || eventType.includes('exceeded') || eventType.includes('approaching')) {
    return { color: '#ed6c02', bgcolor: '#fff4e5', label: eventType };
  }
  // Half-open state - Yellow
  if (eventType.includes('half_open') || eventType.includes('half-open')) {
    return { color: '#f57c00', bgcolor: '#fff8e1', label: eventType };
  }
  // Default - Gray
  return { color: '#616161', bgcolor: '#f5f5f5', label: eventType };
};

const WebhookDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [webhook, setWebhook] = useState<WebhookConfig | null>(null);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Delivery Channels
  const deliveryChannels: DeliveryChannel[] = [
    {
      id: 'webhook',
      name: 'Webhook (HTTP)',
      type: 'webhook',
      enabled: true,
      icon: <SendIcon />,
      color: '#2196f3',
    },
    {
      id: 'slack',
      name: 'Slack',
      type: 'slack',
      enabled: false,
      icon: <ChatIcon />,
      color: '#4A154B',
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      type: 'teams',
      enabled: false,
      icon: <SendIcon />,
      color: '#5B5FC7',
    },
    {
      id: 'webex',
      name: 'Webex',
      type: 'webex',
      enabled: false,
      icon: <SendIcon />,
      color: '#00A8E0',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      type: 'whatsapp',
      enabled: false,
      icon: <WhatsAppIcon />,
      color: '#25D366',
    },
  ];

  // Load webhook details
  useEffect(() => {
    if (id) {
      fetchWebhookDetails();
      fetchStats();
      fetchDeliveryLogs();
    }
  }, [id]);

  const fetchWebhookDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/webhooks/${id}`);
      if (!response.ok) throw new Error('Failed to fetch webhook');
      const result = await response.json();
      setWebhook(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhook');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/webhooks/${id}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const result = await response.json();
      setStats(result.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const fetchDeliveryLogs = async () => {
    try {
      const response = await fetch(`/api/webhooks/${id}/logs?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const result = await response.json();
      setDeliveryLogs(result.data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  const handleRefresh = () => {
    fetchWebhookDetails();
    fetchStats();
    fetchDeliveryLogs();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete webhook "${webhook?.name}"?`)) return;

    try {
      const response = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete webhook');
      navigate('/webhooks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const handleTestWebhook = async () => {
    // TODO: Implement test webhook functionality
    alert('Test webhook functionality coming soon!');
  };

  const handleConfigureChannel = (channelType: string) => {
    // TODO: Implement channel configuration
    alert(`Configure ${channelType} integration coming soon!`);
  };

  // Filter logs
  const filteredLogs = deliveryLogs.filter(log => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'success' && !log.success) return false;
      if (statusFilter === 'failed' && log.success) return false;
    }
    if (eventTypeFilter !== 'all' && log.eventType !== eventTypeFilter) return false;
    if (searchQuery && !JSON.stringify(log).toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Pagination
  const paginatedLogs = filteredLogs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // Get unique event types for filter
  const uniqueEventTypes = Array.from(new Set(deliveryLogs.map(log => log.eventType)));

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !webhook) {
    return (
      <Box p={3}>
        <Alert severity="error">{error || 'Webhook not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/webhooks')} sx={{ mt: 2 }}>
          Back to Webhooks
        </Button>
      </Box>
    );
  }

  const successRate = stats?.totalDeliveries
    ? ((stats.successfulDeliveries / stats.totalDeliveries) * 100).toFixed(1)
    : '0';

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate('/webhooks')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">{webhook.name}</Typography>
          <Chip
            label={webhook.enabled ? 'Enabled' : 'Disabled'}
            color={webhook.enabled ? 'success' : 'default'}
            size="small"
          />
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshIcon />} onClick={handleRefresh} variant="outlined">
            Refresh
          </Button>
          <Button startIcon={<SendIcon />} onClick={handleTestWebhook} variant="outlined">
            Test
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => navigate(`/webhooks/${id}/edit`)} variant="outlined">
            Edit
          </Button>
          <Button startIcon={<DeleteIcon />} onClick={handleDelete} variant="outlined" color="error">
            Delete
          </Button>
        </Stack>
      </Box>

      {/* Overview Stats */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Total Deliveries
              </Typography>
              <Typography variant="h4">{stats?.totalDeliveries || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Success Rate
              </Typography>
              <Typography variant="h4" color="success.main">
                {successRate}%
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {stats?.successfulDeliveries || 0} successful
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Failed Deliveries
              </Typography>
              <Typography variant="h4" color="error.main">
                {stats?.failedDeliveries || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Avg Attempts
              </Typography>
              <Typography variant="h4">
                {stats?.averageAttempts ? stats.averageAttempts.toFixed(1) : '0'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Delivery Channels */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Delivery Channels
          </Typography>
          <Typography variant="body2" color="textSecondary" mb={2}>
            Configure multiple delivery channels for this webhook
          </Typography>
          <Grid container spacing={2}>
            {deliveryChannels.map(channel => (
              <Grid item xs={12} sm={6} md={4} key={channel.id}>
                <Paper
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: channel.enabled ? `2px solid ${channel.color}` : '1px solid #e0e0e0',
                  }}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ color: channel.color }}>{channel.icon}</Box>
                    <Box>
                      <Typography variant="body1">{channel.name}</Typography>
                      <Chip
                        label={channel.enabled ? 'Active' : 'Not Configured'}
                        size="small"
                        color={channel.enabled ? 'success' : 'default'}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  </Box>
                  {!channel.enabled && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleConfigureChannel(channel.name)}
                    >
                      Configure
                    </Button>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Webhook Info */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Webhook Configuration
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                URL
              </Typography>
              <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
                {webhook.url}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Description
              </Typography>
              <Typography variant="body1">{webhook.description || 'No description'}</Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Subscribed Events
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {webhook.events.map(event => (
                  <Chip key={event} label={event} size="small" />
                ))}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Event Statistics */}
      {stats?.byEventType && Object.keys(stats.byEventType).length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Deliveries by Event Type
            </Typography>
            <Grid container spacing={2}>
              {Object.entries(stats.byEventType).map(([eventType, count]) => (
                <Grid item xs={12} sm={6} md={4} key={eventType}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">
                      {eventType}
                    </Typography>
                    <Typography variant="h5">{count}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Delivery Logs */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Delivery Logs</Typography>
            <Chip label={`${filteredLogs.length} deliveries`} />
          </Box>

          {/* Filters */}
          <Grid container spacing={2} mb={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="Status">
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Event Type</InputLabel>
                <Select
                  value={eventTypeFilter}
                  onChange={e => setEventTypeFilter(e.target.value)}
                  label="Event Type"
                >
                  <MenuItem value="all">All Events</MenuItem>
                  {uniqueEventTypes.map(eventType => (
                    <MenuItem key={eventType} value={eventType}>
                      {eventType}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Logs Table */}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Event</TableCell>
                  <TableCell>Attempt</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Response</TableCell>
                  <TableCell align="right">Duration</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="textSecondary">No delivery logs found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLogs.map(log => {
                    const eventStyle = getEventTypeStyle(log.eventType);
                    return (
                    <TableRow key={log.id} hover>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(log.timestamp).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={eventStyle.label} 
                          size="small"
                          sx={{
                            color: eventStyle.color,
                            bgcolor: eventStyle.bgcolor,
                            fontWeight: 500,
                            border: `1px solid ${eventStyle.color}40`,
                          }}
                        />
                      </TableCell>
                      <TableCell>{log.attempt}</TableCell>
                      <TableCell>
                        {log.success ? (
                          <Chip icon={<CheckIcon />} label="Delivered" color="success" size="small" />
                        ) : (
                          <Chip icon={<CloseIcon />} label="Failed" color="error" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        {log.responseStatus ? (
                          <Chip label={log.responseStatus} size="small" />
                        ) : (
                          <Typography variant="body2" color="error">
                            {log.error || 'No response'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {log.duration ? `${log.duration}ms` : '-'}
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <TablePagination
            component="div"
            count={filteredLogs.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </CardContent>
      </Card>
    </Box>
  );
};

export default WebhookDetails;
