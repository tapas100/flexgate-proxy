import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Alert,
  Chip,
  OutlinedInput,
  SelectChangeEvent,
} from '@mui/material';
import { Route } from '../../types';
import { routeService, CreateRouteData } from '../../services/routes';
import { validateRouteConfig } from '../../utils/validation';

interface RouteDialogProps {
  open: boolean;
  route: Route | null;
  onClose: (saved: boolean) => void;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const RouteDialog: React.FC<RouteDialogProps> = ({ open, route, onClose }) => {
  const [formData, setFormData] = useState<CreateRouteData>({
    path: '',
    upstream: '',
    methods: ['GET'],
    rateLimit: undefined,
    circuitBreaker: undefined,
  });

  const [rateLimitEnabled, setRateLimitEnabled] = useState(false);
  const [circuitBreakerEnabled, setCircuitBreakerEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize form when route changes
  useEffect(() => {
    if (route) {
      setFormData({
        path: route.path,
        upstream: route.upstream,
        methods: route.methods,
        rateLimit: route.rateLimit,
        circuitBreaker: route.circuitBreaker,
      });
      setRateLimitEnabled(!!route.rateLimit);
      setCircuitBreakerEnabled(!!route.circuitBreaker?.enabled);
    } else {
      // Reset for new route
      setFormData({
        path: '',
        upstream: '',
        methods: ['GET'],
        rateLimit: undefined,
        circuitBreaker: undefined,
      });
      setRateLimitEnabled(false);
      setCircuitBreakerEnabled(false);
    }
    setError(null);
  }, [route, open]);

  const handleChange = (field: keyof CreateRouteData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleMethodsChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    handleChange('methods', typeof value === 'string' ? value.split(',') : value);
  };

  const handleRateLimitToggle = (checked: boolean) => {
    setRateLimitEnabled(checked);
    if (checked) {
      setFormData(prev => ({
        ...prev,
        rateLimit: { requests: 100, window: '60s' },
      }));
    } else {
      setFormData(prev => ({ ...prev, rateLimit: undefined }));
    }
  };

  const handleCircuitBreakerToggle = (checked: boolean) => {
    setCircuitBreakerEnabled(checked);
    if (checked) {
      setFormData(prev => ({
        ...prev,
        circuitBreaker: { enabled: true, threshold: 5 },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        circuitBreaker: { enabled: false, threshold: 0 },
      }));
    }
  };

  const handleSave = async () => {
    setError(null);

    // Validate form
    const validation = validateRouteConfig(formData);
    if (!validation.valid) {
      setError(validation.error || 'Invalid configuration');
      return;
    }

    setSaving(true);

    let response;
    if (route) {
      // Update existing route
      response = await routeService.updateRoute(route.id, formData);
    } else {
      // Create new route
      response = await routeService.createRoute(formData);
    }

    setSaving(false);

    if (response.success) {
      onClose(true);
    } else {
      setError(response.error || 'Failed to save route');
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={() => onClose(false)} 
      maxWidth="md" 
      fullWidth
      scroll="paper"
      data-testid="route-dialog"
    >
      <DialogTitle>{route ? 'Edit Route' : 'Create Route'}</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Path"
            value={formData.path}
            onChange={(e) => handleChange('path', e.target.value)}
            placeholder="/api/users"
            helperText="Route path (must start with /)"
            required
            fullWidth
          />

          <TextField
            label="Upstream URL"
            value={formData.upstream}
            onChange={(e) => handleChange('upstream', e.target.value)}
            placeholder="https://api.example.com"
            helperText="Target upstream server URL"
            required
            fullWidth
          />

          <FormControl fullWidth>
            <InputLabel>HTTP Methods</InputLabel>
            <Select
              multiple
              value={formData.methods}
              onChange={handleMethodsChange}
              input={<OutlinedInput label="HTTP Methods" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {HTTP_METHODS.map((method) => (
                <MenuItem key={method} value={method}>
                  {method}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={rateLimitEnabled}
                onChange={(e) => handleRateLimitToggle(e.target.checked)}
              />
            }
            label="Enable Rate Limiting"
          />

          {rateLimitEnabled && formData.rateLimit && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Requests"
                type="number"
                value={formData.rateLimit.requests}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    rateLimit: { ...prev.rateLimit!, requests: parseInt(e.target.value) || 0 },
                  }))
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="Window"
                value={formData.rateLimit.window}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    rateLimit: { ...prev.rateLimit!, window: e.target.value },
                  }))
                }
                placeholder="60s"
                helperText="e.g., 60s, 1m, 1h"
                sx={{ flex: 1 }}
              />
            </Box>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={circuitBreakerEnabled}
                onChange={(e) => handleCircuitBreakerToggle(e.target.checked)}
              />
            }
            label="Enable Circuit Breaker"
          />

          {circuitBreakerEnabled && formData.circuitBreaker && (
            <TextField
              label="Failure Threshold"
              type="number"
              value={formData.circuitBreaker.threshold}
              onChange={(e) =>
                setFormData(prev => ({
                  ...prev,
                  circuitBreaker: { ...prev.circuitBreaker!, threshold: parseInt(e.target.value) || 0 },
                }))
              }
              helperText="Number of failures before opening circuit"
              fullWidth
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button 
          onClick={() => onClose(false)} 
          disabled={saving}
          data-testid="cancel-button"
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={saving}
          data-testid="save-button"
        >
          {saving ? 'Saving...' : route ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RouteDialog;
