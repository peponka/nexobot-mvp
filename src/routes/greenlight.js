// =============================================
// NexoBot MVP — Sistema "Luz Verde"
// =============================================
// Risk consultation API for third parties.
//
// IMPORTANT: NexoFinanzas does NOT lend money, does NOT
// authorize credit, and does NOT guarantee payments.
// We ONLY provide risk data and scoring information.
//
// Third parties (financieras, cooperativas, distribuidoras,
// estaciones de servicio) use this API to CONSULT the risk
// profile of a merchant before THEY make their own credit
// decision. NexoFinanzas charges per consultation.
//
// Flow:
//   Provider → GET /api/greenlight/consult/:cedula
//   ← { risk_level: "low", score: 820, tier: "A", profile: {...} }
//
// Revenue model: Per-query pricing (B2B SaaS)

import { Router } from 'express';
import { lookupScore } from '../services/scoring.js';
import supabase from '../config/supabase.js';

const router = Router();

// =============================================
// AUTH: Provider API Key
// =============================================

function requireProviderKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const masterKey = process.env.NEXO_API_KEY;

    // Dev mode: allow all
    if (!masterKey || process.env.NODE_ENV === 'development') {
        req.provider = { name: 'dev-provider', type: 'test' };
        return next();
    }

    if (apiKey === masterKey) {
        req.provider = { name: 'master', type: 'admin' };
        return next();
    }

    if (!apiKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key requerida. Contactá a NexoFinanzas para obtener acceso.',
        });
    }

    req.provider = { name: 'provider', apiKey };
    next();
}

// =============================================
// RISK LEVEL DEFINITIONS
// =============================================

const RISK_LEVELS = {
    A: { risk: 'very_low', label: 'Riesgo Muy Bajo', color: '#00D2A0', emoji: '🟢' },
    B: { risk: 'low', label: 'Riesgo Bajo', color: '#48DBFB', emoji: '🟢' },
    C: { risk: 'medium', label: 'Riesgo Medio', color: '#FECA57', emoji: '🟡' },
    D: { risk: 'high', label: 'Riesgo Alto', color: '#FF9F43', emoji: '🟠' },
    F: { risk: 'very_high', label: 'Riesgo Muy Alto', color: '#FF6B6B', emoji: '🔴' },
};

// Reference ranges for risk context (NOT credit limits — just context)
const REFERENCE_RANGES = {
    A: { description: 'Historial sólido, alta actividad, excelente cobranza' },
    B: { description: 'Buen historial, actividad consistente' },
    C: { description: 'Historial mixto, actividad irregular' },
    D: { description: 'Historial débil, baja actividad o mala cobranza' },
    F: { description: 'Sin datos suficientes o perfil de alto riesgo' },
};

// =============================================
// CORE: Build risk report for a merchant
// =============================================

/**
 * Generate a risk consultation report
 * This is DATA ONLY — NexoFinanzas does NOT approve or deny anything.
 * The third party uses this info to make their own decision.
 *
 * @param {string} identifier - Cédula or phone
 * @returns {Object} Risk report
 */
async function buildRiskReport(identifier) {
    const startTime = Date.now();

    // 1. Get merchant score
    const scoreData = await lookupScore(identifier);

    if (!scoreData) {
        return {
            found: false,
            message: 'Comerciante no registrado en la red NexoFinanzas',
            processing_time_ms: Date.now() - startTime,
        };
    }

    const score = scoreData.score || 0;
    const tier = scoreData.tier || 'F';
    const components = scoreData.components || {};
    const merchant = scoreData.merchant || {};

    // 2. Get risk level
    const riskInfo = RISK_LEVELS[tier] || RISK_LEVELS['F'];
    const reference = REFERENCE_RANGES[tier] || REFERENCE_RANGES['F'];

    // 3. Build risk signals
    const signals = [];

    // Positive signals
    if (score >= 750) signals.push({ type: 'positive', text: 'Score excelente, historial sólido' });
    if (components.variables?.tx_consistency?.normalized > 0.7) signals.push({ type: 'positive', text: 'Actividad comercial consistente' });
    if (components.variables?.collection_ratio?.normalized > 0.8) signals.push({ type: 'positive', text: 'Alta tasa de cobranza' });
    if (components.variables?.customer_retention?.normalized > 0.7) signals.push({ type: 'positive', text: 'Alta retención de clientes' });
    if (components.variables?.days_active?.normalized > 0.5) signals.push({ type: 'positive', text: 'Tiempo significativo en la plataforma' });

    // Warning signals
    if (score < 450) signals.push({ type: 'warning', text: 'Score bajo, datos limitados' });
    if (components.variables?.collection_ratio?.normalized < 0.5) signals.push({ type: 'warning', text: 'Baja tasa de cobranza' });
    if (components.variables?.tx_frequency?.normalized < 0.3) signals.push({ type: 'warning', text: 'Baja frecuencia de transacciones' });
    if (components.variables?.delinquency_rate?.normalized < 0.4) signals.push({ type: 'warning', text: 'Alta tasa de morosidad en sus clientes' });
    if (components.variables?.revenue_trend?.normalized < 0.4) signals.push({ type: 'warning', text: 'Tendencia de ventas en baja' });

    // Score trend
    let scoreTrend = 'stable';
    if (scoreData.history && scoreData.history.length >= 2) {
        const prevScore = scoreData.history[1]?.score || score;
        if (score > prevScore + 30) scoreTrend = 'improving';
        else if (score < prevScore - 30) scoreTrend = 'declining';
    }

    // 4. Build report
    return {
        found: true,

        // Merchant identity (limited — privacy first)
        merchant: {
            name: merchant.name,
            business_name: merchant.business_name,
            business_type: merchant.business_type,
            city: merchant.city,
            member_since: merchant.member_since,
        },

        // NexoScore
        score: {
            value: score,
            max: 1000,
            tier,
            trend: scoreTrend,
            last_calculated: scoreData.last_calculated,
        },

        // Risk assessment (informational only)
        risk: {
            level: riskInfo.risk,
            label: riskInfo.label,
            color: riskInfo.color,
            description: reference.description,
        },

        // Detailed signals
        signals,

        // Operational data summary (anonymized)
        activity: {
            monthly_transaction_volume: components.variables?.tx_frequency?.label || 'N/A',
            collection_behavior: components.variables?.collection_ratio?.label || 'N/A',
            active_customers: components.variables?.customer_diversity?.label || 'N/A',
            platform_tenure: components.variables?.days_active?.label || 'N/A',
        },

        // Metadata
        report_id: `NXR-${Date.now().toString(36).toUpperCase()}`,
        generated_at: new Date().toISOString(),
        valid_for_hours: 24,
        processing_time_ms: Date.now() - startTime,
    };
}

