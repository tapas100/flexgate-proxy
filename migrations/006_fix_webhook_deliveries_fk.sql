-- Migration: Fix webhook_deliveries foreign key
-- Created: 2026-01-30
-- Description: Update webhook_deliveries to properly reference webhooks by webhook_id (VARCHAR)

-- First, convert webhook_id column to VARCHAR to match webhooks.webhook_id
ALTER TABLE webhook_deliveries 
  ALTER COLUMN webhook_id TYPE VARCHAR(255) USING webhook_id::text;

-- Now add the foreign key constraint
ALTER TABLE webhook_deliveries
  ADD CONSTRAINT fk_webhook_deliveries_webhook_id
    FOREIGN KEY (webhook_id)
    REFERENCES webhooks(webhook_id)
    ON DELETE CASCADE;
