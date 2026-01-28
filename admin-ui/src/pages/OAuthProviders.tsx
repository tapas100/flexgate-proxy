import React from 'react';
import { Box, Container } from '@mui/material';
import OAuthProviderList from '../components/OAuth/OAuthProviderList';

const OAuthProviders: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <OAuthProviderList />
      </Box>
    </Container>
  );
};

export default OAuthProviders;
