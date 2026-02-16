// =============================================
// NexoBot MVP — Daily Summary Service
// =============================================
// Sends each active merchant a daily summary
// at 8pm Paraguay time with today's performance.

import supabase from '../config/supabase.js';
import { sendMessage } from './whatsapp.js';

function formatPYG(amount) {
    if (!amount || amount === 0) return 'Gs. 0';
    if (amount >= 1000000) {
        return `Gs. ${(amount / 1000000).toFixed(1).replace('.0', '')} ${amount >= 2000000 ? 'millones' : 'millón'}`;
    }
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

// =============================================
// CORE: Send daily summaries to all merchants
// =============================================

/**
 * Process daily summaries for all active merchants
 * Called by cron job at 8pm PY time
 */
export async function processDailySummaries() {
    if (!supabase) {
        console.log('⚠️ Daily Summary: Supabase not configured, skipping');
        return { sent: 0, skipped: 0 };
    }

    console.log('📊 Starting daily summary processing...');
    const stats = { sent: 0, skipped: 0, errors: 0 };

    try {
        // Get all active merchants
        const { data: merchants, error } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name')
            .eq('status', 'active');

        if (error) {
            console.error('❌ Daily Summary DB error:', error);
            return stats;
        }

        if (!merchants || merchants.length === 0) {
            console.log('📊 No active merchants for daily summary');
            return stats;
        }

        for (const merchant of merchants) {
            try {
                const sent = await sendDailySummary(merchant);
                if (sent) stats.sent++;
                else stats.skipped++;
            } catch (err) {
                console.error(`❌ Summary error for ${merchant.name}:`, err.message);
                stats.errors++;
            }
        }

        console.log(`📊 Daily summaries done: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.errors} errors`);
        return stats;

    } catch (error) {
        console.error('❌ Daily summary processing error:', error);
        return stats;
    }
}

/**
 * Send daily summary to a single merchant
 */
async function sendDailySummary(merchant) {
    // Get today's date range (Paraguay time = UTC-3)
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(3, 0, 0, 0); // Midnight PY = 3am UTC
    if (now.getUTCHours() < 3) {
        todayStart.setDate(todayStart.getDate() - 1);
    }

    // Get today's transactions
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('type, amount, currency')
        .eq('merchant_id', merchant.id)
        .gte('created_at', todayStart.toISOString());

    if (error) {
        console.error(`DB Error getting transactions for ${merchant.name}:`, error);
        return false;
    }

    // Calculate stats
    const salesCash = transactions?.filter(t => t.type === 'SALE_CASH') || [];
    const salesCredit = transactions?.filter(t => t.type === 'SALE_CREDIT') || [];
    const payments = transactions?.filter(t => t.type === 'PAYMENT') || [];

    const totalSalesCash = salesCash.reduce((sum, t) => sum + t.amount, 0);
    const totalSalesCredit = salesCredit.reduce((sum, t) => sum + t.amount, 0);
    const totalSales = totalSalesCash + totalSalesCredit;
    const totalCollected = payments.reduce((sum, t) => sum + t.amount, 0);
    const totalOperations = (transactions || []).length;

    // Skip if no activity today
    if (totalOperations === 0) {
        return false;
    }

    // Get total outstanding debt
    const { data: debtors } = await supabase
        .from('merchant_customers')
        .select('total_debt')
        .eq('merchant_id', merchant.id)
        .gt('total_debt', 0);

    const totalDebt = (debtors || []).reduce((sum, d) => sum + d.total_debt, 0);
    const debtorsCount = (debtors || []).length;

    // Build summary message
    const name = merchant.name || 'Comerciante';
    const hour = (now.getUTCHours() - 3 + 24) % 24;

    let message = `📊 *Resumen del día — ${formatDate(now)}*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `Hola ${name}! Acá va tu resumen de hoy:\n\n`;

    // Sales
    message += `💰 *Ventas totales: ${formatPYG(totalSales)}*\n`;
    if (salesCash.length > 0) {
        message += `   💵 Contado: ${formatPYG(totalSalesCash)} (${salesCash.length} venta${salesCash.length > 1 ? 's' : ''})\n`;
    }
    if (salesCredit.length > 0) {
        message += `   📝 Fiado: ${formatPYG(totalSalesCredit)} (${salesCredit.length} venta${salesCredit.length > 1 ? 's' : ''})\n`;
    }

    // Collections
    if (payments.length > 0) {
        message += `\n💵 *Cobros: ${formatPYG(totalCollected)}* (${payments.length} cobro${payments.length > 1 ? 's' : ''})\n`;
    }

    // Total operations
    message += `\n🧾 Operaciones del día: ${totalOperations}\n`;

    // Outstanding debt
    if (totalDebt > 0) {
        message += `\n━━━━━━━━━━━━━━━━━━\n`;
        message += `📋 *Deuda total pendiente: ${formatPYG(totalDebt)}*\n`;
        message += `👥 ${debtorsCount} cliente${debtorsCount > 1 ? 's' : ''} con deuda\n`;
    }

    // Motivational close
    const emoji = totalSales >= 1000000 ? '🔥' : totalSales >= 500000 ? '💪' : '👍';
    message += `\n${emoji} ¡Buen trabajo hoy, ${name}! Nos vemos mañana.`;

    // Send
    await sendMessage(merchant.phone, message);
    console.log(`📊 Daily summary sent to ${merchant.name} (${merchant.phone})`);
    return true;
}

/**
 * Format date in Spanish
 */
function formatDate(date) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Adjust to PY timezone
    const pyDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    return `${days[pyDate.getUTCDay()]} ${pyDate.getUTCDate()} ${months[pyDate.getUTCMonth()]}`;
}

// =============================================
// CRON SCHEDULER
// =============================================

let summaryInterval = null;

/**
 * Start the daily summary cron job
 * Runs at 8:00 PM Paraguay time (UTC-3) = 23:00 UTC
 */
export function startSummaryCron() {
    const now = new Date();
    const pyHour = (now.getUTCHours() - 3 + 24) % 24;

    let msUntilEight;
    if (pyHour < 20) {
        // Today at 8pm PY
        msUntilEight = ((20 - pyHour) * 60 - now.getUTCMinutes()) * 60 * 1000;
    } else {
        // Tomorrow at 8pm PY
        msUntilEight = ((24 - pyHour + 20) * 60 - now.getUTCMinutes()) * 60 * 1000;
    }

    console.log(`📊 Summary cron: next run in ${Math.round(msUntilEight / 1000 / 60)} minutes`);

    // First run at next 8pm
    setTimeout(() => {
        processDailySummaries();

        // Then every 24 hours
        summaryInterval = setInterval(() => {
            processDailySummaries();
        }, 24 * 60 * 60 * 1000);
    }, msUntilEight);
}

/**
 * Stop the summary cron
 */
export function stopSummaryCron() {
    if (summaryInterval) {
        clearInterval(summaryInterval);
        summaryInterval = null;
    }
}

export default { processDailySummaries, startSummaryCron, stopSummaryCron };
