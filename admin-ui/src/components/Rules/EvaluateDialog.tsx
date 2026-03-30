import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Box,
  Chip,
} from '@mui/material';
import { rulesService, EvaluationResult, MetricKey } from '../../services/rules';

const METRIC_KEYS: MetricKey[] = [
  'rps', 'errorRate', 'clientErrorRate',
  'meanLatencyMs', 'p50LatencyMs', 'p95LatencyMs', 'p99LatencyMs', 'maxLatencyMs',
  'requestCount', 'avgRequestBytes', 'avgResponseBytes',
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const EvaluateDialog: React.FC<Props> = ({ open, onClose }) => {
  const [metrics, setMetrics] = useState<Partial<Record<MetricKey, string>>>({ rps: '2000' });
  const [upstream, setUpstream] = useState('');
  const [path, setPath] = useState('');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMetricChange = (key: MetricKey, value: string) => {
    setMetrics((prev) => ({ ...prev, [key]: value }));
  };

  const handleEvaluate = async () => {
    setError(null);
    setLoading(true);
    try {
      const numericMetrics: Partial<Record<MetricKey, number>> = {};
      for (const key of METRIC_KEYS) {
        const raw = metrics[key];
        if (raw !== undefined && raw.trim() !== '') {
          numericMetrics[key] = parseFloat(raw);
        }
      }

      const res = await rulesService.evaluate({
        metrics: numericMetrics,
        upstream: upstream.trim() || undefined,
        path: path.trim() || undefined,
      });

      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.error ?? 'Evaluation failed');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Evaluation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Test Rule Evaluation</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Enter metric values to test which rules would fire.
        </Typography>

        {/* Metrics grid — 3 columns using flex wrap */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
          {METRIC_KEYS.map((key) => (
            <Box key={key} sx={{ flexBasis: 'calc(33.3% - 16px)', minWidth: 140, flexGrow: 1 }}>
              <TextField
                label={key}
                value={metrics[key] ?? ''}
                onChange={(e) => handleMetricChange(key, e.target.value)}
                size="small"
                fullWidth
                type="number"
                placeholder="leave empty = 0"
              />
            </Box>
          ))}
          <Box sx={{ flexBasis: 'calc(50% - 8px)', minWidth: 180, flexGrow: 1 }}>
            <TextField
              label="Upstream (optional)"
              value={upstream}
              onChange={(e) => setUpstream(e.target.value)}
              size="small"
              fullWidth
            />
          </Box>
          <Box sx={{ flexBasis: 'calc(50% - 8px)', minWidth: 180, flexGrow: 1 }}>
            <TextField
              label="Path (optional)"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              size="small"
              fullWidth
            />
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {result && (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">Result</Typography>
              <Chip
                label={result.triggered ? 'TRIGGERED' : 'NO MATCH'}
                color={result.triggered ? 'error' : 'success'}
                size="small"
              />
              <Typography variant="caption" color="text.secondary">
                RuleSet v{result.ruleSetVersion}
              </Typography>
            </Box>

            {result.decidingAction && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">Deciding action</Typography>
                <Typography variant="body2" fontFamily="monospace" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(result.decidingAction, null, 2)}
                </Typography>
              </Box>
            )}

            {result.matches.length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom>Matched rules ({result.matches.length})</Typography>
                {result.matches.map((m) => (
                  <Box key={m.ruleId} sx={{ p: 1, mb: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="body2" fontWeight="bold">{m.ruleName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      id: {m.ruleId} · priority: {m.priority} · action: {m.action.type}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button
          variant="contained"
          onClick={handleEvaluate}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? 'Evaluating…' : 'Evaluate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EvaluateDialog;
