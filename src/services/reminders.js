// =============================================
// NexoBot MVP — Reminder Service
// =============================================
// Sends automated WhatsApp reminders to debtors
// on an escalating schedule (Day 3, 7, 14+)

import supabase from '../config/supabase.js';
import { sendMessage } from './whatsapp.js';

// =============================================
// REMINDER TEMPLATES (escalating tone)
// =============================================

const TEMPLATES = {
    // Day 3: Friendly reminder
    friendly: (customerName, amount, merchantName) =>
        `Hola ${customerName} 👋\n\n` +
        `Te recordamos que tenés un saldo pendiente de *${formatPYG(amount)}* con ${merchantName}.\n\n` +
        `¿Podés pasar a abonar? ¡Gracias! 🙏\n\n` +
        `_Mensaje enviado por NexoBot en nombre de ${merchantName}_`,

    // Day 7: Firm reminder
    firm: (customerName, amount, merchantName) =>
        `Hola ${customerName},\n\n` +
        `Tu deuda de *${formatPYG(amount)}* con ${merchantName} lleva más de una semana pendiente.\n\n` +
        `¿Querés coordinar un plan de pago? Podés pagar en cuotas. Respondé a este mensaje para coordinar.\n\n` +
        `_Mensaje de cobranza de ${merchantName} via NexoBot_`,

    // Day 14+: Urgent
    urgent: (customerName, amount, merchantName, days) =>
        `${customerName}, \n\n` +
        `Tu deuda de *${formatPYG(amount)}* con ${merchantName} tiene *${days} días* de atraso.\n\n` +
        `Es importante regularizar tu situación lo antes posible. Contactá a ${merchantName} para coordinar el pago.\n\n` +
        `_Cobranza de ${merchantName} via NexoBot_`
};

