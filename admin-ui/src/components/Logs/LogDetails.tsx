// @ts-nocheck - Grid component type issues with MUI version
import React from 'react';
import { Box, Typography, Paper, Grid, Divider, Chip } from '@mui/material';
import { DetailedLogEntry } from '../../types';
import { formatLogTimestamp, formatLatency, formatBytes, highlightSearchTerm } from '../../utils/logHelpers';

interface LogDetailsProps {
  log: DetailedLogEntry;
  searchQuery?: string;
  isRegex?: boolean;
}

const LogDetails: React.FC<LogDetailsProps> = ({ log, searchQuery = '', isRegex = false }) => {
  const renderSection = (title: string, content: React.ReactNode) => (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" color="primary" gutterBottom>
        {title}
      </Typography>
      {content}
    </Box>
  );

  const renderKeyValue = (key: string, value: any) => (
    <Grid container spacing={1} sx={{ mb: 0.5 }}>
      <Grid item xs={3}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {key}:
        </Typography>
      </Grid>
      <Grid item xs={9}>
        <Typography variant="caption" fontFamily="monospace">
          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
        </Typography>
      </Grid>
    </Grid>
  );

  const highlightedMessage = searchQuery
    ? highlightSearchTerm(log.message, searchQuery, isRegex)
    : log.message;

  return (
    <Paper sx={{ p: 2, my: 1, bgcolor: 'grey.50' }} elevation={0}>
      {/* Basic Information */}
      {renderSection(
        'Basic Information',
        <Box>
          {renderKeyValue('ID', log.id)}
          {renderKeyValue('Timestamp', formatLogTimestamp(log.timestamp, 'yyyy-MM-dd HH:mm:ss.SSS'))}
          {renderKeyValue('Level', log.level)}
          {renderKeyValue('Source', log.source)}
          {log.correlationId && renderKeyValue('Correlation ID', log.correlationId)}
          {log.requestId && renderKeyValue('Request ID', log.requestId)}
          {log.userId && renderKeyValue('User ID', log.userId)}
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Message */}
      {renderSection(
        'Message',
        <Paper sx={{ p: 1, bgcolor: 'white', fontFamily: 'monospace', fontSize: '0.875rem' }}>
          <div dangerouslySetInnerHTML={{ __html: highlightedMessage }} />
        </Paper>
      )}

      {/* Request Details */}
      {log.request && (
        <>
          <Divider sx={{ my: 2 }} />
          {renderSection(
            'Request',
            <Box>
              {renderKeyValue('Method', log.request.method)}
              {renderKeyValue('Path', log.request.path)}
              {log.request.headers && (
                <>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mt: 1, display: 'block' }}>
                    Headers:
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'white', mt: 0.5 }}>
                    <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {JSON.stringify(log.request.headers, null, 2)}
                    </pre>
                  </Paper>
                </>
              )}
              {log.request.query && Object.keys(log.request.query).length > 0 && (
                <>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mt: 1, display: 'block' }}>
                    Query Parameters:
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'white', mt: 0.5 }}>
                    <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {JSON.stringify(log.request.query, null, 2)}
                    </pre>
                  </Paper>
                </>
              )}
            </Box>
          )}
        </>
      )}

      {/* Response Details */}
      {log.response && (
        <>
          <Divider sx={{ my: 2 }} />
          {renderSection(
            'Response',
            <Box>
              <Grid container spacing={2}>
                <Grid item>
                  <Chip
                    label={`Status: ${log.response.statusCode}`}
                    size="small"
                    color={log.response.statusCode >= 400 ? 'error' : 'success'}
                  />
                </Grid>
                <Grid item>
                  <Chip
                    label={`Latency: ${formatLatency(log.response.latency)}`}
                    size="small"
                    variant="outlined"
                  />
                </Grid>
                {log.response.size && (
                  <Grid item>
                    <Chip
                      label={`Size: ${formatBytes(log.response.size)}`}
                      size="small"
                      variant="outlined"
                    />
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </>
      )}

      {/* Error Details */}
      {log.error && (
        <>
          <Divider sx={{ my: 2 }} />
          {renderSection(
            'Error',
            <Box>
              {log.error.code && renderKeyValue('Code', log.error.code)}
              {log.error.details && (
                <>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mt: 1, display: 'block' }}>
                    Details:
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'white', mt: 0.5 }}>
                    <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {JSON.stringify(log.error.details, null, 2)}
                    </pre>
                  </Paper>
                </>
              )}
              {log.error.stack && (
                <>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mt: 1, display: 'block' }}>
                    Stack Trace:
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: '#f5f5f5', mt: 0.5, maxHeight: 200, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '0.7rem', fontFamily: 'monospace', color: '#d32f2f' }}>
                      {log.error.stack}
                    </pre>
                  </Paper>
                </>
              )}
            </Box>
          )}
        </>
      )}

      {/* Metadata */}
      {log.metadata && Object.keys(log.metadata).length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          {renderSection(
            'Metadata',
            <Paper sx={{ p: 1, bgcolor: 'white' }}>
              <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </Paper>
          )}
        </>
      )}
    </Paper>
  );
};

export default LogDetails;
