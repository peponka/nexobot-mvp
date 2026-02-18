-- =============================================
-- NexoBot MVP — Migration: Billing / Metering
-- =============================================
-- Tracks API usage by partners (financieras)
-- for billing purposes.

-- API usage log
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

-- Monthly summaries for billing
CREATE TABLE IF NOT EXISTS billing_summaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key VARCHAR(100) NOT NULL,
    partner_name VARCHAR(100),
    period VARCHAR(7) NOT NULL,          -- '2026-02' format
    total_requests INT DEFAULT 0,
    successful_requests INT DEFAULT 0,
    failed_requests INT DEFAULT 0,
    avg_response_time_ms INT,
    endpoints_breakdown JSONB,           -- { "/api/score": 45, "/api/greenlight": 30 }
    amount_due DECIMAL(12,2) DEFAULT 0,  -- calculated billing amount
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending', -- pending, invoiced, paid
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(api_key, period)
);

-- Partners table (registered API consumers)
CREATE TABLE IF NOT EXISTS partners (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(200),
    plan VARCHAR(50) DEFAULT 'free',      -- free, starter, pro, enterprise
    monthly_limit INT DEFAULT 100,         -- max requests per month
    rate_per_request DECIMAL(8,4) DEFAULT 0.05, -- USD per request
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage(api_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_period ON billing_summaries(period, api_key);
CREATE INDEX IF NOT EXISTS idx_partners_api_key ON partners(api_key);

-- Insert default partners (optional)
INSERT INTO partners (name, api_key, plan, monthly_limit, rate_per_request)
VALUES 
    ('NexoBot Internal', 'nexo-internal', 'enterprise', 999999, 0),
    ('GreenLight Demo', 'gl-demo-key', 'starter', 500, 0.05)
ON CONFLICT (api_key) DO NOTHING;
