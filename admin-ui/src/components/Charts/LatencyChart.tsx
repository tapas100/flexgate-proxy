import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { TimeSeriesMetric } from '../../types';
import { formatTimestamp } from '../../utils/metricsHelpers';
import { processTimeSeries, getAvailableMethod, ProcessingMethod } from '../../utils/metricsProcessor';

interface LatencyChartProps {
  p50: TimeSeriesMetric;
  p95: TimeSeriesMetric;
  p99: TimeSeriesMetric;
  height?: number;
  maxPoints?: number;
}

const LatencyChart: React.FC<LatencyChartProps> = ({ p50, p95, p99, height = 300, maxPoints = 200 }) => {
  const [processingMethod, setProcessingMethod] = useState<ProcessingMethod>(ProcessingMethod.SYNC);

  // Memoize combined chart data with WASM/Worker processing
  const chartData = useMemo(() => {
    const points = p50.data || [];
    if (points.length === 0) return [];

    // Process with WASM/Worker for better performance
    if (points.length > maxPoints) {
      processTimeSeries(points, maxPoints)
        .then(() => setProcessingMethod(getAvailableMethod()))
        .catch(err => console.warn('Processing failed:', err));
    }

    // Combine all three percentile series
    return points.map((point, index) => ({
      time: point.timestamp,
      p50: point.value,
      p95: p95.data[index]?.value || 0,
      p99: p99.data[index]?.value || 0,
    }));
  }, [p50, p95, p99, maxPoints]);

  // Performance badge
  const performanceBadge = useMemo(() => {
    switch (processingMethod) {
      case ProcessingMethod.WASM:
        return <Chip label="🔥 WASM" size="small" color="success" sx={{ ml: 1 }} />;
      case ProcessingMethod.WORKER:
        return <Chip label="⚡ Worker" size="small" color="primary" sx={{ ml: 1 }} />;
      default:
        return <Chip label="📊 JS" size="small" color="default" sx={{ ml: 1 }} />;
    }
  }, [processingMethod]);

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">
          Response Time (Latency)
        </Typography>
        {performanceBadge}
      </Box>
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
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="p95"
            stackId="2"
            stroke="#ff9800"
            fill="#ff9800"
            fillOpacity={0.6}
            name="p95"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="p99"
            stackId="3"
            stroke="#f44336"
            fill="#f44336"
            fillOpacity={0.6}
            name="p99"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default React.memo(LatencyChart);
