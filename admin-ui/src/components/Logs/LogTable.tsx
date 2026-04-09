import React from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { DetailedLogEntry } from '../../types';
import LogRow from './LogRow';

interface LogTableProps {
  logs: DetailedLogEntry[];
  loading: boolean;
  searchQuery?: string;
  isRegex?: boolean;
  height?: number;
}

const LogTable: React.FC<LogTableProps> = ({
  logs,
  loading,
  searchQuery = '',
  isRegex = false,
  height = 600,
}) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <CircularProgress />
      </Box>
    );
  }

  if (logs.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No logs found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Try adjusting your filters or search query
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 120, fontWeight: 600 }}>Timestamp</TableCell>
            <TableCell sx={{ width: 100, fontWeight: 600 }}>Level</TableCell>
            <TableCell sx={{ width: 100, fontWeight: 600 }}>Source</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Message</TableCell>
            <TableCell sx={{ width: 200, fontWeight: 600 }}>Request</TableCell>
            <TableCell sx={{ width: 80, fontWeight: 600 }}>Status</TableCell>
            <TableCell sx={{ width: 120, fontWeight: 600 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <LogRow key={log.id} log={log} searchQuery={searchQuery} isRegex={isRegex} />
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};

export default LogTable;
