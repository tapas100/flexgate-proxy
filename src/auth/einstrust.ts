/**
 * Einstrust API Client
 * Handles communication with Einstrust SAML service
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../logger';
import {
  EinstrustConfig,
  SSOInitiateRequest,
  SSOInitiateResponse,
  SSOCallbackRequest,
  SSOCallbackResponse,
  SessionValidationResponse,
  LogoutRequest,
  LogoutResponse,
} from './types';

export class EinstrustClient {
  private axiosInstance: AxiosInstance;
  private config: EinstrustConfig;

  constructor(config: EinstrustConfig) {
    this.config = config;
    
    this.axiosInstance = axios.create({
      baseURL: config.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FlexGate-Proxy/1.0',
      },
    });

    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('Einstrust API request', {
          method: config.method,
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('Einstrust API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('Einstrust API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('Einstrust API response error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initiate SAML SSO flow
   */
  async initiateSSOLogin(request: SSOInitiateRequest): Promise<SSOInitiateResponse> {
    try {
      const response = await this.axiosInstance.post<SSOInitiateResponse>(
        '/api/auth/saml/initiate',
        {
          idpId: request.idpId || this.config.sso?.idpId,
          returnUrl: request.returnUrl,
          tenantId: request.tenantId || this.config.tenantId,
        }
      );

      logger.info('SSO login initiated', {
        idpId: request.idpId || this.config.sso?.idpId,
        returnUrl: request.returnUrl,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to initiate SSO login', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error, 'SSO initiation failed');
    }
  }

  /**
   * Handle SAML callback and exchange for session token
   */
  async handleSSOCallback(request: SSOCallbackRequest): Promise<SSOCallbackResponse> {
    try {
      const response = await this.axiosInstance.post<SSOCallbackResponse>(
        '/api/auth/saml/callback',
        new URLSearchParams({
          SAMLResponse: request.SAMLResponse,
          RelayState: request.RelayState || '',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info('SSO callback processed', {
        userId: response.data.user.id,
        sessionId: response.data.sessionId,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to process SAML callback', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error, 'SAML callback processing failed');
    }
  }

  /**
   * Validate an Einstrust session token
   */
  async validateSession(token: string): Promise<SessionValidationResponse> {
    try {
      const response = await this.axiosInstance.get<SessionValidationResponse>(
        '/api/auth/session',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      logger.debug('Session validated', {
        valid: response.data.valid,
        userId: response.data.user?.id,
      });

      return response.data;
    } catch (error) {
      // Don't log 401s as errors (they're expected for invalid sessions)
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logger.debug('Session validation failed: unauthorized');
        return { valid: false };
      }

      logger.error('Failed to validate session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error, 'Session validation failed');
    }
  }

  /**
   * Logout and optionally initiate SAML SLO
   */
  async logout(token: string, request?: LogoutRequest): Promise<LogoutResponse> {
    try {
      const response = await this.axiosInstance.post<LogoutResponse>(
        '/api/auth/logout',
        request || {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      logger.info('User logged out', {
        sessionId: request?.sessionId,
        slo: !!response.data.sloUrl,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to logout', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error, 'Logout failed');
    }
  }

  /**
   * Get SP metadata for IdP configuration
   */
  async getSPMetadata(tenantId?: string): Promise<string> {
    try {
      const url = tenantId
        ? `/api/saml/metadata/${tenantId}`
        : '/api/saml/metadata';

      const response = await this.axiosInstance.get<string>(url, {
        headers: {
          Accept: 'application/xml',
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get SP metadata', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleError(error, 'Failed to retrieve SP metadata');
    }
  }

  /**
   * Handle API errors consistently
   */
  private handleError(error: unknown, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      
      if (status === 400) {
        return new Error(`Bad Request: ${message}`);
      } else if (status === 401) {
        return new Error('Unauthorized: Invalid or expired session');
      } else if (status === 404) {
        return new Error('Not Found: Resource does not exist');
      } else if (status === 500) {
        return new Error(`Server Error: ${message}`);
      }
      
      return new Error(`${defaultMessage}: ${message}`);
    }
    
    if (error instanceof Error) {
      return error;
    }
    
    return new Error(defaultMessage);
  }

  /**
   * Health check for Einstrust service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get metadata as a health check
      await this.axiosInstance.get('/api/saml/metadata', {
        timeout: 5000,
      });
      return true;
    } catch (error) {
      logger.warn('Einstrust health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

// Singleton instance
let einstrustClient: EinstrustClient | null = null;

/**
 * Initialize Einstrust client
 */
export function initializeEinstrust(config: EinstrustConfig): EinstrustClient {
  if (!einstrustClient) {
    einstrustClient = new EinstrustClient(config);
    logger.info('Einstrust client initialized', {
      apiUrl: config.apiUrl,
      tenantId: config.tenantId,
      ssoEnabled: config.sso?.enabled,
    });
  }
  return einstrustClient;
}

/**
 * Get Einstrust client instance
 */
export function getEinstrustClient(): EinstrustClient {
  if (!einstrustClient) {
    throw new Error('Einstrust client not initialized. Call initializeEinstrust() first.');
  }
  return einstrustClient;
}

export default EinstrustClient;
