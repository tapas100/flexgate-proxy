import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Typography,
  Alert,
  Divider,
  Box,
} from '@mui/material';
import type {
  Rule,
  MetricKey,
  RuleOperator,
  ThresholdCondition,
  ThrottleAction,
  BlockAction,
  AlertAction,
  RedirectAction,
  RuleAction,
} from '../../services/rules';

const METRIC_KEYS: MetricKey[] = [
  'rps', 'errorRate', 'clientErrorRate',
  'meanLatencyMs', 'p50LatencyMs', 'p95LatencyMs', 'p99LatencyMs', 'maxLatencyMs',
  'requestCount', 'avgRequestBytes', 'avgResponseBytes',
];

const OPERATORS: RuleOperator[] = ['>', '>=', '<', '<=', '==', '!='];

const ACTION_TYPES = ['throttle', 'block', 'alert', 'redirect'] as const;
type ActionType = typeof ACTION_TYPES[number];

interface Props {
  open: boolean;
  rule?: Rule | null;
  onClose: () => void;
  onSave: (rule: Omit<Rule, 'version' | 'createdAt' | 'updatedAt'> | Partial<Omit<Rule, 'id' | 'version' | 'createdAt' | 'updatedAt'>>, id?: string) => Promise<void>;
}

function defaultCondition(): ThresholdCondition {
  return { type: 'threshold', metric: 'rps', operator: '>', value: 1000 };
}

function defaultAction(type: ActionType): RuleAction {
  switch (type) {
    case 'throttle': return { type: 'throttle', rps: 500 };
    case 'block':    return { type: 'block', statusCode: 503, message: 'Service unavailable' };
    case 'alert':    return { type: 'alert', severity: 'warning', message: 'Threshold exceeded' };
    case 'redirect': return { type: 'redirect', upstream: '' };
  }
}

