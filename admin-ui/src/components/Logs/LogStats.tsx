// @ts-nocheck
import React from 'react';
import { Paper, Box, Typography, Chip, Grid } from '@mui/material';
import { LogStats } from '../../types';
import { formatLatency } from '../../utils/logHelpers';

interface LogStatsProps {
  stats: LogStats;
}

const LogStatsComponent: React.FC<LogStatsProps> = ({ stats }) => {
  return (
    <Paper sx={{ p: 2, mb: 2 }} elevation={1}>
      <Grid container spacing={3} alignItems="center">
        {/* Total Logs */}
        <Grid item>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Total Logs
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {(stats?.total || 0).toLocaleString()}
            </Typography>
          </Box>
        </Grid>

        {/* By Level */}
        <Grid item>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              By Level
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {stats?.byLevel?.DEBUG > 0 && (
                <Chip label={`DEBUG: ${stats.byLevel.DEBUG}`} size="small" sx={{ bgcolor: '#F5F5F5' }} />
              )}
              {stats?.byLevel?.INFO > 0 && (
                <Chip label={`INFO: ${stats.byLevel.INFO}`} size="small" sx={{ bgcolor: '#E3F2FD' }} />
              )}
              {stats?.byLevel?.WARN > 0 && (
                <Chip label={`WARN: ${stats.byLevel.WARN}`} size="small" sx={{ bgcolor: '#FFF3E0' }} />
              )}
              {stats?.byLevel?.ERROR > 0 && (
                <Chip label={`ERROR: ${stats.byLevel.ERROR}`} size="small" sx={{ bgcolor: '#FFEBEE' }} />
              )}
              {stats?.byLevel?.FATAL > 0 && (
                <Chip label={`FATAL: ${stats.byLevel.FATAL}`} size="small" sx={{ bgcolor: '#F3E5F5' }} />
              )}
            </Box>
          </Box>
        </Grid>

        {/* Error Rate */}
        <Grid item>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Error Rate
            </Typography>
            <Typography variant="h6" fontWeight={600} color={(stats?.errorRate || 0) > 5 ? 'error' : 'success'}>
              {(stats?.errorRate || 0).toFixed(2)}%
            </Typography>
          </Box>
        </Grid>

        {/* Avg Latency */}
        <Grid item>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Avg Latency
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {formatLatency(stats?.avgLatency || 0)}
            </Typography>
          </Box>
        </Grid>

        {/* By Source */}
        <Grid item sx={{ ml: 'auto' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              By Source
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {stats?.bySource?.proxy > 0 && (
                <Chip label={`proxy: ${stats.bySource.proxy}`} size="small" variant="outlined" />
              )}
              {stats?.bySource?.auth > 0 && (
                <Chip label={`auth: ${stats.bySource.auth}`} size="small" variant="outlined" />
              )}
              {stats?.bySource?.metrics > 0 && (
                <Chip label={`metrics: ${stats.bySource.metrics}`} size="small" variant="outlined" />
              )}
              {stats?.bySource?.admin > 0 && (
                <Chip label={`admin: ${stats.bySource.admin}`} size="small" variant="outlined" />
              )}
              {stats?.bySource?.system > 0 && (
                <Chip label={`system: ${stats.bySource.system}`} size="small" variant="outlined" />
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default LogStatsComponent;
