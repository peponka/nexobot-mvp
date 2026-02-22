-- =============================================
-- NexoBot — SCRIPT COMPLETO (Base + Migraciones)
-- =============================================
-- COPIA Y PEGA TODO EN SUPABASE SQL EDITOR
-- Incluye: schema base + todas las migraciones
-- Es idempotente (seguro correr varias veces)
-- =============================================

-- -----------------------------------------------
-- EXTENSIONES
-- -----------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------
-- TABLAS BASE
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    cedula VARCHAR(15),
    address TEXT,
    business_name VARCHAR(200),
    business_type VARCHAR(50) DEFAULT 'general',
    city VARCHAR(100),
    country VARCHAR(3) DEFAULT 'PY',
    language VARCHAR(5) DEFAULT 'es',
    monthly_volume VARCHAR(30),
    nexo_score INT DEFAULT 0,
    total_sales BIGINT DEFAULT 0,
    total_credit_given BIGINT DEFAULT 0,
    total_collected BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    onboarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    total_debt BIGINT DEFAULT 0,
    total_paid BIGINT DEFAULT 0,
    total_transactions INT DEFAULT 0,
    avg_days_to_pay FLOAT DEFAULT 0,
    risk_level VARCHAR(10) DEFAULT 'low',
    last_transaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(merchant_id, name)
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES merchant_customers(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'PYG',
    product VARCHAR(100),
    quantity INT,
    unit_price BIGINT,
    raw_message TEXT,
    parsed_intent VARCHAR(30),
    parsed_confidence FLOAT,
    parsed_entities JSONB DEFAULT '{}',
    language_detected VARCHAR(5) DEFAULT 'es',
    status VARCHAR(20) DEFAULT 'confirmed',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product VARCHAR(100) NOT NULL,
    stock INT DEFAULT 0,
    unit VARCHAR(30) DEFAULT 'unidades',
    avg_price BIGINT DEFAULT 0,
    last_restocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(merchant_id, product)
);

CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES merchant_customers(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    message TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    direction VARCHAR(10) NOT NULL,
    phone VARCHAR(20),
    raw_message TEXT,
    bot_response TEXT,
    intent VARCHAR(30),
    confidence FLOAT,
    processing_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nexo_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    score INT NOT NULL,
    components JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Leads table (for contact form and B2B inquiries)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200),
    email VARCHAR(200),
    phone VARCHAR(50),
    company VARCHAR(200),
    type VARCHAR(50),
    interest VARCHAR(100),
    message TEXT,
    source VARCHAR(50) DEFAULT 'website',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Base indexes
