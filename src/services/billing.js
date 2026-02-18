// =============================================
// NexoBot MVP — Billing / Metering Service
// =============================================
// Tracks every API call from partners (financieras)
// and generates monthly billing summaries.
// 
// Pricing tiers:
//   free:       100 req/mo  — $0
//   starter:    500 req/mo  — $0.05/req
//   pro:      5,000 req/mo  — $0.03/req
//   enterprise: unlimited   — custom

import supabase from '../config/supabase.js';

// =============================================
// API USAGE TRACKING (Express middleware)
// =============================================

/**
 * Middleware that logs every API call from partners
 * Use on score/greenlight/external routes
 */
export function trackApiUsage(req, res, next) {
    const startTime = Date.now();
    const apiKey = req.headers['x-api-key'] || req.query.api_key || 'anonymous';

    // Override res.json to capture response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        const responseTime = Date.now() - startTime;

        // Log async (don't block response)
        logUsage({
            apiKey,
            endpoint: req.originalUrl.split('?')[0],
            method: req.method,
            statusCode: res.statusCode,
            responseTimeMs: responseTime,
            requestBody: req.method !== 'GET' ? sanitizeBody(req.body) : null,
            responseSummary: summarizeResponse(body),
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        }).catch(err => console.error('Billing log error:', err));

        return originalJson(body);
    };

    next();
}

/**
 * Log a single API usage event
 */
async function logUsage(data) {
    if (!supabase) return;

    try {
        await supabase.from('api_usage').insert({
            api_key: data.apiKey,
            endpoint: data.endpoint,
            method: data.method,
            status_code: data.statusCode,
            response_time_ms: data.responseTimeMs,
            request_body: data.requestBody,
            response_summary: data.responseSummary,
            ip_address: data.ipAddress,
            user_agent: data.userAgent
        });
    } catch (err) {
        console.error('❌ Usage log failed:', err.message);
    }
}

// =============================================
// USAGE STATS
// =============================================

/**
 * Get usage stats for a partner in a given period
 */
export async function getUsageStats(apiKey, period = null) {
    if (!supabase) return null;

    const currentPeriod = period || getCurrentPeriod();
    const startOfMonth = `${currentPeriod}-01T00:00:00`;
    const endOfMonth = getEndOfMonth(currentPeriod);

    try {
        const { data: usage, count } = await supabase
            .from('api_usage')
            .select('*', { count: 'exact' })
            .eq('api_key', apiKey)
            .gte('created_at', startOfMonth)
            .lt('created_at', endOfMonth);

        if (!usage) return { total: 0, successful: 0, failed: 0 };

        const successful = usage.filter(u => u.status_code >= 200 && u.status_code < 400).length;
        const failed = usage.filter(u => u.status_code >= 400).length;
        const avgResponseTime = usage.length > 0
            ? Math.round(usage.reduce((s, u) => s + (u.response_time_ms || 0), 0) / usage.length)
            : 0;

        // Endpoints breakdown
        const endpoints = {};
        usage.forEach(u => {
            endpoints[u.endpoint] = (endpoints[u.endpoint] || 0) + 1;
        });

        return {
            period: currentPeriod,
            total: count || usage.length,
            successful,
            failed,
            avgResponseTime,
            endpoints,
            recentCalls: usage.slice(0, 20)
        };
    } catch (err) {
        console.error('Usage stats error:', err);
        return null;
    }
}

// =============================================
// BILLING CALCULATION
// =============================================

/**
 * Calculate billing for a partner for a given period
 */
export async function calculateBilling(apiKey, period = null) {
    if (!supabase) return null;

    const currentPeriod = period || getCurrentPeriod();

    try {
        // Get partner info
        const { data: partner } = await supabase
            .from('partners')
            .select('*')
            .eq('api_key', apiKey)
            .single();

        if (!partner) return { error: 'Partner not found' };

        // Get usage
        const stats = await getUsageStats(apiKey, currentPeriod);
        if (!stats) return { error: 'No usage data' };

        // Calculate amount
        const freeRequests = getFreeRequests(partner.plan);
        const billableRequests = Math.max(0, stats.total - freeRequests);
        const rate = partner.rate_per_request || getRateForPlan(partner.plan);
        const amountDue = Math.round(billableRequests * rate * 100) / 100;

        const billing = {
            partner: partner.name,
            plan: partner.plan,
            period: currentPeriod,
            totalRequests: stats.total,
            freeRequests,
            billableRequests,
            ratePerRequest: rate,
            amountDue,
            currency: 'USD',
            limitReached: stats.total >= partner.monthly_limit,
            usagePercent: Math.round((stats.total / partner.monthly_limit) * 100)
        };

        // Upsert billing summary
        await supabase
            .from('billing_summaries')
            .upsert({
                api_key: apiKey,
                partner_name: partner.name,
                period: currentPeriod,
                total_requests: stats.total,
                successful_requests: stats.successful,
                failed_requests: stats.failed,
                avg_response_time_ms: stats.avgResponseTime,
                endpoints_breakdown: stats.endpoints,
                amount_due: amountDue,
                updated_at: new Date().toISOString()
            }, { onConflict: 'api_key,period' });

        return billing;
    } catch (err) {
        console.error('Billing calculation error:', err);
        return { error: err.message };
    }
}

