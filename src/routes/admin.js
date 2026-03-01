// =============================================
// NexoBot MVP — Admin API Routes
// =============================================
// Internal admin dashboard endpoints
// Protected by admin key auth

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'nexo-super-secret-jwt-2026';

// ── AUTH MIDDLEWARE ──
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido o inválido' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'superadmin' && decoded.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos suficientes' });
        }
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token expirado o inválido' });
    }
}

router.use(requireAdmin);

// ── GET /api/admin/metrics — Hero KPIs ──
router.get('/metrics', async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

        if (!supabase) {
            return res.json({
                totalMerchants: 0, newToday: 0, messagesToday: 0, messagesYesterday: 0,
                salesToday: 0, salesChange: 0, totalDebt: 0, debtorsCount: 0,
                avgScore: 0, scoredMerchants: 0
            });
        }

        // All queries in parallel
        const [merchantsRes, newTodayRes, msgTodayRes, msgYestRes, salesTodayRes, salesYestRes, debtRes, scoreRes] = await Promise.all([
            supabase.from('merchants').select('id', { count: 'exact', head: true }),
            supabase.from('merchants').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
            supabase.from('message_log').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
            supabase.from('message_log').select('id', { count: 'exact', head: true }).gte('created_at', yesterdayStart).lt('created_at', todayStart),
            supabase.from('transactions').select('amount').in('type', ['SALE_CASH', 'SALE_CREDIT']).gte('created_at', todayStart),
            supabase.from('transactions').select('amount').in('type', ['SALE_CASH', 'SALE_CREDIT']).gte('created_at', yesterdayStart).lt('created_at', todayStart),
            supabase.from('merchant_customers').select('total_debt').gt('total_debt', 0),
            supabase.from('merchants').select('nexo_score').gt('nexo_score', 0)
        ]);

        const salesToday = (salesTodayRes.data || []).reduce((s, t) => s + t.amount, 0);
        const salesYesterday = (salesYestRes.data || []).reduce((s, t) => s + t.amount, 0);
        const salesChange = salesYesterday > 0 ? Math.round(((salesToday - salesYesterday) / salesYesterday) * 100) : 0;

        const debtData = debtRes.data || [];
        const totalDebt = debtData.reduce((s, d) => s + d.total_debt, 0);

        const scores = (scoreRes.data || []).map(s => s.nexo_score).filter(s => s > 0);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        res.json({
            totalMerchants: merchantsRes.count || 0,
            newToday: newTodayRes.count || 0,
            messagesToday: msgTodayRes.count || 0,
            messagesYesterday: msgYestRes.count || 0,
            salesToday,
            salesChange,
            totalDebt,
            debtorsCount: debtData.length,
            avgScore,
            scoredMerchants: scores.length
        });
    } catch (error) {
        console.error('Admin metrics error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/admin/merchants — Top merchants ──
router.get('/merchants', async (req, res) => {
    try {
        if (!supabase) return res.json([]);

        const { data } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name, nexo_score, total_sales, status, created_at, updated_at')
            .order('total_sales', { ascending: false })
            .limit(20);

        const now = Date.now();
        const merchants = (data || []).map(m => ({
            ...m,
            daysInactive: m.updated_at ? Math.floor((now - new Date(m.updated_at)) / (1000 * 60 * 60 * 24)) : 999
        }));

        res.json(merchants);
    } catch (error) {
        console.error('Admin merchants error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/admin/activity — Charts + live feed ──
router.get('/activity', async (req, res) => {
    try {
        if (!supabase) {
            return res.json({ daily: [], recent: [] });
        }

        const now = new Date();
        const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

        // Last 14 days of activity
        const [msgRes, txRes, recentRes] = await Promise.all([
            supabase.from('message_log')
                .select('created_at')
                .gte('created_at', fourteenDaysAgo)
                .order('created_at', { ascending: true }),
            supabase.from('transactions')
                .select('created_at, type')
                .gte('created_at', fourteenDaysAgo)
                .order('created_at', { ascending: true }),
            supabase.from('message_log')
                .select('phone, raw_message, intent, confidence, created_at')
                .order('created_at', { ascending: false })
                .limit(20)
        ]);

        // Group by day
        const dayMap = {};
        for (let i = 0; i < 14; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - (13 - i));
            const key = d.toISOString().split('T')[0];
            dayMap[key] = { date: `${d.getDate()}/${d.getMonth() + 1}`, messages: 0, sales: 0 };
        }

        (msgRes.data || []).forEach(m => {
            const key = m.created_at.split('T')[0];
            if (dayMap[key]) dayMap[key].messages++;
        });

        (txRes.data || []).forEach(t => {
            const key = t.created_at.split('T')[0];
            if (dayMap[key] && (t.type === 'SALE_CASH' || t.type === 'SALE_CREDIT')) dayMap[key].sales++;
        });

        // Recent feed
        const recent = (recentRes.data || []).map(m => {
            const time = new Date(m.created_at);
            const diffMin = Math.floor((now - time) / 60000);
            const timeStr = diffMin < 60 ? `Hace ${diffMin}m` :
                diffMin < 1440 ? `Hace ${Math.floor(diffMin / 60)}h` :
                    time.toLocaleDateString('es-PY');

            const phone = m.phone ? `...${m.phone.slice(-4)}` : '???';
            const msg = m.raw_message ? m.raw_message.substring(0, 60) : 'mensaje';

            return {
                intent: m.intent || 'UNKNOWN',
                summary: `${phone}: "${msg}"`,
                time: timeStr
            };
        });

        res.json({
            daily: Object.values(dayMap),
            recent
        });
    } catch (error) {
        console.error('Admin activity error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/admin/intents — Intent distribution today ──
router.get('/intents', async (req, res) => {
    try {
        if (!supabase) return res.json({ intents: [] });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data } = await supabase
            .from('message_log')
            .select('intent')
            .gte('created_at', todayStart.toISOString())
            .not('intent', 'is', null);

        const counts = {};
        (data || []).forEach(m => {
            const intent = m.intent || 'UNKNOWN';
            counts[intent] = (counts[intent] || 0) + 1;
        });

        const intents = Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        res.json({ intents });
    } catch (error) {
        console.error('Admin intents error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/admin/health — System health ──
router.get('/health', async (req, res) => {
    try {
        const health = {};

        // API
        health.api = { status: 'ok', uptime: Math.floor(process.uptime()) };

        // Database
        if (supabase) {
            const start = Date.now();
            const { error } = await supabase.from('merchants').select('id').limit(1);
            health.database = error
                ? { status: 'err', message: error.message }
                : { status: 'ok', latency: Date.now() - start };
        } else {
            health.database = { status: 'warn', message: 'Not configured' };
        }

        // WhatsApp
        health.whatsapp = process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TOKEN !== 'your-whatsapp-token'
            ? { status: 'ok' }
            : { status: 'warn', message: 'No configurado' };

        // OpenAI
        health.openai = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-key'
            ? { status: 'ok' }
            : { status: 'warn', message: 'No configurado' };

        // Cron
        health.cron = { status: 'ok' };

        // Memory
        const mem = process.memoryUsage();
        health.memory = {
            used: Math.round(mem.heapUsed / 1024 / 1024),
            total: Math.round(mem.heapTotal / 1024 / 1024),
            rss: Math.round(mem.rss / 1024 / 1024)
        };

        res.json(health);
    } catch (error) {
        console.error('Admin health error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

export default router;
