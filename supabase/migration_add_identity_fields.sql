-- =============================================
-- NexoFinanzas — Migration: Add Identity Fields
-- =============================================
-- Run this in Supabase SQL Editor if the merchants
-- table already exists and needs the new columns.
-- Safe to run multiple times (idempotent).
-- =============================================

-- 1. Add cedula column
ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS cedula VARCHAR(15);

-- 2. Add address column
ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. Add monthly_volume column
ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS monthly_volume VARCHAR(20);

-- 4. Add unique index on cedula (partial — only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_cedula 
ON merchants(cedula) WHERE cedula IS NOT NULL;

-- 5. Recreate the merchant_summary view with new fields
--    (DROP + CREATE because PostgreSQL can't change columns with REPLACE)
DROP VIEW IF EXISTS merchant_summary;
CREATE VIEW merchant_summary AS
SELECT 
    m.id,
    m.phone,
    m.name,
    m.cedula,
    m.address,
    m.city,
    m.business_name,
    m.business_type,
    m.monthly_volume,
    m.nexo_score,
    m.total_sales,
    m.onboarded_at,
    COALESCE(SUM(CASE WHEN mc.total_debt > 0 THEN mc.total_debt ELSE 0 END), 0) as total_pending_debt,
    COUNT(DISTINCT CASE WHEN mc.total_debt > 0 THEN mc.id END) as debtors_count,
    COUNT(DISTINCT mc.id) as total_customers,
    (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id 
     AND t.created_at >= now() - interval '7 days') as weekly_transactions
FROM merchants m
LEFT JOIN merchant_customers mc ON mc.merchant_id = m.id
GROUP BY m.id, m.phone, m.name, m.cedula, m.address, m.city,
         m.business_name, m.business_type, m.monthly_volume,
         m.nexo_score, m.total_sales, m.onboarded_at;

-- =============================================
-- DONE! Verify with:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'merchants' ORDER BY ordinal_position;
-- =============================================
