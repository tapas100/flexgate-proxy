import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Metrics: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Metrics
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Metrics dashboard will be implemented in upcoming features.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Metrics;
