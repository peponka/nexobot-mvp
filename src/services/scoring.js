// =============================================
// NexoBot MVP — NexoScore Comercial (B2B)
// =============================================
// Calcula un score de 0 a 1000 para el COMERCIANTE (Dueño del local).
// Mide la salud de su negocio, sus ventas y su madurez
// para que bancos le otorguen créditos.

import supabase from '../config/supabase.js';

const MAX_SCORE = 1000;

// Nueva estructura de pesos enfocada 100% en el negocio
const WEIGHTS = {
    revenue_volume: 0.40, // 40% - Volumen de Ventas (Capacidad de pago)
    tx_consistency: 0.30, // 30% - Recurrencia de Uso (Días activos al mes)
    days_active: 0.15,    // 15% - Antigüedad en NexoBot
    credit_maturity: 0.15 // 15% - ¿Da fiado? (Si da fiado tiene espalda y clientes fijos)
};

export const TIERS = {
    A: { min: 800, label: 'Excelente (Verde)', color: '#00D2A0', creditFactor: 0.30 },
    B: { min: 600, label: 'Buen Pagador (Amarillo)', color: '#FECA57', creditFactor: 0.20 },
    C: { min: 400, label: 'Riesgo Medio (Naranja)', color: '#FF9F43', creditFactor: 0.10 },
    D: { min: 0, label: 'Alto Riesgo (Rojo)', color: '#FF6B6B', creditFactor: 0.05 },
};