CREATE INDEX IF NOT EXISTS idx_merchants_phone ON merchants(phone);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_cedula ON merchants(cedula);
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON merchant_customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON merchant_customers(merchant_id, name);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(merchant_id, type);
CREATE INDEX IF NOT EXISTS idx_inventory_merchant ON inventory(merchant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_message_log_merchant ON message_log(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexo_scores_merchant ON nexo_scores(merchant_id, created_at DESC);

-- -----------------------------------------------
-- MIGRACIÓN: Email + Cédula OCR
-- -----------------------------------------------

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cedula_verified BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cedula_ocr_data JSONB;
CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email) WHERE email IS NOT NULL;
ALTER TABLE merchant_customers ADD COLUMN IF NOT EXISTS email VARCHAR(150);

-- -----------------------------------------------
-- MIGRACIÓN: Dashboard Auth
-- -----------------------------------------------

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS dashboard_pin VARCHAR(255);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS dashboard_token TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_merchants_phone_pin ON merchants(phone, dashboard_pin);

-- -----------------------------------------------
-- MIGRACIÓN: GreenLight + Exchange Rates
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS greenlight_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    score INT DEFAULT 0,
    tier VARCHAR(2),
    risk_level VARCHAR(20) DEFAULT 'unknown',
    provider_name VARCHAR(100) DEFAULT 'unknown',
    signals_count INT DEFAULT 0,
    report_id VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_greenlight_merchant ON greenlight_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_greenlight_created ON greenlight_log(created_at);
CREATE INDEX IF NOT EXISTS idx_greenlight_provider ON greenlight_log(provider_name);

CREATE TABLE IF NOT EXISTS exchange_rates (
    currency_pair VARCHAR(10) PRIMARY KEY,
    buy NUMERIC(12,2) NOT NULL,
    sell NUMERIC(12,2) NOT NULL,
    mid NUMERIC(12,2) NOT NULL,
    source VARCHAR(50),
    fetched_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO exchange_rates (currency_pair, buy, sell, mid, source)
VALUES ('USD_PYG', 7300, 7400, 7350, 'initial')
ON CONFLICT (currency_pair) DO NOTHING;

-- -----------------------------------------------
-- MIGRACIÓN: Billing / Metering
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS api_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key VARCHAR(100) NOT NULL,
    partner_name VARCHAR(100),
    endpoint VARCHAR(200) NOT NULL,
    method VARCHAR(10) DEFAULT 'GET',
    status_code INT,
    response_time_ms INT,
    request_body JSONB,
    response_summary TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_summaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key VARCHAR(100) NOT NULL,
    partner_name VARCHAR(100),
    period VARCHAR(7) NOT NULL,
    total_requests INT DEFAULT 0,
    successful_requests INT DEFAULT 0,
    failed_requests INT DEFAULT 0,
    avg_response_time_ms INT,
    endpoints_breakdown JSONB,
    amount_due DECIMAL(12,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(api_key, period)
);

CREATE TABLE IF NOT EXISTS partners (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(200),
    plan VARCHAR(50) DEFAULT 'free',
    monthly_limit INT DEFAULT 100,
    rate_per_request DECIMAL(8,4) DEFAULT 0.05,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage(api_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_period ON billing_summaries(period, api_key);
CREATE INDEX IF NOT EXISTS idx_partners_api_key ON partners(api_key);

INSERT INTO partners (name, api_key, plan, monthly_limit, rate_per_request)
VALUES 
    ('NexoBot Internal', 'nexo-internal', 'enterprise', 999999, 0),
    ('GreenLight Demo', 'gl-demo-key', 'starter', 500, 0.05)
ON CONFLICT (api_key) DO NOTHING;

-- -----------------------------------------------
-- MIGRACIÓN: Payments
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id UUID REFERENCES partners(id),
    period VARCHAR(7) NOT NULL,
    amount_pyg BIGINT NOT NULL DEFAULT 0,
    amount_usd DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    provider VARCHAR(20) NOT NULL,
    provider_session_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    api_calls INTEGER DEFAULT 0,
    plan VARCHAR(20) DEFAULT 'starter',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_periods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id UUID REFERENCES partners(id),
    period VARCHAR(7) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    amount_pyg BIGINT DEFAULT 0,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(partner_id, period)
);

CREATE INDEX IF NOT EXISTS idx_payments_partner ON payments(partner_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period);
CREATE INDEX IF NOT EXISTS idx_payments_provider_session ON payments(provider_session_id);
CREATE INDEX IF NOT EXISTS idx_billing_periods_partner ON billing_periods(partner_id);

-- -----------------------------------------------
-- RLS: Habilitar en TODAS las tablas
-- -----------------------------------------------

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexo_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE greenlight_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_periods ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- RLS POLICIES: service_role full access
-- -----------------------------------------------

DO $$ BEGIN
    CREATE POLICY "allow_all_merchants" ON merchants FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_customers" ON merchant_customers FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_reminders" ON reminders FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_message_log" ON message_log FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_nexo_scores" ON nexo_scores FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_leads" ON leads FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_greenlight" ON greenlight_log FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_exchange" ON exchange_rates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_api_usage" ON api_usage FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_billing" ON billing_summaries FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_partners" ON partners FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_payments" ON payments FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "allow_all_billing_periods" ON billing_periods FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------
-- TRIGGERS: auto-update updated_at
-- -----------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS merchants_updated_at ON merchants;
CREATE TRIGGER merchants_updated_at
    BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS customers_updated_at ON merchant_customers;
CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON merchant_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS inventory_updated_at ON inventory;
CREATE TRIGGER inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------
-- VIEW: Merchant summary
-- -----------------------------------------------

DROP VIEW IF EXISTS merchant_summary;
CREATE OR REPLACE VIEW merchant_summary AS
SELECT 
    m.id,
    m.phone,
    m.name,
    m.business_name,
    m.nexo_score,
    m.total_sales,
    COALESCE(SUM(CASE WHEN mc.total_debt > 0 THEN mc.total_debt ELSE 0 END), 0) as total_pending_debt,
    COUNT(DISTINCT CASE WHEN mc.total_debt > 0 THEN mc.id END) as debtors_count,
    COUNT(DISTINCT mc.id) as total_customers,
    (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id 
     AND t.created_at >= now() - interval '7 days') as weekly_transactions
FROM merchants m
LEFT JOIN merchant_customers mc ON mc.merchant_id = m.id
GROUP BY m.id, m.phone, m.name, m.business_name, m.nexo_score, m.total_sales;

-- -----------------------------------------------
-- MIGRACIÓN: Multi-Business
-- -----------------------------------------------

-- Link multiple business profiles to one owner
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS multi_business_owner_id UUID REFERENCES merchants(id);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS multi_business_phone VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_merchants_multi_owner ON merchants(multi_business_owner_id) 
    WHERE multi_business_owner_id IS NOT NULL;

-- -----------------------------------------------
-- MIGRACIÓN: Referrals + Reports
-- -----------------------------------------------

-- Referral fields on merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- Unique index on referral_code (allow NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_referral_code 
    ON merchants(referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID REFERENCES merchants(id),
    referred_id UUID REFERENCES merchants(id),
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "allow_all_referrals" ON referrals FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Increment referral count function
CREATE OR REPLACE FUNCTION increment_referral_count(merchant_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE merchants 
    SET referral_count = COALESCE(referral_count, 0) + 1
    WHERE id = merchant_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Report tracking
CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id UUID REFERENCES merchants(id),
    report_type TEXT DEFAULT 'monthly',
    period TEXT,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    download_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reports_merchant ON generated_reports(merchant_id);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "allow_all_reports" ON generated_reports FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- ✅ LISTO! Base de datos completa.
-- 
-- Tablas creadas (17):
--   merchants, merchant_customers, transactions,
--   inventory, reminders, message_log, nexo_scores,
--   leads, greenlight_log, exchange_rates,
--   api_usage, billing_summaries, partners,
--   payments, billing_periods, referrals,
--   generated_reports
--
-- + 1 view: merchant_summary
-- + RLS en todas las tablas
-- + 4 triggers de updated_at
-- + 1 function: increment_referral_count
-- + Indexes optimizados
-- =============================================
