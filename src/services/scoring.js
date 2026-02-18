// =============================================
// NexoBot MVP — NexoScore v2 Scoring Engine
// =============================================
// Calculates a 0-1000 risk score for each merchant
// based on 16 weighted variables from existing DB data.
//
// Variables grouped into 4 categories:
//   1. Transactional Data      (40%)
//   2. Collection Behavior     (25%)
//   3. Commercial Network      (20%)
//   4. Engagement & Identity   (15%)
//
// Runs as nightly cron (2am PY) and on-demand via API.

import supabase from '../config/supabase.js';

// =============================================
// SCORE CONFIGURATION
// =============================================

const MAX_SCORE = 1000;

const WEIGHTS = {
    // Category 1: Transactional Data (40%)
    tx_frequency: 0.12,   // Transactions per week
    tx_consistency: 0.10,   // Consistency of activity (low variance = good)
    revenue_trend: 0.08,   // Revenue growth/stability
    avg_ticket: 0.05,   // Average transaction size (contextual)
    multi_currency: 0.05,   // Operates in PYG + USD

    // Category 2: Collection Behavior (25%)
    collection_ratio: 0.10,   // % of credit that gets collected
    avg_days_to_collect: 0.08,   // Speed of collection
    delinquency_rate: 0.07,   // % of high-risk customers

    // Category 3: Commercial Network (20%)
    customer_diversity: 0.08,   // Number of unique active customers
    customer_retention: 0.07,   // Returning customers ratio
    network_validation: 0.05,   // Cross-validation with other NexoBot users

    // Category 4: Engagement & Identity (15%)
    days_active: 0.04,   // Time on platform
    identity_complete: 0.04,   // Onboarding completeness
    feature_adoption: 0.04,   // Diversity of features used
    reminder_efficacy: 0.03,   // Do reminders lead to payments?
};

// Score tier definitions
export const TIERS = {
    A: { min: 750, label: 'Excelente', color: '#00D2A0', creditFactor: 0.30 },
    B: { min: 600, label: 'Bueno', color: '#48DBFB', creditFactor: 0.20 },
    C: { min: 450, label: 'Regular', color: '#FECA57', creditFactor: 0.10 },
    D: { min: 300, label: 'Bajo', color: '#FF9F43', creditFactor: 0.05 },
    F: { min: 0, label: 'Sin Score', color: '#FF6B6B', creditFactor: 0 },
};

// =============================================
// MAIN: Calculate score for a single merchant
// =============================================

/**
 * Calculate NexoScore for a merchant
 * @param {string} merchantId - UUID of the merchant
 * @returns {Object} { score, tier, components, creditLimit, alerts }
 */
