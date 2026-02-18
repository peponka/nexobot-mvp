// =============================================
// NexoBot MVP — Advanced Analytics Service
// =============================================
// Provides deeper insights: trends, predictions,
// customer behavior, and business intelligence.

import supabase from '../config/supabase.js';

// =============================================
// WEEKLY TRENDS (week-over-week comparison)
// =============================================

export async function getWeeklyTrends(merchantId) {
    if (!supabase) return { thisWeek: {}, lastWeek: {}, growth: {} };

    try {
        const now = new Date();
        const thisWeekStart = getMonday(now);
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        // This week's data
        const thisWeek = await getWeekStats(merchantId, thisWeekStart, now);

        // Last week's data
        const lastWeek = await getWeekStats(merchantId, lastWeekStart, thisWeekStart);

        // Growth percentages
        const growth = {
            sales: calcGrowth(lastWeek.totalSales, thisWeek.totalSales),
            collected: calcGrowth(lastWeek.totalCollected, thisWeek.totalCollected),
            txCount: calcGrowth(lastWeek.txCount, thisWeek.txCount),
            avgTicket: calcGrowth(lastWeek.avgTicket, thisWeek.avgTicket)
        };

        return { thisWeek, lastWeek, growth };
    } catch (err) {
        console.error('Analytics trends error:', err);
        return { thisWeek: {}, lastWeek: {}, growth: {} };
    }
}

// =============================================
// MONTHLY OVERVIEW (30 days)
// =============================================

export async function getMonthlyOverview(merchantId) {
    if (!supabase) return {};

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .eq('merchant_id', merchantId)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: true });

        if (!transactions?.length) {
            return {
                totalRevenue: 0,
                totalCollected: 0,
                totalCredit: 0,
                txCount: 0,
                avgDaily: 0,
                bestDay: null,
                worstDay: null,
                dailyBreakdown: []
            };
        }

        // Daily breakdown
        const dailyMap = {};
        transactions.forEach(tx => {
            const day = tx.created_at.substring(0, 10);
            if (!dailyMap[day]) dailyMap[day] = { date: day, sales: 0, collected: 0, credit: 0, count: 0 };

            if (tx.type === 'SALE_CASH') {
                dailyMap[day].sales += tx.amount;
            } else if (tx.type === 'SALE_CREDIT') {
                dailyMap[day].sales += tx.amount;
                dailyMap[day].credit += tx.amount;
            } else if (tx.type === 'PAYMENT') {
                dailyMap[day].collected += tx.amount;
            }
            dailyMap[day].count++;
        });

        const dailyBreakdown = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        const totalRevenue = dailyBreakdown.reduce((s, d) => s + d.sales, 0);
        const totalCollected = dailyBreakdown.reduce((s, d) => s + d.collected, 0);
        const totalCredit = dailyBreakdown.reduce((s, d) => s + d.credit, 0);
        const activeDays = dailyBreakdown.length;

        const bestDay = dailyBreakdown.reduce((best, d) => d.sales > (best?.sales || 0) ? d : best, null);
        const worstDay = dailyBreakdown.filter(d => d.sales > 0).reduce((worst, d) => d.sales < (worst?.sales || Infinity) ? d : worst, null);

        return {
            totalRevenue,
            totalCollected,
            totalCredit,
            txCount: transactions.length,
            avgDaily: Math.round(totalRevenue / Math.max(activeDays, 1)),
            activeDays,
            bestDay,
            worstDay,
            collectionRate: totalRevenue > 0 ? Math.round(totalCollected / totalRevenue * 100) : 0,
            dailyBreakdown
        };
    } catch (err) {
        console.error('Monthly overview error:', err);
        return {};
    }
}

// =============================================
// PEAK HOURS ANALYSIS
// =============================================

export async function getPeakHours(merchantId) {
    if (!supabase) return [];

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: transactions } = await supabase
            .from('transactions')
            .select('created_at')
            .eq('merchant_id', merchantId)
            .gte('created_at', thirtyDaysAgo.toISOString());

        if (!transactions?.length) return Array(24).fill(0);

        // Count transactions per hour (PYT = UTC-3)
        const hourCounts = Array(24).fill(0);
        transactions.forEach(tx => {
            const hour = (new Date(tx.created_at).getUTCHours() - 3 + 24) % 24;
            hourCounts[hour]++;
        });

        return hourCounts;
    } catch (err) {
        console.error('Peak hours error:', err);
        return Array(24).fill(0);
    }
}

// =============================================
// TOP PRODUCTS
// =============================================

export async function getTopProducts(merchantId, limit = 10) {
    if (!supabase) return [];

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: transactions } = await supabase
            .from('transactions')
            .select('product, amount, type')
            .eq('merchant_id', merchantId)
            .not('product', 'is', null)
            .in('type', ['SALE_CASH', 'SALE_CREDIT'])
            .gte('created_at', thirtyDaysAgo.toISOString());

        if (!transactions?.length) return [];

        const productMap = {};
        transactions.forEach(tx => {
            const name = tx.product.toLowerCase().trim();
            if (!productMap[name]) productMap[name] = { name: tx.product, revenue: 0, count: 0 };
            productMap[name].revenue += tx.amount;
            productMap[name].count++;
        });

        return Object.values(productMap)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);
    } catch (err) {
        console.error('Top products error:', err);
        return [];
    }
}