// =============================================
// MONTHLY BILLING CRON
// =============================================

/**
 * Generate monthly billing summaries for all active partners
 */
export async function runBillingCron() {
    if (!supabase) return;

    try {
        const { data: partners } = await supabase
            .from('partners')
            .select('*')
            .eq('is_active', true);

        if (!partners?.length) return;

        const period = getCurrentPeriod();
        console.log(`💰 Generating billing for ${partners.length} partners (${period})...`);

        for (const partner of partners) {
            const billing = await calculateBilling(partner.api_key, period);
            if (billing && !billing.error) {
                console.log(`  📊 ${partner.name}: ${billing.totalRequests} calls → $${billing.amountDue}`);
            }
        }
    } catch (err) {
        console.error('❌ Billing cron error:', err);
    }
}

/**
 * Start billing cron — runs on 1st of each month at 6 AM PYT
 */
export function startBillingCron() {
    // Run daily check (only generates summary once per period due to upsert)
    setInterval(runBillingCron, 24 * 60 * 60 * 1000);

    // Also run on startup to generate current period
    setTimeout(runBillingCron, 10000);

    console.log('💰 Billing cron active — daily summary generation');
}

// =============================================
// RATE LIMITING CHECK
// =============================================

/**
 * Check if a partner has exceeded their monthly limit
 */
export async function checkRateLimit(apiKey) {
    if (!supabase) return { allowed: true };

    try {
        const { data: partner } = await supabase
            .from('partners')
            .select('monthly_limit, plan, is_active')
            .eq('api_key', apiKey)
            .single();

        if (!partner) return { allowed: false, error: 'Unknown API key' };
        if (!partner.is_active) return { allowed: false, error: 'API key disabled' };

        const period = getCurrentPeriod();
        const startOfMonth = `${period}-01T00:00:00`;

        const { count } = await supabase
            .from('api_usage')
            .select('*', { count: 'exact', head: true })
            .eq('api_key', apiKey)
            .gte('created_at', startOfMonth);

        const used = count || 0;
        const remaining = Math.max(0, partner.monthly_limit - used);

        return {
            allowed: used < partner.monthly_limit,
            used,
            limit: partner.monthly_limit,
            remaining,
            plan: partner.plan
        };
    } catch (err) {
        console.error('Rate limit check error:', err);
        return { allowed: true }; // fail open
    }
}

// =============================================
// HELPERS
// =============================================

function getCurrentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getEndOfMonth(period) {
    const [year, month] = period.split('-').map(Number);
    const d = new Date(year, month, 1); // 1st of next month
    return d.toISOString();
}

function getFreeRequests(plan) {
    const free = { free: 100, starter: 0, pro: 0, enterprise: 0 };
    return free[plan] || 100;
}

function getRateForPlan(plan) {
    const rates = { free: 0.10, starter: 0.05, pro: 0.03, enterprise: 0.01 };
    return rates[plan] || 0.05;
}

function sanitizeBody(body) {
    if (!body) return null;
    const safe = { ...body };
    // Remove sensitive fields
    delete safe.password;
    delete safe.pin;
    delete safe.token;
    return safe;
}

function summarizeResponse(body) {
    if (!body) return null;
    if (body.score) return `Score: ${body.score}`;
    if (body.approved !== undefined) return `Approved: ${body.approved}`;
    if (body.error) return `Error: ${body.error}`;
    return 'OK';
}

export default {
    trackApiUsage,
    getUsageStats,
    calculateBilling,
    checkRateLimit,
    startBillingCron
};
