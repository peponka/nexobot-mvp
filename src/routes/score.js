// =============================================
// NexoBot MVP — Score API Routes
// =============================================
// Public API for score lookups (for financieras/providers)
// Protected by API key authentication.

import { Router } from 'express';
import { calculateScore, lookupScore, processAllScores, TIERS } from '../services/scoring.js';
import supabase from '../config/supabase.js';

const router = Router();

// =============================================
// AUTH MIDDLEWARE: API Key validation
// =============================================

function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const validKey = process.env.NEXO_API_KEY;

    // In development, allow access without API key
    if (!validKey || process.env.NODE_ENV === 'development') {
        return next();
    }

    if (!apiKey || apiKey !== validKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key inválida o ausente. Incluí header X-API-Key.',
        });
    }

    next();
}

// =============================================
// IMPORTANT: Specific routes MUST come before /:identifier wildcard!
// =============================================

// ── Score leaderboard ──
router.get('/board/top', requireApiKey, async (req, res) => {
    try {
        if (!supabase) return res.json({ merchants: [] });
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const { data, error } = await supabase
            .from('merchants')
            .select('id, name, phone, cedula, city, business_name, business_type, nexo_score, total_sales, total_credit_given, created_at')
            .eq('status', 'active')
            .gt('nexo_score', 0)
            .order('nexo_score', { ascending: false })
            .limit(limit);
        if (error) throw error;
        const merchants = (data || []).map(m => ({
            ...m,
            tier: Object.entries(TIERS).find(([, t]) => m.nexo_score >= t.min)?.[0] || 'F',
        }));
        res.json({ status: 'ok', count: merchants.length, merchants });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Error obteniendo ranking' });
    }
});

// ── Score distribution stats ──
router.get('/stats/distribution', requireApiKey, async (req, res) => {
    try {
        if (!supabase) return res.json({ distribution: {} });
        const { data: merchants } = await supabase
            .from('merchants')
            .select('nexo_score')
            .eq('status', 'active')
            .gt('nexo_score', 0);
        const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        let total = 0, sumScores = 0;
        (merchants || []).forEach(m => {
            const tier = Object.entries(TIERS).find(([, t]) => m.nexo_score >= t.min)?.[0] || 'F';
            dist[tier]++;
            total++;
            sumScores += m.nexo_score;
        });
        res.json({
            status: 'ok',
            total_scored: total,
            average_score: total > 0 ? Math.round(sumScores / total) : 0,
            distribution: dist,
            tiers: TIERS,
        });
    } catch (err) {
        console.error('Distribution error:', err);
        res.status(500).json({ error: 'Error obteniendo distribución' });
    }
});

// ── Recalculate individual score ──
router.post('/calculate/:merchantId', requireApiKey, async (req, res) => {
    try {
        const { merchantId } = req.params;
        if (!merchantId) return res.status(400).json({ error: 'merchantId requerido' });
        const result = await calculateScore(merchantId);
        if (!result) return res.status(404).json({ error: 'Merchant no encontrado o sin datos' });
        res.json({ status: 'ok', data: result });
    } catch (err) {
        console.error('Score calculate error:', err);
        res.status(500).json({ error: 'Error calculando score' });
    }
});

// ── Batch recalculate all scores ──
router.post('/batch/recalculate', requireApiKey, async (req, res) => {
    try {
        console.log('🔄 Manual batch score recalculation triggered via API');
        const statsPromise = processAllScores();
        res.json({
            status: 'processing',
            message: 'Recalculación masiva iniciada. Esto puede tomar varios minutos.',
        });
        const stats = await statsPromise;
        console.log(`✅ Batch recalculation complete:`, stats);
    } catch (err) {
        console.error('Batch recalculate error:', err);
        res.status(500).json({ error: 'Error en recalculación masiva' });
    }
});

// =============================================
// PUBLIC API: Score Lookup (WILDCARD — must be LAST!)
// =============================================

/**
 * GET /api/score/:identifier
 * Lookup a merchant's score by cédula or phone number.
 */
router.get('/:identifier', requireApiKey, async (req, res) => {
    try {
        const { identifier } = req.params;
        if (!identifier || identifier.length < 4) {
            return res.status(400).json({
                error: 'Identificador inválido',
                message: 'Proporcioná una cédula (ej: 4523871) o teléfono (ej: +595981234567)',
            });
        }
        const result = await lookupScore(identifier);
        if (!result) {
            return res.status(404).json({
                error: 'No encontrado',
                message: 'No hay un comerciante registrado con esa cédula o teléfono.',
            });
        }
        res.json({
            status: 'ok',
            data: result,
            disclaimer: 'NexoScore es un indicador basado en datos operativos. No constituye una calificación crediticia formal.',
        });
    } catch (err) {
        console.error('Score API error:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
