-- =============================================
-- NexoBot MVP — Migration: Dashboard Auth
-- =============================================
-- Adds dashboard_pin and dashboard_token to merchants
-- for secure dashboard access.

-- PIN for dashboard login (4-6 digits)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS dashboard_pin VARCHAR(6);

-- JWT-like token for session management
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS dashboard_token TEXT;

-- Token expiry
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Index for fast login lookup
CREATE INDEX IF NOT EXISTS idx_merchants_phone_pin 
ON merchants(phone, dashboard_pin);
