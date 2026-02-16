// =============================================
// NexoBot MVP — Bot Logic / Command Handler
// =============================================
// This is the brain of NexoBot. It receives parsed NLP results
// and executes the appropriate business logic.

import * as Merchant from '../models/merchant.js';
import * as Customer from '../models/customer.js';
import * as Transaction from '../models/transaction.js';

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
export async function handleMessage(phone, contactName, rawMessage, parsed) {
    // Get or create merchant
    const merchant = await Merchant.findOrCreate(phone, contactName);

    if (!merchant) {
        return '❌ Error interno. Intentá de nuevo en un momento.';
    }

    const { intent, entities } = parsed;

    try {
        switch (intent) {
            case 'SALE_CREDIT':
                return await handleSaleCredit(merchant, entities, rawMessage);

            case 'SALE_CASH':
                return await handleSaleCash(merchant, entities, rawMessage);

            case 'PAYMENT':
                return await handlePayment(merchant, entities, rawMessage);

            case 'DEBT_QUERY':
                return await handleDebtQuery(merchant);

            case 'SALES_QUERY':
                return await handleSalesQuery(merchant);

            case 'INVENTORY_IN':
                return await handleInventoryIn(merchant, entities, rawMessage);

            case 'GREETING':
                return handleGreeting(merchant);

            case 'HELP':
                return handleHelp();

            default:
                return handleUnknown();
        }
    } catch (error) {
        console.error(`Bot error for ${phone}:`, error);
        return '❌ Hubo un error procesando tu mensaje. Intentá de nuevo.';
    }
}

// =============================================
// INTENT HANDLERS
// =============================================

async function handleSaleCredit(merchant, entities, rawMessage) {
    const { amount, customer_name, product, quantity, unit_price, currency } = entities;

    if (!amount) {
        return '🤔 Entendí que querés registrar una venta fiado, pero no encontré el monto. ¿Podés decirme el monto? Ej: "Vendí 500 mil a Carlos, fiado"';
    }

    if (!customer_name) {
        return `🤔 Entendí venta fiado de ${formatPYG(amount)}, pero ¿a quién? Decime el nombre. Ej: "Vendí ${formatCompact(amount)} a Juan, fiado"`;
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
    let response = `✅ *Venta fiado registrada*\n\n`;
    response += `👤 Cliente: ${customer_name}\n`;
    response += `💰 Monto: ${formatPYG(amount)}\n`;

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

async function handleSaleCash(merchant, entities, rawMessage) {
    const { amount, product, quantity, unit_price, customer_name, currency } = entities;

    if (!amount) {
        return '🤔 Entendí que querés registrar una venta, pero no encontré el monto. Ej: "Vendí 300 mil al contado"';
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

    let response = `✅ *Venta al contado registrada*\n\n`;
    response += `💰 Monto: ${formatPYG(amount)}\n`;
    if (customer_name) response += `👤 Cliente: ${customer_name}\n`;
    if (product) response += `📦 Producto: ${product}`;
    if (quantity) response += ` (x${quantity})`;
    if (product || quantity) response += '\n';

    return response;
}

async function handlePayment(merchant, entities, rawMessage) {
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
    response += `💰 Cobrado: ${formatPYG(amount)}\n`;

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

async function handleDebtQuery(merchant) {
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

async function handleSalesQuery(merchant) {
    const summary = await Transaction.getWeeklySummary(merchant.id);

    if (summary.count === 0) {
        return '📊 No tenés ventas registradas esta semana todavía. ¡Registrá tu primera venta!';
    }

    let response = `📊 *Resumen semanal*\n` +
        `━━━━━━━━━━━━━━━━━━\n\n`;

    response += `💰 Total vendido: *${formatPYG(summary.total)}*\n`;
    response += `🧾 Operaciones: ${summary.count}\n`;
    response += `📈 Ticket promedio: ${formatPYG(summary.avgTicket)}\n`;

    return response;
}

async function handleInventoryIn(merchant, entities, rawMessage) {
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

function handleGreeting(merchant) {
    const name = merchant.name || 'amigo';
    const hour = new Date().getUTCHours() - 3; // Paraguay is UTC-3
    const saludo = hour < 12 ? 'Buen día' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    return `${saludo} ${name}! 👋\n\nSoy *NexoBot* 🤖, tu asistente comercial.\n\n` +
        `Puedo ayudarte a:\n` +
        `📝 Registrar ventas (fiado y contado)\n` +
        `💰 Registrar cobros\n` +
        `📊 Ver quién te debe\n` +
        `📈 Resumen de ventas\n` +
        `📦 Controlar inventario\n\n` +
        `Hablame tranquilo, como si fuera tu socio. Ej:\n` +
        `_"Vendí 500 mil a Don Carlos, fiado"_\n` +
        `_"Cobré 200 mil de María"_\n` +
        `_"¿Cuánto me deben?"_`;
}

function handleHelp() {
    return `📖 *Guía de NexoBot* 🇵🇾\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *Venta fiado:*\n` +
        `_"Vendí 500 mil a Carlos, fiado"_\n` +
        `_"Le fié 200 mil a María"_\n` +
        `_"Le dejé mercadería a Don Pedro, a cuenta"_\n\n` +
        `💵 *Venta contado:*\n` +
        `_"Vendí 300 mil al contado"_\n` +
        `_"Venta de 1 palo en efectivo"_\n\n` +
        `💰 *Registrar cobro:*\n` +
        `_"Cobré 200 mil de María"_\n` +
        `_"Carlos me pagó 500 mil"_\n` +
        `_"Me trajo 100 mil la Doña Rosa"_\n\n` +
        `📋 *Consultar deudas:*\n` +
        `_"¿Cuánto me deben?"_\n` +
        `_"¿Quién me debe más?"_\n` +
        `_"Deudores"_\n\n` +
        `📊 *Resumen:*\n` +
        `_"¿Cuánto vendí esta semana?"_\n` +
        `_"¿Cómo me fue hoy?"_\n\n` +
        `📦 *Inventario:*\n` +
        `_"Me llegaron 30 cajas de cerveza"_\n\n` +
        `💡 Podés escribir como quieras, ¡entiendo todo! 🇵🇾`;
}

function handleUnknown() {
    return `🤔 No te entendí bien, disculpá.\n\n` +
        `Probá con algo así:\n` +
        `📝 _"Vendí 500 mil a Carlos, fiado"_\n` +
        `💰 _"Cobré 200 mil de María"_\n` +
        `📋 _"¿Cuánto me deben?"_\n` +
        `📊 _"¿Cómo me fue esta semana?"_\n\n` +
        `Escribí *ayuda* para ver todo lo que puedo hacer 💪`;
}

export default { handleMessage };
