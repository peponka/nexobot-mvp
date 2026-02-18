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
-- =============================================

-- api_usage: only service_role
CREATE POLICY IF NOT EXISTS "service_role_api_usage" ON api_usage
    FOR ALL USING (auth.role() = 'service_role');

-- billing_summaries: only service_role
CREATE POLICY IF NOT EXISTS "service_role_billing" ON billing_summaries
    FOR ALL USING (auth.role() = 'service_role');

-- partners: only service_role
CREATE POLICY IF NOT EXISTS "service_role_partners" ON partners
    FOR ALL USING (auth.role() = 'service_role');

-- greenlight_log: only service_role
CREATE POLICY IF NOT EXISTS "service_role_greenlight" ON greenlight_log
    FOR ALL USING (auth.role() = 'service_role');

-- exchange_rates: only service_role
CREATE POLICY IF NOT EXISTS "service_role_exchange" ON exchange_rates
    FOR ALL USING (auth.role() = 'service_role');

-- merchants: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'merchants' AND policyname = 'service_role_merchants') THEN
        CREATE POLICY "service_role_merchants" ON merchants FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- merchant_customers: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'merchant_customers' AND policyname = 'service_role_customers') THEN
        CREATE POLICY "service_role_customers" ON merchant_customers FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- transactions: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'service_role_transactions') THEN
        CREATE POLICY "service_role_transactions" ON transactions FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- inventory: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'service_role_inventory') THEN
        CREATE POLICY "service_role_inventory" ON inventory FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- reminders: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'service_role_reminders') THEN
        CREATE POLICY "service_role_reminders" ON reminders FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- message_log: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_log' AND policyname = 'service_role_messages') THEN
        CREATE POLICY "service_role_messages" ON message_log FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- nexo_scores: only service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nexo_scores' AND policyname = 'service_role_scores') THEN
        CREATE POLICY "service_role_scores" ON nexo_scores FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- =============================================
-- Done! All tables now have RLS enabled.
-- Only the service_role (backend) can access data.
-- Anonymous/public users cannot read any data.
-- =============================================
