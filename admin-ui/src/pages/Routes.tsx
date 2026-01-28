import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Routes: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Routes
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Route management will be implemented in the next feature.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Routes;
