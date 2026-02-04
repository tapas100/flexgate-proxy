import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  IconButton,
  Switch,
  Tooltip,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import type { OAuthProvider } from '../../types';
import { formatDistanceToNow } from 'date-fns';

interface OAuthProviderCardProps {
  provider: OAuthProvider;
  onEdit: (provider: OAuthProvider) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const OAuthProviderCard: React.FC<OAuthProviderCardProps> = ({
  provider,
  onEdit,
  onDelete,
  onToggle,
}) => {
  const getProviderIcon = (type: string): string => {
    const icons: Record<string, string> = {
      google: '🔵',
      github: '🐙',
      microsoft: '🟦',
      generic: '🔐',
    };
    return icons[type] || '🔐';
  };

  const getProviderColor = (type: string) => {
    const colors: Record<string, any> = {
      google: 'primary',
      github: 'default',
      microsoft: 'info',
      generic: 'secondary',
    };
    return colors[type] || 'default';
  };

  const formatUptime = (errorRate: number): string => {
    const uptime = 100 - errorRate;
    return `${uptime.toFixed(1)}% uptime`;
  };

  const maskClientId = (clientId: string): string => {
    if (clientId.length <= 6) return clientId;
    const visible = clientId.slice(-3);
    return `***************${visible}`;
  };

  return (
    <Card
      sx={{
        opacity: provider.enabled ? 1 : 0.6,
        transition: 'opacity 0.2s',
      }}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Typography variant="h6" component="span">
                {getProviderIcon(provider.type)} {provider.name}
              </Typography>
              <Chip
                label={provider.type}
                size="small"
                color={getProviderColor(provider.type)}
                variant="outlined"
              />
              {provider.enabled ? (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Enabled"
                  size="small"
                  color="success"
                  variant="outlined"
                />
              ) : (
                <Chip
                  icon={<ErrorIcon />}
                  label="Disabled"
                  size="small"
                  color="default"
                  variant="outlined"
                />
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" gutterBottom>
              Client ID: {maskClientId(provider.clientId)}
            </Typography>

            {provider.stats && provider.enabled && (
              <Box display="flex" gap={2} mt={1}>
                <Typography variant="body2" color="text.secondary">
                  <strong>{provider.stats.totalLogins.toLocaleString()}</strong> logins
                </Typography>
                {provider.stats.lastLogin && (
                  <Typography variant="body2" color="text.secondary">
                    Last: {formatDistanceToNow(provider.stats.lastLogin, { addSuffix: true })}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {formatUptime(provider.stats.errorRate)}
                </Typography>
              </Box>
            )}

            {!provider.enabled && (
              <Typography variant="body2" color="warning.main" mt={1}>
                Provider is disabled
              </Typography>
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title="Edit provider">
              <IconButton
                onClick={() => onEdit(provider)}
                size="small"
                color="primary"
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={provider.enabled ? 'Disable' : 'Enable'}>
              <Switch
                checked={provider.enabled}
                onChange={(e) => onToggle(provider.id, e.target.checked)}
                color="primary"
              />
            </Tooltip>

            <Tooltip title="Delete provider">
              <IconButton
                onClick={() => onDelete(provider.id)}
                size="small"
                color="error"
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default OAuthProviderCard;
