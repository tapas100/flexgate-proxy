import React from 'react';
import { Box, Container } from '@mui/material';
import OAuthProviderList from '../components/OAuth/OAuthProviderList';
import Breadcrumb from '../components/Common/Breadcrumb';

const OAuthProviders: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Breadcrumb
          items={[
            { label: 'Settings', path: '/settings' },
            { label: 'Authentication', path: '/settings/authentication' },
            { label: 'OAuth Providers' },
          ]}
        />
        <OAuthProviderList />
      </Box>
    </Container>
  );
};

export default OAuthProviders;
