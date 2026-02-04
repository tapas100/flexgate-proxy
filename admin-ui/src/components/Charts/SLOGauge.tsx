import React from 'react';
import { Paper, Typography, Box, CircularProgress, LinearProgress } from '@mui/material';
import { SLOMetrics } from '../../types';
import { getSLOStatusColor } from '../../utils/metricsHelpers';

interface SLOGaugeProps {
  slo: SLOMetrics;
}

const SLOGauge: React.FC<SLOGaugeProps> = ({ slo }) => {
  const availabilityPercentage = (slo.availability.current / slo.availability.target) * 100;
  const availabilityColor = getSLOStatusColor(slo.availability.current, slo.availability.target);

  const latencyP95Ok = slo.latency.p95 <= slo.latency.targetP95;
  const latencyP99Ok = slo.latency.p99 <= slo.latency.targetP99;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        SLO Compliance
      </Typography>

      {/* Availability SLO */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Availability
          </Typography>
          <Typography variant="body2" fontWeight="bold" sx={{ color: availabilityColor }}>
            {slo.availability.current.toFixed(2)}%
          </Typography>
        </Box>
        <Box sx={{ position: 'relative', display: 'inline-flex', width: '100%' }}>
          <Box sx={{ width: '100%' }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, availabilityPercentage)}
              sx={{
                height: 10,
                borderRadius: 5,
                backgroundColor: '#e0e0e0',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: availabilityColor,
                },
              }}
            />
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Target: {slo.availability.target}% | Budget: {slo.availability.budget.toFixed(2)}%
        </Typography>
      </Box>

      {/* Latency SLO */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Latency
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption">p95</Typography>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{ color: latencyP95Ok ? '#4caf50' : '#f44336' }}
          >
            {slo.latency.p95.toFixed(0)}ms / {slo.latency.targetP95}ms
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption">p99</Typography>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{ color: latencyP99Ok ? '#4caf50' : '#f44336' }}
          >
            {slo.latency.p99.toFixed(0)}ms / {slo.latency.targetP99}ms
          </Typography>
        </Box>
      </Box>

      {/* Error Rate */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Error Rate
          </Typography>
          <Typography
            variant="body2"
            fontWeight="bold"
            sx={{ color: slo.errorRate.current <= slo.errorRate.target ? '#4caf50' : '#f44336' }}
          >
            {slo.errorRate.current.toFixed(2)}%
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Target: ≤ {slo.errorRate.target}%
        </Typography>
      </Box>
    </Paper>
  );
};

export default SLOGauge;
