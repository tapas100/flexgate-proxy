import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Logs: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Logs
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Log viewer will be implemented in upcoming features.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Logs;
