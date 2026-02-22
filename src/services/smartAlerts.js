// =============================================
// NexoBot MVP — Smart Alerts Service
// =============================================
// Proactive alerts that detect patterns and notify
// merchants about important business insights.
//
// Alertas incluyen:
//   - Deudas vencidas (cliente X debe Y hace Z días)
//   - Ventas inusuales (día muy alto o muy bajo)
//   - Alerta de plata (mucho fiado vs contado)
//   - Oportunidades de cobro
//   - Logros semanales
// =============================================

import supabase from '../config/supabase.js';
import { sendMessage } from './whatsapp.js';

function formatPYG(amount) {
    if (!amount || amount === 0) return 'Gs. 0';
    if (amount >= 1000000) {
        const m = amount / 1000000;
        return `Gs. ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)} ${m >= 2 ? 'millones' : 'millón'}`;
    }
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

// =============================================
// CORE: Process all smart alerts
// =============================================

/**
 * Run all alert checks for all active merchants.
 * Called by cron at 10am PY time (after reminders at 9am).
 */
export async function processSmartAlerts() {
    if (!supabase) {
        console.log('⚠️ Smart Alerts: Supabase not configured');
        return { sent: 0 };
    }

    console.log('🧠 Starting smart alerts processing...');
    const stats = { sent: 0, skipped: 0, errors: 0 };

    try {
        const { data: merchants } = await supabase
            .from('merchants')
            .select('id, phone, name, business_name, total_sales, total_credit_given, total_collected')
            .eq('status', 'active');

        if (!merchants?.length) {
            console.log('🧠 No active merchants for smart alerts');
            return stats;
        }

        for (const merchant of merchants) {
            try {
                const alerts = await generateAlerts(merchant);
                if (alerts.length > 0) {
                    await sendAlertDigest(merchant, alerts);
                    stats.sent++;
                } else {
                    stats.skipped++;
                }
            } catch (err) {
                console.error(`❌ Alert error for ${merchant.name}:`, err.message);
                stats.errors++;
            }
        }

        console.log(`🧠 Smart alerts done: ${stats.sent} sent, ${stats.skipped} skipped`);
        return stats;

    } catch (error) {
        console.error('❌ Smart alerts processing error:', error);
        return stats;
    }
}

// =============================================
// ALERT GENERATORS
// =============================================

/**
 * Generate all applicable alerts for a merchant
 */
async function generateAlerts(merchant) {
    const alerts = [];

    // Run all alert checks in parallel
    const [
        overdueAlerts,
        alertaVentas,
        alertaPlata,
        cobrosOportunos,
        logroSemanal
    ] = await Promise.all([
        checkOverdueDebts(merchant),
        checkVentasInusuales(merchant),
        checkAlertaPlata(merchant),
        checkOportunidadesCobro(merchant),
        checkLogrosSemana(merchant)
    ]);

    if (overdueAlerts) alerts.push(...overdueAlerts);
    if (alertaVentas) alerts.push(alertaVentas);
    if (alertaPlata) alerts.push(alertaPlata);
    if (cobrosOportunos) alerts.push(...cobrosOportunos);
    if (logroSemanal) alerts.push(logroSemanal);

    return alerts;
}

// -----------------------------------------------
// 1. DEUDAS VENCIDAS
// -----------------------------------------------

async function checkOverdueDebts(merchant) {
    const { data: debtors } = await supabase
        .from('merchant_customers')
        .select('name, total_debt, last_transaction_at')
        .eq('merchant_id', merchant.id)
        .gt('total_debt', 0)
        .order('total_debt', { ascending: false });

    if (!debtors?.length) return [];

    const alerts = [];
    const now = new Date();

    for (const debtor of debtors) {
        if (!debtor.last_transaction_at) continue;

        const days = Math.floor((now - new Date(debtor.last_transaction_at)) / (1000 * 60 * 60 * 24));

        // Alert at key thresholds: 7, 14, 21, 30 days
        if (days === 7) {
            alerts.push({
                type: 'overdue_week',
                icon: '⚠️',
                text: `*${debtor.name}* te debe ${formatPYG(debtor.total_debt)} hace *1 semana*. ¿Le mandamos recordatorio?`
            });
        } else if (days === 14) {
            alerts.push({
                type: 'overdue_2weeks',
                icon: '🔴',
                text: `*${debtor.name}* lleva *2 semanas* sin pagar (${formatPYG(debtor.total_debt)}). Considerá contactarle directamente.`
            });
        } else if (days === 30) {
            alerts.push({
                type: 'overdue_month',
                icon: '🚨',
                text: `*${debtor.name}* tiene deuda de ${formatPYG(debtor.total_debt)} hace *1 mes*. Riesgo alto de no cobrar.`
            });
        }
    }

    // Big picture: total overdue summary if many debtors
    const criticalDebtors = debtors.filter(d => {
        if (!d.last_transaction_at) return false;
        const days = Math.floor((now - new Date(d.last_transaction_at)) / (1000 * 60 * 60 * 24));
        return days >= 14;
    });

    if (criticalDebtors.length >= 3) {
        const totalCritical = criticalDebtors.reduce((sum, d) => sum + d.total_debt, 0);
        alerts.push({
            type: 'many_overdue',
            icon: '📋',
            text: `Tenés *${criticalDebtors.length} clientes* con deudas de más de 2 semanas, total: ${formatPYG(totalCritical)}. Respondé "deudas" para ver la lista.`
        });
    }

    return alerts.slice(0, 3); // Max 3 overdue alerts per day
}

// -----------------------------------------------
// 2. VENTAS INUSUALES
// -----------------------------------------------

async function checkVentasInusuales(merchant) {
    // Get last 7 days of daily sales
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentTx } = await supabase
        .from('transactions')
        .select('amount, created_at, type')
        .eq('merchant_id', merchant.id)
        .in('type', ['SALE_CASH', 'SALE_CREDIT'])
        .gte('created_at', sevenDaysAgo.toISOString());

    if (!recentTx?.length || recentTx.length < 3) return null;

    // Group by day
    const dailySales = {};
    for (const tx of recentTx) {
        const day = tx.created_at.substring(0, 10);
        dailySales[day] = (dailySales[day] || 0) + tx.amount;
    }

    const days = Object.keys(dailySales).sort();
    if (days.length < 3) return null;

    const values = days.map(d => dailySales[d]);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Yesterday's sales
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().substring(0, 10);
    const yesterdaySales = dailySales[yesterdayKey];

    if (!yesterdaySales) return null;

    // Unusually high day (>2x average)
    if (yesterdaySales > avg * 2 && avg > 0) {
        return {
            type: 'sales_high',
            icon: '🔥',
            text: `¡Ayer fue un *gran día*! Vendiste ${formatPYG(yesterdaySales)}, *${Math.round(yesterdaySales / avg * 100)}%* de tu promedio. ¡Seguí así!`
        };
    }

    // Unusually low day (<30% of average)
    if (yesterdaySales < avg * 0.3 && avg > 100000) {
        return {
            type: 'sales_low',
            icon: '📉',
            text: `Ayer vendiste ${formatPYG(yesterdaySales)}, bastante menos que tu promedio de ${formatPYG(Math.round(avg))}. ¿Todo bien?`
        };
    }

    return null;
}

