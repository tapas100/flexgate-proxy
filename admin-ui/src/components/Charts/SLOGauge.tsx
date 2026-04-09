import React, { useMemo, useState } from 'react';
import { Paper, Typography, Box, LinearProgress, Chip } from '@mui/material';
import { SLOMetrics } from '../../types';
import { getSLOStatusColor } from '../../utils/metricsHelpers';
import { getAvailableMethod, ProcessingMethod } from '../../utils/metricsProcessor';

interface SLOGaugeProps {
  slo: SLOMetrics;
}

const SLOGauge: React.FC<SLOGaugeProps> = ({ slo }) => {
  const [processingMethod] = useState<ProcessingMethod>(getAvailableMethod());

  const metrics = useMemo(() => {
    const availabilityPercentage = (slo.availability.current / slo.availability.target) * 100;
    const availabilityColor = getSLOStatusColor(slo.availability.current, slo.availability.target);
    const latencyP95Ok = slo.latency.p95 <= slo.latency.targetP95;
    const latencyP99Ok = slo.latency.p99 <= slo.latency.targetP99;
    
    return {
      availabilityPercentage,
      availabilityColor,
      latencyP95Ok,
      latencyP99Ok,
    };
  }, [slo]);

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
          SLO Compliance
        </Typography>
        {performanceBadge}
      </Box>

      {/* Availability SLO */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Availability
          </Typography>
          <Typography variant="body2" fontWeight="bold" sx={{ color: metrics.availabilityColor }}>
            {slo.availability.current.toFixed(2)}%
          </Typography>
        </Box>
        <Box sx={{ position: 'relative', display: 'inline-flex', width: '100%' }}>
          <Box sx={{ width: '100%' }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, metrics.availabilityPercentage)}
              sx={{
                height: 10,
                borderRadius: 5,
                backgroundColor: '#e0e0e0',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: metrics.availabilityColor,
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
            sx={{ color: metrics.latencyP95Ok ? '#4caf50' : '#f44336' }}
          >
            {slo.latency.p95.toFixed(0)}ms / {slo.latency.targetP95}ms
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption">p99</Typography>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{ color: metrics.latencyP99Ok ? '#4caf50' : '#f44336' }}
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

export default React.memo(SLOGauge);
