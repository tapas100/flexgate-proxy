-- Migration: Fix webhook_deliveries foreign key
-- Created: 2026-01-30
-- Description: Ensure webhook_deliveries.webhook_id is VARCHAR and has the correct FK.
--              005 already does this; 006 is a safety net in case 005 was partially applied
--              on an older DB state.  All statements are idempotent.

-- Drop any legacy UUID-based FK that might still linger
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_webhook_id_fkey;
-- Drop any variant names from 005 attempts so we can re-add cleanly
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS fk_webhook;
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS fk_webhook_deliveries_webhook_id;

-- Ensure webhook_id is VARCHAR(255) (no-op if 005 already ran)
ALTER TABLE webhook_deliveries
  ALTER COLUMN webhook_id TYPE VARCHAR(255) USING webhook_id::text;

-- Re-add the correct FK
ALTER TABLE webhook_deliveries
  ADD CONSTRAINT fk_webhook_deliveries_webhook_id
    FOREIGN KEY (webhook_id)
    REFERENCES webhooks(webhook_id)
    ON DELETE CASCADE;