// -----------------------------------------------
// 3. ALERTA DE PLATA (mucho fiado)
// -----------------------------------------------

async function checkAlertaPlata(merchant) {
    // Compare total credit given vs total collected
    const { data: customers } = await supabase
        .from('merchant_customers')
        .select('total_debt')
        .eq('merchant_id', merchant.id)
        .gt('total_debt', 0);

    if (!customers?.length) return null;

    const totalDebt = customers.reduce((sum, c) => sum + c.total_debt, 0);

    // Alert if outstanding debt is very high compared to recent sales
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: weeklyCash } = await supabase
        .from('transactions')
        .select('amount')
        .eq('merchant_id', merchant.id)
        .eq('type', 'SALE_CASH')
        .gte('created_at', weekAgo.toISOString());

    const weeklyRevenue = (weeklyCash || []).reduce((sum, t) => sum + t.amount, 0);

    // Si la deuda pendiente es > 4x las ventas semanales al contado
    if (weeklyRevenue > 0 && totalDebt > weeklyRevenue * 4) {
        return {
            type: 'alerta_plata',
            icon: '💸',
            text: `Tu deuda pendiente (${formatPYG(totalDebt)}) es *${Math.round(totalDebt / weeklyRevenue)}x* tus ventas semanales al contado. Considerá cobrar antes de fiar más.`
        };
    }

    return null;
}

// -----------------------------------------------
// 4. OPORTUNIDADES DE COBRO
// -----------------------------------------------

