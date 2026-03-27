import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { getAvailableMethod, ProcessingMethod } from '../../utils/metricsProcessor';

interface StatusPieChartProps {
  statusCodes: {
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };
  height?: number;
}

const COLORS = {
  '2xx': '#4caf50', // Green
  '3xx': '#2196f3', // Blue
  '4xx': '#ff9800', // Orange
  '5xx': '#f44336', // Red
};

const StatusPieChart: React.FC<StatusPieChartProps> = ({ statusCodes, height = 300 }) => {
  const [processingMethod] = useState<ProcessingMethod>(getAvailableMethod());

  const data = useMemo(() => {
    return Object.entries(statusCodes).map(([code, count]) => ({
      name: code,
      value: count,
    }));
  }, [statusCodes]);

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
          Status Code Distribution
        </Typography>
        {performanceBadge}
      </Box>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry) => `${entry.name}: ${((entry.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            isAnimationActive={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number | undefined) => value?.toLocaleString() || '0'} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default React.memo(StatusPieChart);