export async function calculateScore(merchantId) {
    if (!supabase) {
        console.log('⚠️ Scoring: Supabase not configured');
        return null;
    }

    const startTime = Date.now();

    try {
        // Fetch all needed data in parallel
        const [merchant, customers, transactions, reminders, messageLog] = await Promise.all([
            fetchMerchant(merchantId),
            fetchCustomers(merchantId),
            fetchTransactions(merchantId),
            fetchReminders(merchantId),
            fetchMessageLog(merchantId),
        ]);

        if (!merchant) {
            console.error(`❌ Scoring: Merchant ${merchantId} not found`);
            return null;
        }

        // Calculate each component
        const components = {};
        let totalScore = 0;

        // ─── CATEGORY 1: TRANSACTIONAL DATA (40%) ───

        components.tx_frequency = calcTxFrequency(transactions);
        components.tx_consistency = calcTxConsistency(transactions);
        components.revenue_trend = calcRevenueTrend(transactions);
        components.avg_ticket = calcAvgTicket(transactions, merchant.business_type);
        components.multi_currency = calcMultiCurrency(transactions);

        // ─── CATEGORY 2: COLLECTION BEHAVIOR (25%) ───

        components.collection_ratio = calcCollectionRatio(customers);
        components.avg_days_to_collect = calcAvgDaysToCollect(customers);
        components.delinquency_rate = calcDelinquencyRate(customers);

        // ─── CATEGORY 3: COMMERCIAL NETWORK (20%) ───

        components.customer_diversity = calcCustomerDiversity(customers, transactions);
        components.customer_retention = calcCustomerRetention(transactions);
        components.network_validation = await calcNetworkValidation(customers);

        // ─── CATEGORY 4: ENGAGEMENT & IDENTITY (15%) ───

        components.days_active = calcDaysActive(merchant);
        components.identity_complete = calcIdentityComplete(merchant);
        components.feature_adoption = calcFeatureAdoption(messageLog);
        components.reminder_efficacy = calcReminderEfficacy(reminders, transactions);

        // ─── CALCULATE WEIGHTED TOTAL ───

        for (const [key, weight] of Object.entries(WEIGHTS)) {
            const componentScore = components[key]?.normalized || 0;
            totalScore += componentScore * weight;
        }

        // Scale to 0-1000
        const score = Math.round(totalScore * MAX_SCORE);

        // Determine tier
        const tier = getTier(score);

        // Calculate suggested credit limit
        const monthlySales = calcMonthlySales(transactions);
        const creditLimit = Math.round(monthlySales * tier.creditFactor);

        // Generate alerts
        const alerts = generateAlerts(components, score, merchant);

        // Build result
        const result = {
            merchant_id: merchantId,
            score,
            tier: {
                grade: Object.entries(TIERS).find(([, t]) => score >= t.min)?.[0] || 'F',
                label: tier.label,
                color: tier.color,
            },
            components,
            creditLimit,
            monthlySales,
            alerts,
            calculated_at: new Date().toISOString(),
            processing_time_ms: Date.now() - startTime,
        };

        // Save to database
        await saveScore(merchantId, result);

        console.log(`📊 NexoScore: ${merchant.name || merchant.phone} → ${score}/1000 (${result.tier.grade}) [${result.processing_time_ms}ms]`);

        return result;

    } catch (error) {
        console.error(`❌ Scoring error for ${merchantId}:`, error);
        return null;
    }
}

// =============================================
// COMPONENT CALCULATORS
// =============================================

