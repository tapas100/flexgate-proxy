/**
 * AI Incidents Dashboard
 * 
 * List view of all AI-detected incidents with filtering, search, and quick stats.
 */

// @ts-nocheck - MUI v7 Grid type compatibility
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Button,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  TrendingUp as TrendingUpIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  AccessTime as ClockIcon,
} from '@mui/icons-material';
import incidentService, { AIIncident, IncidentListParams } from '../services/incidentService';

const AIIncidents: React.FC = () => {
  const navigate = useNavigate();
  
  // State
  const [incidents, setIncidents] = useState<AIIncident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [status, setStatus] = useState<string>('');
  const [eventType, setEventType] = useState<string>('');
  const [severity, setSeverity] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    resolved: 0,
    avgResolutionTime: 0,
  });

  // Load incidents
  const loadIncidents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params: IncidentListParams = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      
      if (status) params.status = status;
      if (eventType) params.event_type = eventType;
      if (severity) params.severity = severity;
      
      const result = await incidentService.listIncidents(params);
      
      // Filter by search if provided
      let filteredIncidents = result.incidents;
      if (search) {
        filteredIncidents = filteredIncidents.filter(inc =>
          inc.incident_id.toLowerCase().includes(search.toLowerCase()) ||
          inc.summary.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      setIncidents(filteredIncidents);
      setTotal(result.total);
      
      // Calculate stats
      const openCount = result.incidents.filter(i => i.status === 'open').length;
      const resolvedCount = result.incidents.filter(i => i.status === 'resolved').length;
      const avgTime = result.incidents
        .filter(i => i.resolution_time_seconds)
        .reduce((sum, i) => sum + (i.resolution_time_seconds || 0), 0) / resolvedCount || 0;
      
      setStats({
        total: result.total,
        open: openCount,
        resolved: resolvedCount,
        avgResolutionTime: avgTime,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
      console.error('Error loading incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, status, eventType, severity]);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      if (search !== undefined) {
        loadIncidents();
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Severity color mapping
  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' => {
    const sev = severity?.toLowerCase();
    switch (sev) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'info';
    }
  };

  // Status color mapping
  const getStatusColor = (status: string): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
    const stat = status?.toLowerCase();
    switch (stat) {
      case 'open': return 'error';
      case 'acknowledged': return 'warning';
      case 'investigating': return 'primary';
      case 'resolved': return 'success';
      case 'false_positive': return 'default';
      default: return 'default';
    }
  };

  // Format time
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          AI Incidents
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadIncidents}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUpIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="body2">
                  Total Incidents
                </Typography>
              </Box>
              <Typography variant="h4">{stats.total}</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ErrorIcon color="error" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="body2">
                  Open
                </Typography>
              </Box>
              <Typography variant="h4">{stats.open}</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="body2">
                  Resolved
                </Typography>
              </Box>
              <Typography variant="h4">{stats.resolved}</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ClockIcon color="info" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="body2">
                  Avg Resolution
                </Typography>
              </Box>
              <Typography variant="h4">
                {formatDuration(stats.avgResolutionTime)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Incident ID or summary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={status}
                  label="Status"
                  onChange={(e) => setStatus(e.target.value)}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="OPEN">Open</MenuItem>
                  <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
                  <MenuItem value="INVESTIGATING">Investigating</MenuItem>
                  <MenuItem value="RESOLVED">Resolved</MenuItem>
                  <MenuItem value="FALSE_POSITIVE">False Positive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={6}>
              <FormControl fullWidth size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Event Type</InputLabel>
                <Select
                  value={eventType}
                  label="Event Type"
                  onChange={(e) => setEventType(e.target.value)}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 400,
                      },
                    },
                  }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="CIRCUIT_BREAKER_CANDIDATE">Circuit Breaker Candidate</MenuItem>
                  <MenuItem value="RATE_LIMIT_BREACH">Rate Limit Breach</MenuItem>
                  <MenuItem value="LATENCY_ANOMALY">Latency Anomaly</MenuItem>
                  <MenuItem value="ERROR_RATE_SPIKE">Error Rate Spike</MenuItem>
                  <MenuItem value="ERROR_SPIKE">Error Spike</MenuItem>
                  <MenuItem value="COST_ALERT">Cost Alert</MenuItem>
                  <MenuItem value="RETRY_STORM">Retry Storm</MenuItem>
                  <MenuItem value="UPSTREAM_DEGRADATION">Upstream Degradation</MenuItem>
                  <MenuItem value="SECURITY_ANOMALY">Security Anomaly</MenuItem>
                  <MenuItem value="SECURITY_ALERT">Security Alert</MenuItem>
                  <MenuItem value="CAPACITY_WARNING">Capacity Warning</MenuItem>
                  <MenuItem value="RECOVERY_SIGNAL">Recovery Signal</MenuItem>
                  <MenuItem value="MEMORY_LEAK">Memory Leak</MenuItem>
                  <MenuItem value="CPU_SPIKE">CPU Spike</MenuItem>
                  <MenuItem value="TRAFFIC_SURGE">Traffic Surge</MenuItem>
                  <MenuItem value="DATABASE_SLOW">Database Slow</MenuItem>
                  <MenuItem value="DEPLOYMENT_ISSUE">Deployment Issue</MenuItem>
                  <MenuItem value="CONFIG_DRIFT">Config Drift</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Severity</InputLabel>
                <Select
                  value={severity}
                  label="Severity"
                  onChange={(e) => setSeverity(e.target.value)}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="CRITICAL">Critical</MenuItem>
                  <MenuItem value="WARNING">Warning</MenuItem>
                  <MenuItem value="INFO">Info</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Incidents Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Incident ID</TableCell>
                <TableCell>Event Type</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Summary</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Detected At</TableCell>
                <TableCell>Resolution Time</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : incidents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">
                      No incidents found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                incidents.map((incident) => (
                  <TableRow
                    key={incident.incident_id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/ai-incidents/${incident.incident_id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {incident.incident_id.substring(0, 20)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={incident.event_type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={incident.severity}
                        size="small"
                        color={getSeverityColor(incident.severity)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                        {incident.summary}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={incident.status}
                        size="small"
                        color={getStatusColor(incident.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatTimestamp(incident.detected_at)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {incident.resolution_time_seconds ? (
                        <Typography variant="body2">
                          {formatDuration(incident.resolution_time_seconds)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ai-incidents/${incident.incident_id}`);
                        }}
                      >
                        <ViewIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Card>
    </Box>
  );
};

export default AIIncidents;
