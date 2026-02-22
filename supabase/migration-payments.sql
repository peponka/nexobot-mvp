-- =============================================
-- NexoBot — Payments Migration
-- =============================================
-- Table to track all payment transactions
-- from B2B partners (Stripe, Bancard).
-- Run in Supabase SQL Editor.
-- =============================================

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id UUID REFERENCES partners(id),
    period VARCHAR(7) NOT NULL,                    -- e.g. '2026-02'
    amount_pyg BIGINT NOT NULL DEFAULT 0,
    amount_usd DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, expired, refunded, failed
    provider VARCHAR(20) NOT NULL,                 -- stripe, bancard
    provider_session_id VARCHAR(255),              -- checkout session id
    provider_payment_id VARCHAR(255),              -- payment intent id
    api_calls INTEGER DEFAULT 0,
    plan VARCHAR(20) DEFAULT 'starter',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Billing periods tracking
CREATE TABLE IF NOT EXISTS billing_periods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id UUID REFERENCES partners(id),
    period VARCHAR(7) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, paid, overdue
    amount_pyg BIGINT DEFAULT 0,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(partner_id, period)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_partner ON payments(partner_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period);
CREATE INDEX IF NOT EXISTS idx_payments_provider_session ON payments(provider_session_id);
CREATE INDEX IF NOT EXISTS idx_billing_periods_partner ON billing_periods(partner_id);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_periods ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on payments"
    ON payments FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on billing_periods"
    ON billing_periods FOR ALL
    USING (true)
    WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();
