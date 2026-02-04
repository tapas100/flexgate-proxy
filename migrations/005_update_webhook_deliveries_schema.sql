-- Migration: Update webhook_deliveries table schema
-- Created: 2026-01-30
-- Description: Update existing webhook_deliveries table to support multi-channel delivery

-- Drop old indexes first
DROP INDEX IF EXISTS idx_webhook_deliveries_success;

-- Add new columns
ALTER TABLE webhook_deliveries 
  ADD COLUMN IF NOT EXISTS delivery_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) CHECK (status IN ('pending', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_code INTEGER,
  ADD COLUMN IF NOT EXISTS response_body TEXT,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(50) DEFAULT 'webhook' CHECK (delivery_channel IN ('webhook', 'slack', 'whatsapp', 'webex', 'teams')),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing data
UPDATE webhook_deliveries SET
  delivery_id = id::text,
  event_type = event,
  status = CASE WHEN success = true THEN 'success' ELSE 'failed' END,
  attempts = retry_count,
  response_code = response_status,
  response_body = response_body,
  error = error_message,
  delivery_channel = 'webhook',
  delivered_at = CASE WHEN success = true THEN created_at ELSE NULL END,
  updated_at = created_at
WHERE delivery_id IS NULL;

-- Now make delivery_id NOT NULL and PRIMARY KEY
ALTER TABLE webhook_deliveries ALTER COLUMN delivery_id SET NOT NULL;
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_pkey;
ALTER TABLE webhook_deliveries ADD PRIMARY KEY (delivery_id);

-- Make event_type NOT NULL
ALTER TABLE webhook_deliveries ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE webhook_deliveries ALTER COLUMN status SET NOT NULL;

-- Update webhook_id to be VARCHAR to match webhooks table
ALTER TABLE webhook_deliveries ALTER COLUMN webhook_id TYPE VARCHAR(255);

-- Drop old columns
ALTER TABLE webhook_deliveries 
  DROP COLUMN IF EXISTS id,
  DROP COLUMN IF EXISTS event,
  DROP COLUMN IF EXISTS request_url,
  DROP COLUMN IF EXISTS request_headers,
  DROP COLUMN IF EXISTS request_body,
  DROP COLUMN IF EXISTS response_status,
  DROP COLUMN IF EXISTS response_headers,
  DROP COLUMN IF EXISTS duration_ms,
  DROP COLUMN IF EXISTS success,
  DROP COLUMN IF EXISTS error_message,
  DROP COLUMN IF EXISTS retry_count;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_channel ON webhook_deliveries(delivery_channel);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_status ON webhook_deliveries(webhook_id, status, created_at DESC);

-- Update foreign key constraint
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_webhook_id_fkey;
ALTER TABLE webhook_deliveries ADD CONSTRAINT fk_webhook
    FOREIGN KEY (webhook_id)
    REFERENCES webhooks(webhook_id)
    ON DELETE CASCADE;

-- Comments
COMMENT ON TABLE webhook_deliveries IS 'Stores webhook delivery logs for all channels (webhook, Slack, WhatsApp, Webex, Teams)';
COMMENT ON COLUMN webhook_deliveries.delivery_id IS 'Unique delivery identifier';
COMMENT ON COLUMN webhook_deliveries.webhook_id IS 'Reference to webhook configuration';
COMMENT ON COLUMN webhook_deliveries.event_type IS 'Type of event that triggered the delivery';
COMMENT ON COLUMN webhook_deliveries.payload IS 'Complete payload sent to the delivery channel';
COMMENT ON COLUMN webhook_deliveries.status IS 'Delivery status: pending, success, or failed';
COMMENT ON COLUMN webhook_deliveries.attempts IS 'Number of delivery attempts made';
COMMENT ON COLUMN webhook_deliveries.delivery_channel IS 'Channel used for delivery: webhook, slack, whatsapp, webex, teams';
COMMENT ON COLUMN webhook_deliveries.response_code IS 'HTTP response code (for webhook channel)';
COMMENT ON COLUMN webhook_deliveries.response_body IS 'Response body from delivery attempt';
COMMENT ON COLUMN webhook_deliveries.error IS 'Error message if delivery failed';
COMMENT ON COLUMN webhook_deliveries.delivered_at IS 'Timestamp when successfully delivered';
