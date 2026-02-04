-- Requests table for storing proxy request metrics
-- This table stores all proxy requests for metrics and analytics

CREATE TABLE IF NOT EXISTS requests (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms NUMERIC(10, 2) NOT NULL,
  upstream VARCHAR(255),
  client_ip INET,
  user_agent TEXT,
  request_size INTEGER,
  response_size INTEGER,
  error_message TEXT,
  correlation_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status_code ON requests(status_code);
CREATE INDEX IF NOT EXISTS idx_requests_upstream ON requests(upstream);
CREATE INDEX IF NOT EXISTS idx_requests_correlation_id ON requests(correlation_id);

-- Create partitioned index for time-based queries
CREATE INDEX IF NOT EXISTS idx_requests_timestamp_status ON requests(timestamp DESC, status_code);

-- Add table comment
COMMENT ON TABLE requests IS 'Stores all proxy requests for metrics, monitoring, and analytics';
COMMENT ON COLUMN requests.response_time_ms IS 'Response time in milliseconds';
COMMENT ON COLUMN requests.correlation_id IS 'Request correlation ID for distributed tracing';

-- Insert migration version
INSERT INTO schema_migrations (version) VALUES ('003_requests_table')
ON CONFLICT (version) DO NOTHING;
