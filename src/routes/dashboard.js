// =============================================
// NexoBot MVP — Dashboard API Routes
// =============================================

import { Router } from 'express';
import supabase from '../config/supabase.js';
import { getFullAnalytics } from '../services/analytics.js';

const router = Router();

/**
 * GET /api/dashboard/merchants
 * List all merchants (for dev/admin)
 */
router.get('/merchants', async (req, res) => {
    try {
        if (!supabase) {
            return res.json({ merchants: [], message: 'Supabase not configured' });
        }

        const { data, error } = await supabase
            .from('merchants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ merchants: data || [] });
    } catch (err) {
        console.error('Dashboard API error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dashboard/:phone
 * Get full dashboard data for a merchant
 */
router.get('/:phone', async (req, res) => {
    try {
        if (!supabase) {
            return res.json({ error: 'Supabase not configured' });
        }

        const { phone } = req.params;

        // Get merchant
        const { data: merchant, error: mErr } = await supabase
            .from('merchants')
            .select('*')
            .eq('phone', phone)
            .single();

        if (mErr || !merchant) {
            return res.status(404).json({ error: 'Comerciante no encontrado' });
        }

        // Get customers with debts
        const { data: customers } = await supabase
            .from('merchant_customers')
            .select('*')
            .eq('merchant_id', merchant.id)
            .order('total_debt', { ascending: false });

        // Get recent transactions
        const { data: transactions } = await supabase
            .from('transactions')
            .select('*, merchant_customers(name)')
            .eq('merchant_id', merchant.id)
            .order('created_at', { ascending: false })
            .limit(50);

        // Get weekly summary
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: weeklyTx } = await supabase
            .from('transactions')
            .select('amount, type, created_at')
            .eq('merchant_id', merchant.id)
            .gte('created_at', weekAgo.toISOString());

        // Calculate stats
        const weeklySales = (weeklyTx || []).filter(t => ['SALE_CASH', 'SALE_CREDIT'].includes(t.type));
        const weeklyPayments = (weeklyTx || []).filter(t => t.type === 'PAYMENT');

        const totalWeeklySales = weeklySales.reduce((s, t) => s + t.amount, 0);
        const totalWeeklyCollected = weeklyPayments.reduce((s, t) => s + t.amount, 0);

        // Daily breakdown for chart (last 7 days)
        const dailySales = {};
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailySales[key] = { date: key, dayName: days[d.getDay()], sales: 0, payments: 0, count: 0 };
        }

        (weeklyTx || []).forEach(tx => {
            const key = tx.created_at.split('T')[0];
            if (dailySales[key]) {
                if (['SALE_CASH', 'SALE_CREDIT'].includes(tx.type)) {
                    dailySales[key].sales += tx.amount;
                    dailySales[key].count++;
                } else if (tx.type === 'PAYMENT') {
                    dailySales[key].payments += tx.amount;
                }
            }
        });

        // Debtors summary
        const debtors = (customers || []).filter(c => c.total_debt > 0);
        const totalDebt = debtors.reduce((s, c) => s + c.total_debt, 0);

        res.json({
            merchant,
            stats: {
                totalWeeklySales,
                totalWeeklyCollected,
                weeklyTxCount: weeklySales.length,
                avgTicket: weeklySales.length > 0 ? Math.round(totalWeeklySales / weeklySales.length) : 0,
                totalDebt,
                debtorsCount: debtors.length,
                totalCustomers: (customers || []).length
            },
            dailyChart: Object.values(dailySales),
            debtors: debtors.slice(0, 20),
            recentTransactions: (transactions || []).slice(0, 20),
            allCustomers: customers || []
        });
    } catch (err) {
        console.error('Dashboard API error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dashboard/:phone/analytics
 * Advanced analytics for a merchant
 */
router.get('/:phone/analytics', async (req, res) => {
    try {
        if (!supabase) return res.json({ error: 'Supabase not configured' });

        const { phone } = req.params;
        const { data: merchant } = await supabase
            .from('merchants')
            .select('id')
            .eq('phone', phone)
            .single();

        if (!merchant) return res.status(404).json({ error: 'Not found' });

        const analytics = await getFullAnalytics(merchant.id);
        res.json(analytics);
    } catch (err) {
        console.error('Analytics API error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
