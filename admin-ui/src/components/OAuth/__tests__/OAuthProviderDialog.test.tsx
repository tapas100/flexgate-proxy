// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OAuthProviderDialog from '../OAuthProviderDialog';
import { oauthService } from '../../../services/oauth';

// Mock the OAuth service
jest.mock('../../../services/oauth', () => ({
  oauthService: {
    createProvider: jest.fn(),
    updateProvider: jest.fn(),
    testConnection: jest.fn(),
  },
}));

const mockExistingProvider = {
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
    totalLogins: 100,
    lastLogin: Date.now(),
    errorRate: 0.1,
    avgResponseTime: 200,
    successfulLogins24h: 10,
    failedLogins24h: 0,
  },
};

describe('OAuthProviderDialog', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render dialog when open', () => {
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    expect(screen.getByText(/add oauth provider/i)).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<OAuthProviderDialog open={false} onClose={mockOnClose} />);

    expect(screen.queryByText(/add oauth provider/i)).not.toBeInTheDocument();
  });

  it('should show edit mode for existing provider', () => {
    render(
      <OAuthProviderDialog
        open={true}
        provider={mockExistingProvider}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/edit oauth provider/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Google SSO')).toBeInTheDocument();
  });

  it('should auto-fill endpoints for Google provider type', async () => {
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    const typeSelect = screen.getByLabelText(/provider type/i);
    fireEvent.mouseDown(typeSelect);
    
    const googleOption = await screen.findByText('Google');
    fireEvent.click(googleOption);

    // Expand advanced settings to see endpoints
    const advancedSettings = screen.getByText(/advanced settings/i);
    fireEvent.click(advancedSettings);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/accounts.google.com/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/oauth2.googleapis.com/i)).toBeInTheDocument();
    });
  });

  it('should auto-fill endpoints for GitHub provider type', async () => {
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    const typeSelect = screen.getByLabelText(/provider type/i);
    fireEvent.mouseDown(typeSelect);
    
    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    const advancedSettings = screen.getByText(/advanced settings/i);
    fireEvent.click(advancedSettings);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/github.com.*authorize/i)).toBeInTheDocument();
    });
  });

  it('should auto-fill endpoints for Microsoft provider type', async () => {
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    const typeSelect = screen.getByLabelText(/provider type/i);
    fireEvent.mouseDown(typeSelect);
    
    const microsoftOption = await screen.findByText('Microsoft');
    fireEvent.click(microsoftOption);

    const advancedSettings = screen.getByText(/advanced settings/i);
    fireEvent.click(advancedSettings);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/login.microsoftonline.com/i)).toBeInTheDocument();
    });
  });

  it('should validate required fields', async () => {
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    const saveButton = screen.getByText(/^add$/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
  });

  it('should create provider on save', async () => {
    (oauthService.createProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'oauth-new', name: 'Test Provider' },
    });

    const user = userEvent.setup();
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    // Fill in form
    await user.type(screen.getByLabelText(/display name/i), 'Test Provider');
    await user.type(screen.getByLabelText(/client id/i), 'test-client-id');
    await user.type(screen.getByLabelText(/client secret/i), 'test-secret');
    await user.type(screen.getByLabelText(/scopes/i), 'openid, email');

    const saveButton = screen.getByText(/^add$/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(oauthService.createProvider).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalledWith(true);
    });
  });

  it('should update existing provider on save', async () => {
    (oauthService.updateProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: { ...mockExistingProvider, name: 'Updated Name' },
    });

    const user = userEvent.setup();
    render(
      <OAuthProviderDialog
        open={true}
        provider={mockExistingProvider}
        onClose={mockOnClose}
      />
    );

    const nameInput = screen.getByDisplayValue('Google SSO');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');

    const saveButton = screen.getByText(/update/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(oauthService.updateProvider).toHaveBeenCalledWith(
        'oauth-1',
        expect.objectContaining({ name: 'Updated Name' })
      );
      expect(mockOnClose).toHaveBeenCalledWith(true);
    });
  });

  it('should toggle client secret visibility', () => {
    render(
      <OAuthProviderDialog
        open={true}
        provider={mockExistingProvider}
        onClose={mockOnClose}
      />
    );

    const secretInput = screen.getByLabelText(/client secret/i);
    expect(secretInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByLabelText(/toggle password visibility/i);
    fireEvent.click(toggleButton);

    expect(secretInput).toHaveAttribute('type', 'text');

    fireEvent.click(toggleButton);
    expect(secretInput).toHaveAttribute('type', 'password');
  });

  it('should parse scopes from comma-separated input', async () => {
    const user = userEvent.setup();
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    const scopesInput = screen.getByLabelText(/scopes/i);
    await user.type(scopesInput, 'openid, email, profile');

    // Should create chips for each scope
    await waitFor(() => {
      expect(screen.getByText('openid')).toBeInTheDocument();
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByText('profile')).toBeInTheDocument();
    });
  });

  it('should remove scope chip when delete clicked', async () => {
    render(
      <OAuthProviderDialog
        open={true}
        provider={mockExistingProvider}
        onClose={mockOnClose}
      />
    );

    // Find the 'email' chip and delete it
    const emailChip = screen.getByText('email').closest('.MuiChip-root');
    const deleteButton = emailChip.querySelector('[data-testid="CancelIcon"]');
    
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('email')).not.toBeInTheDocument();
    });
  });

  it('should test connection successfully', async () => {
    (oauthService.testConnection as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        message: 'Connection successful',
        responseTime: 250,
      },
    });

    const user = userEvent.setup();
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/display name/i), 'Test');
    await user.type(screen.getByLabelText(/client id/i), 'test-id');
    await user.type(screen.getByLabelText(/client secret/i), 'test-secret');
    await user.type(screen.getByLabelText(/scopes/i), 'openid');

    const testButton = screen.getByText(/test connection/i);
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
    });
  });

  it('should show error for failed connection test', async () => {
    (oauthService.testConnection as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: false,
        message: 'Invalid client credentials',
        error: 'unauthorized_client',
      },
    });

    const user = userEvent.setup();
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/display name/i), 'Test');
    await user.type(screen.getByLabelText(/client id/i), 'bad-id');
    await user.type(screen.getByLabelText(/client secret/i), 'bad-secret');
    await user.type(screen.getByLabelText(/scopes/i), 'openid');

    const testButton = screen.getByText(/test connection/i);
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid client credentials/i)).toBeInTheDocument();
    });
  });

  it('should handle cancel button', () => {
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    const cancelButton = screen.getByText(/cancel/i);
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledWith(false);
  });

  it('should validate at least one scope required', async () => {
    (oauthService.createProvider as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'oauth-new' },
    });

    const user = userEvent.setup();
    render(<OAuthProviderDialog open={true} onClose={mockOnClose} />);

    // Fill in all fields except scopes
    await user.type(screen.getByLabelText(/display name/i), 'Test Provider');
    await user.type(screen.getByLabelText(/client id/i), 'test-client-id');
    await user.type(screen.getByLabelText(/client secret/i), 'test-secret');

    const saveButton = screen.getByText(/^add$/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/at least one scope is required/i)).toBeInTheDocument();
    });
  });
});
