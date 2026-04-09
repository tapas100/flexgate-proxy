import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
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
  CircularProgress,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  CheckCircle,
  Cancel as ErrorCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Build as BuildIcon,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [nuclearResetDialog, setNuclearResetDialog] = useState(false);
  const [nuclearConfirmText, setNuclearConfirmText] = useState('');
  const [cleanInstallDialog, setCleanInstallDialog] = useState(false);
  const [cleanInstallPassword, setCleanInstallPassword] = useState('');
  const [nuclearResetPassword, setNuclearResetPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // Clean Install Progress Dialog State
  const [cleanInstallProgress, setCleanInstallProgress] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [installComplete, setInstallComplete] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Run health check
  const runHealthCheck = async () => {
    setLoading(true);
    updateScriptStatus('healthCheck', 'running', []);

    try {
      // Call backend API to run health-check.sh with JSON output
      const response = await fetch('/api/troubleshooting/health-check', {
        method: 'POST',
      });

      const data = await response.json();

      // Map services from JSON to health checks
      if (data.services) {
        const mappedChecks = data.services.map((service: any) => ({
          name: service.name,
          status: service.status,
          message: `${service.message} ${service.mode !== 'none' ? `[${service.mode}]` : ''}`
        }));
        setHealthChecks(mappedChecks);
      }

      updateScriptStatus('healthCheck', 'success', data.output || [], data.exitCode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateScriptStatus('healthCheck', 'error', [`Error: ${errorMessage}`], 1);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateScriptStatus('requirements', 'error', [`Error: ${errorMessage}`], 1);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateScriptStatus('autoRecover', 'error', [`Error: ${errorMessage}`], 1);
    } finally {
      setLoading(false);
    }
  };

  // Verify admin password
  const verifyAdminPassword = async (password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/troubleshooting/verify-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();
      return data.verified === true;
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  };

  // Run clean install
  const runCleanInstall = async () => {
    // Verify admin password first
    const isVerified = await verifyAdminPassword(cleanInstallPassword);
    
    if (!isVerified) {
      setPasswordError('Invalid admin password. Access denied.');
      return;
    }

    // Close password dialog and open progress dialog
    setCleanInstallDialog(false);
    const password = cleanInstallPassword;
    setCleanInstallPassword('');
    setPasswordError('');
    
    // Reset progress state
    setInstallProgress(0);
    setInstallLogs([]);
    setInstallComplete(false);
    setInstallSuccess(false);
    setCleanInstallProgress(true);
    
    try {
      // Step 1: Start the standalone progress server
      setInstallLogs(['🚀 Starting progress server...']);
      const startResponse = await fetch('/api/troubleshooting/start-progress-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!startResponse.ok) {
        const error = await startResponse.json();
        setInstallLogs(prev => [...prev, `❌ Failed to start progress server: ${error.error}`]);
        setInstallComplete(true);
        setInstallSuccess(false);
        return;
      }

      const startResult = await startResponse.json();
      setInstallLogs(prev => [...prev, `✅ ${startResult.message} (port ${startResult.port})`]);
      
      // Step 2: Connect to the progress stream
      // This server runs independently and won't be killed during clean install
      const eventSource = new EventSource(
        `http://localhost:8082/stream?password=${encodeURIComponent(password)}`
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              setInstallLogs(prev => [...prev, data.message]);
              break;
              
            case 'progress':
              setInstallProgress(data.progress);
              setInstallLogs(prev => [...prev, data.message]);
              break;
              
            case 'complete':
              setInstallComplete(true);
              setInstallSuccess(data.success);
              setInstallLogs(prev => [...prev, data.message]);
              eventSource.close();
              
              // Update script status
              updateScriptStatus(
                'cleanInstall',
                data.success ? 'success' : 'error',
                [...installLogs, data.message],
                data.exitCode
              );
              break;
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setInstallComplete(true);
        setInstallSuccess(false);
        setInstallLogs(prev => [...prev, '❌ Connection error - installation may have failed']);
        eventSource.close();
        updateScriptStatus('cleanInstall', 'error', installLogs, 1);
      };
    } catch (error: any) {
      setInstallLogs(prev => [...prev, `❌ Error: ${error.message}`]);
      setInstallComplete(true);
      setInstallSuccess(false);
    }
  };

  // Run nuclear reset
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runNuclearReset = async () => {
    if (nuclearConfirmText !== 'DELETE EVERYTHING') {
      setPasswordError('Please type "DELETE EVERYTHING" to confirm');
      return;
    }

    // Verify admin password
    const isVerified = await verifyAdminPassword(nuclearResetPassword);
    
    if (!isVerified) {
      setPasswordError('Invalid admin password. Access denied.');
      return;
    }

    setLoading(true);
    setNuclearResetDialog(false);
    setNuclearConfirmText('');
    setNuclearResetPassword('');
    setPasswordError('');

    try {
      const response = await fetch('/api/troubleshooting/nuclear-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adminPassword: nuclearResetPassword }),
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const data = await response.json();

      alert('Nuclear reset complete. You will need to reinstall FlexGate.');
      window.location.reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error: ${errorMessage}`);
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

      <Stack spacing={3}>
        {/* Quick Actions */}
        <Box sx={{ width: "100%" }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AssignmentIcon />}
                    onClick={runHealthCheck}
                    disabled={loading}
                  >
                    Run Health Check
                  </Button>
                </Box>
                <Box>
                  <Button
                    variant="contained"
                    color="info"
                    startIcon={<BugReportIcon />}
                    onClick={runRequirementsCheck}
                    disabled={loading}
                  >
                    Check Requirements
                  </Button>
                </Box>
                <Box>
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<RefreshIcon />}
                    onClick={runAutoRecover}
                    disabled={loading}
                  >
                    Auto Recovery
                  </Button>
                </Box>
                <Box>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<BuildIcon />}
                    onClick={() => setCleanInstallDialog(true)}
                    disabled={loading}
                  >
                    Clean Install
                  </Button>
                </Box>
                {/* Nuclear Reset button temporarily removed */}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {/* Service Health Status */}
        <Box sx={{ flex: { xs: "1 0 100%", md: "1 0 48%" } }}>
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
        </Box>

        {/* System Requirements */}
        <Box sx={{ flex: { xs: "1 0 100%", md: "1 0 48%" } }}>
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
        </Box>

        {/* Script Execution Logs */}
        <Box sx={{ width: "100%" }}>
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
        </Box>

        {/* Common Errors Reference */}
        <Box sx={{ width: "100%" }}>
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
        </Box>

        {/* Recovery Workflow Guide */}
        <Box sx={{ width: "100%" }}>
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
            </Typography>
          </Alert>
        </Box>
      </Stack>

      {/* Nuclear Reset temporarily disabled */}

      {/* Clean Install Confirmation Dialog */}
      <Dialog open={cleanInstallDialog} onClose={() => {
        setCleanInstallDialog(false);
        setCleanInstallPassword('');
        setPasswordError('');
      }}>
        <DialogTitle>🧹 Clean Install - Admin Authorization Required</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              This operation requires admin authorization
            </Typography>
            <Typography variant="body2">
              • Removes backend node_modules only
              <br />
              • Clears backend build artifacts
              <br />
              • Fresh npm install for backend (~5 minutes)
              <br />
              • Rebuilds backend
              <br />
              <strong>✅ Admin UI stays running - you'll see live progress</strong>
              <br />
              <strong>✅ Database data will be preserved</strong>
            </Typography>
          </Alert>

          <Typography variant="body2" gutterBottom>
            Enter admin password to proceed:
          </Typography>
          <TextField
            fullWidth
            type="password"
            value={cleanInstallPassword}
            onChange={(e) => {
              setCleanInstallPassword(e.target.value);
              setPasswordError('');
            }}
            placeholder="Admin password"
            error={!!passwordError}
            helperText={passwordError}
            sx={{ mt: 1 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setCleanInstallDialog(false);
            setCleanInstallPassword('');
            setPasswordError('');
          }}>Cancel</Button>
          <Button
            onClick={runCleanInstall}
            color="secondary"
            variant="contained"
            disabled={!cleanInstallPassword}
          >
            Confirm Clean Install
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clean Install Progress Dialog */}
      <Dialog 
        open={cleanInstallProgress} 
        onClose={() => {
          // Only allow closing if installation is complete
          if (installComplete) {
            setCleanInstallProgress(false);
          }
        }}
        maxWidth="md"
        fullWidth
        disableEscapeKeyDown={!installComplete}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {installComplete ? (
              installSuccess ? (
                <>
                  <CheckCircle color="success" />
                  Clean Installation Complete
                </>
              ) : (
                <>
                  <ErrorCircleIcon color="error" />
                  Installation Failed
                </>
              )
            ) : (
              <>
                <CircularProgress size={20} />
                Installing Backend Dependencies...
              </>
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Box sx={{ flex: 1, mr: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={installProgress} 
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {installProgress}%
              </Typography>
            </Box>
            {!installComplete && (
              <Typography variant="caption" color="text.secondary">
                The Admin UI will remain accessible during installation
              </Typography>
            )}
          </Box>

          <Box 
            sx={{ 
              bgcolor: '#1e1e1e',
              color: '#d4d4d4',
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              maxHeight: 400,
              overflowY: 'auto',
            }}
          >
            {installLogs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setCleanInstallProgress(false)}
            disabled={!installComplete}
            variant="contained"
            color={installSuccess ? 'primary' : 'error'}
          >
            {installComplete ? 'Close' : 'Please wait...'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Troubleshooting;
