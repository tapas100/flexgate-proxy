import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { oauthService } from '../../services/oauth';
import type { OAuthProvider, OAuthProviderConfig, OAuthProviderType } from '../../types';

interface OAuthProviderDialogProps {
  open: boolean;
  provider: OAuthProvider | null; // null for new provider
  onClose: (saved: boolean) => void;
}

const OAuthProviderDialog: React.FC<OAuthProviderDialogProps> = ({
  open,
  provider,
  onClose,
}) => {
  const [formData, setFormData] = useState<OAuthProviderConfig>({
    name: '',
    type: 'google',
    clientId: '',
    clientSecret: '',
    scopes: [],
    redirectUri: '',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userInfoEndpoint: '',
  });

  const [showClientSecret, setShowClientSecret] = useState(false);
  const [scopeInput, setScopeInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (provider) {
        // Edit mode
        setFormData({
          name: provider.name,
          type: provider.type,
          clientId: provider.clientId,
          clientSecret: '', // Never pre-fill secret for security
          scopes: provider.scopes,
          redirectUri: provider.redirectUri,
          authorizationEndpoint: provider.authorizationEndpoint,
          tokenEndpoint: provider.tokenEndpoint,
          userInfoEndpoint: provider.userInfoEndpoint,
        });
        setScopeInput(provider.scopes.join(', '));
      } else {
        // Create mode
        resetForm();
      }
      setTestResult(null);
      setError(null);
    }
  }, [open, provider]);

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'google',
      clientId: '',
      clientSecret: '',
      scopes: [],
      redirectUri: '',
      authorizationEndpoint: '',
      tokenEndpoint: '',
      userInfoEndpoint: '',
    });
    setScopeInput('');
    setShowClientSecret(false);
  };

  const handleChange = (field: keyof OAuthProviderConfig, value: any) => {
    setFormData({ ...formData, [field]: value });
    setTestResult(null); // Clear test result on change
  };

  const handleTypeChange = (type: OAuthProviderType) => {
    handleChange('type', type);
    
    // Auto-fill endpoints for known providers
    const endpoints = getProviderEndpoints(type);
    if (endpoints) {
      setFormData({
        ...formData,
        type,
        authorizationEndpoint: endpoints.authorizationEndpoint,
        tokenEndpoint: endpoints.tokenEndpoint,
        userInfoEndpoint: endpoints.userInfoEndpoint,
      });
    }
  };

  const getProviderEndpoints = (type: OAuthProviderType) => {
    const endpoints: Record<string, any> = {
      google: {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
      },
      github: {
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        userInfoEndpoint: 'https://api.github.com/user',
      },
      microsoft: {
        authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
      },
    };
    return endpoints[type];
  };

  const handleScopeInputChange = (value: string) => {
    setScopeInput(value);
    const scopes = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    handleChange('scopes', scopes);
  };

  const handleTestConnection = async () => {
    if (!formData.clientId || !formData.clientSecret) {
      setTestResult({
        success: false,
        message: 'Client ID and Client Secret are required for testing',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const result = await oauthService.testConnection(formData);

    if (result.success && result.data) {
      if (result.data.success) {
        setTestResult({
          success: true,
          message: `Connection successful! Response time: ${result.data.details?.responseTime}ms`,
        });
      } else {
        setTestResult({
          success: false,
          message: result.data.error || 'Connection test failed',
        });
      }
    } else {
      setTestResult({
        success: false,
        message: result.error || 'Failed to test connection',
      });
    }

    setTesting(false);
  };

  const handleSave = async () => {
    // Validation
    if (!formData.name || !formData.clientId || !formData.clientSecret) {
      setError('Name, Client ID, and Client Secret are required');
      return;
    }

    if (formData.scopes.length === 0) {
      setError('At least one scope is required');
      return;
    }

    setSaving(true);
    setError(null);

    let result;
    if (provider) {
      // Update existing provider
      result = await oauthService.updateProvider(provider.id, formData);
    } else {
      // Create new provider
      result = await oauthService.createProvider(formData);
    }

    if (result.success) {
      onClose(true);
    } else {
      setError(result.error || 'Failed to save provider');
    }

    setSaving(false);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {provider ? 'Edit OAuth Provider' : 'Add OAuth Provider'}
          </Typography>
          <IconButton onClick={() => onClose(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Provider Type"
            select
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as OAuthProviderType)}
            fullWidth
            required
          >
            <MenuItem value="google">Google</MenuItem>
            <MenuItem value="github">GitHub</MenuItem>
            <MenuItem value="microsoft">Microsoft</MenuItem>
            <MenuItem value="generic">Generic OAuth2</MenuItem>
          </TextField>

          <TextField
            label="Display Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., Google SSO"
            fullWidth
            required
          />

          <TextField
            label="Client ID"
            value={formData.clientId}
            onChange={(e) => handleChange('clientId', e.target.value)}
            placeholder="Your OAuth client ID"
            fullWidth
            required
          />

          <TextField
            label="Client Secret"
            type={showClientSecret ? 'text' : 'password'}
            value={formData.clientSecret}
            onChange={(e) => handleChange('clientSecret', e.target.value)}
            placeholder={provider ? 'Leave empty to keep current secret' : 'Your OAuth client secret'}
            fullWidth
            required={!provider}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowClientSecret(!showClientSecret)}
                    edge="end"
                  >
                    {showClientSecret ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Redirect URI"
            value={formData.redirectUri}
            onChange={(e) => handleChange('redirectUri', e.target.value)}
            placeholder="https://your-domain.com/auth/oauth/callback"
            fullWidth
            helperText="Configure this URL in your OAuth provider settings"
          />

          <Box>
            <TextField
              label="Scopes"
              value={scopeInput}
              onChange={(e) => handleScopeInputChange(e.target.value)}
              placeholder="e.g., openid, email, profile"
              fullWidth
              required
              helperText="Comma-separated list of OAuth scopes"
            />
            {formData.scopes.length > 0 && (
              <Box mt={1} display="flex" gap={1} flexWrap="wrap">
                {formData.scopes.map((scope, index) => (
                  <Chip
                    key={index}
                    label={scope}
                    size="small"
                    onDelete={() => {
                      const newScopes = formData.scopes.filter((_, i) => i !== index);
                      handleChange('scopes', newScopes);
                      setScopeInput(newScopes.join(', '));
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Advanced Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField
                  label="Authorization Endpoint"
                  value={formData.authorizationEndpoint}
                  onChange={(e) => handleChange('authorizationEndpoint', e.target.value)}
                  placeholder="https://provider.com/oauth/authorize"
                  fullWidth
                  helperText="Auto-filled for known providers"
                />

                <TextField
                  label="Token Endpoint"
                  value={formData.tokenEndpoint}
                  onChange={(e) => handleChange('tokenEndpoint', e.target.value)}
                  placeholder="https://provider.com/oauth/token"
                  fullWidth
                  helperText="Auto-filled for known providers"
                />

                <TextField
                  label="User Info Endpoint"
                  value={formData.userInfoEndpoint}
                  onChange={(e) => handleChange('userInfoEndpoint', e.target.value)}
                  placeholder="https://provider.com/userinfo"
                  fullWidth
                  helperText="Auto-filled for known providers"
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          {testResult && (
            <Alert
              severity={testResult.success ? 'success' : 'error'}
              icon={testResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
            >
              {testResult.message}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleTestConnection}
          disabled={testing || saving}
          startIcon={testing ? <CircularProgress size={16} /> : null}
        >
          Test Connection
        </Button>
        <Box flex={1} />
        <Button onClick={() => onClose(false)} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {provider ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OAuthProviderDialog;
