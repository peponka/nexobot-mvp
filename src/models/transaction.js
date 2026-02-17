// =============================================
// NexoBot MVP — Transaction Model
// =============================================

import supabase from '../config/supabase.js';

// In-memory store
const memoryStore = []; // array of transactions

/**
 * Create a new transaction
 */
export async function create(data) {
    if (!supabase) {
        return createMemory(data);
    }

    const { data: tx, error } = await supabase
        .from('transactions')
        .insert(data)
        .select()
        .single();

    if (error) {
        console.error('DB Error creating transaction:', error);
        return null;
    }
    return tx;
}

/**
 * Get weekly sales summary for a merchant
 */
export async function getWeeklySummary(merchantId) {
    if (!supabase) {
        return getWeeklySummaryMemory(merchantId);
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data, error } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('merchant_id', merchantId)
        .in('type', ['SALE_CASH', 'SALE_CREDIT'])
        .gte('created_at', weekAgo.toISOString());

    if (error) {
        console.error('DB Error getting weekly summary:', error);
        return { total: 0, count: 0, avgTicket: 0 };
    }

    const sales = data || [];
    const total = sales.reduce((sum, tx) => sum + tx.amount, 0);

    return {
        total,
        count: sales.length,
        avgTicket: sales.length > 0 ? Math.round(total / sales.length) : 0
    };
}

/**
 * Get recent transactions for a merchant
 */
export async function getRecent(merchantId, limit = 10) {
    if (!supabase) {
        return getRecentMemory(merchantId, limit);
    }

    const { data, error } = await supabase
        .from('transactions')
        .select('*, merchant_customers(name)')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('DB Error getting recent transactions:', error);
        return [];
    }
    return data || [];
}

/**
 * Get daily summary for a merchant (today's activity)
 */
export async function getDailySummary(merchantId) {
    if (!supabase) {
        return getDailySummaryMemory(merchantId);
    }

    // Today in Paraguay time (UTC-3)
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(3, 0, 0, 0); // Midnight PY = 3am UTC
    if (now.getUTCHours() < 3) {
        todayStart.setDate(todayStart.getDate() - 1);
    }

    const { data, error } = await supabase
        .from('transactions')
        .select('amount, type, currency')
        .eq('merchant_id', merchantId)
        .gte('created_at', todayStart.toISOString());

    if (error) {
        console.error('DB Error getting daily summary:', error);
        return { totalSales: 0, salesCash: 0, salesCredit: 0, totalCollected: 0, countSales: 0, countPayments: 0, totalOps: 0 };
    }

    const txs = data || [];
    const salesCashList = txs.filter(t => t.type === 'SALE_CASH');
    const salesCreditList = txs.filter(t => t.type === 'SALE_CREDIT');
    const paymentsList = txs.filter(t => t.type === 'PAYMENT');

    const salesCash = salesCashList.reduce((sum, t) => sum + t.amount, 0);
    const salesCredit = salesCreditList.reduce((sum, t) => sum + t.amount, 0);
    const totalCollected = paymentsList.reduce((sum, t) => sum + t.amount, 0);

    return {
        totalSales: salesCash + salesCredit,
        salesCash,
        salesCredit,
        totalCollected,
        countSalesCash: salesCashList.length,
        countSalesCredit: salesCreditList.length,
        countSales: salesCashList.length + salesCreditList.length,
        countPayments: paymentsList.length,
        totalOps: txs.length
    };
}

// =============================================
// IN-MEMORY FALLBACK
// =============================================

function createMemory(data) {
    const tx = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        ...data,
        created_at: new Date().toISOString()
    };
    memoryStore.push(tx);
    return tx;
}

function getWeeklySummaryMemory(merchantId) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const sales = memoryStore.filter(tx =>
        tx.merchant_id === merchantId &&
        ['SALE_CASH', 'SALE_CREDIT'].includes(tx.type) &&
        new Date(tx.created_at) >= weekAgo
    );

    const total = sales.reduce((sum, tx) => sum + tx.amount, 0);
    return {
        total,
        count: sales.length,
        avgTicket: sales.length > 0 ? Math.round(total / sales.length) : 0
    };
}

function getRecentMemory(merchantId, limit) {
    return memoryStore
        .filter(tx => tx.merchant_id === merchantId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit);
}

function getDailySummaryMemory(merchantId) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const txs = memoryStore.filter(tx =>
        tx.merchant_id === merchantId &&
        new Date(tx.created_at) >= todayStart
    );

    const salesCashList = txs.filter(t => t.type === 'SALE_CASH');
    const salesCreditList = txs.filter(t => t.type === 'SALE_CREDIT');
    const paymentsList = txs.filter(t => t.type === 'PAYMENT');

    const salesCash = salesCashList.reduce((sum, t) => sum + t.amount, 0);
    const salesCredit = salesCreditList.reduce((sum, t) => sum + t.amount, 0);
    const totalCollected = paymentsList.reduce((sum, t) => sum + t.amount, 0);

    return {
        totalSales: salesCash + salesCredit,
        salesCash,
        salesCredit,
        totalCollected,
        countSalesCash: salesCashList.length,
        countSalesCredit: salesCreditList.length,
        countSales: salesCashList.length + salesCreditList.length,
        countPayments: paymentsList.length,
        totalOps: txs.length
    };
}

export default { create, getWeeklySummary, getDailySummary, getRecent };
