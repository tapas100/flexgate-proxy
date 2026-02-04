import { apiService } from './api';
import { User, ApiResponse } from '../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface SSOInitiateResponse {
  redirectUrl: string;
  relayState: string;
}

export interface SSOCallbackResponse {
  success: boolean;
  token: string;
  user: User;
  sessionId: string;
  expiresAt: string;
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<ApiResponse<LoginResponse>> {
    const response = await apiService.post<LoginResponse>('/api/auth/login', credentials);
    
    if (response.success && response.data) {
      // Store token and user in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response;
  }

  async register(data: RegisterData): Promise<ApiResponse<LoginResponse>> {
    const response = await apiService.post<LoginResponse>('/api/auth/register', data);
    
    if (response.success && response.data) {
      // Store token and user in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response;
  }

  /**
   * Initiate SAML SSO login flow
   */
  async initiateSSOLogin(returnUrl: string): Promise<SSOInitiateResponse> {
    const response = await apiService.post<SSOInitiateResponse>(
      '/api/auth/saml/initiate',
      { returnUrl }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to initiate SSO login');
    }

    return response.data;
  }

  /**
   * Handle SAML callback
   */
  async handleSSOCallback(samlResponse: string, relayState?: string | null): Promise<SSOCallbackResponse> {
    // We need to make a direct axios call for form-encoded data
    const formData = new URLSearchParams({
      SAMLResponse: samlResponse,
      RelayState: relayState || '',
    });

    const response = await fetch('/api/auth/saml/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'SAML callback failed' }));
      throw new Error(error.message || 'SAML callback failed');
    }

    const data: SSOCallbackResponse = await response.json();

    if (!data.success || !data.token) {
      throw new Error('SAML callback failed');
    }

    // Store token and user
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('sessionId', data.sessionId);
    
    return data;
  }

  logout(): void {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('sessionId');
    
    // Redirect to login
    window.location.href = '/login';
  }

  async logoutWithSLO(): Promise<void> {
    try {
      const response = await apiService.post<{ success: boolean; sloUrl?: string }>(
        '/api/auth/logout',
        {}
      );

      // Clear localStorage
      this.logout();

      // Redirect to IdP logout if SLO URL provided
      if (response.success && response.data?.sloUrl) {
        window.location.href = response.data.sloUrl;
      }
    } catch (error) {
      console.error('Logout failed:', error);
      this.logout();
    }
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr) as User;
    } catch (error) {
      console.error('Failed to parse user from localStorage:', error);
      return null;
    }
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getUser();
    return !!token && !!user;
  }

  async validateToken(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      const response = await apiService.get<{ valid: boolean }>('/api/auth/validate');
      return response.success && response.data?.valid === true;
    } catch (error) {
      return false;
    }
  }
}

export const authService = new AuthService();
export default authService;
