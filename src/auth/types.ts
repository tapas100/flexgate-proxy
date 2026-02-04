/**
 * Authentication Types for FlexGate + Einstrust Integration
 */

export interface EinstrustConfig {
  apiUrl: string;
  tenantId?: string;
  sessionValidation?: {
    enabled: boolean;
    cacheTTL: number; // seconds
  };
  sso?: {
    enabled: boolean;
    idpId: string;
    returnUrl: string;
  };
  fallbackAuth?: {
    enabled: boolean;
    methods: ('basic' | 'apiKey')[];
  };
}

export interface EinstrustUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  attributes?: Record<string, any>;
}

export interface EinstrustSession {
  sessionId: string;
  userId: string;
  user: EinstrustUser;
  expiresAt: string;
  active: boolean;
  createdAt: string;
  lastActivity: string;
}

export interface SSOInitiateRequest {
  idpId?: string;
  returnUrl: string;
  tenantId?: string;
}

export interface SSOInitiateResponse {
  redirectUrl: string;
  relayState: string;
}

export interface SSOCallbackRequest {
  SAMLResponse: string;
  RelayState?: string;
}

export interface SSOCallbackResponse {
  token: string;
  user: EinstrustUser;
  sessionId: string;
  expiresAt: string;
}

export interface SessionValidationResponse {
  valid: boolean;
  user?: EinstrustUser;
  session?: EinstrustSession;
  expiresAt?: string;
}

export interface LogoutRequest {
  sessionId?: string;
}

export interface LogoutResponse {
  success: boolean;
  sloUrl?: string; // If IdP supports Single Logout
}

export interface CachedSession {
  userId: string;
  user: EinstrustUser;
  sessionId: string;
  expiresAt: number;
  lastValidated: number;
}

export interface AuthenticationResult {
  authenticated: boolean;
  user?: EinstrustUser;
  sessionId?: string;
  error?: string;
}

// Route-level authentication configuration
export interface RouteAuthConfig {
  required: boolean;
  provider?: 'einstrust' | 'basic' | 'apiKey';
  allowAnonymous?: boolean;
  roles?: string[]; // Required roles from SAML
}
