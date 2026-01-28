import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Refresh,
  Pause,
  PlayArrow,
  Download,
  Clear,
} from '@mui/icons-material';
import { DetailedLogEntry, LogFilter, LogStats, LogLevel, LogSource } from '../types';
import { logService } from '../services/logs';
import { getTimeRangeBounds, exportToJSON, exportToCSV, downloadFile } from '../utils/logHelpers';
import LogFilters from '../components/Logs/LogFilters';
import LogStatsComponent from '../components/Logs/LogStats';
import LogTable from '../components/Logs/LogTable';

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<DetailedLogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [filter, setFilter] = useState<LogFilter>({
    levels: [] as LogLevel[],
    sources: [] as LogSource[],
    timeRange: '1h',
    searchQuery: '',
    isRegex: false,
  });

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get time range bounds
      const { start, end } = getTimeRangeBounds(filter.timeRange);

      // Fetch logs
      const response = await logService.fetchLogs(1000, 0, {
        ...filter,
        startTime: start,
        endTime: end,
      });

      if (response.success && response.data) {
        setLogs(response.data.logs);
      } else {
        setError(response.error || 'Failed to fetch logs');
      }

      // Fetch stats
      const statsResponse = await logService.fetchLogStats(filter);
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
    } catch (err) {
      setError('An error occurred while fetching logs');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Initial load and filter changes
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // WebSocket streaming
  useEffect(() => {
    if (streaming) {
      logService.connectWebSocket((newLog) => {
        setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, 1000));
      });
    } else {
      logService.disconnectWebSocket();
    }

    return () => {
      logService.disconnectWebSocket();
    };
  }, [streaming]);

  // Toggle streaming
  const handleToggleStreaming = () => {
    setStreaming(!streaming);
  };

  // Refresh logs
  const handleRefresh = () => {
    fetchLogs();
  };

  // Clear logs
  const handleClear = () => {
    setLogs([]);
    setStats(null);
  };

  // Export logs
  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const content = format === 'json' ? exportToJSON(logs) : exportToCSV(logs);
      const filename = `logs-${Date.now()}.${format}`;
      const mimeType = format === 'json' ? 'application/json' : 'text/csv';
      downloadFile(content, filename, mimeType);
    } catch (err) {
      setError('Failed to export logs');
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" fontWeight={600}>
          Log Viewer
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={streaming ? 'Pause streaming' : 'Start streaming'}>
            <IconButton onClick={handleToggleStreaming} color={streaming ? 'primary' : 'default'}>
              {streaming ? <Pause /> : <PlayArrow />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh logs">
            <IconButton onClick={handleRefresh}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export as JSON">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download />}
              onClick={() => handleExport('json')}
            >
              JSON
            </Button>
          </Tooltip>
          <Tooltip title="Export as CSV">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download />}
              onClick={() => handleExport('csv')}
            >
              CSV
            </Button>
          </Tooltip>
          <Tooltip title="Clear logs">
            <IconButton onClick={handleClear} color="error">
              <Clear />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Filters */}
      <LogFilters filter={filter} onChange={setFilter} />

      {/* Stats */}
      {stats && <LogStatsComponent stats={stats} />}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Streaming Indicator */}
      {streaming && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Live streaming enabled - new logs will appear automatically
        </Alert>
      )}

      {/* Log Table */}
      <LogTable
        logs={logs}
        loading={loading}
        searchQuery={filter.searchQuery}
        isRegex={filter.isRegex}
      />
    </Box>
  );
};

export default Logs;
