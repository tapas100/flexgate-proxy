import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  LinearProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Build as BuildIcon,
  DeleteForever as DeleteForeverIcon,
  Assignment as AssignmentIcon,
  BugReport as BugReportIcon,
} from '@mui/icons-material';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'warning' | 'unknown';
  message: string;
  details?: string;
}

interface ScriptExecution {
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  output: string[];
  exitCode?: number;
}

const Troubleshooting: React.FC = () => {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([
    { name: 'FlexGate API', status: 'unknown', message: 'Not checked yet' },
    { name: 'PostgreSQL', status: 'unknown', message: 'Not checked yet' },
    { name: 'Redis', status: 'unknown', message: 'Not checked yet' },
    { name: 'HAProxy', status: 'unknown', message: 'Not checked yet' },
    { name: 'Prometheus', status: 'unknown', message: 'Not checked yet' },
    { name: 'Grafana', status: 'unknown', message: 'Not checked yet' },
  ]);

  const [systemChecks, setSystemChecks] = useState<HealthCheck[]>([
    { name: 'Node.js Version', status: 'unknown', message: 'Not checked yet' },
    { name: 'npm', status: 'unknown', message: 'Not checked yet' },
    { name: 'Podman/Docker', status: 'unknown', message: 'Not checked yet' },
    { name: 'Port Availability', status: 'unknown', message: 'Not checked yet' },
    { name: 'Disk Space', status: 'unknown', message: 'Not checked yet' },
    { name: 'Memory', status: 'unknown', message: 'Not checked yet' },
  ]);

  const [scriptExecutions, setScriptExecutions] = useState<Record<string, ScriptExecution>>({
    healthCheck: { name: 'Health Check', status: 'idle', output: [] },
    requirements: { name: 'Requirements Check', status: 'idle', output: [] },
    autoRecover: { name: 'Auto Recovery', status: 'idle', output: [] },
    cleanInstall: { name: 'Clean Install', status: 'idle', output: [] },
  });

  const [loading, setLoading] = useState(false);
  const [nuclearResetDialog, setNuclearResetDialog] = useState(false);
  const [nuclearConfirmText, setNuclearConfirmText] = useState('');

  // Run health check
  const runHealthCheck = async () => {
    setLoading(true);
    updateScriptStatus('healthCheck', 'running', []);

    try {
      // Call backend API to run health-check.sh
      const response = await fetch('/api/troubleshooting/health-check', {
        method: 'POST',
      });

      const data = await response.json();

      // Update health checks based on response
      setHealthChecks(data.healthChecks || []);
      updateScriptStatus('healthCheck', 'success', data.output || [], data.exitCode);
    } catch (error) {
      updateScriptStatus('healthCheck', 'error', [`Error: ${error.message}`], 1);
    } finally {
      setLoading(false);
    }
  };

  // Run requirements check
  const runRequirementsCheck = async () => {
    setLoading(true);
    updateScriptStatus('requirements', 'running', []);

    try {
      const response = await fetch('/api/troubleshooting/check-requirements', {
        method: 'POST',
      });

      const data = await response.json();

      setSystemChecks(data.systemChecks || []);
      updateScriptStatus('requirements', 'success', data.output || [], data.exitCode);
    } catch (error) {
      updateScriptStatus('requirements', 'error', [`Error: ${error.message}`], 1);
    } finally {
      setLoading(false);
    }
  };

  // Run auto-recovery
  const runAutoRecover = async () => {
    setLoading(true);
    updateScriptStatus('autoRecover', 'running', []);

    try {
      const response = await fetch('/api/troubleshooting/auto-recover', {
        method: 'POST',
      });

      const data = await response.json();

      updateScriptStatus('autoRecover', 'success', data.output || [], data.exitCode);

      // Re-run health check after recovery
      setTimeout(() => runHealthCheck(), 2000);
    } catch (error) {
      updateScriptStatus('autoRecover', 'error', [`Error: ${error.message}`], 1);
    } finally {
      setLoading(false);
    }
  };

  // Run clean install
  const runCleanInstall = async () => {
    if (!window.confirm('This will reinstall all dependencies and rebuild FlexGate. Database data will be preserved. Continue?')) {
      return;
    }

    setLoading(true);
    updateScriptStatus('cleanInstall', 'running', []);

    try {
      const response = await fetch('/api/troubleshooting/clean-install', {
        method: 'POST',
      });

      const data = await response.json();

      updateScriptStatus('cleanInstall', 'success', data.output || [], data.exitCode);
    } catch (error) {
      updateScriptStatus('cleanInstall', 'error', [`Error: ${error.message}`], 1);
    } finally {
      setLoading(false);
    }
  };

  // Run nuclear reset
  const runNuclearReset = async () => {
    if (nuclearConfirmText !== 'DELETE EVERYTHING') {
      alert('Please type "DELETE EVERYTHING" to confirm');
      return;
    }

    setLoading(true);
    setNuclearResetDialog(false);

    try {
      const response = await fetch('/api/troubleshooting/nuclear-reset', {
        method: 'POST',
      });

      const data = await response.json();

      alert('Nuclear reset complete. You will need to reinstall FlexGate.');
      window.location.reload();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setNuclearConfirmText('');
    }
  };

  // Helper function to update script status
  const updateScriptStatus = (
    scriptKey: string,
    status: 'idle' | 'running' | 'success' | 'error',
    output: string[],
    exitCode?: number
  ) => {
    setScriptExecutions((prev) => ({
      ...prev,
      [scriptKey]: {
        ...prev[scriptKey],
        status,
        output,
        exitCode,
      },
    }));
  };

  // Get status icon
  const getStatusIcon = (status: 'healthy' | 'unhealthy' | 'warning' | 'unknown') => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon color="success" />;
      case 'unhealthy':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      default:
        return <InfoIcon color="disabled" />;
    }
  };

  // Get status color
  const getStatusColor = (status: 'healthy' | 'unhealthy' | 'warning' | 'unknown') => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'unhealthy':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Troubleshooting & Diagnostics
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Run diagnostics, check system health, and perform recovery operations
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {/* Quick Actions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Grid container spacing={2}>
                <Grid item>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AssignmentIcon />}
                    onClick={runHealthCheck}
                    disabled={loading}
                  >
                    Run Health Check
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    variant="contained"
                    color="info"
                    startIcon={<BugReportIcon />}
                    onClick={runRequirementsCheck}
                    disabled={loading}
                  >
                    Check Requirements
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<RefreshIcon />}
                    onClick={runAutoRecover}
                    disabled={loading}
                  >
                    Auto Recovery
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<BuildIcon />}
                    onClick={runCleanInstall}
                    disabled={loading}
                  >
                    Clean Install
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteForeverIcon />}
                    onClick={() => setNuclearResetDialog(true)}
                    disabled={loading}
                  >
                    Nuclear Reset
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Service Health Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Service Health
              </Typography>
              <List>
                {healthChecks.map((check, index) => (
                  <React.Fragment key={check.name}>
                    <ListItem>
                      <ListItemIcon>{getStatusIcon(check.status)}</ListItemIcon>
                      <ListItemText
                        primary={check.name}
                        secondary={check.message}
                      />
                      <Chip
                        label={check.status}
                        color={getStatusColor(check.status) as any}
                        size="small"
                      />
                    </ListItem>
                    {index < healthChecks.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* System Requirements */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Requirements
              </Typography>
              <List>
                {systemChecks.map((check, index) => (
                  <React.Fragment key={check.name}>
                    <ListItem>
                      <ListItemIcon>{getStatusIcon(check.status)}</ListItemIcon>
                      <ListItemText
                        primary={check.name}
                        secondary={check.message}
                      />
                      <Chip
                        label={check.status}
                        color={getStatusColor(check.status) as any}
                        size="small"
                      />
                    </ListItem>
                    {index < systemChecks.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Script Execution Logs */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Execution Logs
              </Typography>

              {Object.entries(scriptExecutions).map(([key, execution]) => (
                <Accordion key={key}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                      <Typography>{execution.name}</Typography>
                      <Chip
                        label={execution.status}
                        color={
                          execution.status === 'success'
                            ? 'success'
                            : execution.status === 'error'
                            ? 'error'
                            : execution.status === 'running'
                            ? 'primary'
                            : 'default'
                        }
                        size="small"
                      />
                      {execution.exitCode !== undefined && (
                        <Chip
                          label={`Exit: ${execution.exitCode}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {execution.output.length > 0 ? (
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: 'grey.900',
                          color: 'grey.100',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          maxHeight: 400,
                          overflow: 'auto',
                        }}
                      >
                        {execution.output.map((line, index) => (
                          <div key={index}>{line}</div>
                        ))}
                      </Paper>
                    ) : (
                      <Typography color="text.secondary">No output yet</Typography>
                    )}
                  </AccordionDetails>
                </Accordion>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Common Errors Reference */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Common Errors Quick Reference
              </Typography>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>EACCES: permission denied</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2">
                    <strong>Problem:</strong> npm install fails with permission error
                    <br />
                    <strong>Solution:</strong> Fix npm permissions or use npx
                  </Typography>
                  <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.100' }}>
                    <code>
                      mkdir ~/.npm-global
                      <br />
                      npm config set prefix '~/.npm-global'
                    </code>
                  </Paper>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>ECONNREFUSED 127.0.0.1:5432</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2">
                    <strong>Problem:</strong> Cannot connect to PostgreSQL
                    <br />
                    <strong>Solution:</strong> Start PostgreSQL container
                  </Typography>
                  <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.100' }}>
                    <code>npm run db:start</code>
                  </Paper>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Port 3000 already in use</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2">
                    <strong>Problem:</strong> Port conflict
                    <br />
                    <strong>Solution:</strong> Kill process using port 3000
                  </Typography>
                  <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.100' }}>
                    <code>kill -9 $(lsof -ti:3000)</code>
                  </Paper>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Build failed / Cannot find module</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2">
                    <strong>Problem:</strong> Dependency or build issues
                    <br />
                    <strong>Solution:</strong> Run clean install
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={runCleanInstall}
                    sx={{ mt: 1 }}
                  >
                    Run Clean Install
                  </Button>
                </AccordionDetails>
              </Accordion>
            </CardContent>
          </Card>
        </Grid>

        {/* Recovery Workflow Guide */}
        <Grid item xs={12}>
          <Alert severity="info">
            <Typography variant="subtitle2" gutterBottom>
              Recovery Workflow
            </Typography>
            <Typography variant="body2">
              1. <strong>Diagnosis:</strong> Run Health Check (30 sec)
              <br />
              2. <strong>Auto-Recovery:</strong> If unhealthy, run Auto Recovery (1 min)
              <br />
              3. <strong>Clean Install:</strong> If still failing, run Clean Install (5 min)
              <br />
              4. <strong>Requirements:</strong> Check system requirements
              <br />
              5. <strong>Nuclear Reset:</strong> Last resort - destroys all data (10 min)
            </Typography>
          </Alert>
        </Grid>
      </Grid>

      {/* Nuclear Reset Confirmation Dialog */}
      <Dialog open={nuclearResetDialog} onClose={() => setNuclearResetDialog(false)}>
        <DialogTitle>☢️ Nuclear Reset - Confirm</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              WARNING: This will DESTROY ALL DATA
            </Typography>
            <Typography variant="body2">
              • All containers will be removed
              <br />
              • All volumes will be deleted (DATABASE DATA LOST)
              <br />
              • All dependencies will be removed
              <br />
              • All build artifacts will be deleted
              <br />• You will need to reinstall FlexGate
            </Typography>
          </Alert>

          <Typography variant="body2" gutterBottom>
            Type <strong>"DELETE EVERYTHING"</strong> to confirm:
          </Typography>
          <TextField
            fullWidth
            value={nuclearConfirmText}
            onChange={(e) => setNuclearConfirmText(e.target.value)}
            placeholder="DELETE EVERYTHING"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNuclearResetDialog(false)}>Cancel</Button>
          <Button
            onClick={runNuclearReset}
            color="error"
            variant="contained"
            disabled={nuclearConfirmText !== 'DELETE EVERYTHING'}
          >
            Confirm Nuclear Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Troubleshooting;
