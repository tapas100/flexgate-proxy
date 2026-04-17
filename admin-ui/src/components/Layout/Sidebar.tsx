import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Chip,
  Typography,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Route as RouteIcon,
  ShowChart as MetricsIcon,
  Description as LogsIcon,
  Webhook as WebhookIcon,
  Settings as SettingsIcon,
  Build as TroubleshootingIcon,
  Psychology as AIIcon,
  ReportProblem as IncidentIcon,
  BarChart as AnalyticsIcon,
  Speed as BenchmarkIcon,
  StarBorder as UpgradeIcon,
} from '@mui/icons-material';
import { useMode } from '../../context/ModeContext';
import { useUpgrade } from '../../hooks/useUpgrade';

const DRAWER_WIDTH = 240;

// ── Menu item type ────────────────────────────────────────────────────────────

interface MenuItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  /** Optional badge shown to the right of the label (e.g. "Full only"). */
  badge?: string;
}

// ── Lite mode nav ─────────────────────────────────────────────────────────────

/**
 * Lite (benchmark) mode — focused 3-item list.
 * - Dashboard: home hub with live stats, inline test + route summary
 * - Benchmarks: the core Lite feature (scenario charts, latency, etc.)
 * - Routes: read-only view of active proxy routes with upgrade CTA
 * "Test" is intentionally omitted — it's already a panel on the Dashboard.
 */
const LITE_MENU: MenuItem[] = [
  { text: 'Dashboard',  icon: <DashboardIcon />, path: '/lite'         },
  { text: 'Benchmarks', icon: <BenchmarkIcon />, path: '/benchmarks'   },
  { text: 'Routes',     icon: <RouteIcon />,     path: '/routes/lite'  },
];

// Lite bottom: no Settings — /settings is Full-only and would silently
// redirect back to /lite. The "Upgrade to Full" strip (rendered inline
// in the Sidebar component) is the only bottom action Lite users need.
const LITE_BOTTOM: MenuItem[] = [];

// ── Full mode nav ─────────────────────────────────────────────────────────────

const FULL_MENU: MenuItem[] = [
  { text: 'Dashboard',    icon: <DashboardIcon />, path: '/dashboard'    },
  { text: 'Routes',       icon: <RouteIcon />,     path: '/routes'       },
  { text: 'Metrics',      icon: <MetricsIcon />,   path: '/metrics'      },
  { text: 'Logs',         icon: <LogsIcon />,      path: '/logs'         },
  { text: 'Webhooks',     icon: <WebhookIcon />,   path: '/webhooks'     },
  { text: 'AI Incidents', icon: <IncidentIcon />,  path: '/ai-incidents' },
  { text: 'AI Analytics', icon: <AnalyticsIcon />, path: '/ai-analytics' },
  { text: 'Benchmarks',   icon: <BenchmarkIcon />, path: '/benchmarks'   },
];

const FULL_BOTTOM: MenuItem[] = [
  { text: 'AI Testing',      icon: <AIIcon />,              path: '/ai-testing'      },
  { text: 'Troubleshooting', icon: <TroubleshootingIcon />, path: '/troubleshooting' },
  { text: 'Settings',        icon: <SettingsIcon />,        path: '/settings'        },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLite, isResolved } = useMode();
  const { upgrade, upgrading } = useUpgrade();

  // Pick the right nav lists for this mode.
  // While mode is still resolving (unknown) fall back to full list so nothing
  // disappears on first render.
  const mainItems  = isLite ? LITE_MENU   : FULL_MENU;
  const bottomItems = isLite ? LITE_BOTTOM : FULL_BOTTOM;

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(path + '/'));

  const renderItem = (item: MenuItem) => (
    <ListItem key={item.text} disablePadding>
      <ListItemButton
        selected={isActive(item.path)}
        onClick={() => navigate(item.path)}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
        <ListItemText primary={item.text} />
        {item.badge && (
          <Chip
            label={item.badge}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: 10, ml: 0.5 }}
          />
        )}
      </ListItemButton>
    </ListItem>
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Toolbar />

      {/* Mode badge — shows current mode at a glance */}
      {isResolved && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Chip
            label={isLite ? 'Lite Mode' : 'Full Mode'}
            size="small"
            color={isLite ? 'warning' : 'primary'}
            variant="outlined"
            sx={{ fontSize: 11, height: 20 }}
          />
        </Box>
      )}

      {/* Main nav */}
      <List disablePadding>
        {mainItems.map(renderItem)}
      </List>

      <Divider sx={{ mt: 'auto' }} />

      {/* Bottom nav */}
      <List disablePadding>
        {bottomItems.map(renderItem)}

        {/* Upgrade strip — Lite only */}
        {isResolved && isLite && (
          <>
            <Divider />
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => upgrade()}
                disabled={upgrading}
                sx={{
                  color: 'warning.dark',
                  '&:hover': { bgcolor: 'warning.light' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <UpgradeIcon sx={{ color: 'warning.dark' }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={700} color="warning.dark">
                      {upgrading ? 'Upgrading…' : 'Upgrade to Full'}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      Unlock all features
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          </>
        )}
      </List>
    </Drawer>
  );
};

export default Sidebar;