async function checkOportunidadesCobro(merchant) {
    // Find customers who usually pay around this time
    const { data: debtors } = await supabase
        .from('merchant_customers')
        .select('name, total_debt, avg_days_to_pay, last_transaction_at')
        .eq('merchant_id', merchant.id)
        .gt('total_debt', 0)
        .gt('avg_days_to_pay', 0);

    if (!debtors?.length) return [];

    const alerts = [];
    const now = new Date();

    for (const debtor of debtors) {
        if (!debtor.last_transaction_at) continue;

        const daysSince = Math.floor((now - new Date(debtor.last_transaction_at)) / (1000 * 60 * 60 * 24));
        const avgDays = Math.round(debtor.avg_days_to_pay);

        // Customer usually pays around this time (within 1 day window)
        if (Math.abs(daysSince - avgDays) <= 1 && avgDays >= 3) {
            alerts.push({
                type: 'collection_window',
                icon: '💰',
                text: `*${debtor.name}* suele pagar a los ${avgDays} días. Hoy es el día ${daysSince}. Buen momento para recordarle su deuda de ${formatPYG(debtor.total_debt)}.`
            });
        }
    }

    return alerts.slice(0, 2); // Max 2 collection alerts
}

// -----------------------------------------------
// 5. LOGROS DE LA SEMANA
// -----------------------------------------------

async function checkLogrosSemana(merchant) {
    // Revisar logros semanales
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday

    // Solo revisar logros los lunes (resumen semanal)
    if (dayOfWeek !== 1) return null;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: weeklyTx } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('merchant_id', merchant.id)
        .in('type', ['SALE_CASH', 'SALE_CREDIT'])
        .gte('created_at', weekAgo.toISOString());

    if (!weeklyTx?.length) return null;

    const weeklySales = weeklyTx.reduce((sum, t) => sum + t.amount, 0);
    const txCount = weeklyTx.length;

    // Milestone: hit 1M, 5M, 10M weekly
    if (weeklySales >= 10000000) {
        return {
            type: 'milestone',
            icon: '🏆',
            text: `¡Semana increíble! Vendiste ${formatPYG(weeklySales)} en ${txCount} operaciones. ¡Sos un crack, ${merchant.name}! 🎉`
        };
    } else if (weeklySales >= 5000000) {
        return {
            type: 'milestone',
            icon: '⭐',
            text: `¡Gran semana! ${formatPYG(weeklySales)} en ventas con ${txCount} operaciones. ¡Seguí así! 💪`
        };
    } else if (weeklySales >= 1000000) {
        return {
            type: 'milestone',
            icon: '🎯',
            text: `Buena semana: ${formatPYG(weeklySales)} en ventas. Cada semana es más fácil con NexoBot 📈`
        };
    }

    return null;
}

// =============================================
// SEND ALERT DIGEST
// =============================================

/**
 * Send all alerts as a single digest message
 */
async function sendAlertDigest(merchant, alerts) {
    const name = merchant.name || 'Comerciante';

    let message = `🧠 *Alertas inteligentes*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `Hola ${name}, NexoBot detectó lo siguiente:\n\n`;

    for (const alert of alerts) {
        message += `${alert.icon} ${alert.text}\n\n`;
    }

    message += `_Respondé "ayuda" para aprender a usar estos datos._`;

    await sendMessage(merchant.phone, message);
    console.log(`🧠 Smart alert sent to ${merchant.name}: ${alerts.length} alerts`);
}

// =============================================
// CRON SCHEDULER
// =============================================

let alertInterval = null;

/**
 * Start smart alerts cron job
 * Runs at 10:00 AM Paraguay time (UTC-3) = 13:00 UTC
 */
export function startAlertsCron() {
    const now = new Date();
    const pyHour = (now.getUTCHours() - 3 + 24) % 24;

    let msUntilTen;
    if (pyHour < 10) {
        msUntilTen = ((10 - pyHour) * 60 - now.getUTCMinutes()) * 60 * 1000;
    } else {
        msUntilTen = ((24 - pyHour + 10) * 60 - now.getUTCMinutes()) * 60 * 1000;
    }

    console.log(`🧠 Smart alerts cron: next run in ${Math.round(msUntilTen / 1000 / 60)} minutes`);

    setTimeout(() => {
        processSmartAlerts();
        alertInterval = setInterval(() => {
            processSmartAlerts();
        }, 24 * 60 * 60 * 1000);
    }, msUntilTen);
}

export function stopAlertsCron() {
    if (alertInterval) {
        clearInterval(alertInterval);
        alertInterval = null;
    }
}

export default { processSmartAlerts, startAlertsCron, stopAlertsCron };
