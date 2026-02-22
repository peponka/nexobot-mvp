// =============================================
// NexoBot — Guaraní / Jopará Localization
// =============================================
// Provides bilingual responses when merchant
// writes in guaraní or jopará.
// 
// Usage: import { t } from './guarani.js';
//        t(lang, 'sale_registered') → guaraní or spanish
// =============================================

// Response templates in Spanish and Guaraní
const messages = {
    // === GREETINGS ===
    greeting_morning: {
        es: 'Buen día',
        gn: 'Mba\'éichapa ndepyhare'
    },
    greeting_afternoon: {
        es: 'Buenas tardes',
        gn: 'Mba\'éichapa nde ka\'aru'
    },
    greeting_evening: {
        es: 'Buenas noches',
        gn: 'Mba\'éichapa nde pyhareve'
    },
    greeting_intro: {
        es: (name) => `${name}! 👋\n\nSoy *NexoBot* 🤖, tu asistente comercial.\n\nPuedo ayudarte a:\n📝 Registrar ventas (fiado y contado)\n💰 Registrar cobros\n📊 Ver quién te debe\n📈 Resumen de ventas\n📦 Controlar inventario\n\nHablame tranquilo, como si fuera tu socio. Ej:\n_"Vendí 500 mil a Don Carlos, fiado"_\n_"Cobré 200 mil de María"_\n_"¿Cuánto me deben?"_`,
        gn: (name) => `${name}! 👋\n\nChe ha'e *NexoBot* 🤖, nde pytyvõhára negociope.\n\nIkatu roipytyvõ:\n📝 Oñeregistra venta (fiado ha contado)\n💰 Oñeregistra cobro\n📊 Eporandu mávapa ndéve ojedebe\n📈 Resumen de venta\n📦 Oñecontrola mercadería\n\nEñe'ẽ chéve tranquilo, socio rami. Ej:\n_"Avendé 500 mil Don Carlos-pe, fiado"_\n_"Acobra 200 mil María-gui"_\n_"Mbovy ojedebe chéve?"_`
    },

    // === SALES ===
    sale_cash_registered: {
        es: '✅ *Venta al contado registrada*',
        gn: '✅ *Venta contado oñeregistra*'
    },
    sale_credit_registered: {
        es: '✅ *Venta fiado registrada*',
        gn: '✅ *Venta fiado oñeregistra*'
    },
    sale_no_amount: {
        es: '🤔 Entendí que querés registrar una venta, pero no encontré el monto. Ej: "Vendí 300 mil al contado"',
        gn: '🤔 Aikuaa reipotaha eregistra peteĩ venta, pero ndaikatúi ajuhu mbovy. Ej: "Avendé 300 mil contado"'
    },
    sale_credit_no_name: {
        es: '🤔 Para registrar un fiado necesito saber a quién. Ej: "Le fié 200 mil a Carlos"',
        gn: '🤔 Fiado oñeregistra haguã, aikotevẽ aikuaa mávape. Ej: "Afié 200 mil Carlos-pe"'
    },
    amount_label: {
        es: '💰 Monto',
        gn: '💰 Mbovy'
    },
    customer_label: {
        es: '👤 Cliente',
        gn: '👤 Marchante'
    },
    product_label: {
        es: '📦 Producto',
        gn: '📦 Producto'
    },
    due_date_label: {
        es: '⏰ Vence',
        gn: '⏰ Opa'
    },
    pending_debt: {
        es: (name, total) => `📋 Deuda total de ${name}: ${total}`,
        gn: (name, total) => `📋 ${name} ojedebe opavave: ${total}`
    },

    // === PAYMENTS ===
    payment_registered: {
        es: '✅ *Cobro registrado*',
        gn: '✅ *Cobro oñeregistra*'
    },
    payment_no_amount: {
        es: '🤔 ¿Cuánto cobraste? Ej: "Cobré 200 mil de Carlos"',
        gn: '🤔 Mbovy recobra? Ej: "Acobra 200 mil Carlos-gui"'
    },

    // === DEBT QUERY ===
    debt_title: {
        es: '📋 *Deudas pendientes*',
        gn: '📋 *Deuda pendiente kuéra*'
    },
    debt_no_debts: {
        es: '🎉 *¡No tenés deudas pendientes!*\n\nTodas las cuentas al día 💪',
        gn: '🎉 *Ndaipóri deuda pendiente!*\n\nOpavave cuenta al día 💪'
    },
    debt_total: {
        es: (total) => `\n💰 *Total pendiente: ${total}*`,
        gn: (total) => `\n💰 *Opavave ojedebe: ${total}*`
    },

    // === SALES QUERY ===
    sales_title: {
        es: '📊 *Resumen de ventas*',
        gn: '📊 *Venta resumen*'
    },
    sales_today: {
        es: '📅 Hoy',
        gn: '📅 Ko\'ára'
    },
    sales_week: {
        es: '📆 Esta semana',
        gn: '📆 Ko semana'
    },
    sales_month: {
        es: '📅 Este mes',
        gn: '📅 Ko jasy'
    },

    // === INVENTORY ===
    inventory_registered: {
        es: '✅ *Mercadería registrada*',
        gn: '✅ *Mercadería oñeregistra*'
    },

    // === HELP ===
    help_title: {
        es: `📖 *Guía de NexoBot* 🇵🇾\n━━━━━━━━━━━━━━━━━━\n\n📝 *Venta fiado:*\n_"Vendí 500 mil a Carlos, fiado"_\n_"Le fié 200 mil a María"_\n\n💵 *Venta contado:*\n_"Vendí 300 mil al contado"_\n_"Venta de 1 palo en efectivo"_\n\n💰 *Registrar cobro:*\n_"Cobré 200 mil de María"_\n_"Carlos me pagó 500 mil"_\n\n📋 *Consultar deudas:*\n_"¿Cuánto me deben?"_\n_"¿Quién me debe más?"_\n\n📊 *Resumen:*\n_"¿Cuánto vendí esta semana?"_\n_"¿Cómo me fue hoy?"_\n\n📦 *Inventario:*\n_"Me llegaron 30 cajas de cerveza"_\n\n💡 Podés escribir como quieras, ¡entiendo todo! 🇵🇾`,
        gn: `📖 *NexoBot Guía* 🇵🇾\n━━━━━━━━━━━━━━━━━━\n\n📝 *Venta fiado:*\n_"Avendé 500 mil Carlos-pe, fiado"_\n_"Afié 200 mil María-pe"_\n\n💵 *Venta contado:*\n_"Avendé 300 mil contado"_\n_"Venta 1 palo efectivo-pe"_\n\n💰 *Cobro:*\n_"Acobra 200 mil María-gui"_\n_"Carlos ohepaga 500 mil"_\n\n📋 *Deuda:*\n_"Mbovy ojedebe chéve?"_\n_"Máva ojedebe chéve?"_\n\n📊 *Resumen:*\n_"Mbovy avendé ko semana?"_\n_"Mba'éichapa che negocio?"_\n\n📦 *Mercadería:*\n_"Oguahẽ 30 caja cerveza"_\n\n💡 Eñe'ẽ chéve nde háicha, aikuaa opavave! 🇵🇾`
    },

    // === UNKNOWN ===
    unknown: {
        es: `🤔 No te entendí bien, disculpá.\n\nProbá con algo así:\n📝 _"Vendí 500 mil a Carlos, fiado"_\n💰 _"Cobré 200 mil de María"_\n📋 _"¿Cuánto me deben?"_\n📊 _"¿Cómo me fue esta semana?"_\n\nEscribí *ayuda* para ver todo lo que puedo hacer 💪`,
        gn: `🤔 Ndaikuaái mba'épa ere, disculpá.\n\nEhai ko'ã rami:\n📝 _"Avendé 500 mil Carlos-pe, fiado"_\n💰 _"Acobra 200 mil María-gui"_\n📋 _"Mbovy ojedebe chéve?"_\n📊 _"Mba'éichapa ko semana?"_\n\nEhai *pytyvõ* ehecha haguã mba'e aikuaápa 💪`
    },

    // === ERRORS ===
    error_generic: {
        es: '❌ Hubo un error procesando tu mensaje. Intentá de nuevo.',
        gn: '❌ Oĩ peteĩ error. Eha\'ã jey.'
    },
    error_internal: {
        es: '❌ Error interno. Intentá de nuevo en un momento.',
        gn: '❌ Error interno. Eha\'ã jey.'
    },

    // === REMINDERS ===
    reminder_sent: {
        es: (name) => `✅ Le mandé un recordatorio a *${name}*`,
        gn: (name) => `✅ Amondó peteĩ recordatorio *${name}*-pe`
    },
    reminder_no_name: {
        es: '🤔 ¿A quién le mando el recordatorio? Ej: "Recordale a Carlos"',
        gn: '🤔 Mávape amondó recordatorio? Ej: "Erecordále Carlos-pe"'
    },

    // === PIN ===
    pin_set: {
        es: (pin) => `🔐 *PIN configurado correctamente*\n\nTu PIN del dashboard es: *${pin}*\nGuardalo en un lugar seguro.\n\n📊 Accedé a tu dashboard en:\nhttps://nexobot-mvp-1.onrender.com\n\nUsá tu número de teléfono + este PIN para ingresar.`,
        gn: (pin) => `🔐 *PIN oñeconfigura porã*\n\nNde PIN dashboard pegua: *${pin}*\nEñongatu porã.\n\n📊 Eike nde dashboard-pe:\nhttps://nexobot-mvp-1.onrender.com\n\nEipuru nde teléfono número + ko PIN eike haguã.`
    },

    // === DAILY SUMMARY ===
    summary_title: {
        es: '📊 *Resumen del día*',
        gn: '📊 *Ko ára resumen*'
    }
};

/**
 * Get a translated message
 * @param {string} lang - 'es', 'gn', or 'jopara'
 * @param {string} key - message key
 * @param  {...any} args - arguments for template functions
 * @returns {string}
 */
export function t(lang, key, ...args) {
    const msg = messages[key];
    if (!msg) return key;

    // Jopará uses guaraní translations with some spanish mixed in
    const target = (lang === 'gn' || lang === 'jopara') ? 'gn' : 'es';
    const val = msg[target] || msg['es'];

    if (typeof val === 'function') return val(...args);
    return val;
}

/**
 * Get the greeting based on time and language
 * @param {string} lang - language code
 * @returns {string}
 */
export function getGreeting(lang) {
    const hour = new Date().getUTCHours() - 3; // Paraguay UTC-3
    if (hour < 12) return t(lang, 'greeting_morning');
    if (hour < 18) return t(lang, 'greeting_afternoon');
    return t(lang, 'greeting_evening');
}

export default { t, getGreeting, messages };
