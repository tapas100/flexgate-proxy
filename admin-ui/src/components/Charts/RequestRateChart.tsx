import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography, Box } from '@mui/material';
import { TimeSeriesMetric } from '../../types';
import { formatTimestamp } from '../../utils/metricsHelpers';

interface RequestRateChartProps {
  data: TimeSeriesMetric;
  height?: number;
}

const RequestRateChart: React.FC<RequestRateChartProps> = ({ data, height = 300 }) => {
  const chartData = data.data.map((point) => ({
    time: point.timestamp,
    value: point.value,
  }));

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Request Rate
      </Typography>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={(timestamp) => formatTimestamp(timestamp, 'HH:mm')}
            stroke="#666"
          />
          <YAxis
            label={{ value: data.unit, angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip
            labelFormatter={(timestamp) => formatTimestamp(timestamp as number)}
            formatter={(value: number | undefined) => [value?.toFixed(1) || '0', 'Requests/sec']}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#1976d2"
            strokeWidth={2}
            dot={false}
            name="Request Rate"
          />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default RequestRateChart;
