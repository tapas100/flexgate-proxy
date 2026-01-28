import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { oauthService } from '../../services/oauth';
import type { OAuthProvider } from '../../types';
import OAuthProviderCard from './OAuthProviderCard';
import OAuthProviderDialog from './OAuthProviderDialog';

const OAuthProviderList: React.FC = () => {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    
    const result = await oauthService.fetchProviders();
    
    if (result.success && result.data) {
      setProviders(result.data);
    } else {
      setError(result.error || 'Failed to load OAuth providers');
    }
    
    setLoading(false);
  };

  const handleAddProvider = () => {
    setEditingProvider(null);
    setDialogOpen(true);
  };

  const handleEditProvider = (provider: OAuthProvider) => {
    setEditingProvider(provider);
    setDialogOpen(true);
  };

  const handleDeleteProvider = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this OAuth provider?')) {
      return;
    }

    const result = await oauthService.deleteProvider(id);
    
    if (result.success) {
      setProviders(providers.filter(p => p.id !== id));
    } else {
      setError(result.error || 'Failed to delete provider');
    }
  };

  const handleToggleProvider = async (id: string, enabled: boolean) => {
    const result = await oauthService.toggleProvider(id, enabled);
    
    if (result.success && result.data) {
      setProviders(providers.map(p => p.id === id ? result.data! : p));
    } else {
      setError(result.error || 'Failed to toggle provider');
    }
  };

  const handleDialogClose = (saved: boolean) => {
    setDialogOpen(false);
    setEditingProvider(null);
    
    if (saved) {
      fetchProviders();
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">OAuth Providers</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddProvider}
        >
          Add Provider
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {providers.length === 0 ? (
        <Alert severity="info">
          No OAuth providers configured. Click "Add Provider" to get started.
        </Alert>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {providers.map((provider) => (
            <OAuthProviderCard
              key={provider.id}
              provider={provider}
              onEdit={handleEditProvider}
              onDelete={handleDeleteProvider}
              onToggle={handleToggleProvider}
            />
          ))}
        </Box>
      )}

      <OAuthProviderDialog
        open={dialogOpen}
        provider={editingProvider}
        onClose={handleDialogClose}
      />
    </Box>
  );
};

export default OAuthProviderList;
