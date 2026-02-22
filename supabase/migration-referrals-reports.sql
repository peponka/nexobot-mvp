-- =============================================
-- NexoBot — Migration: Referrals + Reports
-- =============================================
-- Adds referral tracking and report generation support

-- 1. Add referral_code to merchants (if not exists)
DO $$ BEGIN
    ALTER TABLE merchants ADD COLUMN referral_code TEXT UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE merchants ADD COLUMN referral_count INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE merchants ADD COLUMN referred_by TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID REFERENCES merchants(id),
    referred_id UUID REFERENCES merchants(id),
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_merchants_referral_code ON merchants(referral_code);

-- 4. RLS for referrals
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "referrals_own_data" ON referrals
        FOR ALL USING (auth.uid()::text = referrer_id::text);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Function to increment referral count
CREATE OR REPLACE FUNCTION increment_referral_count(merchant_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE merchants 
    SET referral_count = COALESCE(referral_count, 0) + 1
    WHERE id = merchant_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Reports tracking table (optional - track generated reports)
CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id UUID REFERENCES merchants(id),
    report_type TEXT DEFAULT 'monthly',
    period TEXT, -- e.g., '2026-02'
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    download_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reports_merchant ON generated_reports(merchant_id);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "reports_own_data" ON generated_reports
        FOR ALL USING (auth.uid()::text = merchant_id::text);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
