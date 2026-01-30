import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Stack,
} from '@mui/material';
import { authService } from '../../services/auth';
import { oauthService } from '../../services/oauth';
import type { OAuthProvider } from '../../types';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOAuthProviders] = useState<OAuthProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  useEffect(() => {
    // Fetch enabled OAuth providers
    const fetchProviders = async () => {
      const result = await oauthService.fetchProviders();
      if (result.success && result.data) {
        // Only show enabled providers
        const enabledProviders = result.data.filter(p => p.enabled);
        setOAuthProviders(enabledProviders);
      }
      setProvidersLoading(false);
    };

    fetchProviders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await authService.login({ email, password });

      if (response.success) {
        // Redirect to dashboard on successful login
        navigate('/dashboard');
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSSOLogin = async () => {
    setError(null);
    setSsoLoading(true);

    try {
      const returnUrl = window.location.origin + '/auth/callback';
      const ssoResponse = await authService.initiateSSOLogin(returnUrl);

      // Redirect to IdP login page
      window.location.href = ssoResponse.redirectUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate SSO login');
      setSsoLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError(null);
    setSsoLoading(true);

    try {
      // Redirect to OAuth provider authorization URL
      const returnUrl = window.location.origin + '/auth/callback';
      const authUrl = `${provider.authorizationUrl}?client_id=${provider.clientId}&redirect_uri=${provider.redirectUri}&response_type=code&state=${returnUrl}`;
      
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message || `Failed to login with ${provider.name}`);
      setSsoLoading(false);
    }
  };

  const getProviderIcon = (type: string) => {
    const icons: Record<string, string> = {
      google: '🔵',
      github: '⚫',
      microsoft: '🔷',
      okta: '🔶',
      auth0: '🔴',
      keycloak: '🟢',
    };
    return icons[type.toLowerCase()] || '🔐';
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            FlexGate
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Sign in to your account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoComplete="email"
              autoFocus
              disabled={loading}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              autoComplete="current-password"
              disabled={loading}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading || ssoLoading}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
          </form>

          {/* OAuth Providers Section */}
          {!providersLoading && oauthProviders.length > 0 && (
            <>
              <Divider sx={{ my: 2 }}>OR</Divider>

              <Stack spacing={1.5}>
                {oauthProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    fullWidth
                    variant="outlined"
                    size="large"
                    onClick={() => handleOAuthLogin(provider)}
                    disabled={loading || ssoLoading}
                    startIcon={
                      <span style={{ fontSize: '1.2em' }}>
                        {getProviderIcon(provider.type)}
                      </span>
                    }
                    sx={{
                      justifyContent: 'flex-start',
                      px: 2,
                      textTransform: 'none',
                    }}
                  >
                    Continue with {provider.name}
                  </Button>
                ))}
              </Stack>

              <Divider sx={{ my: 2 }} />
            </>
          )}

          {/* Legacy Enterprise SSO Button */}
          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={handleSSOLogin}
            disabled={loading || ssoLoading}
            sx={{ mb: 2 }}
          >
            {ssoLoading ? <CircularProgress size={24} /> : 'Login with Enterprise SSO'}
          </Button>

          <Typography variant="body2" color="text.secondary" align="center">
            Demo credentials: admin@flexgate.dev / admin123
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
