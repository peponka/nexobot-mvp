-- =============================================
-- NexoFinanzas — Migration: Add personal data columns
-- =============================================
-- Run this in the Supabase SQL Editor to add
-- cédula, address, and monthly_volume columns to merchants.
-- These are needed for the new onboarding flow that
-- captures identity data.
-- =============================================

-- Add personal identity columns
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cedula VARCHAR(15);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS monthly_volume VARCHAR(30);

-- Add index on cedula for fast lookups (scoring API will use this)
CREATE INDEX IF NOT EXISTS idx_merchants_cedula ON merchants(cedula);

-- Verify the changes
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'merchants' ORDER BY ordinal_position;
