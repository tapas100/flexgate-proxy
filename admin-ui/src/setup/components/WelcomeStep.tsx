/**
 * WelcomeStep  — Stage 7
 *
 * Step 0 of the setup wizard.
 * Shows a hero headline and a single "Start" CTA.
 *
 * Stage 7 additions:
 *  - isDevMode prop: shows a "Dev mode — no auth required" notice
 *  - Feature pill updates to reflect dev-mode behaviour
 *
 * Isolation contract:
 *   - No imports from existing app code outside src/setup/.
 *   - Self-contained MUI layout, no Sidebar, no Layout wrapper.
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Alert,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BugReportIcon from '@mui/icons-material/BugReport';
import type { WelcomeFormState } from '../hooks/useSetup';

interface WelcomeStepProps {
  form: WelcomeFormState;
  onChange: React.Dispatch<React.SetStateAction<WelcomeFormState>>;
  onNext: () => void;
  /** True when running on localhost — shows dev-mode notice. */
  isDevMode?: boolean;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext, isDevMode }) => {
  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        py: { xs: 2, sm: 4 },
        px: 1,
      }}
    >
      {/* Icon badge */}
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '20px',
          bgcolor: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          mb: 4,
          boxShadow: '0 8px 24px rgba(25,118,210,0.30)',
        }}
      >
        <BoltIcon sx={{ fontSize: 38 }} />
      </Box>

      {/* Headline */}
      <Typography
        variant="h4"
        fontWeight={800}
        letterSpacing={-0.5}
        sx={{ mb: 2, lineHeight: 1.2 }}
      >
        Set up your API gateway
        <br />
        in 60 seconds
      </Typography>

      {/* Sub-copy */}
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ maxWidth: 400, mb: 4, lineHeight: 1.7 }}
      >
        Configure a proxy route, test connectivity end-to-end, and land in your
        dashboard — all without writing a single line of config.
      </Typography>

      {/* Dev-mode notice */}
      {isDevMode && (
        <Alert
          icon={<BugReportIcon fontSize="small" />}
          severity="info"
          variant="outlined"
          sx={{ mb: 4, maxWidth: 420, textAlign: 'left', fontSize: 13 }}
        >
          <strong>Dev mode detected</strong> — running on localhost.
          Authentication is skipped, API stubs are used for missing endpoints,
          and the wizard auto-completes without a live backend.
        </Alert>
      )}

      {/* Feature pills */}
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        justifyContent="center"
        sx={{ mb: 5, gap: 1 }}
      >
        {[
          '⚡  1-minute setup',
          isDevMode ? '🔓  No auth (dev)' : '🔒  No auth required',
          '📊  Live metrics',
        ].map((label) => (
          <Box
            key={label}
            sx={{
              px: 2,
              py: 0.75,
              bgcolor: isDevMode && label.includes('dev') ? 'warning.50' : 'grey.100',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              color: isDevMode && label.includes('dev') ? 'warning.dark' : 'text.secondary',
              border: '1px solid',
              borderColor: isDevMode && label.includes('dev') ? 'warning.200' : 'transparent',
            }}
          >
            {label}
          </Box>
        ))}
      </Stack>

      {/* CTA */}
      <Button
        variant="contained"
        size="large"
        endIcon={<ArrowForwardIcon />}
        onClick={onNext}
        data-testid="setup-welcome-next"
        sx={{
          px: 5,
          py: 1.5,
          fontSize: 16,
          fontWeight: 700,
          borderRadius: 2,
          boxShadow: '0 4px 16px rgba(25,118,210,0.35)',
          '&:hover': { boxShadow: '0 6px 20px rgba(25,118,210,0.45)' },
        }}
      >
        Start
      </Button>

      <Typography variant="caption" color="text.disabled" sx={{ mt: 2 }}>
        {isDevMode
          ? 'Dev mode · localhost · No credentials needed'
          : 'Takes about 60 seconds · No credit card needed'}
      </Typography>
    </Box>
  );
};

export default WelcomeStep;
