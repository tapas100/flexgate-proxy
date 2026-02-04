-- FlexGate Database Schema v1.0.0
-- PostgreSQL Initial Migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ROUTES TABLE
-- ============================================================================
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id VARCHAR(255) UNIQUE NOT NULL,  -- User-friendly ID (route-xxx)
  path VARCHAR(500) NOT NULL,              -- Route path (e.g., /api/*)
  upstream VARCHAR(255) NOT NULL,          -- Upstream service name
  methods TEXT[] NOT NULL,                 -- HTTP methods (GET, POST, etc.)
  strip_path VARCHAR(500),                 -- Path to strip before proxying
  enabled BOOLEAN DEFAULT true,
  
  -- Rate limiting
  rate_limit_enabled BOOLEAN DEFAULT false,
  rate_limit_max INTEGER,
  rate_limit_window_ms INTEGER,
  rate_limit_message TEXT,
  
  -- Metadata
  description TEXT,
  tags TEXT[],
  
  -- Audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  
  -- Soft delete
  deleted_at TIMESTAMP,
  deleted_by VARCHAR(255)
);

CREATE INDEX idx_routes_route_id ON routes(route_id);
CREATE INDEX idx_routes_path ON routes(path);
CREATE INDEX idx_routes_upstream ON routes(upstream);
CREATE INDEX idx_routes_enabled ON routes(enabled);
CREATE INDEX idx_routes_deleted_at ON routes(deleted_at);

-- ============================================================================
-- WEBHOOKS TABLE
-- ============================================================================
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id VARCHAR(255) UNIQUE NOT NULL,  -- User-friendly ID (webhook-xxx)
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,                         -- Destination URL
  events TEXT[] NOT NULL,                    -- Events to subscribe to
  enabled BOOLEAN DEFAULT true,
  
  -- Configuration
  headers JSONB,                             -- Custom headers
  timeout INTEGER DEFAULT 5000,              -- Timeout in ms
  retry_count INTEGER DEFAULT 3,
  retry_delay INTEGER DEFAULT 1000,
  
  -- Security
  secret VARCHAR(255),                       -- HMAC secret for signature
  
  -- Stats
  last_triggered_at TIMESTAMP,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  
  -- Metadata
  description TEXT,
  tags TEXT[],
  
  -- Audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  
  -- Soft delete
  deleted_at TIMESTAMP,
  deleted_by VARCHAR(255)
);

CREATE INDEX idx_webhooks_webhook_id ON webhooks(webhook_id);
CREATE INDEX idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);
CREATE INDEX idx_webhooks_deleted_at ON webhooks(deleted_at);

-- ============================================================================
-- WEBHOOK DELIVERIES TABLE (Audit Log)
-- ============================================================================
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(255) NOT NULL,
  payload JSONB,
  
  -- Request
  request_url TEXT NOT NULL,
  request_headers JSONB,
  request_body JSONB,
  
  -- Response
  response_status INTEGER,
  response_headers JSONB,
  response_body TEXT,
  
  -- Timing
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Status
  success BOOLEAN,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
CREATE INDEX idx_webhook_deliveries_success ON webhook_deliveries(success);

-- ============================================================================
-- USERS TABLE (for future authentication)
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),  -- NULL if using SAML SSO
  
  -- Profile
  full_name VARCHAR(255),
  avatar_url TEXT,
  
  -- Roles & Permissions
  role VARCHAR(50) DEFAULT 'viewer',  -- admin, editor, viewer
  permissions TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  
  -- SSO Integration
  sso_provider VARCHAR(50),  -- saml, oauth, etc.
  sso_id VARCHAR(255),
  
  -- Audit
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Soft delete
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,  -- CREATE, UPDATE, DELETE, etc.
  resource_type VARCHAR(100) NOT NULL,  -- route, webhook, user, etc.
  resource_id VARCHAR(255),
  
  -- Details
  changes JSONB,  -- Before/after values
  metadata JSONB,  -- Additional context
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  correlation_id VARCHAR(255),
  
  -- Timestamp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- API KEYS TABLE
-- ============================================================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL,  -- Hashed API key
  key_prefix VARCHAR(20),  -- First few chars for identification
  
  -- Permissions
  scopes TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  revoked_at TIMESTAMP,
  revoked_by UUID REFERENCES users(id)
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Create default admin user (password: admin123 - hashed with bcrypt)
INSERT INTO users (email, username, password_hash, full_name, role, is_active, email_verified)
VALUES (
  'admin@flexgate.dev',
  'admin',
  '$2b$10$rBV2/Oe7WqZ5vZYxqXJ5O.8YvZEQvZxZQYxZQYxZQYxZQYxZQYxZQ',  -- admin123
  'FlexGate Administrator',
  'admin',
  true,
  true
);

-- Add some example routes (from config)
-- These will be managed by the application

-- Demo routes for quick proxy + metrics verification
-- NOTE: These are NON-API paths (not /api/*) so they won't conflict with built-in endpoints.
INSERT INTO routes (route_id, path, upstream, methods, enabled, description, created_at, updated_at)
VALUES
  ('httpbin-api', '/httpbin/*', 'https://httpbin.org', ARRAY['GET','POST','PUT','DELETE'], true, 'Demo route for testing proxying and metrics', NOW(), NOW()),
  ('jsonplaceholder-api', '/external/api/*', 'https://jsonplaceholder.typicode.com', ARRAY['GET','POST','PUT','DELETE'], true, 'Demo route for testing proxying and metrics', NOW(), NOW())
ON CONFLICT (route_id) DO NOTHING;

COMMENT ON TABLE routes IS 'Dynamic proxy routes configuration';
COMMENT ON TABLE webhooks IS 'Webhook subscriptions for events';
COMMENT ON TABLE webhook_deliveries IS 'Audit log of webhook deliveries';
COMMENT ON TABLE users IS 'Application users and SSO integration';
COMMENT ON TABLE audit_logs IS 'Audit trail of all system changes';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access';
