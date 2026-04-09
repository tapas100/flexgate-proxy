/**
 * Multi-Provider AI Settings Component
 * Supports: Claude, Gemini, OpenAI, Groq, Demo Mode
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  AlertTitle,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  IconButton,
  Chip,
  Card,
  CardContent,
  Stack,
  Link,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error,
  Psychology,
  Speed,
  AttachMoney,
} from '@mui/icons-material';

interface AIProvider {
  id: string;
  name: string;
  description: string;
  pricingTier: 'free' | 'paid' | 'freemium';
  defaultModel: string;
  apiKeyUrl: string;
  docsUrl: string;
  icon: string;
  models: ModelInfo[];
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface AIConfig {
  provider: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyLocked?: boolean; // New: indicates if key is locked (write-once)
  model: string;
  maxTokens: number;
  temperature: number;
  demoMode: boolean;
  availableProviders?: AIProvider[];
}

const AISettings: React.FC = () => {
  const [config, setConfig] = useState<AIConfig>({
    provider: 'gemini', // Default to Gemini (FREE)
    apiKey: '',
    hasApiKey: false,
    model: 'gemini-2.5-flash',
    maxTokens: 2000,
    temperature: 0,
    demoMode: true, // Will switch to false once API key is set
    availableProviders: [],
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Get currently selected provider
  const selectedProvider = config.availableProviders?.find(
    p => p.id === config.provider
  );

  // Get available models for selected provider
  const availableModels = selectedProvider?.models || [];

  // Get selected model info
  const selectedModel = availableModels.find(m => m.id === config.model);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/ai');
      const data = await response.json();

      if (data.success) {
        setConfig({
          ...data,
          apiKey: '', // Never send from backend
        });
      }
    } catch (error) {
      console.error('Failed to load AI config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (newProvider: string) => {
    const provider = config.availableProviders?.find(p => p.id === newProvider);
    if (provider) {
      setConfig({
        ...config,
        provider: newProvider,
        model: provider.defaultModel,
        demoMode: newProvider === 'demo',
      });
    }
  };

  const handleTestApiKey = async () => {
    if (!config.apiKey) {
      setTestResult({
        type: 'error',
        message: 'Please enter an API key',
      });
      return;
    }

    try {
      setLoading(true);
      setTestResult(null);

      const response = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          type: 'success',
          message: data.message || 'API key is valid!',
        });
      } else {
        setTestResult({
          type: 'error',
          message: data.error || 'API key validation failed',
        });
      }
    } catch (error: any) {
      setTestResult({
        type: 'error',
        message: error.message || 'Failed to test API key',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Security warning for HTTP
      if (window.location.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        if (!window.confirm('⚠️ WARNING: You are using HTTP. API keys should be sent over HTTPS. Continue anyway?')) {
          setSaving(false);
          return;
        }
      }
      
      const response = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey || undefined,
          model: config.model,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          demoMode: config.demoMode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          type: 'success',
          message: data.securityNote 
            ? `${data.message} ⚠️ ${data.securityNote}` 
            : data.message || 'Settings saved successfully!',
        });
        await loadConfig();
      } else {
        setTestResult({
          type: 'error',
          message: data.error || 'Failed to save settings',
        });
      }
    } catch (error: any) {
      setTestResult({
        type: 'error',
        message: error.message || 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!window.confirm('🗑️ Delete API key?\n\nThis will:\n• Remove the locked API key\n• Switch to demo mode\n• Allow you to set a new key\n\nThis cannot be undone!')) {
      return;
    }
    
    try {
      setSaving(true);
      
      const response = await fetch('/api/settings/ai/key', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          type: 'success',
          message: '✅ API key deleted successfully. You can now set a new key.',
        });
        // Clear the API key field
        setConfig(prev => ({
          ...prev,
          apiKey: '',
          hasApiKey: false,
          apiKeyLocked: false,
          demoMode: true,
        }));
        await loadConfig();
      } else {
        setTestResult({
          type: 'error',
          message: data.error || 'Failed to delete API key',
        });
      }
    } catch (error: any) {
      setTestResult({
        type: 'error',
        message: error.message || 'Failed to delete API key',
      });
    } finally {
      setSaving(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free':
        return 'success';
      case 'freemium':
        return 'info';
      case 'paid':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case 'free':
        return 'FREE';
      case 'freemium':
        return 'FREE TIER';
      case 'paid':
        return 'PAID';
      default:
        return tier.toUpperCase();
    }
  };

  if (loading && !config.availableProviders?.length) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={3}>
        {/* Cost Savings Recommendation */}
        {(config.provider === 'demo' || config.provider === 'claude') && (
          <Alert severity="info" icon={<AttachMoney />}>
            <AlertTitle>💰 Save Money with Free AI</AlertTitle>
            <Typography variant="body2">
              <strong>Recommended:</strong> Use <strong>Google Gemini Flash</strong> (60 requests/min FREE) 
              or <strong>Groq</strong> (30 requests/min FREE) instead of paid providers. 
              Perfect for incident analysis and action recommendations!
            </Typography>
            {config.provider === 'demo' && (
              <Button
                size="small"
                variant="outlined"
                sx={{ mt: 1 }}
                onClick={() => handleProviderChange('gemini')}
              >
                Switch to Gemini (FREE)
              </Button>
            )}
          </Alert>
        )}

        {/* Demo Mode Warning */}
        {config.demoMode && config.provider === 'demo' && (
          <Alert severity="warning" icon={<Psychology />}>
            <AlertTitle>🎭 Demo Mode Active</AlertTitle>
            Using mock AI responses for testing. No API key or subscription required!
            {config.provider !== 'demo' && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Configure an API key below to enable real AI analysis.
              </Typography>
            )}
          </Alert>
        )}

        {/* Provider Selection */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            AI Provider
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose your AI provider. Free tiers available for Gemini, OpenAI, and Groq!
          </Typography>

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Provider</InputLabel>
            <Select
              value={config.provider}
              label="Provider"
              onChange={e => handleProviderChange(e.target.value)}
            >
              {config.availableProviders?.map(provider => (
                <MenuItem key={provider.id} value={provider.id}>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
                    <Typography sx={{ fontSize: '1.5em' }}>{provider.icon}</Typography>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1">{provider.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {provider.description}
                      </Typography>
                    </Box>
                    <Chip
                      label={getTierLabel(provider.pricingTier)}
                      color={getTierColor(provider.pricingTier)}
                      size="small"
                    />
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Provider Info Cards */}
          {selectedProvider && selectedProvider.id !== 'demo' && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Get API Key
                  </Typography>
                  <Link href={selectedProvider.apiKeyUrl} target="_blank" rel="noopener">
                    {selectedProvider.apiKeyUrl.replace('https://', '')}
                  </Link>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Documentation
                  </Typography>
                  <Link href={selectedProvider.docsUrl} target="_blank" rel="noopener">
                    {selectedProvider.docsUrl.replace('https://', '')}
                  </Link>
                </CardContent>
              </Card>
            </Stack>
          )}
        </Paper>

        {/* API Key Configuration (skip for demo mode) */}
        {config.provider !== 'demo' && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              API Key Configuration
            </Typography>
            
            {/* Security Notice */}
            {window.location.protocol !== 'https:' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <AlertTitle>🔒 Security Notice</AlertTitle>
                <Typography variant="body2">
                  You're using HTTP. In production, use HTTPS to securely transmit API keys.
                  Keys are encrypted at rest in the database.
                </Typography>
              </Alert>
            )}

            {config.apiKeyLocked && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <AlertTitle>🔒 Write-Once Protection Active</AlertTitle>
                API key is locked and cannot be edited. To change the key:
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  <li>Click "Delete API Key" button below</li>
                  <li>Enter new API key</li>
                  <li>Save settings</li>
                </ul>
              </Alert>
            )}

            <TextField
              fullWidth
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={e => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={config.hasApiKey ? '••••••••••••••••' : 'Enter your API key'}
              disabled={config.apiKeyLocked} // Disable input when locked
              helperText={
                config.apiKeyLocked
                  ? '🔒 API key is locked (write-once mode). Delete to change.'
                  : config.hasApiKey
                  ? '🔐 API key is securely stored (encrypted). Enter a new key to update.'
                  : 'Get your API key from the provider\'s console'
              }
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                      disabled={config.apiKeyLocked && !config.apiKey}
                    >
                      {showApiKey ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                onClick={handleTestApiKey}
                disabled={loading || !config.apiKey}
                startIcon={loading ? undefined : <CheckCircle />}
              >
                {loading ? 'Testing...' : 'Test API Key'}
              </Button>
              
              {config.apiKeyLocked && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDeleteApiKey}
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Delete API Key'}
                </Button>
              )}
            </Stack>

            {testResult && (
              <Alert
                severity={testResult.type}
                icon={testResult.type === 'success' ? <CheckCircle /> : <Error />}
                sx={{ mt: 2 }}
              >
                {testResult.message}
              </Alert>
            )}
          </Paper>
        )}

        {/* Model Configuration */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Model Configuration
          </Typography>

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Model</InputLabel>
            <Select
              value={config.model}
              label="Model"
              onChange={e => setConfig({ ...config, model: e.target.value })}
            >
              {availableModels.map(model => (
                <MenuItem key={model.id} value={model.id}>
                  <Box>
                    <Typography variant="body1">{model.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {model.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedModel && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Psychology color="primary" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Context Window
                      </Typography>
                      <Typography variant="h6">
                        {(selectedModel.contextWindow / 1000).toFixed(0)}K
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AttachMoney color="success" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Input Cost
                      </Typography>
                      <Typography variant="h6">
                        ${selectedModel.inputCostPer1M.toFixed(2)}/M
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Speed color="warning" />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Output Cost
                      </Typography>
                      <Typography variant="h6">
                        ${selectedModel.outputCostPer1M.toFixed(2)}/M
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Max Tokens"
              type="number"
              value={config.maxTokens}
              onChange={e =>
                setConfig({ ...config, maxTokens: parseInt(e.target.value) })
              }
              helperText="Maximum tokens in response"
            />
            <TextField
              fullWidth
              label="Temperature"
              type="number"
              value={config.temperature}
              onChange={e =>
                setConfig({ ...config, temperature: parseFloat(e.target.value) })
              }
              inputProps={{ min: 0, max: 2, step: 0.1 }}
              helperText="0 = focused, 1 = creative"
            />
          </Stack>
        </Paper>

        {/* Save Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
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
            disabled={loading || saving}
            size="large"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
};

export default AISettings;
