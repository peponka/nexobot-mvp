// =============================================
// NexoBot MVP — Dashboard API Routes
// =============================================

import { Router } from 'express';
import supabase from '../config/supabase.js';
import { getFullAnalytics } from '../services/analytics.js';

const router = Router();

/**
 * GET /api/dashboard/summary
 * Home dashboard stats (sales today, total debtors, etc)
 */
router.get('/summary', async (req, res) => {
    try {
        if (!supabase) return res.json({ error: 'Supabase not configured' });

        const merchantId = req.merchant.id;

        // Get sales today
        const todayAtZero = new Date();
        todayAtZero.setHours(0, 0, 0, 0);

        const { data: salesTodayData } = await supabase
            .from('transactions')
            .select('amount, type')
            .eq('merchant_id', merchantId)
            .in('type', ['SALE_CASH', 'SALE_CREDIT', 'EXPENSE'])
            .gte('created_at', todayAtZero.toISOString());

        let salesToday = 0;
        let expensesToday = 0;
        (salesTodayData || []).forEach(tx => {
            if (tx.type === 'EXPENSE') {
                expensesToday += tx.amount;
            } else {
                salesToday += tx.amount;
            }
        });

        // Get customers/debt
        const { data: customersData } = await supabase
            .from('merchant_customers')
            .select('id, total_debt')
            .eq('merchant_id', merchantId);

        const totalDebt = (customersData || []).reduce((acc, c) => acc + (c.total_debt || 0), 0);
        const customerCount = (customersData || []).length;

        res.json({
            salesToday,
            expensesToday,
            totalDebt,
            customerCount
        });
    } catch (err) {
        console.error('Summary API error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dashboard/transactions
 * List merchant transactions
 */
router.get('/transactions', async (req, res) => {
    try {
        if (!supabase) return res.json({ error: 'Supabase not configured' });

        const merchantId = req.merchant.id;
        const limit = parseInt(req.query.limit) || 30;

        const { data: transactions, error } = await supabase
            .from('transactions')
            .select(`
                id, type, amount, created_at, product, raw_message,
                merchant_customers ( name )
            `)
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Map customer name gracefully
        const mapped = (transactions || []).map(tx => {
            // Unpack foreign key correctly assuming object array from Supabase
            const nameFromRel = Array.isArray(tx.merchant_customers) && tx.merchant_customers.length > 0
                ? tx.merchant_customers[0].name
                : tx.merchant_customers?.name;
            return {
                ...tx,
                customer_name: nameFromRel || 'Cliente'
            }
        });

        res.json({ transactions: mapped });
    } catch (err) {
        console.error('Transactions API error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dashboard/debtors
 * List top debtors
 */
router.get('/debtors', async (req, res) => {
    try {
        if (!supabase) return res.json({ error: 'Supabase not configured' });

        const merchantId = req.merchant.id;

        const { data: debtors, error } = await supabase
            .from('merchant_customers')
            .select('*')
            .eq('merchant_id', merchantId)
            .gt('total_debt', 0)
            .order('total_debt', { ascending: false });

        if (error) throw error;
        res.json({ debtors: debtors || [] });
    } catch (err) {
        console.error('Debtors API error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/dashboard/transactions
 * Add a quick sale or payment
 */
router.post('/transactions', async (req, res) => {
    try {
        if (!supabase) return res.json({ error: 'Supabase not configured' });

        const merchantId = req.merchant.id;
        const { type, amount, customer_name, product } = req.body;

        if (!type || !amount || !customer_name) {
            return res.status(400).json({ error: 'Faltan campos' });
        }

        // Upsert customer
        const { data: customer, error: custErr } = await supabase
            .from('merchant_customers')
            .select('id, total_debt, total_paid, total_transactions')
            .eq('merchant_id', merchantId)
            .ilike('name', customer_name)
            .single();

        let customerId;
        if (custErr || !customer) {
            // New customer
            const { data: newCustomer, error: newCustErr } = await supabase
                .from('merchant_customers')
                .insert({
                    merchant_id: merchantId,
                    name: customer_name,
                    total_debt: type === 'SALE_CREDIT' ? amount : 0,
                    total_paid: type === 'PAYMENT' ? amount : 0,
                    total_transactions: 1,
                    last_transaction_at: new Date().toISOString()
                })
                .select()
                .single();

            if (newCustErr) throw newCustErr;
            customerId = newCustomer.id;
        } else {
            // Existing customer
            customerId = customer.id;
            let updateData = {
                total_transactions: (customer.total_transactions || 0) + 1,
                last_transaction_at: new Date().toISOString()
            };

            if (type === 'SALE_CREDIT') updateData.total_debt = (customer.total_debt || 0) + amount;
            if (type === 'PAYMENT') updateData.total_debt = Math.max(0, (customer.total_debt || 0) - amount);
            if (type === 'PAYMENT') updateData.total_paid = (customer.total_paid || 0) + amount;

            await supabase
                .from('merchant_customers')
                .update(updateData)
                .eq('id', customerId);
        }

        // Insert Transaction
        const { error: txErr } = await supabase
            .from('transactions')
            .insert({
                merchant_id: merchantId,
                customer_id: customerId,
                type,
                amount,
                product: product || '',
                raw_message: 'App Móvil - Carga manual',
                status: 'confirmed'
            });

        if (txErr) throw txErr;

        res.json({ success: true });
    } catch (err) {
        console.error('Add Transaction API error:', err);
        res.status(500).json({ error: err.message });
    }
});

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
        const weeklyExpenses = (weeklyTx || []).filter(t => t.type === 'EXPENSE');

        const totalWeeklySales = weeklySales.reduce((s, t) => s + t.amount, 0);
        const totalWeeklyCollected = weeklyPayments.reduce((s, t) => s + t.amount, 0);
        const totalWeeklyExpenses = weeklyExpenses.reduce((s, t) => s + t.amount, 0);

        // Daily breakdown for chart (last 7 days)
        const dailySales = {};
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailySales[key] = { date: key, dayName: days[d.getDay()], sales: 0, payments: 0, expenses: 0, count: 0 };
        }

        (weeklyTx || []).forEach(tx => {
            const key = tx.created_at.split('T')[0];
            if (dailySales[key]) {
                if (['SALE_CASH', 'SALE_CREDIT'].includes(tx.type)) {
                    dailySales[key].sales += tx.amount;
                    dailySales[key].count++;
                } else if (tx.type === 'PAYMENT') {
                    dailySales[key].payments += tx.amount;
                } else if (tx.type === 'EXPENSE') {
                    dailySales[key].expenses += tx.amount;
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
                totalWeeklyExpenses,
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
