// @ts-nocheck
import { oauthService } from '../oauth';
import type { OAuthProviderConfig } from '../../types';

describe('OAuthService', () => {
  beforeEach(() => {
    // Reset service state if needed
  });

  describe('fetchProviders', () => {
    it('should fetch all OAuth providers', async () => {
      const result = await oauthService.fetchProviders();

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data).toBeInstanceOf(Array);
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should return providers with all required fields', async () => {
      const result = await oauthService.fetchProviders();

      if (result.success && result.data) {
        const provider = result.data[0];
        expect(provider).toHaveProperty('id');
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('type');
        expect(provider).toHaveProperty('enabled');
        expect(provider).toHaveProperty('clientId');
        expect(provider).toHaveProperty('scopes');
        expect(provider).toHaveProperty('stats');
      }
    });
  });

  describe('fetchProviderById', () => {
    it('should fetch single provider by ID', async () => {
      const providers = await oauthService.fetchProviders();
      if (providers.success && providers.data && providers.data[0]) {
        const result = await oauthService.fetchProviderById(providers.data[0].id);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.id).toBe(providers.data[0].id);
        }
      }
    });

    it('should return error for non-existent provider', async () => {
      const result = await oauthService.fetchProviderById('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('createProvider', () => {
    it('should create new OAuth provider', async () => {
      const config: OAuthProviderConfig = {
        name: 'Test Provider',
        type: 'google',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scopes: ['openid', 'email', 'profile'],
      };

      const result = await oauthService.createProvider(config);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.name).toBe(config.name);
        expect(result.data.type).toBe(config.type);
        expect(result.data.clientId).toBe(config.clientId);
        expect(result.data.scopes).toEqual(config.scopes);
        expect(result.data.enabled).toBe(false); // Should start disabled
        expect(result.data.stats).toBeDefined();
      }
    });

    it('should generate redirect URI for new provider', async () => {
      const config: OAuthProviderConfig = {
        name: 'GitHub Test',
        type: 'github',
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret',
        scopes: ['read:user', 'user:email'],
      };

      const result = await oauthService.createProvider(config);

      if (result.success && result.data) {
        expect(result.data.redirectUri).toContain('github');
      }
    });
  });

  describe('updateProvider', () => {
    it('should update existing provider', async () => {
      // Create a provider first
      const createConfig: OAuthProviderConfig = {
        name: 'Original Name',
        type: 'google',
        clientId: 'original-id',
        clientSecret: 'original-secret',
        scopes: ['openid'],
      };

      const created = await oauthService.createProvider(createConfig);
      if (!created.success || !created.data) {
        fail('Failed to create provider for test');
        return;
      }

      // Update it
      const updateConfig = {
        name: 'Updated Name',
        scopes: ['openid', 'email', 'profile'],
      };

      const result = await oauthService.updateProvider(created.data.id, updateConfig);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.name).toBe('Updated Name');
        expect(result.data.scopes).toEqual(['openid', 'email', 'profile']);
      }
    });

    it('should return error for non-existent provider', async () => {
      const result = await oauthService.updateProvider('non-existent-id', { name: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('deleteProvider', () => {
    it('should delete existing provider', async () => {
      // Create a provider first
      const config: OAuthProviderConfig = {
        name: 'To Delete',
        type: 'google',
        clientId: 'delete-me',
        clientSecret: 'delete-secret',
        scopes: ['openid'],
      };

      const created = await oauthService.createProvider(config);
      if (!created.success || !created.data) {
        fail('Failed to create provider for test');
        return;
      }

      // Delete it
      const result = await oauthService.deleteProvider(created.data.id);

      expect(result.success).toBe(true);

      // Verify it's gone
      const fetch = await oauthService.fetchProviderById(created.data.id);
      expect(fetch.success).toBe(false);
    });

    it('should return error for non-existent provider', async () => {
      const result = await oauthService.deleteProvider('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('toggleProvider', () => {
    it('should enable provider', async () => {
      const providers = await oauthService.fetchProviders();
      if (providers.success && providers.data && providers.data[0]) {
        const provider = providers.data[0];
        const result = await oauthService.toggleProvider(provider.id, true);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.enabled).toBe(true);
        }
      }
    });

    it('should disable provider', async () => {
      const providers = await oauthService.fetchProviders();
      if (providers.success && providers.data && providers.data[0]) {
        const provider = providers.data[0];
        const result = await oauthService.toggleProvider(provider.id, false);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.enabled).toBe(false);
        }
      }
    });
  });

  describe('testConnection', () => {
    it('should test OAuth provider connection', async () => {
      const config: OAuthProviderConfig = {
        name: 'Test Connection',
        type: 'google',
        clientId: 'test-id',
        clientSecret: 'test-secret',
        scopes: ['openid'],
      };

      const result = await oauthService.testConnection(config);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data).toHaveProperty('success');
        if (result.data.success) {
          expect(result.data.details).toBeDefined();
          expect(result.data.details?.responseTime).toBeGreaterThan(0);
        }
      }
    });

    it('should handle test connection failures', async () => {
      const config: OAuthProviderConfig = {
        name: 'Test Fail',
        type: 'google',
        clientId: 'invalid-id',
        clientSecret: 'invalid-secret',
        scopes: ['openid'],
      };

      const result = await oauthService.testConnection(config);

      expect(result.success).toBe(true);
      // Result might be success or failure based on mock
      if (result.success && result.data) {
        expect(result.data).toHaveProperty('success');
      }
    });
  });

  describe('fetchProviderStats', () => {
    it('should fetch provider statistics', async () => {
      const providers = await oauthService.fetchProviders();
      if (providers.success && providers.data && providers.data[0]) {
        const provider = providers.data[0];
        const result = await oauthService.fetchProviderStats(provider.id);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data).toHaveProperty('totalLogins');
          expect(result.data).toHaveProperty('errorRate');
          expect(result.data).toHaveProperty('avgResponseTime');
        }
      }
    });

    it('should return error for non-existent provider', async () => {
      const result = await oauthService.fetchProviderStats('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('fetchLoginLogs', () => {
    it('should fetch login logs for provider', async () => {
      const providers = await oauthService.fetchProviders();
      if (providers.success && providers.data && providers.data[0]) {
        const provider = providers.data[0];
        const result = await oauthService.fetchLoginLogs(provider.id, 10);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data).toBeInstanceOf(Array);
          expect(result.data.length).toBeLessThanOrEqual(10);
          if (result.data.length > 0) {
            const log = result.data[0];
            expect(log).toHaveProperty('id');
            expect(log).toHaveProperty('providerId');
            expect(log).toHaveProperty('success');
            expect(log).toHaveProperty('responseTime');
            expect(log).toHaveProperty('timestamp');
          }
        }
      }
    });

    it('should respect limit parameter', async () => {
      const providers = await oauthService.fetchProviders();
      if (providers.success && providers.data && providers.data[0]) {
        const provider = providers.data[0];
        const result = await oauthService.fetchLoginLogs(provider.id, 5);

        if (result.success && result.data) {
          expect(result.data.length).toBeLessThanOrEqual(5);
        }
      }
    });
  });
});