const RuleEditor: React.FC<Props> = ({ open, rule, onClose, onSave }) => {
  const isEdit = !!rule;

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(100);
  const [enabled, setEnabled] = useState(true);
  const [continueOnMatch, setContinueOnMatch] = useState(false);

  // Condition (threshold only for simplicity in UI)
  const [metric, setMetric] = useState<MetricKey>('rps');
  const [operator, setOperator] = useState<RuleOperator>('>');
  const [threshold, setThreshold] = useState(1000);
  const [condUpstream, setCondUpstream] = useState('');
  const [condPath, setCondPath] = useState('');

  // Action
  const [actionType, setActionType] = useState<ActionType>('throttle');
  const [throttleRps, setThrottleRps] = useState(500);
  const [throttleMsg, setThrottleMsg] = useState('');
  const [blockStatus, setBlockStatus] = useState(503);
  const [blockMessage, setBlockMessage] = useState('Service unavailable');
  const [alertSeverity, setAlertSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [alertMessage, setAlertMessage] = useState('Threshold exceeded');
  const [redirectUpstream, setRedirectUpstream] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && rule) {
      setId(rule.id);
      setName(rule.name);
      setPriority(rule.priority);
      setEnabled(rule.enabled);
      setContinueOnMatch(rule.continueOnMatch);

      if (rule.condition.type === 'threshold') {
        setMetric(rule.condition.metric);
        setOperator(rule.condition.operator);
        setThreshold(rule.condition.value);
        setCondUpstream(rule.condition.upstream ?? '');
        setCondPath(rule.condition.pathPrefix ?? '');
      }

      setActionType(rule.action.type as ActionType);
      if (rule.action.type === 'throttle') {
        setThrottleRps((rule.action as ThrottleAction).rps);
        setThrottleMsg((rule.action as ThrottleAction).message ?? '');
      } else if (rule.action.type === 'block') {
        setBlockStatus((rule.action as BlockAction).statusCode);
        setBlockMessage((rule.action as BlockAction).message);
      } else if (rule.action.type === 'alert') {
        setAlertSeverity((rule.action as AlertAction).severity);
        setAlertMessage((rule.action as AlertAction).message);
      } else if (rule.action.type === 'redirect') {
        setRedirectUpstream((rule.action as RedirectAction).upstream);
      }
    } else if (open && !rule) {
      setId('');
      setName('');
      setPriority(100);
      setEnabled(true);
      setContinueOnMatch(false);
      setMetric('rps');
      setOperator('>');
      setThreshold(1000);
      setCondUpstream('');
      setCondPath('');
      setActionType('throttle');
      setThrottleRps(500);
      setThrottleMsg('');
      setBlockStatus(503);
      setBlockMessage('Service unavailable');
      setAlertSeverity('warning');
      setAlertMessage('Threshold exceeded');
      setRedirectUpstream('');
      setError(null);
    }
  }, [open, rule]);

  function buildCondition(): ThresholdCondition {
    let cond: ThresholdCondition = { type: 'threshold', metric, operator, value: threshold };
    if (condUpstream.trim()) cond = { ...cond, upstream: condUpstream.trim() };
    if (condPath.trim()) cond = { ...cond, pathPrefix: condPath.trim() };
    return cond;
  }

  function buildAction(): RuleAction {
    switch (actionType) {
      case 'throttle': {
        const a: ThrottleAction = { type: 'throttle', rps: throttleRps };
        return throttleMsg.trim() ? { ...a, message: throttleMsg.trim() } : a;
      }
      case 'block':
        return { type: 'block', statusCode: blockStatus, message: blockMessage };
      case 'alert':
        return { type: 'alert', severity: alertSeverity, message: alertMessage };
      case 'redirect':
        return { type: 'redirect', upstream: redirectUpstream };
    }
  }

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const condition = buildCondition();
      const action = buildAction();

      if (isEdit && rule) {
        await onSave({ name, priority, enabled, continueOnMatch, condition, action }, rule.id);
      } else {
        await onSave({ id: id.trim(), name, priority, enabled, continueOnMatch, condition, action });
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? `Edit Rule — ${rule?.id}` : 'New Rule'}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Identity row */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {!isEdit && (
              <TextField
                label="ID (unique, snake_case)"
                value={id}
                onChange={(e) => setId(e.target.value)}
                sx={{ flex: '1 1 200px' }}
                required
                size="small"
              />
            )}
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ flex: '2 1 200px' }}
              required
              size="small"
            />
            <TextField
              label="Priority (0–9999)"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              sx={{ flex: '0 1 140px' }}
              size="small"
              inputProps={{ min: 0, max: 9999 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
              label="Enabled"
            />
            <FormControlLabel
              control={<Switch checked={continueOnMatch} onChange={(e) => setContinueOnMatch(e.target.checked)} />}
              label="Continue on match (allow multiple actions)"
            />
          </Box>

          <Divider><Typography variant="caption">Condition (Threshold)</Typography></Divider>

          {/* Condition row */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControl sx={{ flex: '2 1 160px' }} size="small">
              <InputLabel>Metric</InputLabel>
              <Select value={metric} label="Metric" onChange={(e) => setMetric(e.target.value as MetricKey)}>
                {METRIC_KEYS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl sx={{ flex: '0 1 90px' }} size="small">
              <InputLabel>Op</InputLabel>
              <Select value={operator} label="Op" onChange={(e) => setOperator(e.target.value as RuleOperator)}>
                {OPERATORS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Value"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              sx={{ flex: '0 1 100px' }}
              size="small"
            />
            <TextField
              label="Upstream filter (optional)"
              value={condUpstream}
              onChange={(e) => setCondUpstream(e.target.value)}
              sx={{ flex: '1 1 160px' }}
              size="small"
              placeholder="e.g. payments-svc"
            />
            <TextField
              label="Path prefix (optional)"
              value={condPath}
              onChange={(e) => setCondPath(e.target.value)}
              sx={{ flex: '1 1 160px' }}
              size="small"
              placeholder="e.g. /api/payments"
            />
          </Box>

          <Divider><Typography variant="caption">Action</Typography></Divider>

          {/* Action row */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <FormControl sx={{ flex: '0 1 160px' }} size="small">
              <InputLabel>Action type</InputLabel>
              <Select value={actionType} label="Action type" onChange={(e) => setActionType(e.target.value as ActionType)}>
                {ACTION_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>

            {actionType === 'throttle' && (
              <>
                <TextField
                  label="Allowed RPS"
                  type="number"
                  value={throttleRps}
                  onChange={(e) => setThrottleRps(Number(e.target.value))}
                  sx={{ flex: '0 1 120px' }}
                  size="small"
                  inputProps={{ min: 1 }}
                />
                <TextField
                  label="Custom 429 message (optional)"
                  value={throttleMsg}
                  onChange={(e) => setThrottleMsg(e.target.value)}
                  sx={{ flex: '1 1 200px' }}
                  size="small"
                />
              </>
            )}

            {actionType === 'block' && (
              <>
                <TextField
                  label="Status code"
                  type="number"
                  value={blockStatus}
                  onChange={(e) => setBlockStatus(Number(e.target.value))}
                  sx={{ flex: '0 1 110px' }}
                  size="small"
                  inputProps={{ min: 400 }}
                />
                <TextField
                  label="Message"
                  value={blockMessage}
                  onChange={(e) => setBlockMessage(e.target.value)}
                  sx={{ flex: '1 1 200px' }}
                  size="small"
                />
              </>
            )}

            {actionType === 'alert' && (
              <>
                <FormControl sx={{ flex: '0 1 130px' }} size="small">
                  <InputLabel>Severity</InputLabel>
                  <Select value={alertSeverity} label="Severity" onChange={(e) => setAlertSeverity(e.target.value as any)}>
                    {['info', 'warning', 'critical'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Alert message"
                  value={alertMessage}
                  onChange={(e) => setAlertMessage(e.target.value)}
                  sx={{ flex: '1 1 200px' }}
                  size="small"
                />
              </>
            )}

            {actionType === 'redirect' && (
              <TextField
                label="Target upstream name"
                value={redirectUpstream}
                onChange={(e) => setRedirectUpstream(e.target.value)}
                sx={{ flex: '1 1 200px' }}
                size="small"
                required
              />
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RuleEditor;
