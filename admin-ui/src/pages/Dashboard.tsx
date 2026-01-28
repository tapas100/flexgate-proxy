import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Error,
} from '@mui/icons-material';

interface StatsCard {
  title: string;
  value: string | number;
  icon: React.ReactElement;
  color: string;
}

const Dashboard: React.FC = () => {
  const stats: StatsCard[] = [
    {
      title: 'Total Requests',
      value: '1.2M',
      icon: <TrendingUp />,
      color: '#1976d2',
    },
    {
      title: 'Avg Response Time',
      value: '45ms',
      icon: <Speed />,
      color: '#2e7d32',
    },
    {
      title: 'Success Rate',
      value: '99.9%',
      icon: <CheckCircle />,
      color: '#ed6c02',
    },
    {
      title: 'Error Rate',
      value: '0.1%',
      icon: <Error />,
      color: '#d32f2f',
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Welcome to FlexGate Admin Dashboard
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 3, mb: 3 }}>
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    {stat.title}
                  </Typography>
                  <Typography variant="h4">{stat.value}</Typography>
                </Box>
                <Box
                  sx={{
                    color: stat.color,
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 40,
                  }}
                >
                  {stat.icon}
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Quick Start
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • Configure your first route in the Routes section
          <br />
          • Monitor real-time metrics in the Metrics dashboard
          <br />
          • View system logs in the Logs section
          <br />
          • Adjust settings in the Settings page
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;
