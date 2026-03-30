import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Alert,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as ReloadIcon,
  PlayArrow as EvaluateIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { rulesService, Rule, RuleSet } from '../../services/rules';
import RuleEditor from './RuleEditor';
import EvaluateDialog from './EvaluateDialog';
import HistoryDrawer from './HistoryDrawer';

function actionChip(rule: Rule) {
  const color: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
    block: 'error',
    throttle: 'warning',
    alert: 'info',
    redirect: 'default',
  };
  return (
    <Chip
      label={rule.action.type}
      size="small"
      color={color[rule.action.type] ?? 'default'}
    />
  );
}

function conditionSummary(rule: Rule): string {
  const c = rule.condition;
  if (c.type === 'threshold') {
    return `${c.metric} ${c.operator} ${c.value}`;
  }
  return c.type;
}

const RuleList: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [evaluateOpen, setEvaluateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rulesRes, ruleSetRes] = await Promise.all([
      rulesService.getRules(),
      rulesService.getRuleSet(),
    ]);
    if (rulesRes.success) setRules(rulesRes.data ?? []);
    else setError(rulesRes.error ?? 'Failed to load rules');
    if (ruleSetRes.success) setRuleSet(ruleSetRes.data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule: Rule) => {
    const res = await rulesService.updateRule(rule.id, { enabled: !rule.enabled });
    if (res.success) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } else {
      setError(res.error ?? 'Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete rule "${id}"?`)) return;
    const res = await rulesService.deleteRule(id);
    if (res.success) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (ruleSet) setRuleSet({ ...ruleSet, version: ruleSet.version + 1 });
    } else {
      setError(res.error ?? 'Delete failed');
    }
  };

  const handleSave = async (
    payload: Omit<Rule, 'version' | 'createdAt' | 'updatedAt'> | Partial<Omit<Rule, 'id' | 'version' | 'createdAt' | 'updatedAt'>>,
    id?: string,
  ) => {
    if (id) {
      const res = await rulesService.updateRule(id, payload as Partial<Omit<Rule, 'id' | 'version' | 'createdAt' | 'updatedAt'>>);
      if (!res.success) throw new Error(res.error ?? 'Update failed');
      await load();
    } else {
      const res = await rulesService.createRule(payload as Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>);
      if (!res.success) throw new Error(res.error ?? 'Create failed');
      await load();
    }
  };

  const handleReload = async () => {
    const res = await rulesService.forceReload();
    if (res.success) {
      setInfo('Hot-reload triggered successfully');
      await load();
    } else {
      setError(res.error ?? 'Reload failed');
    }
    setTimeout(() => setInfo(null), 4000);
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight="bold">Rule Engine</Typography>
          {ruleSet && (
            <Typography variant="caption" color="text.secondary">
              RuleSet: <strong>{ruleSet.name}</strong> · Version <strong>{ruleSet.version}</strong> · {rules.length} rule{rules.length !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="View version history">
            <IconButton onClick={() => setHistoryOpen(true)}><HistoryIcon /></IconButton>
          </Tooltip>
          <Tooltip title="Test evaluation">
            <Button variant="outlined" startIcon={<EvaluateIcon />} onClick={() => setEvaluateOpen(true)} size="small">
              Evaluate
            </Button>
          </Tooltip>
          <Tooltip title="Hot-reload from file (requires rulesFilePath config)">
            <Button variant="outlined" startIcon={<ReloadIcon />} onClick={handleReload} size="small">
              Reload
            </Button>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditingRule(null); setEditorOpen(true); }} size="small">
            Add Rule
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 2 }}>{info}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : rules.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No rules defined yet.</Typography>
          <Button variant="contained" sx={{ mt: 2 }} startIcon={<AddIcon />} onClick={() => { setEditingRule(null); setEditorOpen(true); }}>
            Add your first rule
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Priority</TableCell>
                <TableCell>ID / Name</TableCell>
                <TableCell>Condition</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>v</TableCell>
                <TableCell align="center">Enabled</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...rules].sort((a, b) => a.priority - b.priority).map((rule) => (
                <TableRow key={rule.id} sx={{ opacity: rule.enabled ? 1 : 0.5 }}>
                  <TableCell>
                    <Chip label={rule.priority} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{rule.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{rule.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">{conditionSummary(rule)}</Typography>
                    {rule.condition.type === 'threshold' && (rule.condition.upstream || rule.condition.pathPrefix) && (
                      <Typography variant="caption" color="text.secondary">
                        {rule.condition.upstream && `↳ upstream: ${rule.condition.upstream}`}
                        {rule.condition.pathPrefix && ` path: ${rule.condition.pathPrefix}`}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{actionChip(rule)}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">v{rule.version}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={rule.enabled}
                      onChange={() => handleToggle(rule)}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => { setEditingRule(rule); setEditorOpen(true); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <RuleEditor
        open={editorOpen}
        rule={editingRule}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />

      <EvaluateDialog open={evaluateOpen} onClose={() => setEvaluateOpen(false)} />

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </Box>
  );
};

export default RuleList;