export async function calculateScore(merchantId) {
    if (!supabase) return null;

    const startTime = Date.now();

    try {
        const [merchant, transactions] = await Promise.all([
            fetchMerchant(merchantId),
            fetchTransactions(merchantId),
        ]);

        if (!merchant) return null;

        const components = {};
        let totalScore = 0;

        components.revenue_volume = calcRevenueVolume(transactions);
        components.tx_consistency = calcTxConsistency(transactions);
        components.days_active = calcDaysActive(merchant);
        components.credit_maturity = calcCreditMaturity(transactions);

        for (const [key, weight] of Object.entries(WEIGHTS)) {
            const componentScore = components[key]?.normalized || 0;
            totalScore += componentScore * weight;
        }

        const score = Math.round(totalScore * MAX_SCORE);
        const tier = getTier(score);

        const monthlySales = calcMonthlySales(transactions);
        const creditLimit = Math.round(monthlySales * tier.creditFactor);

        const alerts = generateAlerts(components, score, merchant);

        const result = {
            merchant_id: merchantId,
            score,
            tier: {
                grade: Object.entries(TIERS).find(([, t]) => score >= t.min)?.[0] || 'D',
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

        await saveScore(merchantId, result);

        console.log(`📊 NexoScore: ${merchant.name || merchant.phone} → ${score}/1000 (${result.tier.grade}) [${result.processing_time_ms}ms]`);

        return result;

    } catch (error) {
        console.error(`❌ Scoring error for ${merchantId}:`, error);
        return null;
    }
}

// ─── 1. REVENUE VOLUME (40%) ───
function calcRevenueVolume(transactions) {
    const last30d = filterDays(transactions, 30);
    const volume = last30d.reduce((s, t) => s + (t.amount || 0), 0);

    // Scale: 0 -> 0; 5M -> 0.5; 15M -> 0.8; 30M+ -> 1.0
    let normalized = 0;
    if (volume >= 30000000) normalized = 1.0;
    else if (volume >= 15000000) normalized = 0.8 + (volume - 15000000) / 15000000 * 0.2;
    else if (volume >= 5000000) normalized = 0.5 + (volume - 5000000) / 10000000 * 0.3;
    else normalized = volume / 5000000 * 0.5;

    return {
        raw: volume,
        label: `Volumen 30d: Gs. ${~~(volume / 1000)}k`,
        normalized: Math.min(1, Math.max(0, normalized))
    };
}

// ─── 2. TX CONSISTENCY (30%) ───
function calcTxConsistency(transactions) {
    const last30d = filterDays(transactions, 30);

    // Contamos días únicos facturando
    const activeDays = new Set();
    last30d.forEach(tx => activeDays.add(tx.created_at.split('T')[0]));

    const days = activeDays.size;

    // Scale: 20+ days is excellent
    let normalized = 0;
    if (days >= 20) normalized = 1.0;
    else if (days >= 10) normalized = 0.6 + (days - 10) / 10 * 0.4;
    else normalized = days / 10 * 0.6;

    return {
        raw: days,
        label: `${days} días de uso en último mes`,
        normalized
    };
}

// ─── 3. DAYS ACTIVE (15%) ───
function calcDaysActive(merchant) {
    const createdAt = new Date(merchant.created_at || Date.now());
    const days = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Scale: 90+ days = 1.0
    let normalized = 0;
    if (days >= 90) normalized = 1.0;
    else if (days >= 30) normalized = 0.5 + (days - 30) / 60 * 0.5;
    else normalized = days / 30 * 0.5;

    return {
        raw: days,
        label: `${days} días antigüedad`,
        normalized
    };
}

// ─── 4. CREDIT MATURITY (15%) ───
// Si da fiado frecuentemente y tiene variedad de clientes, es un comercio establecido.
function calcCreditMaturity(transactions) {
    const last30d = filterDays(transactions, 30);
    const credits = last30d.filter(t => t.type === 'SALE_CREDIT');

    const count = credits.length;
    let normalized = 0;

    if (count >= 15) normalized = 1.0;
    else if (count >= 5) normalized = 0.6 + (count - 5) / 10 * 0.4;
    else normalized = count / 5 * 0.6;

    return {
        raw: count,
        label: `${count} fiados otorgados (30d)`,
        normalized
    };
}


function filterDays(items, days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return items.filter(i => new Date(i.created_at) >= since);
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
    return TIERS.D;
}

function generateAlerts(components, score, merchant) {
    const alerts = [];
    if (components.tx_consistency.raw < 5) {
        alerts.push({ type: 'warning', code: 'LOW_USAGE', message: 'Uso irregular de NexoBot' });
    }
    if (components.revenue_volume.raw < 500000) {
        alerts.push({ type: 'critical', code: 'LOW_VOLUME', message: 'Volumen mensual muy bajo' });
    }
    return alerts;
}

async function fetchMerchant(merchantId) {
    const { data } = await supabase.from('merchants').select('*').eq('id', merchantId).single();
    return data;
}

async function fetchTransactions(merchantId) {
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

async function saveScore(merchantId, result) {
    try {
        await supabase.from('nexo_scores').insert({
            merchant_id: merchantId,
            score: result.score,
            components: {
                tier: result.tier,
                variables: result.components,
                credit_limit: result.creditLimit,
                monthly_sales: result.monthlySales,
                alerts: result.alerts,
            },
        });

        await supabase.from('merchants').update({ nexo_score: result.score }).eq('id', merchantId);
    } catch (e) {
        console.error('Error saving:', e.message);
    }
}

export async function processAllScores() {
    if (!supabase) return;
    const stats = { processed: 0, errors: 0 };
    try {
        const { data: merchants } = await supabase.from('merchants').select('id');
        if (!merchants) return stats;

        for (const m of merchants) {
            try {
                const res = await calculateScore(m.id);
                if (res) stats.processed++;
            } catch (e) {
                stats.errors++;
            }
        }
    } catch { }
    return stats;
}

export async function lookupScore(identifier) {
    if (!supabase) return null;

    const clean = identifier.replace(/[^0-9+]/g, '');
    let merchant;

    if (clean.startsWith('+') || clean.length >= 10) {
        const { data } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name, nexo_score, cedula, city, business_type, created_at')
            .eq('phone', clean.startsWith('+') ? clean : `+${clean}`)
            .single();
        merchant = data;
    }

    if (!merchant) {
        const { data } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name, nexo_score, cedula, city, business_type, created_at')
            .eq('cedula', clean)
            .single();
        merchant = data;
    }

    if (!merchant) return null;

    // Get latest score
    const { data: latestScore } = await supabase
        .from('nexo_scores')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    // Get history
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
        tier: Object.entries(TIERS).find(([, t]) => merchant.nexo_score >= t.min)?.[0] || 'D',
        tierInfo: getTier(merchant.nexo_score),
        components: latestScore?.components || null,
        history: (history || []).map(h => ({ score: h.score, date: h.created_at })),
        last_calculated: latestScore?.created_at || null,
    };
}

let scoringInterval = null;
export function startScoringCron() {
    processAllScores();
    scoringInterval = setInterval(() => {
        processAllScores();
    }, 24 * 60 * 60 * 1000);
}

export function stopScoringCron() {
    if (scoringInterval) {
        clearInterval(scoringInterval);
        scoringInterval = null;
    }
}

export default { calculateScore, processAllScores, lookupScore, startScoringCron, stopScoringCron, TIERS };
