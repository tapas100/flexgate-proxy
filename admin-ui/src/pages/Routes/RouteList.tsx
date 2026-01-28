import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Chip,
  Switch,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { Route } from '../../types';
import { routeService } from '../../services/routes';
import RouteDialog from './RouteDialog';
import DeleteDialog from './DeleteDialog';

const RouteList: React.FC = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  // Load routes on mount
  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = async () => {
    setLoading(true);
    setError(null);

    const response = await routeService.getRoutes();

    if (response.success && response.data) {
      setRoutes(response.data);
    } else {
      setError(response.error || 'Failed to load routes');
    }

    setLoading(false);
  };

  const handleCreate = () => {
    setSelectedRoute(null);
    setDialogOpen(true);
  };

  const handleEdit = (route: Route) => {
    setSelectedRoute(route);
    setDialogOpen(true);
  };

  const handleDelete = (route: Route) => {
    setSelectedRoute(route);
    setDeleteDialogOpen(true);
  };

  const handleDialogClose = (saved: boolean) => {
    setDialogOpen(false);
    setSelectedRoute(null);
    if (saved) {
      loadRoutes();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRoute) return;

    const response = await routeService.deleteRoute(selectedRoute.id);

    if (response.success) {
      setDeleteDialogOpen(false);
      setSelectedRoute(null);
      loadRoutes();
    } else {
      setError(response.error || 'Failed to delete route');
    }
  };

  const handleToggle = async (route: Route) => {
    const response = await routeService.toggleRoute(route.id, !route.enabled);

    if (response.success) {
      loadRoutes();
    } else {
      setError(response.error || 'Failed to toggle route');
    }
  };

  // Filter routes by search term
  const filteredRoutes = routes.filter(route =>
    route.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.upstream.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Routes</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
        >
          Create Route
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField
          fullWidth
          placeholder="Search routes by path or upstream..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Path</TableCell>
              <TableCell>Upstream</TableCell>
              <TableCell>Methods</TableCell>
              <TableCell>Rate Limit</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRoutes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    {searchTerm ? 'No routes match your search' : 'No routes configured. Click "Create Route" to get started.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredRoutes.map((route) => (
                <TableRow key={route.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {route.path}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" noWrap sx={{ maxWidth: 300 }}>
                      {route.upstream}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {route.methods.map((method) => (
                        <Chip key={method} label={method} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {route.rateLimit ? (
                      <Typography variant="body2">
                        {route.rateLimit.requests}/{route.rateLimit.window}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        None
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={route.enabled}
                      onChange={() => handleToggle(route)}
                      color="primary"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(route)}
                      title="Edit route"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(route)}
                      title="Delete route"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <RouteDialog
        open={dialogOpen}
        route={selectedRoute}
        onClose={handleDialogClose}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        routePath={selectedRoute?.path || ''}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
};

export default RouteList;
