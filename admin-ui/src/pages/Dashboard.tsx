// @ts-nocheck
import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
  Grid,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Error,
  WifiOff,
  ReportProblem,
  Psychology,
  TrendingDown,
} from '@mui/icons-material';
import { useJetStream } from '../hooks/useJetStream';
import { useNavigate } from 'react-router-dom';
import incidentService from '../services/incidentService';

interface StatsCard {
  title: string;
  value: string | number;
  icon: React.ReactElement;
  color: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  
  // Debug: Track render count
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    console.log(`🔄 Dashboard render #${renderCount.current}`);
  });

  // AI Incidents state
  const [aiStats, setAiStats] = useState({
    totalIncidents: 0,
    openIncidents: 0,
    resolvedToday: 0,
    acceptanceRate: 0,
    loading: true,
  });

  // Fetch AI incidents stats
  useEffect(() => {
    const fetchAiStats = async () => {
      try {
        const summary = await incidentService.getAnalyticsSummary(1); // Last 24 hours
        
        setAiStats({
          totalIncidents: Number(summary.incidents.total_incidents) || 0,
          openIncidents: Number(summary.incidents.open_count) || 0,
          resolvedToday: Number(summary.incidents.resolved_count) || 0,
          acceptanceRate: Number(summary.recommendations.acceptance_rate) || 0,
          loading: false,
        });
      } catch (err) {
        console.error('Failed to fetch AI stats:', err);
        setAiStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchAiStats();
    const interval = setInterval(fetchAiStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Memoize callbacks to prevent recreating them on every render
  const handleError = useCallback((err: Error) => {
    console.error('Stream error:', err);
  }, []);

  const handleConnect = useCallback(() => {
    console.log('Dashboard stream connected');
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('Dashboard stream disconnected');
  }, []);

  const { data: metricsData, connected, error } = useJetStream({
    url: '/api/stream/metrics',
    reconnectInterval: 5000,
    onError: handleError,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
  });

  // Add data-testid for E2E tests to detect when dashboard is ready
  const isReady = connected || metricsData !== null;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const stats: StatsCard[] = useMemo(() => {
    if (!metricsData) {
      return [
        { title: 'Total Requests', value: '...', icon: <TrendingUp />, color: '#1976d2' },
        { title: 'Avg Response Time', value: '...', icon: <Speed />, color: '#2e7d32' },
        { title: 'Success Rate', value: '...', icon: <CheckCircle />, color: '#ed6c02' },
        { title: 'Error Rate', value: '...', icon: <Error />, color: '#d32f2f' },
      ];
    }

    const avgLatency = parseFloat(metricsData.summary?.avgLatency || '0');
    const errorRate = parseFloat(metricsData.summary?.errorRate || '0') / 100;

    return [
      {
        title: 'Total Requests',
        value: formatNumber(metricsData.summary?.totalRequests || 0),
        icon: <TrendingUp />,
        color: '#1976d2',
      },
      {
        title: 'Avg Response Time',
        value: `${Math.round(avgLatency)}ms`,
        icon: <Speed />,
        color: '#2e7d32',
      },
      {
        title: 'Success Rate',
        value: `${((1 - errorRate) * 100).toFixed(1)}%`,
        icon: <CheckCircle />,
        color: '#ed6c02',
      },
      {
        title: 'Error Rate',
        value: `${(errorRate * 100).toFixed(1)}%`,
        icon: <Error />,
        color: '#d32f2f',
      },
    ];
  }, [metricsData]);

  return (
    <Box data-testid="dashboard-page" data-loaded={isReady ? 'true' : 'false'}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Dashboard</Typography>
        <Chip 
          label={connected ? 'Live' : 'Disconnected'}
          color={connected ? 'success' : 'error'}
          size="small"
          variant="outlined"
          icon={connected ? undefined : <WifiOff />}
        />
      </Box>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Welcome to FlexGate Admin Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Connection error. Attempting to reconnect...
        </Alert>
      )}

      {!connected && !metricsData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Connecting to real-time metrics stream...
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 3, mb: 3 }}>
        {stats.map((stat) => (
          <Card key={stat.title} data-testid={`stat-card-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    {stat.title}
                  </Typography>
                  <Typography variant="h4">{stat.value}</Typography>
                </Box>
                <Box sx={{ color: stat.color, display: 'flex', alignItems: 'center', fontSize: 40 }}>
                  {stat.icon}
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* AI Incidents Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">AI Incident Tracking (Last 24h)</Typography>
          <Chip 
            label="View All" 
            size="small" 
            clickable 
            onClick={() => navigate('/ai-incidents')}
            sx={{ cursor: 'pointer' }}
          />
        </Box>
        
        {aiStats.loading ? (
          <LinearProgress />
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/ai-incidents')}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <ReportProblem sx={{ color: '#1976d2', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Total Incidents
                    </Typography>
                  </Box>
                  <Typography variant="h4">{aiStats.totalIncidents}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {aiStats.openIncidents} open
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/ai-incidents?status=RESOLVED')}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <CheckCircle sx={{ color: '#2e7d32', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Resolved Today
                    </Typography>
                  </Box>
                  <Typography variant="h4">{aiStats.resolvedToday}</Typography>
                  <Typography variant="caption" color="success.main">
                    Auto-remediated
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/ai-analytics')}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Psychology sx={{ color: '#9c27b0', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      AI Acceptance Rate
                    </Typography>
                  </Box>
                  <Typography variant="h4">
                    {(aiStats.acceptanceRate * 100).toFixed(0)}%
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={aiStats.acceptanceRate * 100} 
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/ai-incidents?status=OPEN')}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <TrendingDown sx={{ color: '#ed6c02', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Open Incidents
                    </Typography>
                  </Box>
                  <Typography variant="h4">{aiStats.openIncidents}</Typography>
                  <Typography variant="caption" color="warning.main">
                    Requires attention
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Quick Start</Typography>
        <Typography variant="body2" color="text.secondary">
          • Configure your first route in the Routes section<br />
          • Monitor real-time metrics in the Metrics dashboard<br />
          • Track AI incidents and auto-remediation in AI Incidents<br />
          • View system logs in the Logs section<br />
          • Adjust settings in the Settings page
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;
