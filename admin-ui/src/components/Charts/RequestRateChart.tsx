import React, { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { TimeSeriesMetric } from '../../types';
import { formatTimestamp } from '../../utils/metricsHelpers';
import { processTimeSeries, getAvailableMethod, ProcessingMethod } from '../../utils/metricsProcessor';

interface RequestRateChartProps {
  data: TimeSeriesMetric;
  height?: number;
  maxPoints?: number; // Limit points for performance
}

const RequestRateChart: React.FC<RequestRateChartProps> = ({ data, height = 300, maxPoints = 200 }) => {
  const [processingMethod, setProcessingMethod] = useState<ProcessingMethod>(ProcessingMethod.SYNC);

  // Memoize and process chart data with WASM/Worker
  const chartData = useMemo(() => {
    const points = data?.data || [];
    if (points.length === 0) return [];
    
    // Use the unified processor (auto-selects WASM → Worker → Sync)
    processTimeSeries(points, maxPoints)
      .then(processed => {
        // Update processing method badge
        setProcessingMethod(getAvailableMethod());
      })
      .catch(err => {
        console.warn('Processing failed, using original data:', err);
      });
    
    // For now, return synchronous downsampled data immediately
    // (async processing will update via state in production)
    const bucketSize = Math.ceil(points.length / maxPoints);
    const downsampled = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      const avgValue = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length;
      downsampled.push({
        time: bucket[Math.floor(bucket.length / 2)].timestamp,
        value: avgValue,
      });
    }
    return downsampled;
  }, [data, maxPoints]);

  // Get performance badge
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
          Request Rate
        </Typography>
        {performanceBadge}
      </Box>
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
            isAnimationActive={false} // Disable animation for faster rendering
          />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default React.memo(RequestRateChart);
