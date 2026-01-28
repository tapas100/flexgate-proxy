import type {
  OAuthProvider,
  OAuthProviderConfig,
  OAuthProviderStats,
  OAuthTestResult,
  OAuthLoginLog,
  ApiResponse,
} from '../types';

class OAuthService {
  private mockProviders: OAuthProvider[] = [];

  constructor() {
    // Initialize with some mock providers for development
    this.mockProviders = this.generateMockProviders();
  }

  /**
   * Fetch all OAuth providers
   */
  async fetchProviders(): Promise<ApiResponse<OAuthProvider[]>> {
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));

      return {
        success: true,
        data: this.mockProviders,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch OAuth providers',
      };
    }
  }

  /**
   * Fetch single OAuth provider by ID
   */
  async fetchProviderById(id: string): Promise<ApiResponse<OAuthProvider>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const provider = this.mockProviders.find(p => p.id === id);
      if (!provider) {
        return {
          success: false,
          error: 'Provider not found',
        };
      }

      return {
        success: true,
        data: provider,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch OAuth provider',
      };
    }
  }

  /**
   * Create new OAuth provider
   */
  async createProvider(config: OAuthProviderConfig): Promise<ApiResponse<OAuthProvider>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const now = Date.now();
      const newProvider: OAuthProvider = {
        id: `oauth-${Date.now()}`,
        name: config.name,
        type: config.type,
        enabled: false, // Start disabled for safety
        clientId: config.clientId,
        redirectUri: config.redirectUri || this.generateRedirectUri(config.type),
        scopes: config.scopes,
        authorizationEndpoint: config.authorizationEndpoint,
        tokenEndpoint: config.tokenEndpoint,
        userInfoEndpoint: config.userInfoEndpoint,
        createdAt: now,
        updatedAt: now,
        stats: {
          totalLogins: 0,
          lastLogin: null,
          errorRate: 0,
          avgResponseTime: 0,
          successfulLogins24h: 0,
          failedLogins24h: 0,
        },
      };

      this.mockProviders.push(newProvider);

      return {
        success: true,
        data: newProvider,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to create OAuth provider',
      };
    }
  }

  /**
   * Update existing OAuth provider
   */
  async updateProvider(
    id: string,
    config: Partial<OAuthProviderConfig>
  ): Promise<ApiResponse<OAuthProvider>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const index = this.mockProviders.findIndex(p => p.id === id);
      if (index === -1) {
        return {
          success: false,
          error: 'Provider not found',
        };
      }

      const existingProvider = this.mockProviders[index];
      const updatedProvider: OAuthProvider = {
        ...existingProvider,
        ...(config.name && { name: config.name }),
        ...(config.clientId && { clientId: config.clientId }),
        ...(config.scopes && { scopes: config.scopes }),
        ...(config.redirectUri && { redirectUri: config.redirectUri }),
        ...(config.authorizationEndpoint && { authorizationEndpoint: config.authorizationEndpoint }),
        ...(config.tokenEndpoint && { tokenEndpoint: config.tokenEndpoint }),
        ...(config.userInfoEndpoint && { userInfoEndpoint: config.userInfoEndpoint }),
        updatedAt: Date.now(),
      };

      this.mockProviders[index] = updatedProvider;

      return {
        success: true,
        data: updatedProvider,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to update OAuth provider',
      };
    }
  }

  /**
   * Delete OAuth provider
   */
  async deleteProvider(id: string): Promise<ApiResponse<void>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 300));

      const index = this.mockProviders.findIndex(p => p.id === id);
      if (index === -1) {
        return {
          success: false,
          error: 'Provider not found',
        };
      }

      this.mockProviders.splice(index, 1);

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to delete OAuth provider',
      };
    }
  }

  /**
   * Toggle provider enabled state
   */
  async toggleProvider(id: string, enabled: boolean): Promise<ApiResponse<OAuthProvider>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const index = this.mockProviders.findIndex(p => p.id === id);
      if (index === -1) {
        return {
          success: false,
          error: 'Provider not found',
        };
      }

      this.mockProviders[index].enabled = enabled;
      this.mockProviders[index].updatedAt = Date.now();

      return {
        success: true,
        data: this.mockProviders[index],
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to toggle OAuth provider',
      };
    }
  }

  /**
   * Test OAuth provider connection
   */
  async testConnection(config: OAuthProviderConfig): Promise<ApiResponse<OAuthTestResult>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate connection test

      // Mock test result - in real implementation, this would validate OAuth endpoints
      const success = Math.random() > 0.1; // 90% success rate for mock

      if (success) {
        return {
          success: true,
          data: {
            success: true,
            details: {
              authEndpointReachable: true,
              tokenEndpointReachable: true,
              userInfoEndpointReachable: true,
              responseTime: Math.floor(Math.random() * 500) + 100,
            },
          },
        };
      } else {
        return {
          success: true,
          data: {
            success: false,
            error: 'Invalid client credentials',
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to test connection',
      };
    }
  }

  /**
   * Fetch provider statistics
   */
  async fetchProviderStats(id: string): Promise<ApiResponse<OAuthProviderStats>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const provider = this.mockProviders.find(p => p.id === id);
      if (!provider || !provider.stats) {
        return {
          success: false,
          error: 'Provider or stats not found',
        };
      }

      return {
        success: true,
        data: provider.stats,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch provider stats',
      };
    }
  }

  /**
   * Fetch recent login logs for a provider
   */
  async fetchLoginLogs(
    providerId: string,
    limit: number = 50
  ): Promise<ApiResponse<OAuthLoginLog[]>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 300));

      const logs = this.generateMockLoginLogs(providerId, limit);

      return {
        success: true,
        data: logs,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch login logs',
      };
    }
  }

  /**
   * Generate redirect URI for a provider type
   */
  private generateRedirectUri(type: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/auth/oauth/${type}/callback`;
  }

  /**
   * Generate mock OAuth providers for development
   */
  private generateMockProviders(): OAuthProvider[] {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    return [
      {
        id: 'oauth-google-1',
        name: 'Google SSO',
        type: 'google',
        enabled: true,
        clientId: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
        redirectUri: 'https://api.example.com/auth/oauth/google/callback',
        scopes: ['openid', 'email', 'profile'],
        createdAt: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        updatedAt: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
        stats: {
          totalLogins: 1234,
          lastLogin: now - 2 * 60 * 60 * 1000, // 2 hours ago
          errorRate: 0.2,
          avgResponseTime: 350,
          successfulLogins24h: 45,
          failedLogins24h: 1,
        },
      },
      {
        id: 'oauth-github-1',
        name: 'GitHub OAuth',
        type: 'github',
        enabled: true,
        clientId: 'Iv1.1234567890abcdef',
        redirectUri: 'https://api.example.com/auth/oauth/github/callback',
        scopes: ['read:user', 'user:email'],
        createdAt: now - 45 * 24 * 60 * 60 * 1000,
        updatedAt: now - 10 * 24 * 60 * 60 * 1000,
        stats: {
          totalLogins: 856,
          lastLogin: now - 5 * 60 * 1000, // 5 minutes ago
          errorRate: 0.5,
          avgResponseTime: 280,
          successfulLogins24h: 32,
          failedLogins24h: 2,
        },
      },
      {
        id: 'oauth-microsoft-1',
        name: 'Microsoft Azure AD',
        type: 'microsoft',
        enabled: false,
        clientId: '12345678-1234-1234-1234-123456789abc',
        redirectUri: 'https://api.example.com/auth/oauth/microsoft/callback',
        scopes: ['openid', 'profile', 'email', 'User.Read'],
        createdAt: now - 15 * 24 * 60 * 60 * 1000,
        updatedAt: now - 5 * 24 * 60 * 60 * 1000,
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
  }

  /**
   * Generate mock login logs
   */
  private generateMockLoginLogs(providerId: string, count: number): OAuthLoginLog[] {
    const provider = this.mockProviders.find(p => p.id === providerId);
    if (!provider) return [];

    const logs: OAuthLoginLog[] = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      const success = Math.random() > 0.1; // 90% success rate
      const timestamp = now - i * 5 * 60 * 1000; // Every 5 minutes

      logs.push({
        id: `log-${providerId}-${i}`,
        providerId: provider.id,
        providerName: provider.name,
        userId: success ? `user-${Math.floor(Math.random() * 1000)}` : undefined,
        userEmail: success ? `user${Math.floor(Math.random() * 1000)}@example.com` : undefined,
        success,
        errorMessage: success ? undefined : this.getRandomErrorMessage(),
        responseTime: Math.floor(Math.random() * 500) + 100,
        timestamp,
      });
    }

    return logs;
  }

  /**
   * Get random error message for mock logs
   */
  private getRandomErrorMessage(): string {
    const errors = [
      'Invalid credentials',
      'Token exchange failed',
      'User info endpoint unreachable',
      'Network timeout',
      'Rate limit exceeded',
      'Invalid OAuth state parameter',
    ];
    return errors[Math.floor(Math.random() * errors.length)];
  }
}

// Export singleton instance
export const oauthService = new OAuthService();