// ─── 1. TRANSACTION FREQUENCY ───
function calcTxFrequency(transactions) {
    const last30d = filterDays(transactions, 30);
    const txPerWeek = last30d.length / 4.3; // ~4.3 weeks in 30 days

    // Score: 0 tx/week = 0, 3+ tx/week = 0.7, 7+ = 0.9, 14+ = 1.0
    let normalized;
    if (txPerWeek >= 14) normalized = 1.0;
    else if (txPerWeek >= 7) normalized = 0.85 + (txPerWeek - 7) / 7 * 0.15;
    else if (txPerWeek >= 3) normalized = 0.6 + (txPerWeek - 3) / 4 * 0.25;
    else if (txPerWeek >= 1) normalized = 0.3 + (txPerWeek - 1) / 2 * 0.3;
    else normalized = txPerWeek * 0.3;

    return {
        raw: Math.round(txPerWeek * 10) / 10,
        label: `${Math.round(txPerWeek * 10) / 10} tx/semana`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 2. TRANSACTION CONSISTENCY ───
function calcTxConsistency(transactions) {
    const last30d = filterDays(transactions, 30);
    if (last30d.length < 5) {
        return { raw: 0, label: 'Datos insuficientes', normalized: 0.1 };
    }

    // Count transactions per day
    const dailyCounts = {};
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyCounts[d.toISOString().split('T')[0]] = 0;
    }

    last30d.forEach(tx => {
        const key = tx.created_at.split('T')[0];
        if (dailyCounts[key] !== undefined) dailyCounts[key]++;
    });

    const counts = Object.values(dailyCounts);
    const activeDays = counts.filter(c => c > 0).length;
    const activeDayRatio = activeDays / 30;

    // Also measure variance of active days
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 999;

    // Score: active 20+ days/month with low CV = 1.0
    let normalized;
    if (activeDays >= 20 && cv < 1.0) normalized = 1.0;
    else if (activeDays >= 15) normalized = 0.7 + (activeDays - 15) / 10 * 0.3;
    else if (activeDays >= 8) normalized = 0.4 + (activeDays - 8) / 7 * 0.3;
    else normalized = activeDays / 8 * 0.4;

    return {
        raw: { activeDays, cv: Math.round(cv * 100) / 100 },
        label: `${activeDays} días activos, CV: ${Math.round(cv * 100) / 100}`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 3. REVENUE TREND ───
function calcRevenueTrend(transactions) {
    const saleTx = transactions.filter(t => ['SALE_CASH', 'SALE_CREDIT'].includes(t.type));

    const current30d = filterDays(saleTx, 30).reduce((s, t) => s + t.amount, 0);
    const prev30d = filterDaysRange(saleTx, 30, 60).reduce((s, t) => s + t.amount, 0);

    if (prev30d === 0 && current30d === 0) {
        return { raw: 0, label: 'Sin datos', normalized: 0.1 };
    }

    if (prev30d === 0) {
        return { raw: 999, label: 'Nuevo (creciendo)', normalized: 0.6 };
    }

    const ratio = current30d / prev30d;

    // Score: ratio 1.0 (stable) = 0.7, growing = up to 1.0, declining = lower
    let normalized;
    if (ratio >= 1.2) normalized = 1.0;      // Growing 20%+
    else if (ratio >= 1.0) normalized = 0.7 + (ratio - 1.0) / 0.2 * 0.3; // Stable to growing
    else if (ratio >= 0.8) normalized = 0.4 + (ratio - 0.8) / 0.2 * 0.3; // Slight decline
    else if (ratio >= 0.5) normalized = 0.2 + (ratio - 0.5) / 0.3 * 0.2; // Decline
    else normalized = ratio * 0.4;            // Severe decline

    return {
        raw: Math.round(ratio * 100) / 100,
        label: ratio >= 1 ? `+${Math.round((ratio - 1) * 100)}% vs mes anterior` : `${Math.round((ratio - 1) * 100)}% vs mes anterior`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 4. AVERAGE TICKET ───
function calcAvgTicket(transactions, businessType) {
    const sales = filterDays(transactions, 30).filter(t => ['SALE_CASH', 'SALE_CREDIT'].includes(t.type));
    if (sales.length === 0) {
        return { raw: 0, label: 'Sin ventas', normalized: 0.1 };
    }

    const avgTicket = sales.reduce((s, t) => s + t.amount, 0) / sales.length;

    // Expected ranges by business type (in Guaraníes)
    const expectedRange = {
        'almacen': { min: 50000, ideal: 200000 },
        'despensa': { min: 30000, ideal: 150000 },
        'distribuidora': { min: 200000, ideal: 1000000 },
        'kiosco': { min: 10000, ideal: 50000 },
        'ferretería': { min: 100000, ideal: 500000 },
        'farmacia': { min: 50000, ideal: 200000 },
        'restaurante': { min: 30000, ideal: 150000 },
        'taller / servicio': { min: 100000, ideal: 500000 },
        'default': { min: 30000, ideal: 200000 },
    };

    const range = expectedRange[businessType] || expectedRange['default'];

    // Score: within expected range = high, too low or too high = lower
    let normalized;
    if (avgTicket >= range.ideal) normalized = 0.9;
    else if (avgTicket >= range.min) normalized = 0.5 + (avgTicket - range.min) / (range.ideal - range.min) * 0.4;
    else normalized = Math.max(0.1, avgTicket / range.min * 0.5);

    return {
        raw: Math.round(avgTicket),
        label: `Gs. ${formatCompact(avgTicket)} promedio`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 5. MULTI-CURRENCY ───
function calcMultiCurrency(transactions) {
    const last90d = filterDays(transactions, 90);
    const currencies = new Set(last90d.map(t => t.currency || 'PYG'));
    const isMulti = currencies.size > 1;

    return {
        raw: Array.from(currencies),
        label: isMulti ? 'PYG + USD (bi-monetario)' : 'Solo PYG',
        normalized: isMulti ? 1.0 : 0.5,
    };
}

// ─── 6. COLLECTION RATIO ───
function calcCollectionRatio(customers) {
    const totalDebt = customers.reduce((s, c) => s + (c.total_debt || 0), 0);
    const totalPaid = customers.reduce((s, c) => s + (c.total_paid || 0), 0);
    const totalCredit = totalDebt + totalPaid;

    if (totalCredit === 0) {
        return { raw: 1, label: 'Sin fiado (100%)', normalized: 0.8 };
    }

    const ratio = totalPaid / totalCredit;

    // Score: 90%+ collected = 1.0, 75%+ = 0.7, <50% = low
    let normalized;
    if (ratio >= 0.90) normalized = 1.0;
    else if (ratio >= 0.75) normalized = 0.7 + (ratio - 0.75) / 0.15 * 0.3;
    else if (ratio >= 0.50) normalized = 0.4 + (ratio - 0.50) / 0.25 * 0.3;
    else normalized = ratio * 0.8;

    return {
        raw: Math.round(ratio * 100),
        label: `${Math.round(ratio * 100)}% cobrado`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 7. AVG DAYS TO COLLECT ───
function calcAvgDaysToCollect(customers) {
    const withData = customers.filter(c => c.avg_days_to_pay > 0);
    if (withData.length === 0) {
        return { raw: 0, label: 'Sin datos', normalized: 0.5 };
    }

    const avgDays = withData.reduce((s, c) => s + c.avg_days_to_pay, 0) / withData.length;

    // Score: ≤3 days = 1.0, ≤7 days = 0.8, ≤15 = 0.5, >30 = low
    let normalized;
    if (avgDays <= 3) normalized = 1.0;
    else if (avgDays <= 7) normalized = 0.8 + (7 - avgDays) / 4 * 0.2;
    else if (avgDays <= 15) normalized = 0.5 + (15 - avgDays) / 8 * 0.3;
    else if (avgDays <= 30) normalized = 0.2 + (30 - avgDays) / 15 * 0.3;
    else normalized = Math.max(0.05, 0.2 - (avgDays - 30) / 60 * 0.15);

    return {
        raw: Math.round(avgDays * 10) / 10,
        label: `${Math.round(avgDays)} días promedio`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 8. DELINQUENCY RATE ───
function calcDelinquencyRate(customers) {
    if (customers.length === 0) {
        return { raw: 0, label: 'Sin clientes', normalized: 0.5 };
    }

    const highRisk = customers.filter(c => c.risk_level === 'high').length;
    const rate = highRisk / customers.length;

    // Score: 0% high risk = 1.0, <5% = 0.8, <10% = 0.6, >20% = low
    let normalized;
    if (rate === 0) normalized = 1.0;
    else if (rate <= 0.05) normalized = 0.8 + (0.05 - rate) / 0.05 * 0.2;
    else if (rate <= 0.10) normalized = 0.6 + (0.10 - rate) / 0.05 * 0.2;
    else if (rate <= 0.20) normalized = 0.3 + (0.20 - rate) / 0.10 * 0.3;
    else normalized = Math.max(0.05, 0.3 - rate);

    return {
        raw: Math.round(rate * 100),
        label: `${Math.round(rate * 100)}% alto riesgo`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 9. CUSTOMER DIVERSITY ───
function calcCustomerDiversity(customers, transactions) {
    const last30d = filterDays(transactions, 30);
    const activeCustomerIds = new Set(last30d.filter(t => t.customer_id).map(t => t.customer_id));

    const count = activeCustomerIds.size;

    // Score: 1 customer = 0.2, 5 = 0.5, 10 = 0.7, 20+ = 1.0
    let normalized;
    if (count >= 20) normalized = 1.0;
    else if (count >= 10) normalized = 0.7 + (count - 10) / 10 * 0.3;
    else if (count >= 5) normalized = 0.5 + (count - 5) / 5 * 0.2;
    else if (count >= 1) normalized = 0.2 + (count - 1) / 4 * 0.3;
    else normalized = 0.05;

    return {
        raw: count,
        label: `${count} clientes activos (30d)`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 10. CUSTOMER RETENTION ───
function calcCustomerRetention(transactions) {
    const currentMonth = filterDays(transactions, 30);
    const prevMonth = filterDaysRange(transactions, 30, 60);

    const currentCustomers = new Set(currentMonth.filter(t => t.customer_id).map(t => t.customer_id));
    const prevCustomers = new Set(prevMonth.filter(t => t.customer_id).map(t => t.customer_id));

    if (prevCustomers.size === 0) {
        return { raw: 0, label: 'Primer mes', normalized: 0.4 };
    }

    // How many of last month's customers returned this month?
    let retained = 0;
    prevCustomers.forEach(cid => {
        if (currentCustomers.has(cid)) retained++;
    });

    const ratio = retained / prevCustomers.size;

    // Score: 80%+ retention = 1.0, 60%+ = 0.7, <40% = low
    let normalized;
    if (ratio >= 0.80) normalized = 0.9 + (ratio - 0.80) / 0.20 * 0.1;
    else if (ratio >= 0.60) normalized = 0.6 + (ratio - 0.60) / 0.20 * 0.3;
    else if (ratio >= 0.40) normalized = 0.3 + (ratio - 0.40) / 0.20 * 0.3;
    else normalized = ratio * 0.75;

    return {
        raw: Math.round(ratio * 100),
        label: `${Math.round(ratio * 100)}% retención`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 11. NETWORK VALIDATION ───
async function calcNetworkValidation(customers) {
    if (!supabase || customers.length === 0) {
        return { raw: 0, label: 'Sin validación cruzada', normalized: 0.3 };
    }

    // Check if any of this merchant's customers are also NexoBot users (merchants)
    const customerPhones = customers.filter(c => c.phone).map(c => c.phone);

    if (customerPhones.length === 0) {
        return { raw: 0, label: 'Clientes sin teléfono', normalized: 0.3 };
    }

    try {
        const { data: matchedMerchants } = await supabase
            .from('merchants')
            .select('id')
            .in('phone', customerPhones);

        const crossValidated = (matchedMerchants || []).length;

        // Score: 0 cross-validated = 0.3, 1-2 = 0.5, 3-5 = 0.7, 5+ = 1.0
        let normalized;
        if (crossValidated >= 5) normalized = 1.0;
        else if (crossValidated >= 3) normalized = 0.7 + (crossValidated - 3) / 2 * 0.3;
        else if (crossValidated >= 1) normalized = 0.45 + (crossValidated - 1) / 2 * 0.25;
        else normalized = 0.3;

        return {
            raw: crossValidated,
            label: `${crossValidated} clientes también en NexoBot`,
            normalized,
        };
    } catch {
        return { raw: 0, label: 'Error de validación', normalized: 0.3 };
    }
}

// ─── 12. DAYS ACTIVE ───
function calcDaysActive(merchant) {
    const createdAt = new Date(merchant.created_at);
    const now = new Date();
    const days = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    // Score: 7 days = 0.15, 30 = 0.4, 60 = 0.6, 90 = 0.8, 180+ = 1.0
    let normalized;
    if (days >= 180) normalized = 1.0;
    else if (days >= 90) normalized = 0.75 + (days - 90) / 90 * 0.25;
    else if (days >= 60) normalized = 0.6 + (days - 60) / 30 * 0.15;
    else if (days >= 30) normalized = 0.35 + (days - 30) / 30 * 0.25;
    else if (days >= 7) normalized = 0.1 + (days - 7) / 23 * 0.25;
    else normalized = days / 7 * 0.1;

    return {
        raw: days,
        label: `${days} días en plataforma`,
        normalized: Math.min(1, normalized),
    };
}

// ─── 13. IDENTITY COMPLETE ───
function calcIdentityComplete(merchant) {
    const fields = [
        merchant.name,
        merchant.cedula,
        merchant.address,
        merchant.city,
        merchant.business_name,
        merchant.business_type && merchant.business_type !== 'general',
        merchant.monthly_volume && merchant.monthly_volume !== 'no_especificado',
        merchant.onboarded_at,
    ];

    const completed = fields.filter(Boolean).length;
    const total = fields.length;
    const ratio = completed / total;

    return {
        raw: { completed, total },
        label: `${completed}/${total} campos completos`,
        normalized: ratio,
    };
}

// ─── 14. FEATURE ADOPTION ───
function calcFeatureAdoption(messageLog) {
    const allIntents = [
        'SALE_CREDIT', 'SALE_CASH', 'PAYMENT', 'DEBT_QUERY',
        'SALES_QUERY', 'INVENTORY_IN', 'REMINDER', 'GREETING', 'HELP',
    ];

    const usedIntents = new Set(messageLog.map(m => m.intent).filter(Boolean));
    // Don't count GREETING and HELP as "feature" adoption — they're passive
    const meaningfulIntents = ['SALE_CREDIT', 'SALE_CASH', 'PAYMENT', 'DEBT_QUERY', 'SALES_QUERY', 'INVENTORY_IN', 'REMINDER'];
    const usedMeaningful = meaningfulIntents.filter(i => usedIntents.has(i));

    const ratio = usedMeaningful.length / meaningfulIntents.length;

    return {
        raw: { used: usedMeaningful, total: meaningfulIntents.length },
        label: `${usedMeaningful.length}/${meaningfulIntents.length} features usados`,
        normalized: ratio,
    };
}

// ─── 15. REMINDER EFFICACY ───
function calcReminderEfficacy(reminders, transactions) {
    const sentReminders = reminders.filter(r => r.status === 'sent');

    if (sentReminders.length === 0) {
        return { raw: 0, label: 'Sin recordatorios enviados', normalized: 0.5 };
    }

    // Check how many reminders were followed by a payment within 7 days
    let effectiveReminders = 0;
    const payments = transactions.filter(t => t.type === 'PAYMENT');

    for (const reminder of sentReminders) {
        const reminderDate = new Date(reminder.sent_at);
        const windowEnd = new Date(reminderDate.getTime() + 7 * 24 * 60 * 60 * 1000);

        const paymentAfter = payments.find(p => {
            const pDate = new Date(p.created_at);
            return pDate >= reminderDate && pDate <= windowEnd
                && p.customer_id === reminder.customer_id;
        });

        if (paymentAfter) effectiveReminders++;
    }

    const efficacy = effectiveReminders / sentReminders.length;

    // Score: 50%+ efficacy = 0.9, 30%+ = 0.7, 10%+ = 0.5
    let normalized;
    if (efficacy >= 0.50) normalized = 0.9 + (efficacy - 0.50) / 0.50 * 0.1;
    else if (efficacy >= 0.30) normalized = 0.65 + (efficacy - 0.30) / 0.20 * 0.25;
    else if (efficacy >= 0.10) normalized = 0.4 + (efficacy - 0.10) / 0.20 * 0.25;
    else normalized = 0.3 + efficacy;

    return {
        raw: Math.round(efficacy * 100),
        label: `${Math.round(efficacy * 100)}% recordatorios efectivos`,
        normalized: Math.min(1, normalized),
    };
}

// =============================================
// DATA FETCHERS
// =============================================

async function fetchMerchant(merchantId) {
    const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', merchantId)
        .single();
    return data;
}

async function fetchCustomers(merchantId) {
    const { data } = await supabase
        .from('merchant_customers')
        .select('*')
        .eq('merchant_id', merchantId);
    return data || [];
}

async function fetchTransactions(merchantId) {
    // Last 90 days of transactions
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const { data } = await supabase
        .from('transactions')
        .select('id, type, amount, currency, customer_id, created_at')
        .eq('merchant_id', merchantId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false });
    return data || [];
}

async function fetchReminders(merchantId) {
    const { data } = await supabase
        .from('reminders')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false })
        .limit(100);
    return data || [];
}

async function fetchMessageLog(merchantId) {
    const { data } = await supabase
        .from('message_log')
        .select('intent')
        .eq('merchant_id', merchantId);
    return data || [];
}

// =============================================
// HELPERS
// =============================================

function filterDays(items, days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return items.filter(i => new Date(i.created_at) >= since);
}

function filterDaysRange(items, startDaysAgo, endDaysAgo) {
    const start = new Date();
    start.setDate(start.getDate() - endDaysAgo);
    const end = new Date();
    end.setDate(end.getDate() - startDaysAgo);
    return items.filter(i => {
        const d = new Date(i.created_at);
        return d >= start && d < end;
    });
}

function calcMonthlySales(transactions) {
    const last30d = filterDays(transactions, 30);
    return last30d
        .filter(t => ['SALE_CASH', 'SALE_CREDIT'].includes(t.type))
        .reduce((s, t) => s + t.amount, 0);
}

function getTier(score) {
    for (const [, tier] of Object.entries(TIERS)) {
        if (score >= tier.min) return tier;
    }
    return TIERS.F;
}

function formatCompact(amount) {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
    return amount.toString();
}

function generateAlerts(components, score, merchant) {
    const alerts = [];

    // Revenue declining
    if (components.revenue_trend?.normalized < 0.4) {
        alerts.push({
            type: 'warning',
            code: 'REVENUE_DECLINE',
            message: 'Ingresos en baja vs mes anterior',
        });
    }

    // Poor collection
    if (components.collection_ratio?.normalized < 0.4) {
        alerts.push({
            type: 'critical',
            code: 'LOW_COLLECTION',
            message: 'Ratio de cobranza bajo (<50%)',
        });
    }

    // High delinquency
    if (components.delinquency_rate?.normalized < 0.4) {
        alerts.push({
            type: 'warning',
            code: 'HIGH_DELINQUENCY',
            message: 'Alto porcentaje de clientes morosos',
        });
    }

    // Low activity
    if (components.tx_frequency?.normalized < 0.3) {
        alerts.push({
            type: 'info',
            code: 'LOW_ACTIVITY',
            message: 'Actividad transaccional baja',
        });
    }

    // Identity incomplete
    if (components.identity_complete?.normalized < 0.5) {
        alerts.push({
            type: 'info',
            code: 'INCOMPLETE_PROFILE',
            message: 'Perfil incompleto — completar onboarding',
        });
    }

    // Score drop alert (compare to previous)
    // This is set by the batch process, not calculated here

    return alerts;
}

// =============================================
// DATABASE: Save score
// =============================================

async function saveScore(merchantId, result) {
    if (!supabase) return;

    try {
        // Insert snapshot into nexo_scores
        await supabase.from('nexo_scores').insert({
            merchant_id: merchantId,
            score: result.score,
            components: {
                tier: result.tier,
                variables: Object.fromEntries(
                    Object.entries(result.components).map(([key, val]) => [
                        key,
                        { normalized: val.normalized, raw: val.raw, label: val.label }
                    ])
                ),
                credit_limit: result.creditLimit,
                monthly_sales: result.monthlySales,
                alerts: result.alerts,
            },
        });

        // Update merchant's current score
        await supabase
            .from('merchants')
            .update({ nexo_score: result.score })
            .eq('id', merchantId);

    } catch (error) {
        console.error(`❌ Error saving score for ${merchantId}:`, error);
    }
}

// =============================================
// BATCH: Process all merchants (cron)
// =============================================

/**
 * Recalculate scores for ALL active merchants
 * Called by cron job at 2am PY time
 */
export async function processAllScores() {
    if (!supabase) {
        console.log('⚠️ Scoring batch: Supabase not configured');
        return { processed: 0, errors: 0 };
    }

    console.log('📊 Starting NexoScore batch processing...');
    const startTime = Date.now();
    const stats = { processed: 0, errors: 0, avgScore: 0, totalScore: 0 };

    try {
        const { data: merchants, error } = await supabase
            .from('merchants')
            .select('id, name, phone')
            .eq('status', 'active');

        if (error || !merchants) {
            console.error('❌ Scoring batch DB error:', error);
            return stats;
        }

        for (const merchant of merchants) {
            try {
                const result = await calculateScore(merchant.id);
                if (result) {
                    stats.processed++;
                    stats.totalScore += result.score;
                }
            } catch (err) {
                console.error(`❌ Scoring error for ${merchant.name || merchant.phone}:`, err.message);
                stats.errors++;
            }
        }

        stats.avgScore = stats.processed > 0
            ? Math.round(stats.totalScore / stats.processed)
            : 0;

        const elapsed = Date.now() - startTime;
        console.log(`📊 NexoScore batch done: ${stats.processed} scored, ${stats.errors} errors, avg score: ${stats.avgScore}/1000 [${elapsed}ms]`);

        return stats;

    } catch (error) {
        console.error('❌ Scoring batch error:', error);
        return stats;
    }
}

// =============================================
// LOOKUP: Get score by cédula or phone
// =============================================

/**
 * Look up a merchant's score by cédula or phone
 * Used by the public API for financieras/providers
 */
export async function lookupScore(identifier) {
    if (!supabase) return null;

    // Clean identifier
    const clean = identifier.replace(/[^0-9+]/g, '');

    // Try phone first, then cédula
    let merchant;

    // If starts with + or has 10+ digits, try as phone
    if (clean.startsWith('+') || clean.length >= 10) {
        const { data } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name, nexo_score, cedula, city, business_type, created_at')
            .eq('phone', clean.startsWith('+') ? clean : `+${clean}`)
            .single();
        merchant = data;
    }

    // Try as cédula
    if (!merchant) {
        const { data } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name, nexo_score, cedula, city, business_type, created_at')
            .eq('cedula', clean)
            .single();
        merchant = data;
    }

    if (!merchant) return null;

    // Get latest full score
    const { data: latestScore } = await supabase
        .from('nexo_scores')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    // Get score history (last 30 snapshots)
    const { data: history } = await supabase
        .from('nexo_scores')
        .select('score, created_at')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(30);

    return {
        merchant: {
            name: merchant.name,
            business_name: merchant.business_name,
            city: merchant.city,
            business_type: merchant.business_type,
            member_since: merchant.created_at,
        },
        score: merchant.nexo_score,
        tier: Object.entries(TIERS).find(([, t]) => merchant.nexo_score >= t.min)?.[0] || 'F',
        tierInfo: getTier(merchant.nexo_score),
        components: latestScore?.components || null,
        history: (history || []).map(h => ({ score: h.score, date: h.created_at })),
        last_calculated: latestScore?.created_at || null,
    };
}

// =============================================
// CRON SCHEDULER
// =============================================

let scoringInterval = null;

/**
 * Start the nightly scoring cron job
 * Runs at 2:00 AM Paraguay time (UTC-3) = 5:00 UTC
 */
export function startScoringCron() {
    const now = new Date();
    const pyHour = (now.getUTCHours() - 3 + 24) % 24;

    let msUntilTwo;
    if (pyHour < 2) {
        msUntilTwo = ((2 - pyHour) * 60 - now.getUTCMinutes()) * 60 * 1000;
    } else {
        msUntilTwo = ((24 - pyHour + 2) * 60 - now.getUTCMinutes()) * 60 * 1000;
    }

    console.log(`📊 Scoring cron: next run in ${Math.round(msUntilTwo / 1000 / 60)} minutes`);

    setTimeout(() => {
        processAllScores();

        scoringInterval = setInterval(() => {
            processAllScores();
        }, 24 * 60 * 60 * 1000);
    }, msUntilTwo);
}

export function stopScoringCron() {
    if (scoringInterval) {
        clearInterval(scoringInterval);
        scoringInterval = null;
    }
}

export default {
    calculateScore,
    processAllScores,
    lookupScore,
    startScoringCron,
    stopScoringCron,
    TIERS,
};
