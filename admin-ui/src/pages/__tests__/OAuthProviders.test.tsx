// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import OAuthProviders from '../OAuthProviders';
import { oauthService } from '../services/oauth';

// Mock the OAuth service
jest.mock('../services/oauth', () => ({
  oauthService: {
    fetchProviders: jest.fn(),
    createProvider: jest.fn(),
    updateProvider: jest.fn(),
    deleteProvider: jest.fn(),
    toggleProvider: jest.fn(),
    testConnection: jest.fn(),
  },
}));

const mockProviders = [
  {
    id: 'oauth-1',
    name: 'Google SSO',
    type: 'google',
    enabled: true,
    clientId: '1234567890-abc.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-abc123',
    redirectUri: 'https://api.example.com/auth/google/callback',
    scopes: ['openid', 'email', 'profile'],
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v1/userinfo',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stats: {
      totalLogins: 1234,
      lastLogin: Date.now() - 2 * 60 * 60 * 1000,
      errorRate: 0.2,
      avgResponseTime: 350,
      successfulLogins24h: 45,
      failedLogins24h: 1,
    },
  },
  {
    id: 'oauth-2',
    name: 'GitHub OAuth',
    type: 'github',
    enabled: false,
    clientId: 'Iv1.1234567890abcdef',
    clientSecret: 'github-secret-123',
    redirectUri: 'https://api.example.com/auth/github/callback',
    scopes: ['read:user', 'user:email'],
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userInfoEndpoint: 'https://api.github.com/user',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stats: {
      totalLogins: 856,
      lastLogin: Date.now() - 5 * 60 * 1000,
      errorRate: 0.5,
      avgResponseTime: 280,
      successfulLogins24h: 32,
      failedLogins24h: 2,
    },
  },
];

