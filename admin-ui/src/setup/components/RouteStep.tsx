/**
 * RouteStep  — Stage 7
 *
 * Step 1 of the setup wizard.
 * Pre-filled route config + POST /api/routes.
 *
 * Stage 7 additions:
 *  - isDevMode prop: shows "API stub in dev" notice when 404 is expected
 *  - touched state per field: errors shown only after user interaction
 *  - button disabled during save + clear disabled reason tooltip
 *
 * Isolation contract:
 *   - No imports from existing app code outside src/setup/.
 *   - Self-contained MUI layout, no Sidebar, no Layout wrapper.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Paper,
  Alert,
  CircularProgress,
  InputAdornment,
  Chip,
  Tooltip,
} from '@mui/material';
import RouteIcon from '@mui/icons-material/Route';
import ScienceIcon from '@mui/icons-material/Science';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { RouteFormState } from '../hooks/useSetup';

interface RouteStepProps {
  form: RouteFormState;
  onChange: React.Dispatch<React.SetStateAction<RouteFormState>>;
  onSave: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
  saveLoading: boolean;
  saveError: string | null;
  savedRouteId: string | null;
  /** True when running on localhost — shows dev-mode stub note. */
  isDevMode?: boolean;
}

const RouteStep: React.FC<RouteStepProps> = ({
  form,
  onChange,
  onSave,
  onNext,
  onBack,
  saveLoading,
  saveError,
  savedRouteId,
  isDevMode,
}) => {
  // Show field errors only after the user has touched each field.
  const [touched, setTouched] = useState({ routePath: false, upstreamUrl: false });

  const isPathValid = form.routePath.trim().length > 0 && form.routePath.trim().startsWith('/');
  const isUpstreamValid = (() => {
    try { new URL(form.upstreamUrl); return true; }
    catch { return false; }
  })();
  const isFormValid = isPathValid && isUpstreamValid;

  const handleChange =
    (field: keyof RouteFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleBlur = (field: 'routePath' | 'upstreamUrl') => () =>
    setTouched((t) => ({ ...t, [field]: true }));

  const handleSaveAndTest = async () => {
    // Mark both fields touched so errors appear if still invalid.
    setTouched({ routePath: true, upstreamUrl: true });
    if (!isFormValid) return;
    if (!savedRouteId) {
      await onSave();
      // onSave throws on error → don't advance
    }
    onNext();
  };

  // Tooltip shown on disabled button.
  const disabledReason = !isPathValid
    ? 'Route path must start with /'
    : !isUpstreamValid
    ? 'Enter a valid upstream URL'
    : '';

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: 'secondary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
          }}
        >
          <RouteIcon />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1.3}>
            Set up your first route
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Map an incoming path to an upstream service. Pre-filled with a working example.
          </Typography>
        </Box>
      </Box>

      {isDevMode && (
        <Alert
          icon={<InfoOutlinedIcon fontSize="small" />}
          severity="info"
          variant="outlined"
          sx={{ mt: 2, mb: 1, fontSize: 13 }}
        >
          <strong>Dev mode:</strong> If <code>/api/routes</code> returns 404,
          the wizard advances anyway — route creation is stubbed locally.
        </Alert>
      )}

      <Box sx={{ my: 2 }} />

      <Stack spacing={3}>
        {/* Path */}
        <TextField
          label="Route path"
          value={form.routePath}
          onChange={handleChange('routePath')}
          onBlur={handleBlur('routePath')}
          fullWidth
          required
          error={touched.routePath && !isPathValid}
          helperText={
            touched.routePath && !isPathValid
              ? '⚠ Path must start with /'
              : 'Incoming requests matching this prefix are forwarded upstream.'
          }
          FormHelperTextProps={{
            sx: touched.routePath && !isPathValid ? { color: 'error.main', fontWeight: 500 } : {},
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                  GET
                </Typography>
              </InputAdornment>
            ),
          }}
          inputProps={{ 'data-testid': 'setup-route-path', style: { fontFamily: 'monospace' } }}
        />

        {/* Upstream */}
        <TextField
          label="Upstream URL"
          value={form.upstreamUrl}
          onChange={handleChange('upstreamUrl')}
          onBlur={handleBlur('upstreamUrl')}
          fullWidth
          required
          error={touched.upstreamUrl && !isUpstreamValid}
          helperText={
            touched.upstreamUrl && !isUpstreamValid
              ? '⚠ Enter a valid URL (e.g. https://api.example.com)'
              : 'The service FlexGate will proxy matching requests to.'
          }
          FormHelperTextProps={{
            sx: touched.upstreamUrl && !isUpstreamValid
              ? { color: 'error.main', fontWeight: 500 }
              : {},
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Typography variant="caption" color="text.secondary">→</Typography>
              </InputAdornment>
            ),
          }}
          inputProps={{ 'data-testid': 'setup-upstream-url', style: { fontFamily: 'monospace' } }}
        />

        {/* Live preview */}
        {isFormValid && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Preview
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <Chip label="GET" size="small" color="primary" variant="outlined" />
              <Typography variant="body2" fontFamily="monospace" color="text.primary">
                {form.routePath}
              </Typography>
              <Typography variant="body2" color="text.secondary">→</Typography>
              <Typography
                variant="body2"
                fontFamily="monospace"
                color="text.secondary"
                sx={{ wordBreak: 'break-all' }}
              >
                {form.upstreamUrl}
              </Typography>
            </Stack>
          </Paper>
        )}
      </Stack>

      {/* API error */}
      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => {}}>
          <strong>Save failed:</strong> {saveError}
          {isDevMode && (
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              In dev mode this is expected if the backend isn't running — click
              "Save &amp; Test" again to proceed with a stub.
            </Typography>
          )}
        </Alert>
      )}

      {savedRouteId && (
        <Alert
          severity="success"
          icon={<CheckCircleOutlineIcon />}
          sx={{ mt: 2 }}
          data-testid="setup-route-saved"
        >
          Route saved{savedRouteId !== 'dev-stub' ? ` (ID: ${savedRouteId})` : ' (dev stub)'}
        </Alert>
      )}

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          disabled={saveLoading}
          data-testid="setup-route-back"
        >
          Back
        </Button>

        <Tooltip title={!saveLoading && !isFormValid ? disabledReason : ''} placement="top">
          {/* span needed so Tooltip works on a disabled button */}
          <span>
            <Button
              variant="contained"
              size="large"
              disabled={saveLoading}
              onClick={handleSaveAndTest}
              data-testid="setup-route-next"
              startIcon={
                saveLoading
                  ? <CircularProgress size={18} color="inherit" />
                  : savedRouteId
                  ? <CheckCircleOutlineIcon />
                  : <ScienceIcon />
              }
              sx={{ minWidth: 160, fontWeight: 700 }}
            >
              {saveLoading ? 'Saving…' : savedRouteId ? 'Next' : 'Save & Test'}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default RouteStep;

