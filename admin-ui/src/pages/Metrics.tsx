// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { metricsService } from '../services/metrics';
import { MetricsData, TimeRange, RefreshInterval } from '../types';
import { formatLargeNumber } from '../utils/metricsHelpers';
import RequestRateChart from '../components/Charts/RequestRateChart';
import LatencyChart from '../components/Charts/LatencyChart';
import StatusPieChart from '../components/Charts/StatusPieChart';
import SLOGauge from '../components/Charts/SLOGauge';

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, trend, icon, color }) => {
  const trendColor = trend === 'up' ? '#4caf50' : trend === 'down' ? '#f44336' : '#757575';

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight="bold">
              {value}
            </Typography>
            {change && (
              <Typography variant="caption" sx={{ color: trendColor }}>
                {change}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: `${color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const Metrics: React.FC = () => {
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>('off');

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    const response = await metricsService.fetchMetrics(timeRange);
    if (response.success && response.data) {
      setMetricsData(response.data);
    } else {
      setError(response.error || 'Failed to fetch metrics');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
  }, [timeRange]);

  useEffect(() => {
    if (refreshInterval === 'off') return;

    const intervals: Record<Exclude<RefreshInterval, 'off'>, number> = {
      '30s': 30000,
      '1m': 60000,
      '5m': 300000,
    };

    const intervalId = setInterval(fetchMetrics, intervals[refreshInterval as Exclude<RefreshInterval, 'off'>]);
    return () => clearInterval(intervalId);
  }, [refreshInterval, timeRange]);

  const handleTimeRangeChange = (_event: React.MouseEvent<HTMLElement>, newRange: TimeRange | null) => {
    if (newRange !== null) {
      setTimeRange(newRange);
    }
  };

  const handleRefreshIntervalChange = (_event: React.MouseEvent<HTMLElement>, newInterval: RefreshInterval | null) => {
    if (newInterval !== null) {
      setRefreshInterval(newInterval);
    }
  };

  if (loading && !metricsData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={fetchMetrics}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!metricsData) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">No metrics data available</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header Controls */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" fontWeight="bold">
          Metrics Dashboard
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={handleTimeRangeChange}
            size="small"
          >
            <ToggleButton value="1h">1H</ToggleButton>
            <ToggleButton value="6h">6H</ToggleButton>
            <ToggleButton value="24h">24H</ToggleButton>
            <ToggleButton value="7d">7D</ToggleButton>
            <ToggleButton value="30d">30D</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            value={refreshInterval}
            exclusive
            onChange={handleRefreshIntervalChange}
            size="small"
          >
            <ToggleButton value="30s">30s</ToggleButton>
            <ToggleButton value="1m">1m</ToggleButton>
            <ToggleButton value="5m">5m</ToggleButton>
            <ToggleButton value="off">Off</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchMetrics}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Requests"
            value={formatLargeNumber(metricsData.summary.totalRequests)}
            change="+12.5%"
            trend="up"
            icon={<TrendingUpIcon fontSize="large" />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Latency"
            value={`${metricsData.summary.avgLatency.toFixed(0)}ms`}
            change="-5.2%"
            trend="down"
            icon={<SpeedIcon fontSize="large" />}
            color="#4caf50"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Error Rate"
            value={`${metricsData.summary.errorRate.toFixed(2)}%`}
            change="-0.1%"
            trend="down"
            icon={<ErrorIcon fontSize="large" />}
            color="#ff9800"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Uptime"
            value={`${metricsData.summary.uptime.toFixed(2)}%`}
            change="+0.02%"
            trend="up"
            icon={<CheckCircleIcon fontSize="large" />}
            color="#4caf50"
          />
        </Grid>
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={3}>
        {/* Request Rate */}
        <Grid item xs={12} md={6}>
          <RequestRateChart data={metricsData.requestRate} />
        </Grid>

        {/* SLO Gauge */}
        <Grid item xs={12} md={6}>
          <SLOGauge slo={metricsData.slo} />
        </Grid>

        {/* Latency Chart */}
        <Grid item xs={12}>
          <LatencyChart
            p50={metricsData.latency.p50}
            p95={metricsData.latency.p95}
            p99={metricsData.latency.p99}
          />
        </Grid>

        {/* Status Code Distribution */}
        <Grid item xs={12} md={6}>
          <StatusPieChart statusCodes={metricsData.statusCodes} />
        </Grid>

        {/* Circuit Breakers */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Circuit Breakers
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Closed</Typography>
                <Typography variant="body2" fontWeight="bold" color="success.main">
                  {metricsData.circuitBreakers.closed}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Half-Open</Typography>
                <Typography variant="body2" fontWeight="bold" color="warning.main">
                  {metricsData.circuitBreakers.halfOpen}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Open</Typography>
                <Typography variant="body2" fontWeight="bold" color="error.main">
                  {metricsData.circuitBreakers.open}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Metrics;