// =============================================
// CUSTOMER LIFETIME VALUE
// =============================================

export async function getCustomerInsights(merchantId) {
    if (!supabase) return [];

    try {
        const { data: customers } = await supabase
            .from('merchant_customers')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('total_purchased', { ascending: false });

        if (!customers?.length) return [];

        return customers.map(c => {
            const daysSinceFirst = c.created_at
                ? Math.max(1, Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000))
                : 1;

            return {
                id: c.id,
                name: c.name,
                totalPurchased: c.total_purchased || 0,
                totalPaid: c.total_paid || 0,
                totalDebt: c.total_debt || 0,
                totalTransactions: c.total_transactions || 0,
                riskLevel: c.risk_level || 'low',
                avgPerTransaction: c.total_transactions > 0 ? Math.round(c.total_purchased / c.total_transactions) : 0,
                monthlyValue: Math.round((c.total_purchased || 0) / Math.max(daysSinceFirst / 30, 1)),
                daysSinceFirst,
                lastActivity: c.last_transaction_at
            };
        });
    } catch (err) {
        console.error('Customer insights error:', err);
        return [];
    }
}

// =============================================
// REVENUE PREDICTION (simple linear)
// =============================================

export async function getRevenuePrediction(merchantId) {
    if (!supabase) return null;

    try {
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, created_at')
            .eq('merchant_id', merchantId)
            .in('type', ['SALE_CASH', 'SALE_CREDIT'])
            .gte('created_at', fourWeeksAgo.toISOString());

        if (!transactions?.length) return null;

        // Weekly totals for last 4 weeks
        const weeklyTotals = [0, 0, 0, 0];
        const now = Date.now();
        transactions.forEach(tx => {
            const weeksAgo = Math.floor((now - new Date(tx.created_at).getTime()) / (7 * 86400000));
            if (weeksAgo < 4) weeklyTotals[3 - weeksAgo] += tx.amount;
        });

        // Simple linear regression
        const n = weeklyTotals.length;
        const xMean = (n - 1) / 2;
        const yMean = weeklyTotals.reduce((s, v) => s + v, 0) / n;

        let num = 0, den = 0;
        weeklyTotals.forEach((y, x) => {
            num += (x - xMean) * (y - yMean);
            den += (x - xMean) ** 2;
        });

        const slope = den !== 0 ? num / den : 0;
        const intercept = yMean - slope * xMean;

        // Predict next week
        const nextWeekPrediction = Math.max(0, Math.round(intercept + slope * n));
        const trend = slope > 0 ? 'up' : slope < 0 ? 'down' : 'stable';
        const trendPercent = yMean > 0 ? Math.round((slope / yMean) * 100) : 0;

        return {
            weeklyTotals,
            prediction: nextWeekPrediction,
            trend,
            trendPercent,
            avgWeekly: Math.round(yMean)
        };
    } catch (err) {
        console.error('Revenue prediction error:', err);
        return null;
    }
}

// =============================================
// FULL ANALYTICS BUNDLE
// =============================================

export async function getFullAnalytics(merchantId) {
    const [trends, monthly, peakHours, topProducts, customers, prediction] = await Promise.all([
        getWeeklyTrends(merchantId),
        getMonthlyOverview(merchantId),
        getPeakHours(merchantId),
        getTopProducts(merchantId),
        getCustomerInsights(merchantId),
        getRevenuePrediction(merchantId)
    ]);

    return {
        trends,
        monthly,
        peakHours,
        topProducts,
        customers,
        prediction
    };
}

// =============================================
// HELPERS
// =============================================

async function getWeekStats(merchantId, from, to) {
    const { data: txs } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('merchant_id', merchantId)
        .gte('created_at', from.toISOString())
        .lt('created_at', to.toISOString());

    if (!txs?.length) return { totalSales: 0, totalCollected: 0, txCount: 0, avgTicket: 0 };

    let totalSales = 0, totalCollected = 0;
    txs.forEach(tx => {
        if (tx.type === 'SALE_CASH' || tx.type === 'SALE_CREDIT') totalSales += tx.amount;
        if (tx.type === 'PAYMENT') totalCollected += tx.amount;
    });

    const salesTxs = txs.filter(t => t.type === 'SALE_CASH' || t.type === 'SALE_CREDIT');

    return {
        totalSales,
        totalCollected,
        txCount: txs.length,
        avgTicket: salesTxs.length > 0 ? Math.round(totalSales / salesTxs.length) : 0
    };
}

function getMonday(d) {
    const result = new Date(d);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
}

function calcGrowth(prev, current) {
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 100);
}

export default {
    getWeeklyTrends,
    getMonthlyOverview,
    getPeakHours,
    getTopProducts,
    getCustomerInsights,
    getRevenuePrediction,
    getFullAnalytics
};
