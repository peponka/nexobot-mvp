-- =============================================
-- NexoBot — Security Fix: Enable RLS on all tables
-- Run this in Supabase SQL Editor
-- =============================================

-- Tables from migration-billing.sql
ALTER TABLE IF EXISTS api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS billing_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS partners ENABLE ROW LEVEL SECURITY;

-- Tables from migration-greenlight-currency.sql
ALTER TABLE IF EXISTS greenlight_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exchange_rates ENABLE ROW LEVEL SECURITY;

-- Ensure original tables also have RLS (idempotent)
ALTER TABLE IF EXISTS merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS merchant_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nexo_scores ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies: Allow service_role full access
-- (our backend uses service_role key)
-- Drop existing + recreate for idempotency
-- =============================================

-- api_usage
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_api_usage" ON api_usage;
    CREATE POLICY "service_role_api_usage" ON api_usage FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- billing_summaries
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_billing" ON billing_summaries;
    CREATE POLICY "service_role_billing" ON billing_summaries FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- partners
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_partners" ON partners;
    CREATE POLICY "service_role_partners" ON partners FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- greenlight_log
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_greenlight" ON greenlight_log;
    CREATE POLICY "service_role_greenlight" ON greenlight_log FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- exchange_rates
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_exchange" ON exchange_rates;
    CREATE POLICY "service_role_exchange" ON exchange_rates FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- merchants
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_merchants" ON merchants;
    CREATE POLICY "service_role_merchants" ON merchants FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- merchant_customers
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_customers" ON merchant_customers;
    CREATE POLICY "service_role_customers" ON merchant_customers FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- transactions
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_transactions" ON transactions;
    CREATE POLICY "service_role_transactions" ON transactions FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- inventory
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_inventory" ON inventory;
    CREATE POLICY "service_role_inventory" ON inventory FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- reminders
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_reminders" ON reminders;
    CREATE POLICY "service_role_reminders" ON reminders FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- message_log
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_messages" ON message_log;
    CREATE POLICY "service_role_messages" ON message_log FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- nexo_scores
DO $$ BEGIN
    DROP POLICY IF EXISTS "service_role_scores" ON nexo_scores;
    CREATE POLICY "service_role_scores" ON nexo_scores FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- Done! All tables now have RLS enabled.
-- Only the service_role (backend) can access data.
-- Anonymous/public users cannot read any data.
-- =============================================