function formatPYG(amount) {
    if (amount >= 1000000) {
        return `Gs. ${(amount / 1000000).toFixed(1).replace('.0', '')} ${amount >= 2000000 ? 'millones' : 'millón'}`;
    }
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

// =============================================
// CORE: Process and send reminders
// =============================================

/**
 * Check all merchants for overdue debts and send reminders
 * Called by cron job daily at 9am PY time
 */
export async function processReminders() {
    if (!supabase) {
        console.log('⚠️ Reminders: Supabase not configured, skipping');
        return { sent: 0, skipped: 0, errors: 0 };
    }

    console.log('🔔 Starting reminder processing...');
    const stats = { sent: 0, skipped: 0, errors: 0 };

    try {
        // Get all customers with outstanding debt
        const { data: debtors, error } = await supabase
            .from('merchant_customers')
            .select(`
                id,
                name,
                phone,
                total_debt,
                last_transaction_at,
                merchant_id,
                merchants!inner (
                    name,
                    business_name,
                    phone
                )
            `)
            .gt('total_debt', 0)
            .order('total_debt', { ascending: false });

        if (error) {
            console.error('❌ Reminder DB error:', error);
            return stats;
        }

        if (!debtors || debtors.length === 0) {
            console.log('✅ No pending debts to remind about');
            return stats;
        }

        for (const debtor of debtors) {
            try {
                await processDebtorReminder(debtor, stats);
            } catch (err) {
                console.error(`❌ Error processing reminder for ${debtor.name}:`, err.message);
                stats.errors++;
            }
        }

        console.log(`🔔 Reminders done: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.errors} errors`);
        return stats;

    } catch (error) {
        console.error('❌ Reminder processing error:', error);
        return stats;
    }
}

/**
 * Process reminder for a single debtor
 */
async function processDebtorReminder(debtor, stats) {
    // Skip if customer has no phone number
    if (!debtor.phone) {
        stats.skipped++;
        return;
    }

    // Calculate days since last transaction
    const lastTx = debtor.last_transaction_at ? new Date(debtor.last_transaction_at) : null;
    if (!lastTx) {
        stats.skipped++;
        return;
    }

    const now = new Date();
    const daysSinceLastTx = Math.floor((now - lastTx) / (1000 * 60 * 60 * 24));

    // Only send reminders for debts older than 3 days
    if (daysSinceLastTx < 3) {
        stats.skipped++;
        return;
    }

    // Check if we already sent a reminder recently (within 3 days)
    const { data: recentReminder } = await supabase
        .from('reminders')
        .select('id, sent_at')
        .eq('customer_id', debtor.id)
        .eq('status', 'sent')
        .gte('sent_at', new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

    if (recentReminder && recentReminder.length > 0) {
        stats.skipped++;
        return;
    }

    // Determine reminder type based on age
    const merchantName = debtor.merchants.business_name || debtor.merchants.name || 'tu proveedor';
    let messageText;
    let reminderType;

    if (daysSinceLastTx <= 5) {
        reminderType = 'friendly';
        messageText = TEMPLATES.friendly(debtor.name, debtor.total_debt, merchantName);
    } else if (daysSinceLastTx <= 10) {
        reminderType = 'firm';
        messageText = TEMPLATES.firm(debtor.name, debtor.total_debt, merchantName);
    } else {
        reminderType = 'urgent';
        messageText = TEMPLATES.urgent(debtor.name, debtor.total_debt, merchantName, daysSinceLastTx);
    }

    // Send the WhatsApp message
    const sent = await sendMessage(debtor.phone, messageText);

    if (sent) {
        // Log the reminder in DB
        await supabase.from('reminders').insert({
            merchant_id: debtor.merchant_id,
            customer_id: debtor.id,
            amount: debtor.total_debt,
            message: messageText,
            scheduled_at: now.toISOString(),
            sent_at: now.toISOString(),
            status: 'sent'
        });

        // Notify the merchant that a reminder was sent
        await sendMessage(
            debtor.merchants.phone,
            `🔔 *Recordatorio enviado*\n\n` +
            `Se envió un recordatorio ${reminderType === 'friendly' ? 'amigable' : reminderType === 'firm' ? 'firme' : 'urgente'} a *${debtor.name}* por su deuda de ${formatPYG(debtor.total_debt)}.\n\n` +
            `📅 Deuda de ${daysSinceLastTx} días`
        );

        stats.sent++;
        console.log(`📨 Reminder sent to ${debtor.name} (${debtor.phone}) - ${reminderType} - ${formatPYG(debtor.total_debt)}`);
    } else {
        stats.errors++;
    }
}

// =============================================
// MANUAL REMINDER (merchant requests it)
// =============================================

/**
 * Send a manual reminder to a specific customer
 * Triggered when merchant says "recordale a Carlos"
 */
export async function sendManualReminder(merchantId, customerName) {
    if (!supabase) return null;

    // Find the customer
    const { data: customer } = await supabase
        .from('merchant_customers')
        .select('*')
        .eq('merchant_id', merchantId)
        .ilike('name', customerName)
        .single();

    if (!customer) {
        return { success: false, message: `No encontré un cliente llamado "${customerName}"` };
    }

    if (customer.total_debt <= 0) {
        return { success: false, message: `${customerName} no tiene deudas pendientes 🎉` };
    }

    if (!customer.phone) {
        return {
            success: false,
            message: `No tengo el teléfono de ${customerName}. Decime su número para registrarlo.`
        };
    }

    // Get merchant info
    const { data: merchant } = await supabase
        .from('merchants')
        .select('name, business_name')
        .eq('id', merchantId)
        .single();

    const merchantName = merchant?.business_name || merchant?.name || 'tu proveedor';

    // Send reminder
    const messageText = TEMPLATES.friendly(customer.name, customer.total_debt, merchantName);
    const sent = await sendMessage(customer.phone, messageText);

    if (sent) {
        // Log 
        await supabase.from('reminders').insert({
            merchant_id: merchantId,
            customer_id: customer.id,
            amount: customer.total_debt,
            message: messageText,
            scheduled_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: 'sent'
        });

        return {
            success: true,
            message: `✅ *Recordatorio enviado* a ${customer.name} (${customer.phone})\n` +
                `💰 Deuda: ${formatPYG(customer.total_debt)}`
        };
    }

    return { success: false, message: '❌ No pude enviar el mensaje. Intentá más tarde.' };
}

// =============================================
// CRON SCHEDULER
// =============================================

let reminderInterval = null;

/**
 * Start the daily reminder cron job
 * Runs at 9:00 AM Paraguay time (UTC-3) = 12:00 UTC
 */
export function startReminderCron() {
    // Calculate ms until next 9am PY time
    const now = new Date();
    const pyHour = (now.getUTCHours() - 3 + 24) % 24;

    let msUntilNine;
    if (pyHour < 9) {
        // Today at 9am PY
        msUntilNine = ((9 - pyHour) * 60 - now.getUTCMinutes()) * 60 * 1000;
    } else {
        // Tomorrow at 9am PY
        msUntilNine = ((24 - pyHour + 9) * 60 - now.getUTCMinutes()) * 60 * 1000;
    }

    console.log(`⏰ Reminder cron: next run in ${Math.round(msUntilNine / 1000 / 60)} minutes`);

    // First run at next 9am
    setTimeout(() => {
        processReminders();

        // Then every 24 hours
        reminderInterval = setInterval(() => {
            processReminders();
        }, 24 * 60 * 60 * 1000);
    }, msUntilNine);
}

/**
 * Stop the reminder cron
 */
export function stopReminderCron() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
    }
}

export default { processReminders, sendManualReminder, startReminderCron, stopReminderCron };
