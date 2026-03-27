/**
 * RequestRateChart with Web Worker optimization
 * Uses background thread for data processing
 * Falls back to synchronous processing if workers unavailable
 */

import React, { useMemo, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { Speed as SpeedIcon } from '@mui/icons-material';
import { TimeSeriesMetric } from '../../types';
import { formatTimestamp } from '../../utils/metricsHelpers';
import {
  processTimeSeriesWorker,
  processTimeSeriesSync,
  isWorkerSupported,
  TimeSeriesPoint,
} from '../../utils/workerMetricsProcessor';

interface RequestRateChartProps {
  data: TimeSeriesMetric;
  height?: number;
  maxPoints?: number;
}

const RequestRateChartWorker: React.FC<RequestRateChartProps> = ({
  data,
  height = 300,
  maxPoints = 200,
}) => {
  const [chartData, setChartData] = useState<Array<{ time: number; value: number }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState<number>(0);

  const useWorker = isWorkerSupported();

  useEffect(() => {
    const processData = async () => {
      const points = data?.data || [];
      if (points.length === 0) {
        setChartData([]);
        return;
      }

      setIsProcessing(true);
      const startTime = performance.now();

      try {
        let processed: TimeSeriesPoint[];

        if (useWorker && points.length > 100) {
          // Use Web Worker for large datasets
          processed = await processTimeSeriesWorker(points, 60000, maxPoints);
        } else {
          // Use synchronous processing for small datasets
          processed = processTimeSeriesSync(points, 60000, maxPoints);
        }

        const formatted = processed.map((point) => ({
          time: point.timestamp,
          value: point.value,
        }));

        const endTime = performance.now();
        setProcessingTime(endTime - startTime);
        setChartData(formatted);
      } catch (error) {
        console.error('Data processing failed:', error);
        // Fallback to sync processing
        const fallback = processTimeSeriesSync(data.data, 60000, maxPoints);
        setChartData(fallback.map((p) => ({ time: p.timestamp, value: p.value })));
      } finally {
        setIsProcessing(false);
      }
    };

    processData();
  }, [data, maxPoints, useWorker]);

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Request Rate</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {useWorker && (
            <Chip
              label="Worker"
              size="small"
              color="success"
              variant="outlined"
              icon={<SpeedIcon />}
            />
          )}
          {processingTime > 0 && (
            <Chip
              label={`${processingTime.toFixed(1)}ms`}
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      </Box>

      {isProcessing ? (
        <Box
          sx={{
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'text.secondary',
          }}
        >
          <Typography variant="body2">Processing data...</Typography>
        </Box>
      ) : (
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
              formatter={(value: number | undefined) => [
                value?.toFixed(1) || '0',
                'Requests/sec',
              ]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#1976d2"
              strokeWidth={2}
              dot={false}
              name="Request Rate"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
};

export default React.memo(RequestRateChartWorker);
