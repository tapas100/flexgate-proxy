import React, { useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
} from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Error,
  WifiOff,
} from '@mui/icons-material';
import { useJetStream } from '../hooks/useJetStream';

interface StatsCard {
  title: string;
  value: string | number;
  icon: React.ReactElement;
  color: string;
}

const Dashboard: React.FC = () => {
  const { data: metricsData, connected, error } = useJetStream({
    url: '/api/stream/metrics',
    reconnectInterval: 5000,
    onError: (err) => console.error('Stream error:', err),
    onConnect: () => console.log('Dashboard stream connected'),
    onDisconnect: () => console.log('Dashboard stream disconnected'),
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

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Quick Start</Typography>
        <Typography variant="body2" color="text.secondary">
          • Configure your first route in the Routes section<br />
          • Monitor real-time metrics in the Metrics dashboard<br />
          • View system logs in the Logs section<br />
          • Adjust settings in the Settings page
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;
