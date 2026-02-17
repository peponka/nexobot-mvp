-- =============================================
-- NexoFinanzas — Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- MERCHANTS (comerciantes)
-- =============================================
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    
    -- Identity data (collected during onboarding)
    cedula VARCHAR(15),             -- Cédula de identidad (ej: 4523871)
    address TEXT,                   -- Dirección completa (calle, barrio)
    
    business_name VARCHAR(200),
    business_type VARCHAR(50) DEFAULT 'general',
    city VARCHAR(100),
    country VARCHAR(3) DEFAULT 'PY',
    language VARCHAR(5) DEFAULT 'es',
    monthly_volume VARCHAR(20),     -- Rango de facturación mensual
    nexo_score INT DEFAULT 0,
    total_sales BIGINT DEFAULT 0,
    total_credit_given BIGINT DEFAULT 0,
    total_collected BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    onboarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- MERCHANT CUSTOMERS (clientes del comerciante)
-- =============================================
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
    
    -- A merchant can't have two customers with the exact same name
    UNIQUE(merchant_id, name)
);

-- =============================================
-- TRANSACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES merchant_customers(id) ON DELETE SET NULL,
    
    -- Transaction type: SALE_CASH, SALE_CREDIT, PAYMENT, INVENTORY_IN
    type VARCHAR(20) NOT NULL,
    
    -- Financial
    amount BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'PYG',
    
    -- Product info (optional)
    product VARCHAR(100),
    quantity INT,
    unit_price BIGINT,
    
    -- NLP metadata
    raw_message TEXT,
    parsed_intent VARCHAR(30),
    parsed_confidence FLOAT,
    parsed_entities JSONB DEFAULT '{}',
    language_detected VARCHAR(5) DEFAULT 'es',
    
    -- Status
    status VARCHAR(20) DEFAULT 'confirmed',
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INVENTORY
-- =============================================
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

-- =============================================
-- REMINDERS (recordatorios de cobro)
-- =============================================
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

-- =============================================
-- MESSAGE LOG (for NLP training & audit)
-- =============================================
CREATE TABLE IF NOT EXISTS message_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
    phone VARCHAR(20),
    raw_message TEXT,
    bot_response TEXT,
    intent VARCHAR(30),
    confidence FLOAT,
    processing_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- NEXO SCORES (historical tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS nexo_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    score INT NOT NULL,
    components JSONB DEFAULT '{}',
    -- Components: { tx_frequency, tx_consistency, collection_ratio, 
    --               avg_days_collect, unique_customers, days_active }
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_merchants_phone ON merchants(phone);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_cedula ON merchants(cedula) WHERE cedula IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON merchant_customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON merchant_customers(merchant_id, name);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(merchant_id, type);
CREATE INDEX IF NOT EXISTS idx_inventory_merchant ON inventory(merchant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_message_log_merchant ON message_log(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexo_scores_merchant ON nexo_scores(merchant_id, created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexo_scores ENABLE ROW LEVEL SECURITY;

-- Service role policy (backend has full access)
-- Drop existing policies first to make script re-runnable
DROP POLICY IF EXISTS "Service role full access" ON merchants;
DROP POLICY IF EXISTS "Service role full access" ON merchant_customers;
DROP POLICY IF EXISTS "Service role full access" ON transactions;
DROP POLICY IF EXISTS "Service role full access" ON inventory;
DROP POLICY IF EXISTS "Service role full access" ON reminders;
DROP POLICY IF EXISTS "Service role full access" ON message_log;
DROP POLICY IF EXISTS "Service role full access" ON nexo_scores;

CREATE POLICY "Service role full access" ON merchants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON merchant_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON message_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON nexo_scores FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Auto-update updated_at timestamp
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

-- =============================================
-- VIEWS
-- =============================================

-- Merchant dashboard summary
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
