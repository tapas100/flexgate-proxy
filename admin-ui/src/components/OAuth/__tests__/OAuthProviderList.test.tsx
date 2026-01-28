// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OAuthProviderList from '../OAuthProviderList';
import { oauthService } from '../../../services/oauth';

// Mock the OAuth service
jest.mock('../../../services/oauth', () => ({
  oauthService: {
    fetchProviders: jest.fn(),
    deleteProvider: jest.fn(),
    toggleProvider: jest.fn(),
  },
}));

const mockProviders = [
  {
    id: 'oauth-1',
    name: 'Google SSO',
    type: 'google',
    enabled: true,
    clientId: '1234567890-abc.apps.googleusercontent.com',
    redirectUri: 'https://api.example.com/auth/google/callback',
    scopes: ['openid', 'email', 'profile'],
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
    redirectUri: 'https://api.example.com/auth/github/callback',
    scopes: ['read:user', 'user:email'],
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
  },
];

describe('OAuthProviderList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (oauthService.fetchProviders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockProviders,
    });
  });

  it('should render loading state initially', () => {
    render(<OAuthProviderList />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should load and display OAuth providers', async () => {
    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
      expect(screen.getByText('GitHub OAuth')).toBeInTheDocument();
    });
  });

  it('should show Add Provider button', async () => {
    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
  });

  it('should show empty state when no providers', async () => {
    (oauthService.fetchProviders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText(/no oauth providers configured/i)).toBeInTheDocument();
    });
  });

  it('should handle fetch error', async () => {
    (oauthService.fetchProviders as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to load providers',
    });

    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it('should display provider stats', async () => {
    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText(/1,234.*logins/i)).toBeInTheDocument();
      expect(screen.getByText(/99.8%.*uptime/i)).toBeInTheDocument();
    });
  });

  it('should show enabled/disabled status', async () => {
    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('should toggle provider enabled state', async () => {
    (oauthService.toggleProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: { ...mockProviders[1], enabled: true },
    });

    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText('GitHub OAuth')).toBeInTheDocument();
    });

    // Find and click the toggle switch for GitHub provider
    const switches = screen.getAllByRole('checkbox');
    fireEvent.click(switches[1]); // Second provider (GitHub, currently disabled)

    await waitFor(() => {
      expect(oauthService.toggleProvider).toHaveBeenCalledWith('oauth-2', true);
    });
  });

  it('should delete provider with confirmation', async () => {
    global.confirm = jest.fn().mockReturnValue(true);
    (oauthService.deleteProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: undefined,
    });

    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
    });

    // Find and click delete button
    const deleteButtons = screen.getAllByLabelText(/delete provider/i);
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalled();

    await waitFor(() => {
      expect(oauthService.deleteProvider).toHaveBeenCalledWith('oauth-1');
    });
  });

  it('should cancel delete when not confirmed', async () => {
    global.confirm = jest.fn().mockReturnValue(false);

    render(<OAuthProviderList />);

    await waitFor(() => {
      expect(screen.getByText('Google SSO')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByLabelText(/delete provider/i);
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalled();
    expect(oauthService.deleteProvider).not.toHaveBeenCalled();
  });
});
