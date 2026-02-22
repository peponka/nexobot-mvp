// =============================================
// NexoBot MVP — Bot Logic / Command Handler
// =============================================
// This is the brain of NexoBot. It receives parsed NLP results
// and executes the appropriate business logic.

import * as Merchant from '../models/merchant.js';
import * as Customer from '../models/customer.js';
import * as Transaction from '../models/transaction.js';
import { sendManualReminder } from './reminders.js';
import { needsOnboarding, handleOnboarding } from './onboarding.js';
import { formatAmount, formatDualCurrency, usdToPyg, getExchangeRate } from './currency.js';
import { setPin } from './auth.js';
import { t, getGreeting } from './guarani.js';
import { handleReferralIntent } from './referrals.js';
import { getReportMessage } from './reports.js';
import { handleReceiptPhoto } from './receiptOcr.js';
import { handleMultiBusinessIntent } from './multiBusiness.js';

/**
 * Format currency (Guaraníes)
 */
function formatPYG(amount) {
    if (amount >= 1000000) {
        return `Gs. ${(amount / 1000000).toFixed(1).replace('.0', '')} ${amount >= 2000000 ? 'millones' : 'millón'}`;
    }
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

/**
 * Format currency (compact)
 */
function formatCompact(amount) {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
    return amount.toString();
}

/**
 * Handle a parsed message and return a response
 * @param {string} phone - Merchant's phone
 * @param {string} contactName - Contact name from WhatsApp
 * @param {string} rawMessage - Original message
 * @param {Object} parsed - NLP parsed result
 * @returns {string} Bot response text
 */
export async function handleMessage(phone, contactName, rawMessage, parsed, imageData = null) {
    // Detect language for this message
    const lang = parsed.language || 'es';

    // Get or create merchant
    const merchant = await Merchant.findOrCreate(phone, contactName);

    if (!merchant) {
        return t(lang, 'error_internal');
    }

    // Check if merchant needs onboarding (new user)
    if (needsOnboarding(merchant)) {
        const onboardingResponse = await handleOnboarding(merchant, rawMessage, imageData);
        if (onboardingResponse) return onboardingResponse;
    }

    // If image received (not during onboarding), try receipt OCR
    if (imageData && imageData.mediaId) {
        return await handleReceiptPhoto(merchant, imageData);
    }

    const { intent, entities } = parsed;

    try {
        switch (intent) {
            case 'SALE_CREDIT':
                return await handleSaleCredit(merchant, entities, rawMessage, lang);

            case 'SALE_CASH':
                return await handleSaleCash(merchant, entities, rawMessage, lang);

            case 'PAYMENT':
                return await handlePayment(merchant, entities, rawMessage, lang);

            case 'DEBT_QUERY':
                return await handleDebtQuery(merchant, lang);

            case 'SALES_QUERY':
                return await handleSalesQuery(merchant, lang);

            case 'INVENTORY_IN':
                return await handleInventoryIn(merchant, entities, rawMessage, lang);

            case 'REMINDER':
                return await handleReminder(merchant, entities, lang);

            case 'SET_PIN':
                return await handleSetPin(merchant, entities, lang);

            case 'FORGOT_PIN':
                return handleForgotPin(merchant, lang);

            case 'REFERRAL':
                return await handleReferralIntent(merchant, entities.subIntent, entities);

            case 'REPORT':
                return await handleReportIntent(merchant);

            case 'MULTI_BUSINESS':
                return await handleMultiBusinessIntent(merchant, phone, entities.subIntent, entities);

            case 'EXPORT':
                return handleExportIntent(merchant, entities.exportType);

            case 'GREETING':
                return handleBotGreeting(merchant, lang);

            case 'HELP':
                return handleHelp(lang);

            default:
                return handleUnknown(lang);
        }
    } catch (error) {
        console.error(`Bot error for ${phone}:`, error);
        return t(lang, 'error_generic');
    }
}

// =============================================
// INTENT HANDLERS
// =============================================

async function handleSaleCredit(merchant, entities, rawMessage, lang = 'es') {
    const { amount, customer_name, product, quantity, unit_price, currency } = entities;

    if (!amount) {
        return t(lang, 'sale_no_amount');
    }

    if (!customer_name) {
        return t(lang, 'sale_credit_no_name');
    }

    // Find or create customer
    const customer = await Customer.findOrCreate(merchant.id, customer_name);

    // Create transaction
    await Transaction.create({
        merchant_id: merchant.id,
        customer_id: customer?.id || null,
        type: 'SALE_CREDIT',
        amount,
        currency: currency || 'PYG',
        product: product || null,
        quantity: quantity || null,
        unit_price: unit_price || null,
        raw_message: rawMessage,
        parsed_intent: 'SALE_CREDIT'
    });

    // Update customer debt
    if (customer) {
        await Customer.updateDebt(customer.id, amount, 'SALE_CREDIT');
    }

    // Update merchant stats
    await Merchant.updateStats(merchant.id, {
        total_sales: (merchant.total_sales || 0) + amount,
        total_credit_given: (merchant.total_credit_given || 0) + amount
    });

    // Build response
    let response = `${t(lang, 'sale_credit_registered')}\n\n`;
    response += `${t(lang, 'customer_label')}: ${customer_name}\n`;

    if (currency === 'USD') {
        const fmtDual = await formatDualCurrency(amount, 'USD');
        response += `💰 Monto: ${fmtDual}\n`;
    } else {
        response += `💰 Monto: ${formatPYG(amount)}\n`;
    }

    if (product) response += `📦 Producto: ${product}`;
    if (quantity) response += ` (x${quantity})`;
    if (product || quantity) response += '\n';

    // Show updated debt for this customer
    if (customer) {
        const updatedCustomer = await Customer.getById(customer.id);
        if (updatedCustomer && updatedCustomer.total_debt > amount) {
            response += `\n📊 Deuda total de ${customer_name}: ${formatPYG(updatedCustomer.total_debt)}`;
        }
    }

    return response;
}

async function handleSaleCash(merchant, entities, rawMessage, lang = 'es') {
    const { amount, product, quantity, unit_price, customer_name, currency } = entities;

    if (!amount) {
        return t(lang, 'sale_no_amount');
    }

    await Transaction.create({
        merchant_id: merchant.id,
        type: 'SALE_CASH',
        amount,
        currency: currency || 'PYG',
        product: product || null,
        quantity: quantity || null,
        unit_price: unit_price || null,
        raw_message: rawMessage,
        parsed_intent: 'SALE_CASH'
    });

    await Merchant.updateStats(merchant.id, {
        total_sales: (merchant.total_sales || 0) + amount
    });

    let response = `${t(lang, 'sale_cash_registered')}\n\n`;

    if (currency === 'USD') {
        const fmtDual = await formatDualCurrency(amount, 'USD');
        response += `💰 Monto: ${fmtDual}\n`;
    } else {
        response += `💰 Monto: ${formatPYG(amount)}\n`;
    }

    if (customer_name) response += `👤 Cliente: ${customer_name}\n`;
    if (product) response += `📦 Producto: ${product}`;
    if (quantity) response += ` (x${quantity})`;
    if (product || quantity) response += '\n';

    return response;
}

async function handlePayment(merchant, entities, rawMessage, lang = 'es') {
    const { amount, customer_name, currency } = entities;

    if (!amount) {
        return '🤔 ¿Cuánto te pagaron? Ej: "Cobré 200 mil de María"';
    }

    if (!customer_name) {
        return `🤔 Cobro de ${formatPYG(amount)}, pero ¿de quién? Ej: "Cobré ${formatCompact(amount)} de María"`;
    }

    const customer = await Customer.findOrCreate(merchant.id, customer_name);

    await Transaction.create({
        merchant_id: merchant.id,
        customer_id: customer?.id || null,
        type: 'PAYMENT',
        amount,
        currency: currency || 'PYG',
        raw_message: rawMessage,
        parsed_intent: 'PAYMENT'
    });

    if (customer) {
        await Customer.updateDebt(customer.id, amount, 'PAYMENT');
    }

    await Merchant.updateStats(merchant.id, {
        total_collected: (merchant.total_collected || 0) + amount
    });

    let response = `✅ *Cobro registrado*\n\n`;
    response += `👤 Cliente: ${customer_name}\n`;

    if (currency === 'USD') {
        const fmtDual = await formatDualCurrency(amount, 'USD');
        response += `💰 Cobrado: ${fmtDual}\n`;
    } else {
        response += `💰 Cobrado: ${formatPYG(amount)}\n`;
    }

    if (customer) {
        const updatedCustomer = await Customer.getById(customer.id);
        if (updatedCustomer) {
            if (updatedCustomer.total_debt <= 0) {
                response += `\n🎉 ¡${customer_name} ya no te debe nada! Saldo: Gs. 0`;
            } else {
                response += `\n📊 Saldo pendiente de ${customer_name}: ${formatPYG(updatedCustomer.total_debt)}`;
            }
        }
    }

    return response;
}

async function handleDebtQuery(merchant, lang = 'es') {
    const debtors = await Customer.getDebtors(merchant.id);

    if (debtors.length === 0) {
        return '🎉 ¡No tenés deudas pendientes! Excelente gestión. 💪';
    }

    const totalDebt = debtors.reduce((sum, d) => sum + d.total_debt, 0);

    let response = `📋 *Deudas pendientes*\n` +
        `━━━━━━━━━━━━━━━━━━\n\n`;

    debtors.forEach((debtor, i) => {
        const riskEmoji = debtor.risk_level === 'high' ? '🔴' :
            debtor.risk_level === 'medium' ? '🟡' : '🟢';
        response += `${riskEmoji} *${debtor.name}*: ${formatPYG(debtor.total_debt)}\n`;
    });

    response += `\n━━━━━━━━━━━━━━━━━━\n`;
    response += `💰 *Total pendiente: ${formatPYG(totalDebt)}*\n`;
    response += `👥 ${debtors.length} cliente${debtors.length > 1 ? 's' : ''} con deuda`;

    return response;
}

async function handleSalesQuery(merchant, lang = 'es') {
    const weekly = await Transaction.getWeeklySummary(merchant.id);
    const daily = await Transaction.getDailySummary(merchant.id);

    if (weekly.count === 0 && daily.totalOps === 0) {
        return '📊 No tenés ventas registradas todavía. ¡Registrá tu primera venta!';
    }

    let response = '';

    // Daily summary (today)
    if (daily.totalOps > 0) {
        response += `📊 *Resumen de hoy*\n`;
        response += `━━━━━━━━━━━━━━━━━━\n\n`;
        response += `💰 *Ventas totales: ${formatPYG(daily.totalSales)}*\n`;
        if (daily.countSalesCash > 0) {
            response += `   💵 Contado: ${formatPYG(daily.salesCash)} (${daily.countSalesCash})\n`;
        }
        if (daily.countSalesCredit > 0) {
            response += `   📝 Fiado: ${formatPYG(daily.salesCredit)} (${daily.countSalesCredit})\n`;
        }
        if (daily.countPayments > 0) {
            response += `\n💵 *Cobros: ${formatPYG(daily.totalCollected)}* (${daily.countPayments})\n`;
        }
        response += `\n🧾 Operaciones del día: ${daily.totalOps}\n`;
    } else {
        response += `📊 *Hoy* — Sin actividad todavía.\n`;
    }

    // Weekly summary
    if (weekly.count > 0) {
        response += `\n━━━━━━━━━━━━━━━━━━\n`;
        response += `📈 *Semana:* ${formatPYG(weekly.total)} (${weekly.count} ops)\n`;
        response += `📊 Ticket promedio: ${formatPYG(weekly.avgTicket)}\n`;
    }

    // Motivational
    const emoji = daily.totalSales >= 1000000 ? '🔥' : daily.totalSales >= 500000 ? '💪' : '👍';
    response += `\n${emoji} ¡Seguí así!`;

    return response;
}

async function handleInventoryIn(merchant, entities, rawMessage, lang = 'es') {
    const { product, quantity, amount } = entities;

    if (!product && !quantity) {
        return '🤔 ¿Qué te llegó y cuánto? Ej: "Me llegaron 30 cajas de cerveza"';
    }

    await Transaction.create({
        merchant_id: merchant.id,
        type: 'INVENTORY_IN',
        amount: amount || 0,
        product: product || 'mercadería',
        quantity: quantity || null,
        raw_message: rawMessage,
        parsed_intent: 'INVENTORY_IN'
    });

    let response = `📦 *Inventario actualizado*\n\n`;
    if (product) response += `📋 Producto: ${product}\n`;
    if (quantity) response += `📊 Cantidad: ${quantity}\n`;
    if (amount) response += `💰 Costo: ${formatPYG(amount)}\n`;

    return response;
}

async function handleReminder(merchant, entities, lang = 'es') {
    const { customer_name } = entities;

    if (!customer_name) {
        return '🤔 ¿A quién le mando el recordatorio? Ej: _"Recordale a Carlos"_';
    }

    const result = await sendManualReminder(merchant.id, customer_name);

    if (result && result.success) {
        return result.message;
    } else if (result) {
        return result.message;
    }

    return '❌ No pude enviar el recordatorio. Intentá más tarde.';
}

function handleBotGreeting(merchant, lang = 'es') {
    const name = merchant.name || 'amigo';
    const saludo = getGreeting(lang);
    return `${saludo} ${t(lang, 'greeting_intro', name)}`;
}

function handleHelp(lang = 'es') {
    return t(lang, 'help_title');
}

function handleUnknown(lang = 'es') {
    return t(lang, 'unknown');
}

async function handleSetPin(merchant, entities, lang = 'es') {
    const { pin } = entities;
    const result = await setPin(merchant.id, pin);

    if (result.success) {
        return t(lang, 'pin_set', pin);
    }

    return `❌ ${result.error || 'Error configurando el PIN'}`;
}

function handleForgotPin(merchant, lang = 'es') {
    return `🔐 *Recuperación de PIN*\n\n` +
        `No te preocupes. Para crear un nuevo PIN y volver a entrar a la App Móvil, simplemente enviame un mensaje que diga:\n\n` +
        `👉 *"PIN 1234"* (pero cambiá el 1234 por el número secreto que quieras usar, de 4 a 6 dígitos).\n\n` +
        `Tu PIN se actualizará automáticamente y podrás volver a entrar. 😉`;
}

async function handleReportIntent(merchant) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const downloadUrl = `https://nexobot-mvp-1.onrender.com/api/reports/${merchant.id}?month=${month}&year=${year}`;

    return `📄 *Reporte de ${months[month]} ${year}*\n\n` +
        `Tu reporte PDF está listo para descargar:\n\n` +
        `🔗 ${downloadUrl}\n\n` +
        `Incluye:\n` +
        `• Resumen de ventas (contado y fiado)\n` +
        `• Lista de deudores\n` +
        `• Clientes principales\n` +
        `• Tu NexoScore\n\n` +
        `_Hacé click en el link para descargarlo_`;
}

function handleExportIntent(merchant, exportType = 'sales') {
    const baseUrl = `https://nexobot-mvp-1.onrender.com/api/export/${merchant.id}`;

    if (exportType === 'debtors') {
        return `📊 *Excel de Deudores* listo!\n\n` +
            `🔗 ${baseUrl}/debtors\n\n` +
            `Incluye:\n` +
            `• Lista completa de deudores\n` +
            `• Monto de cada deuda\n` +
            `• Nivel de riesgo\n` +
            `• Fecha de última transacción\n\n` +
            `_Hacé click para descargar el .xlsx_`;
    }

    const now = new Date();
    return `📊 *Excel de Ventas* listo!\n\n` +
        `🔗 ${baseUrl}/sales?month=${now.getMonth()}&year=${now.getFullYear()}\n\n` +
        `Incluye:\n` +
        `• Todas las operaciones del mes\n` +
        `• Totales por tipo (contado, fiado, cobros)\n` +
        `• Filtros y formato profesional\n\n` +
        `_Hacé click para descargar el .xlsx_`;
}

export default { handleMessage };
