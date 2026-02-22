// =============================================
// NexoBot MVP — Partner Portal API Routes
// =============================================
// Backend for the B2B partner dashboard.
// Partners (cooperativas/financieras) can:
//   - View API usage stats
//   - Look up NexoScores
//   - Check billing/invoices
//   - See GreenLight consultation history

import { Router } from 'express';
import supabase from '../config/supabase.js';

const router = Router();

// -----------------------------------------------
// Middleware: validate API key
// -----------------------------------------------
async function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey) {
        return res.status(401).json({ error: 'API key requerida' });
    }

    if (!supabase) {
        return res.status(503).json({ error: 'Base de datos no disponible' });
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('api_key', apiKey)
        .eq('is_active', true)
        .single();

    if (!partner) {
        return res.status(403).json({ error: 'API key inválida o desactivada' });
    }

    req.partner = partner;
    next();
}

// -----------------------------------------------
// GET /api/portal/stats — Dashboard KPI data
// -----------------------------------------------
router.get('/stats', requireApiKey, async (req, res) => {
    try {
        const partner = req.partner;
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // This month's API usage
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data: usage, count: usageCount } = await supabase
            .from('api_usage')
            .select('endpoint, status_code, response_time_ms', { count: 'exact' })
            .eq('api_key', partner.api_key)
            .gte('created_at', monthStart);

        // Count by endpoint
        const scoreCount = (usage || []).filter(u => u.endpoint?.includes('/score')).length;
        const greenlightCount = (usage || []).filter(u => u.endpoint?.includes('/greenlight')).length;
        const otherCount = (usageCount || 0) - scoreCount - greenlightCount;

        // Average response time
        const avgTime = (usage || []).length > 0
            ? Math.round((usage || []).reduce((sum, u) => sum + (u.response_time_ms || 0), 0) / usage.length)
            : 0;

        // Billing
        const { data: billingSummary } = await supabase
            .from('billing_summaries')
            .select('*')
            .eq('api_key', partner.api_key)
            .eq('period', currentPeriod)
            .single();

        // Recent API calls (last 20)
        const { data: recentCalls } = await supabase
            .from('api_usage')
            .select('endpoint, method, status_code, response_time_ms, response_summary, created_at')
            .eq('api_key', partner.api_key)
            .order('created_at', { ascending: false })
            .limit(20);

        // GreenLight history
        const { data: greenlightHistory } = await supabase
            .from('greenlight_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        res.json({
            partner: {
                name: partner.name,
                plan: partner.plan,
                monthlyLimit: partner.monthly_limit,
                apiKey: partner.api_key
            },
            kpis: {
                totalCalls: usageCount || 0,
                scoreConsults: scoreCount,
                greenlightConsults: greenlightCount,
                otherCalls: otherCount,
                avgResponseMs: avgTime,
                limit: partner.monthly_limit
            },
            billing: {
                period: currentPeriod,
                amountDue: billingSummary?.amount_due || 0,
                status: billingSummary?.status || 'al_dia',
                totalRequests: billingSummary?.total_requests || usageCount || 0
            },
            recentCalls: (recentCalls || []).map(c => ({
                date: c.created_at,
                endpoint: c.endpoint,
                status: c.status_code,
                time: c.response_time_ms,
                result: c.response_summary || ''
            })),
            greenlightHistory: (greenlightHistory || []).map(g => ({
                date: g.created_at,
                score: g.score,
                tier: g.tier,
                risk: g.risk_level,
                provider: g.provider_name,
                reportId: g.report_id
            }))
        });

    } catch (error) {
        console.error('Portal stats error:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// -----------------------------------------------
// GET /api/portal/usage-daily — Daily usage chart
// -----------------------------------------------
router.get('/usage-daily', requireApiKey, async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: usage } = await supabase
            .from('api_usage')
            .select('created_at')
            .eq('api_key', req.partner.api_key)
            .gte('created_at', thirtyDaysAgo.toISOString());

        // Group by day
        const daily = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().substring(0, 10);
            daily[key] = 0;
        }

        for (const u of (usage || [])) {
            const key = u.created_at.substring(0, 10);
            if (daily[key] !== undefined) daily[key]++;
        }

        res.json({
            labels: Object.keys(daily).map(d => {
                const [, m, day] = d.split('-');
                return `${day}/${m}`;
            }),
            values: Object.values(daily)
        });

    } catch (error) {
        console.error('Usage daily error:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// -----------------------------------------------
// GET /api/portal/payment-history
// -----------------------------------------------
router.get('/payment-history', requireApiKey, async (req, res) => {
    try {
        const { data: payments } = await supabase
            .from('payments')
            .select('*')
            .eq('partner_id', req.partner.id)
            .order('created_at', { ascending: false })
            .limit(12);

        res.json({
            payments: (payments || []).map(p => ({
                period: p.period,
                calls: p.api_calls,
                amountUsd: p.amount_usd,
                status: p.status,
                paidAt: p.paid_at,
                provider: p.provider
            }))
        });

    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
