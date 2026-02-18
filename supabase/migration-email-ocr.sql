-- =============================================
-- NexoBot MVP — Schema Migration: Email + Cédula OCR
-- =============================================
-- Run this migration AFTER the initial schema-clean.sql
-- Adds: email, cedula_verified, cedula_ocr_data to merchants

-- Add email column
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email VARCHAR(150);

-- Add cédula verification fields
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cedula_verified BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cedula_ocr_data JSONB;

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email) WHERE email IS NOT NULL;

-- Add email to merchant_customers too (for future communication)
ALTER TABLE merchant_customers ADD COLUMN IF NOT EXISTS email VARCHAR(150);
