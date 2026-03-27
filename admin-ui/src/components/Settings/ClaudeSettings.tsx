import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  Chip,
  Card,
  CardContent,
  Link,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  demoMode: boolean; // Use mock API for testing
}

interface TestResult {
  success: boolean;
  message: string;
  model?: string;
  responseTime?: number;
}

const ClaudeSettings: React.FC = () => {
  const [config, setConfig] = useState<ClaudeConfig>({
    apiKey: '',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 2000,
    temperature: 0,
    demoMode: true, // Enable demo mode by default
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // Load current configuration
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8080/api/settings/claude');
      const data = await response.json();
      
      if (data.success) {
        setConfig({
          apiKey: data.apiKey || '',
          model: data.model || 'claude-3-5-sonnet-20241022',
          maxTokens: data.maxTokens || 2000,
          temperature: data.temperature || 0,
          demoMode: data.demoMode !== undefined ? data.demoMode : true,
        });
        setHasExistingKey(data.hasApiKey || false);
      } else {
        setError(data.message || 'Failed to load configuration');
      }
    } catch (err) {
      console.error('Error loading Claude config:', err);
      setError('Failed to load configuration. Using defaults.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('http://localhost:8080/api/settings/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess('Claude settings saved successfully! Changes will take effect immediately.');
        setHasExistingKey(!!config.apiKey);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(data.message || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving Claude config:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.apiKey) {
      setError('Please enter an API key first');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8080/api/settings/claude/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: config.apiKey }),
      });
      
      const data = await response.json();
      setTestResult(data);
      
      if (!data.success) {
        setError(data.message || 'API key test failed');
      }
    } catch (err) {
      console.error('Error testing Claude API key:', err);
      setTestResult({
        success: false,
        message: 'Failed to test API key. Please check your connection.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Demo Mode Alert */}
      {config.demoMode && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>🎭 Demo Mode Active:</strong> Using mock Claude API for testing. No real API key or subscription required! 
            Responses are generated locally with realistic sample data.
          </Typography>
        </Alert>
      )}

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 3 }} icon={<InfoIcon />}>
        <Typography variant="body2">
          {config.demoMode ? (
            <>
              Demo mode uses a local mock API - perfect for testing without a real API key! 
              Switch to production mode when you're ready to use real Claude AI.
            </>
          ) : (
            <>
              Configure Claude AI integration for automatic incident analysis. Get your API key from{' '}
              <Link href="https://console.anthropic.com/" target="_blank" rel="noopener">
                https://console.anthropic.com/
              </Link>
            </>
          )}
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Mode Selection */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: config.demoMode ? '#fff3e0' : 'background.paper' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" gutterBottom>
              {config.demoMode ? '🎭 Demo Mode' : '🚀 Production Mode'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {config.demoMode 
                ? 'Using local mock API - no subscription needed! Perfect for testing and development.'
                : 'Using real Claude API - requires valid API key and active subscription.'
              }
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={!config.demoMode}
                onChange={(e) => setConfig({ ...config, demoMode: !e.target.checked })}
                color="primary"
              />
            }
            label={config.demoMode ? 'Enable Production' : 'Production Active'}
          />
        </Stack>
      </Paper>

      {/* API Key Configuration */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          API Key {config.demoMode && '(Optional in Demo Mode)'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {config.demoMode 
            ? 'Demo mode works without an API key. Add one to switch to production mode.'
            : 'Your Anthropic API key for Claude integration'
          }
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
          <TextField
            fullWidth
            label="Anthropic API Key"
            type={showApiKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder={hasExistingKey ? '••••••••••••••••••••••••' : 'sk-ant-api03-...'}
            helperText={
              hasExistingKey && !config.apiKey
                ? 'API key is configured (leave blank to keep existing key)'
                : 'Starts with sk-ant-api03-'
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowApiKey(!showApiKey)}
                    edge="end"
                  >
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1 }}
          />
          <Button
            variant="outlined"
            onClick={handleTest}
            disabled={!config.apiKey || testing}
            startIcon={testing ? <CircularProgress size={20} /> : null}
            sx={{ height: 56, minWidth: 150 }}
          >
            {testing ? 'Testing...' : 'Test API Key'}
          </Button>
        </Stack>

        {/* Test Result */}
        {testResult && (
          <Alert
            severity={testResult.success ? 'success' : 'error'}
            icon={testResult.success ? <CheckCircle /> : <ErrorIcon />}
            sx={{ mt: 2 }}
          >
            <Typography variant="body2">
              {testResult.message}
              {testResult.success && testResult.model && (
                <>
                  <br />
                  <strong>Model:</strong> {testResult.model}
                  {testResult.responseTime && (
                    <> • <strong>Response Time:</strong> {testResult.responseTime}ms</>
                  )}
                </>
              )}
            </Typography>
          </Alert>
        )}
      </Paper>

      {/* Model Configuration */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Model Configuration
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure which Claude model to use for analysis
        </Typography>

        <Stack spacing={2}>
          <TextField
            fullWidth
            label="Model"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            helperText="Recommended: claude-3-5-sonnet-20241022"
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Max Tokens"
              type="number"
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 2000 })}
              helperText="Output limit (1000-4000)"
              inputProps={{ min: 1000, max: 4000 }}
            />
            <TextField
              fullWidth
              label="Temperature"
              type="number"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0 })}
              helperText="Creativity (0-1)"
              inputProps={{ min: 0, max: 1, step: 0.1 }}
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Cost Information */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Cost Information
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Card variant="outlined" sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Claude 3.5 Sonnet Pricing
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Chip label="Input: $3 / 1M tokens" size="small" sx={{ mr: 1, mb: 1 }} />
                <Chip label="Output: $15 / 1M tokens" size="small" sx={{ mb: 1 }} />
              </Box>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Typical Analysis Cost
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Chip label="~$0.004 per incident" color="success" size="small" sx={{ mr: 1, mb: 1 }} />
                <Chip label="~$1.28/month for 10/day" size="small" sx={{ mb: 1 }} />
              </Box>
            </CardContent>
          </Card>
        </Stack>
      </Paper>

      {/* Save Button */}
      <Box display="flex" justifyContent="flex-end" gap={2}>
        <Button
          variant="outlined"
          onClick={loadConfig}
          disabled={loading || saving}
        >
          Reset
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !config.apiKey}
          startIcon={saving ? <CircularProgress size={20} /> : null}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>

      {/* Help Text */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>How to get an API key:</strong>
        </Typography>
        <Typography variant="body2" component="ol" sx={{ mt: 1, pl: 2 }}>
          <li>Go to <Link href="https://console.anthropic.com/" target="_blank">console.anthropic.com</Link></li>
          <li>Sign up or log in</li>
          <li>Navigate to "API Keys"</li>
          <li>Click "Create Key"</li>
          <li>Copy the key (starts with sk-ant-api03-)</li>
          <li>Paste it above and click "Test API Key"</li>
        </Typography>
      </Alert>
    </Box>
  );
};

export default ClaudeSettings;
