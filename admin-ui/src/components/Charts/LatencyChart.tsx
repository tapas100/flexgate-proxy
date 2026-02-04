import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography } from '@mui/material';
import { TimeSeriesMetric } from '../../types';
import { formatTimestamp } from '../../utils/metricsHelpers';

interface LatencyChartProps {
  p50: TimeSeriesMetric;
  p95: TimeSeriesMetric;
  p99: TimeSeriesMetric;
  height?: number;
}

const LatencyChart: React.FC<LatencyChartProps> = ({ p50, p95, p99, height = 300 }) => {
  // Combine all percentiles into one dataset
  const chartData = p50.data.map((point, index) => ({
    time: point.timestamp,
    p50: point.value,
    p95: p95.data[index]?.value || 0,
    p99: p99.data[index]?.value || 0,
  }));

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Response Time (Latency)
      </Typography>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={(timestamp) => formatTimestamp(timestamp, 'HH:mm')}
            stroke="#666"
          />
          <YAxis
            label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip
            labelFormatter={(timestamp) => formatTimestamp(timestamp as number)}
            formatter={(value: number | undefined) => [`${value?.toFixed(1) || '0'}ms`]}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="p50"
            stackId="1"
            stroke="#4caf50"
            fill="#4caf50"
            fillOpacity={0.6}
            name="p50"
          />
          <Area
            type="monotone"
            dataKey="p95"
            stackId="2"
            stroke="#ff9800"
            fill="#ff9800"
            fillOpacity={0.6}
            name="p95"
          />
          <Area
            type="monotone"
            dataKey="p99"
            stackId="3"
            stroke="#f44336"
            fill="#f44336"
            fillOpacity={0.6}
            name="p99"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default LatencyChart;