// =============================================
// API ROUTES
// =============================================

/**
 * GET /api/greenlight/consult/:identifier
 *
 * Risk consultation: Get risk profile for a merchant.
 * Returns risk level, score, signals, and activity summary.
 *
 * NexoFinanzas does NOT approve/deny credit.
 * This is informational data for the provider's own decision.
 */
router.get('/consult/:identifier', requireProviderKey, async (req, res) => {
    try {
        const { identifier } = req.params;

        if (!identifier || identifier.length < 4) {
            return res.status(400).json({
                error: 'Identificador inválido',
                message: 'Proporcioná cédula (ej: 4523871) o teléfono (ej: +595981234567)',
            });
        }

        const report = await buildRiskReport(identifier);

        if (!report.found) {
            return res.status(404).json({
                error: 'No encontrado',
                message: report.message,
            });
        }

        // Log the consultation
        await logConsultation(identifier, report, req.provider?.name || 'unknown');

        res.json({
            status: 'ok',
            report,
            disclaimer: 'NexoFinanzas provee datos informativos. NO otorga, autoriza ni garantiza créditos. La decisión de otorgar crédito es exclusiva del consultante.',
        });

    } catch (err) {
        console.error('GreenLight consult error:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

/**
 * POST /api/greenlight/batch-consult
 *
 * Batch consultation: Get risk profiles for multiple merchants.
 * Body: { identifiers: ["4523871", "3987654", "+595981234567"] }
 */
router.post('/batch-consult', requireProviderKey, async (req, res) => {
    try {
        const { identifiers } = req.body;

        if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
            return res.status(400).json({ error: 'identifiers[] requerido (array de cédulas o teléfonos)' });
        }

        if (identifiers.length > 50) {
            return res.status(400).json({ error: 'Máximo 50 consultas por batch' });
        }

        const results = await Promise.all(
            identifiers.map(async (id) => {
                const report = await buildRiskReport(id);
                await logConsultation(id, report, req.provider?.name || 'unknown');
                return { identifier: id, ...report };
            })
        );

        res.json({
            status: 'ok',
            total: results.length,
            found: results.filter(r => r.found).length,
            reports: results,
            disclaimer: 'NexoFinanzas provee datos informativos. NO otorga, autoriza ni garantiza créditos.',
        });

    } catch (err) {
        console.error('GreenLight batch error:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

/**
 * GET /api/greenlight/history/:identifier
 *
 * Consultation history for a merchant (for audit/reporting)
 */
router.get('/history/:identifier', requireProviderKey, async (req, res) => {
    try {
        if (!supabase) return res.json({ history: [] });

        const { identifier } = req.params;
        const clean = identifier.replace(/[^0-9+]/g, '');

        let merchantId;
        const isPhone = clean.startsWith('+') || clean.length >= 10;

        if (isPhone) {
            const { data } = await supabase.from('merchants')
                .select('id').eq('phone', clean.startsWith('+') ? clean : `+${clean}`).single();
            merchantId = data?.id;
        } else {
            const { data } = await supabase.from('merchants')
                .select('id').eq('cedula', clean).single();
            merchantId = data?.id;
        }

        if (!merchantId) return res.json({ history: [] });

        const { data: logs } = await supabase
            .from('greenlight_log')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false })
            .limit(50);

        res.json({ status: 'ok', history: logs || [] });

    } catch (err) {
        console.error('GreenLight history error:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// =============================================
// HELPERS
// =============================================

async function logConsultation(identifier, report, providerName) {
    if (!supabase || !report.found) return;

    try {
        const clean = identifier.replace(/[^0-9+]/g, '');
        let merchantId;

        if (clean.startsWith('+') || clean.length >= 10) {
            const { data } = await supabase.from('merchants')
                .select('id').eq('phone', clean.startsWith('+') ? clean : `+${clean}`).single();
            merchantId = data?.id;
        } else {
            const { data } = await supabase.from('merchants')
                .select('id').eq('cedula', clean).single();
            merchantId = data?.id;
        }

        if (!merchantId) return;

        await supabase.from('greenlight_log').insert({
            merchant_id: merchantId,
            score: report.score?.value || 0,
            tier: report.score?.tier || 'F',
            risk_level: report.risk?.level || 'unknown',
            provider_name: providerName,
            signals_count: report.signals?.length || 0,
            report_id: report.report_id,
        });
    } catch (error) {
        console.error('GreenLight log error:', error.message);
    }
}

export default router;
