// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OAuthProviderCard from '../OAuthProviderCard';

const mockProvider = {
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
    lastLogin: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    errorRate: 0.2,
    avgResponseTime: 350,
    successfulLogins24h: 45,
    failedLogins24h: 1,
  },
};

const mockDisabledProvider = {
  ...mockProvider,
  id: 'oauth-2',
  name: 'GitHub OAuth',
  type: 'github',
  enabled: false,
  stats: {
    totalLogins: 0,
    lastLogin: null,
    errorRate: 0,
    avgResponseTime: 0,
    successfulLogins24h: 0,
    failedLogins24h: 0,
  },
};

describe('OAuthProviderCard', () => {
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render provider information', () => {
    render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText('Google SSO')).toBeInTheDocument();
    expect(screen.getByText(/google/i)).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('should display provider icon', () => {
    const { container } = render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    // Google provider should have blue circle icon
    expect(container.textContent).toContain('🔵');
  });

  it('should display different icons for different provider types', () => {
    const githubProvider = { ...mockProvider, type: 'github' };
    const { container: githubContainer } = render(
      <OAuthProviderCard
        provider={githubProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(githubContainer.textContent).toContain('🐙');

    const microsoftProvider = { ...mockProvider, type: 'microsoft' };
    const { container: microsoftContainer } = render(
      <OAuthProviderCard
        provider={microsoftProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(microsoftContainer.textContent).toContain('🟦');

    const genericProvider = { ...mockProvider, type: 'generic' };
    const { container: genericContainer } = render(
      <OAuthProviderCard
        provider={genericProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(genericContainer.textContent).toContain('🔐');
  });

  it('should mask client ID', () => {
    render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText(/\*\*\*.*com/)).toBeInTheDocument();
    expect(screen.queryByText(mockProvider.clientId)).not.toBeInTheDocument();
  });

  it('should display statistics for enabled provider', () => {
    render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText(/1,234.*logins/i)).toBeInTheDocument();
    expect(screen.getByText(/about 2 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/99.8%.*uptime/i)).toBeInTheDocument();
  });

  it('should show never logged in for provider without logins', () => {
    render(
      <OAuthProviderCard
        provider={mockDisabledProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText(/never/i)).toBeInTheDocument();
  });

  it('should call onEdit when edit button clicked', () => {
    render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    const editButton = screen.getByLabelText(/edit provider/i);
    fireEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith(mockProvider);
  });

  it('should call onDelete when delete button clicked', () => {
    render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    const deleteButton = screen.getByLabelText(/delete provider/i);
    fireEvent.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith(mockProvider.id);
  });

  it('should call onToggle when switch clicked', () => {
    render(
      <OAuthProviderCard
        provider={mockProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    const toggleSwitch = screen.getByRole('checkbox');
    fireEvent.click(toggleSwitch);

    expect(mockOnToggle).toHaveBeenCalledWith(mockProvider.id, false);
  });

  it('should show disabled state', () => {
    const { container } = render(
      <OAuthProviderCard
        provider={mockDisabledProvider}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    
    // Disabled providers should have reduced opacity
    const card = container.querySelector('.MuiCard-root');
    expect(card).toHaveStyle({ opacity: 0.6 });
  });

  it('should calculate uptime correctly', () => {
    const providerWith5PercentError = {
      ...mockProvider,
      stats: { ...mockProvider.stats, errorRate: 5.0 },
    };

    render(
      <OAuthProviderCard
        provider={providerWith5PercentError}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText(/95.*%.*uptime/i)).toBeInTheDocument();
  });
});
