import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import OAuthProviderList from '../components/OAuth/OAuthProviderList';
import Breadcrumb from '../components/Common/Breadcrumb';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      path: '/settings/authentication',
      label: 'Authentication',
      icon: <SecurityIcon />,
      description: 'Manage OAuth providers and SSO settings',
    },
    {
      path: '/settings/notifications',
      label: 'Notifications',
      icon: <NotificationsIcon />,
      description: 'Configure notification preferences',
    },
    {
      path: '/settings/general',
      label: 'General',
      icon: <SettingsIcon />,
      description: 'General system settings',
    },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <Box>
      <Routes>
        {/* Settings Index - Show menu */}
        <Route
          path="/"
          element={
            <>
              <Typography variant="h4" gutterBottom>
                Settings
              </Typography>
              <Paper sx={{ mt: 2 }}>
                <List>
                  {menuItems.map((item, index) => (
                    <React.Fragment key={item.path}>
                      {index > 0 && <Divider />}
                      <ListItem disablePadding>
                        <ListItemButton
                          onClick={() => navigate(item.path)}
                          selected={isActive(item.path)}
                        >
                          <ListItemIcon>{item.icon}</ListItemIcon>
                          <ListItemText
                            primary={item.label}
                            secondary={item.description}
                          />
                        </ListItemButton>
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              </Paper>
            </>
          }
        />

        {/* Authentication Section */}
        <Route
          path="/authentication"
          element={
            <>
              <Breadcrumb
                items={[
                  { label: 'Settings', path: '/settings' },
                  { label: 'Authentication' },
                ]}
              />
              <Typography variant="h4" gutterBottom>
                Authentication
              </Typography>
              <Paper sx={{ p: 3, mt: 2 }}>
                <Typography variant="h6" gutterBottom>
                  OAuth Providers
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Configure OAuth 2.0 and OpenID Connect providers for SSO authentication
                </Typography>
                <OAuthProviderList />
              </Paper>
            </>
          }
        />

        {/* Notifications Section */}
        <Route
          path="/notifications"
          element={
            <>
              <Breadcrumb
                items={[
                  { label: 'Settings', path: '/settings' },
                  { label: 'Notifications' },
                ]}
              />
              <Typography variant="h4" gutterBottom>
                Notifications
              </Typography>
              <Paper sx={{ p: 3, mt: 2 }}>
                <Typography variant="body1" color="text.secondary">
                  Notification settings will be implemented in upcoming features.
                </Typography>
              </Paper>
            </>
          }
        />

        {/* General Section */}
        <Route
          path="/general"
          element={
            <>
              <Breadcrumb
                items={[
                  { label: 'Settings', path: '/settings' },
                  { label: 'General' },
                ]}
              />
              <Typography variant="h4" gutterBottom>
                General Settings
              </Typography>
              <Paper sx={{ p: 3, mt: 2 }}>
                <Typography variant="body1" color="text.secondary">
                  General settings will be implemented in upcoming features.
                </Typography>
              </Paper>
            </>
          }
        />

        {/* Default redirect to authentication */}
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </Box>
  );
};

export default Settings;
