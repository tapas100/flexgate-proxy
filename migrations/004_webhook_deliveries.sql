-- Migration: Add webhook_deliveries table
-- Created: 2026-01-30
-- Description: Store webhook delivery logs for analytics, retry management, and multi-channel delivery

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id VARCHAR(255) PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    attempts INTEGER DEFAULT 0,
    response_code INTEGER,
    response_body TEXT,
    error TEXT,
    delivery_channel VARCHAR(50) DEFAULT 'webhook' CHECK (delivery_channel IN ('webhook', 'slack', 'whatsapp', 'webex', 'teams')),
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key to webhooks table
    CONSTRAINT fk_webhook
        FOREIGN KEY (webhook_id)
        REFERENCES webhooks(webhook_id)
        ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_channel ON webhook_deliveries(delivery_channel);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_status ON webhook_deliveries(webhook_id, status, created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_delivery_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_webhook_delivery_timestamp
    BEFORE UPDATE ON webhook_deliveries
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_delivery_timestamp();

-- Comments for documentation
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

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_deliveries TO flexgate_user;
-- GRANT USAGE ON SEQUENCE webhook_deliveries_delivery_id_seq TO flexgate_user;