describe('OAuthProviders Page Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (oauthService.fetchProviders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockProviders,
    });
  });

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <OAuthProviders />
      </BrowserRouter>
    );
  };

  it('should load and display OAuth providers page', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
      expect(screen.getByText('GitHub OAuth')).toBeInTheDocument();
    });
  });

  it('should complete add provider flow', async () => {
    const newProvider = {
      id: 'oauth-3',
      name: 'Microsoft Azure',
      type: 'microsoft',
      enabled: false,
      clientId: 'microsoft-client-id',
      clientSecret: 'microsoft-secret',
      redirectUri: 'https://api.example.com/auth/microsoft/callback',
      scopes: ['openid', 'email'],
      authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: {
        totalLogins: 0,
        lastLogin: null,
        errorRate: 0,
        avgResponseTime: 0,
        successfulLogins24h: 0,
        failedLogins24h: 0,
      },
    };

    (oauthService.createProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: newProvider,
    });

    (oauthService.fetchProviders as jest.Mock)
      .mockResolvedValueOnce({ success: true, data: mockProviders })
      .mockResolvedValueOnce({ success: true, data: [...mockProviders, newProvider] });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
    });

    // Click Add Provider button
    const addButton = screen.getByText('Add Provider');
    fireEvent.click(addButton);

    // Fill in dialog
    await waitFor(() => {
      expect(screen.getByText(/add oauth provider/i)).toBeInTheDocument();
    });

    // Select provider type
    const typeSelect = screen.getByLabelText(/provider type/i);
    fireEvent.mouseDown(typeSelect);
    const microsoftOption = await screen.findByText('Microsoft');
    fireEvent.click(microsoftOption);

    // Fill in form fields
    await user.type(screen.getByLabelText(/display name/i), 'Microsoft Azure');
    await user.type(screen.getByLabelText(/client id/i), 'microsoft-client-id');
    await user.type(screen.getByLabelText(/client secret/i), 'microsoft-secret');
    await user.type(screen.getByLabelText(/scopes/i), 'openid, email');

    // Save
    const saveButton = screen.getByText(/^add$/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(oauthService.createProvider).toHaveBeenCalled();
    });

    // Verify new provider appears in list
    await waitFor(() => {
      expect(screen.getByText('Microsoft Azure')).toBeInTheDocument();
    });
  });

  it('should complete edit provider flow', async () => {
    const updatedProvider = {
      ...mockProviders[0],
      name: 'Google SSO Updated',
    };

    (oauthService.updateProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: updatedProvider,
    });

    (oauthService.fetchProviders as jest.Mock)
      .mockResolvedValueOnce({ success: true, data: mockProviders })
      .mockResolvedValueOnce({
        success: true,
        data: [updatedProvider, mockProviders[1]],
      });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
    });

    // Click edit button on first provider
    const editButtons = screen.getAllByLabelText(/edit provider/i);
    fireEvent.click(editButtons[0]);

    // Wait for dialog
    await waitFor(() => {
      expect(screen.getByText(/edit oauth provider/i)).toBeInTheDocument();
    });

    // Update name
    const nameInput = screen.getByDisplayValue('Google SSO');
    await user.clear(nameInput);
    await user.type(nameInput, 'Google SSO Updated');

    // Save
    const saveButton = screen.getByText(/update/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(oauthService.updateProvider).toHaveBeenCalledWith(
        'oauth-1',
        expect.objectContaining({ name: 'Google SSO Updated' })
      );
    });

    // Verify updated name appears
    await waitFor(() => {
      expect(screen.getByText('Google SSO Updated')).toBeInTheDocument();
    });
  });

  it('should complete delete provider flow', async () => {
    global.confirm = jest.fn().mockReturnValue(true);

    (oauthService.deleteProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: undefined,
    });

    (oauthService.fetchProviders as jest.Mock)
      .mockResolvedValueOnce({ success: true, data: mockProviders })
      .mockResolvedValueOnce({ success: true, data: [mockProviders[1]] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = screen.getAllByLabelText(/delete provider/i);
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalled();

    await waitFor(() => {
      expect(oauthService.deleteProvider).toHaveBeenCalledWith('oauth-1');
    });

    // Verify provider is removed
    await waitFor(() => {
      expect(screen.queryByText('Google SSO')).not.toBeInTheDocument();
      expect(screen.getByText('GitHub OAuth')).toBeInTheDocument();
    });
  });

  it('should complete toggle enable/disable flow', async () => {
    const toggledProvider = {
      ...mockProviders[1],
      enabled: true,
    };

    (oauthService.toggleProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: toggledProvider,
    });

    (oauthService.fetchProviders as jest.Mock)
      .mockResolvedValueOnce({ success: true, data: mockProviders })
      .mockResolvedValueOnce({
        success: true,
        data: [mockProviders[0], toggledProvider],
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('GitHub OAuth')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    // Toggle the disabled provider (GitHub)
    const switches = screen.getAllByRole('checkbox');
    fireEvent.click(switches[1]); // Second switch (GitHub)

    await waitFor(() => {
      expect(oauthService.toggleProvider).toHaveBeenCalledWith('oauth-2', true);
    });

    // Verify provider is now enabled
    await waitFor(() => {
      const enabledChips = screen.getAllByText('Enabled');
      expect(enabledChips).toHaveLength(2); // Both providers enabled now
    });
  });

  it('should complete test connection flow', async () => {
    (oauthService.testConnection as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        message: 'Connection successful',
        responseTime: 250,
      },
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
    });

    // Open edit dialog
    const editButtons = screen.getAllByLabelText(/edit provider/i);
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/edit oauth provider/i)).toBeInTheDocument();
    });

    // Click test connection
    const testButton = screen.getByText(/test connection/i);
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(oauthService.testConnection).toHaveBeenCalled();
      expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    (oauthService.fetchProviders as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to load OAuth providers',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when no providers configured', async () => {
    (oauthService.fetchProviders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no oauth providers configured/i)).toBeInTheDocument();
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
  });
});
