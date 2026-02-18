-- =============================================
-- NexoBot MVP — Schema Migration: GreenLight + Exchange Rates
-- =============================================
-- NexoFinanzas does NOT lend money or authorize credit.
-- greenlight_log tracks RISK CONSULTATIONS made by third parties
-- who use our data to make their own credit decisions.

-- GreenLight consultation log (audit trail for billing + compliance)
CREATE TABLE IF NOT EXISTS greenlight_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    score INT DEFAULT 0,
    tier VARCHAR(2),
    risk_level VARCHAR(20) DEFAULT 'unknown',     -- very_low, low, medium, high, very_high
    provider_name VARCHAR(100) DEFAULT 'unknown',  -- Who consulted
    signals_count INT DEFAULT 0,
    report_id VARCHAR(30),                         -- Unique report ID (NXR-xxxx)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for analytics and billing
CREATE INDEX IF NOT EXISTS idx_greenlight_merchant ON greenlight_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_greenlight_created ON greenlight_log(created_at);
CREATE INDEX IF NOT EXISTS idx_greenlight_provider ON greenlight_log(provider_name);

-- Exchange rates table (cached rates for multi-currency)
CREATE TABLE IF NOT EXISTS exchange_rates (
    currency_pair VARCHAR(10) PRIMARY KEY,
    buy NUMERIC(12,2) NOT NULL,
    sell NUMERIC(12,2) NOT NULL,
    mid NUMERIC(12,2) NOT NULL,
    source VARCHAR(50),
    fetched_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial USD/PYG rate
INSERT INTO exchange_rates (currency_pair, buy, sell, mid, source)
VALUES ('USD_PYG', 7300, 7400, 7350, 'initial')
ON CONFLICT (currency_pair) DO NOTHING;
