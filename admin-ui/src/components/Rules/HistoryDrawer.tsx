import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { rulesService, RuleSetHistoryEntry } from '../../services/rules';

interface Props {
  open: boolean;
  onClose: () => void;
}

const HistoryDrawer: React.FC<Props> = ({ open, onClose }) => {
  const [history, setHistory] = useState<RuleSetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    rulesService.getHistory().then((res) => {
      if (res.success && res.data) {
        setHistory((res.data as any).history ?? []);
      } else {
        setError(res.error ?? 'Failed to load history');
      }
      setLoading(false);
    });
  }, [open]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 380, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">RuleSet Version History</Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {loading && <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>}
        {error && <Alert severity="error">{error}</Alert>}

        {!loading && history.length === 0 && (
          <Typography color="text.secondary" variant="body2">No history yet. History is recorded on each mutation or hot-reload.</Typography>
        )}

        <List dense>
          {[...history].reverse().map((entry, i) => (
            <React.Fragment key={i}>
              <ListItem alignItems="flex-start">
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography variant="body2" fontWeight="bold">v{entry.version}</Typography>
                      <Chip
                        label={entry.reason}
                        size="small"
                        color={entry.reason === 'hot-reload' ? 'info' : 'default'}
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography variant="caption" color="text.secondary">
                        Replaced at: {new Date(entry.replacedAt).toLocaleString()}
                      </Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary">
                        {entry.rules.length} rule{entry.rules.length !== 1 ? 's' : ''} at time of replacement
                      </Typography>
                    </>
                  }
                />
              </ListItem>
              <Divider component="li" />
            </React.Fragment>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default HistoryDrawer;
