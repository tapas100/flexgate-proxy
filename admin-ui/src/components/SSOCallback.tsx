import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { authService } from '../services/auth';

/**
 * SSO Callback Component
 * Handles SAML response from IdP and completes authentication
 */
const SSOCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get SAMLResponse from URL params
        const samlResponse = searchParams.get('SAMLResponse');
        const relayState = searchParams.get('RelayState');

        if (!samlResponse) {
          setError('Missing SAML response from identity provider');
          return;
        }

        // Send SAML response to backend for validation
        const response = await authService.handleSSOCallback(samlResponse, relayState || undefined);

        if (response.success) {
          // Store session token
          localStorage.setItem('authToken', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));

          // Redirect to original destination or dashboard
          const redirectTo = relayState || '/';
          navigate(redirectTo);
        } else {
          setError(response.message || 'Authentication failed');
        }
      } catch (err: any) {
        console.error('SSO callback error:', err);
        setError(err.message || 'An unexpected error occurred during authentication');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        p={3}
      >
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          <Typography variant="h6" gutterBottom>
            Authentication Error
          </Typography>
          <Typography variant="body2">{error}</Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
    >
      <CircularProgress size={60} />
      <Typography variant="h6" sx={{ mt: 3 }}>
        Completing authentication...
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Please wait while we verify your credentials
      </Typography>
    </Box>
  );
};

export default SSOCallback;
