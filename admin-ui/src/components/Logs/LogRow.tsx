import React from 'react';
import { TableRow, TableCell, Chip, IconButton, Collapse, Box, Typography } from '@mui/material';
import { ExpandMore, ExpandLess, ContentCopy } from '@mui/icons-material';
import { DetailedLogEntry } from '../../types';
import {
  formatLogTimestamp,
  getLogLevelColor,
  getLogLevelBgColor,
  truncateMessage,
  copyToClipboard,
} from '../../utils/logHelpers';
// @ts-ignore - LogDetails has ts-nocheck due to MUI Grid typing issues
import LogDetails from './LogDetails';

interface LogRowProps {
  log: DetailedLogEntry;
  searchQuery?: string;
  isRegex?: boolean;
}

const LogRow: React.FC<LogRowProps> = ({ log, searchQuery = '', isRegex = false }) => {
  const [expanded, setExpanded] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(JSON.stringify(log, null, 2));
    if (success) {
      // Could show a snackbar notification here
      console.log('Log copied to clipboard');
    }
  };

  return (
    <>
      <TableRow
        hover
        onClick={() => setExpanded(!expanded)}
        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <TableCell sx={{ width: 120 }}>
          <Typography variant="body2" fontFamily="monospace">
            {formatLogTimestamp(log.timestamp)}
          </Typography>
        </TableCell>

        <TableCell sx={{ width: 100 }}>
          <Chip
            label={log.level}
            size="small"
            sx={{
              bgcolor: getLogLevelBgColor(log.level),
              color: getLogLevelColor(log.level),
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
        </TableCell>

        <TableCell sx={{ width: 100 }}>
          <Chip
            label={log.source}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
        </TableCell>

        <TableCell>
          <Typography variant="body2" fontFamily="monospace">
            {truncateMessage(log.message, 80)}
          </Typography>
        </TableCell>

        <TableCell sx={{ width: 200 }}>
          {log.request && (
            <Typography variant="caption" color="text.secondary">
              {log.request.method} {log.request.path}
            </Typography>
          )}
        </TableCell>

        <TableCell sx={{ width: 80 }}>
          {log.response && (
            <Chip
              label={log.response.statusCode}
              size="small"
              sx={{
                bgcolor: log.response.statusCode >= 400 ? 'error.light' : 'success.light',
                color: 'white',
                fontSize: '0.7rem',
              }}
            />
          )}
        </TableCell>

        <TableCell sx={{ width: 120 }}>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopy fontSize="small" />
            </IconButton>
            <IconButton size="small">
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <LogDetails log={log} searchQuery={searchQuery} isRegex={isRegex} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

export default LogRow;
