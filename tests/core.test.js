// =============================================
// NexoBot MVP — Test Suite v2
// =============================================
// Comprehensive tests covering NLP, formatting,
// auth, billing, referrals, and multi-business
//
// Run: node tests/core.test.js

import { writeFileSync } from 'fs';

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        results.push(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        results.push(`  ❌ ${name}: ${err.message}`);
    }
}

function eq(a, b) {
    if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function ok(val, msg) {
    if (!val) throw new Error(msg || `Expected truthy, got ${val}`);
}

// ═══════════════════════════════════════
// 📝 NLP INTENT DETECTION
// ═══════════════════════════════════════
results.push('\n📝 NLP Intent Detection — Core');

function detectIntent(message) {
    const lower = message.toLowerCase().trim();
    const original = message.trim();
    const result = { intent: 'UNKNOWN', entities: {} };

    // PIN
    const pinMatch = lower.match(/^pin\s+(\d{4,6})$/);
    if (pinMatch) return { intent: 'SET_PIN', entities: { pin: pinMatch[1] } };

    // GREETING
    if (/^(hola|buenas?|buen[oa]?s?\s*(d[ií]as?|tardes?|noches?)?|qu[eé]\s*tal|hey|hi|ola|epa)/i.test(lower) && lower.length < 40)
        return { intent: 'GREETING', entities: {} };

    // HELP
    if (/^(ayuda|help|menu|menú|comandos|opciones)/i.test(lower))
        return { intent: 'HELP', entities: {} };

    // REMINDER
    if (/record[aá]le|mand[aá]le\s*(un\s*)?(mensaje|recordatorio)|cobr[aá]le|decile\s*que\s*(pague|me\s*debe)/i.test(lower))
        return { intent: 'REMINDER', entities: {} };

    // DEBT QUERY
    if (/cu[áa]nto\s*me\s*deben|deudas?|pendientes?|deudores?|morosos?|lista\s*de\s*deud|me\s*deben|fiados?\s*pendientes?/i.test(lower))
        return { intent: 'DEBT_QUERY', entities: {} };

    // SALES QUERY
    if (/cu[áa]nto\s*vend[ií]|resumen|mis\s*ventas|ventas?\s*de\s*(hoy|esta\s*semana)|c[oó]mo\s*(me\s*fue|estoy|voy)/i.test(lower))
        return { intent: 'SALES_QUERY', entities: {} };

    // PAYMENT
    if (/cobr[eé]|pag[oó]|me\s*pag[oó]|recib[ií]\s*pago|ya\s*pag[oó]|me\s*cancel[oó]|abon[oó]/i.test(lower) && /\d/.test(lower))
        return { intent: 'PAYMENT', entities: {} };

    // SALE_CREDIT
    if (/fi(ado|é|ar)|cred|prest[eéaó]|debe/i.test(lower) && /\d/.test(lower))
        return { intent: 'SALE_CREDIT', entities: {} };

    // SALE_CASH
    if (/vend[ií]|venta|factur/i.test(lower) && /\d/.test(lower))
        return { intent: 'SALE_CASH', entities: {} };

    // INVENTORY
    if (/lleg[aoóa]r?on|me\s*lleg[oó]|mercader[ií]a|stock|inventario/i.test(lower))
        return { intent: 'INVENTORY_IN', entities: {} };

    // REFERRAL
    if (/mi\s*c[oó]digo|c[oó]digo\s*de\s*referido|referir|programa\s*de\s*referidos/i.test(lower))
        return { intent: 'REFERRAL', entities: { subIntent: 'GET_CODE' } };

    if (/invitar\s*a\s*/i.test(lower))
        return { intent: 'REFERRAL', entities: { subIntent: 'SEND_INVITE' } };

    // REPORT
    if (/mi\s*reporte|reporte\s*(mensual|pdf|del\s*mes)|descargar\s*reporte|link\s*reporte/i.test(lower))
        return { intent: 'REPORT', entities: {} };

    // MULTI-BUSINESS
    if (/mis\s*negocios|mis\s*comercios|mis\s*tiendas/i.test(lower))
        return { intent: 'MULTI_BUSINESS', entities: { subIntent: 'LIST' } };

    const switchMatch = lower.match(/cambiar\s*a\s+(.+)/i);
    if (switchMatch)
        return { intent: 'MULTI_BUSINESS', entities: { subIntent: 'SWITCH', businessName: switchMatch[1].trim() } };

    const addBizMatch = lower.match(/agregar\s*negocio\s+(.+)/i);
    if (addBizMatch)
        return { intent: 'MULTI_BUSINESS', entities: { subIntent: 'ADD', businessName: addBizMatch[1].trim() } };

    // THANK YOU
    if (/^(gracias|dale|ok|perfecto|genial|listo|joya|barbaro)/i.test(lower) && lower.length < 30)
        return { intent: 'GREETING', entities: {} };

    return result;
}

// Greetings
test('hola → GREETING', () => eq(detectIntent('hola').intent, 'GREETING'));
test('buenas tardes → GREETING', () => eq(detectIntent('buenas tardes').intent, 'GREETING'));
test('buenos días → GREETING', () => eq(detectIntent('buenos días').intent, 'GREETING'));
test('qué tal → GREETING', () => eq(detectIntent('qué tal').intent, 'GREETING'));
test('epa → GREETING', () => eq(detectIntent('epa').intent, 'GREETING'));

// Help
test('ayuda → HELP', () => eq(detectIntent('ayuda').intent, 'HELP'));
test('menú → HELP', () => eq(detectIntent('menú').intent, 'HELP'));
test('comandos → HELP', () => eq(detectIntent('comandos').intent, 'HELP'));

// PIN
test('pin 1234 → SET_PIN', () => { const r = detectIntent('pin 1234'); eq(r.intent, 'SET_PIN'); eq(r.entities.pin, '1234'); });
test('pin 123456 → SET_PIN (6 digits)', () => eq(detectIntent('pin 123456').intent, 'SET_PIN'));
test('pin abc → NOT SET_PIN', () => { if (detectIntent('pin abc').intent === 'SET_PIN') throw new Error('Should not be SET_PIN'); });

// Sales
test('vendí 500 mil a Carlos fiado → SALE_CREDIT', () => eq(detectIntent('vendí 500 mil a Carlos fiado').intent, 'SALE_CREDIT'));
test('fié 200 a María → SALE_CREDIT', () => eq(detectIntent('fié 200 a María').intent, 'SALE_CREDIT'));
test('le presté 100 mil → SALE_CREDIT', () => eq(detectIntent('le presté 100 mil a Pedro').intent, 'SALE_CREDIT'));
test('vendí 100 mil → SALE_CASH', () => eq(detectIntent('vendí 100 mil').intent, 'SALE_CASH'));

// Payments
test('cobré 300 de Pedro → PAYMENT', () => eq(detectIntent('cobré 300 de Pedro').intent, 'PAYMENT'));
test('pagó 150 mil Juan → PAYMENT', () => eq(detectIntent('pagó 150 mil Juan').intent, 'PAYMENT'));
test('me canceló 500 mil → PAYMENT', () => eq(detectIntent('me canceló 500 mil').intent, 'PAYMENT'));
test('abonó 200 → PAYMENT', () => eq(detectIntent('abonó 200').intent, 'PAYMENT'));

// Queries
test('cuánto me deben → DEBT_QUERY', () => eq(detectIntent('cuánto me deben').intent, 'DEBT_QUERY'));
test('lista de deudas → DEBT_QUERY', () => eq(detectIntent('lista de deudas').intent, 'DEBT_QUERY'));
test('deudores → DEBT_QUERY', () => eq(detectIntent('deudores').intent, 'DEBT_QUERY'));
test('morosos → DEBT_QUERY', () => eq(detectIntent('morosos').intent, 'DEBT_QUERY'));
test('fiados pendientes → DEBT_QUERY', () => eq(detectIntent('fiados pendientes').intent, 'DEBT_QUERY'));
test('cómo me fue esta semana → SALES_QUERY', () => eq(detectIntent('cómo me fue esta semana').intent, 'SALES_QUERY'));
test('resumen → SALES_QUERY', () => eq(detectIntent('resumen').intent, 'SALES_QUERY'));
test('cuánto vendí → SALES_QUERY', () => eq(detectIntent('cuánto vendí').intent, 'SALES_QUERY'));

// Reminders
test('recordále a Carlos → REMINDER', () => eq(detectIntent('recordále a Carlos').intent, 'REMINDER'));
test('cobrále a María → REMINDER', () => eq(detectIntent('cobrále a María').intent, 'REMINDER'));
test('decile que me debe → REMINDER', () => eq(detectIntent('decile que me debe').intent, 'REMINDER'));

// Inventory
test('me llegó mercadería → INVENTORY_IN', () => eq(detectIntent('me llegó mercadería').intent, 'INVENTORY_IN'));
test('llegaron 50 cajas → INVENTORY_IN', () => eq(detectIntent('llegaron 50 cajas').intent, 'INVENTORY_IN'));

// ═══════════════════════════════════════
// 🆕 NEW INTENTS
// ═══════════════════════════════════════
results.push('\n🆕 NLP — New Intents');

// Referral
test('mi código → REFERRAL GET_CODE', () => {
    const r = detectIntent('mi código');
    eq(r.intent, 'REFERRAL');
    eq(r.entities.subIntent, 'GET_CODE');
});
test('código de referido → REFERRAL', () => eq(detectIntent('código de referido').intent, 'REFERRAL'));
test('referir → REFERRAL', () => eq(detectIntent('referir').intent, 'REFERRAL'));
test('invitar a 0981234567 → REFERRAL SEND_INVITE', () => {
    const r = detectIntent('invitar a 0981234567');
    eq(r.intent, 'REFERRAL');
    eq(r.entities.subIntent, 'SEND_INVITE');
});

// Report
test('mi reporte → REPORT', () => eq(detectIntent('mi reporte').intent, 'REPORT'));
test('reporte mensual → REPORT', () => eq(detectIntent('reporte mensual').intent, 'REPORT'));
test('link reporte → REPORT', () => eq(detectIntent('link reporte').intent, 'REPORT'));
test('descargar reporte → REPORT', () => eq(detectIntent('descargar reporte').intent, 'REPORT'));

// Multi-business
test('mis negocios → MULTI_BUSINESS LIST', () => {
    const r = detectIntent('mis negocios');
    eq(r.intent, 'MULTI_BUSINESS');
    eq(r.entities.subIntent, 'LIST');
});
test('mis comercios → MULTI_BUSINESS LIST', () => eq(detectIntent('mis comercios').intent, 'MULTI_BUSINESS'));
test('cambiar a Distribuidora → MULTI_BUSINESS SWITCH', () => {
    const r = detectIntent('cambiar a Distribuidora López');
    eq(r.intent, 'MULTI_BUSINESS');
    eq(r.entities.subIntent, 'SWITCH');
    eq(r.entities.businessName, 'distribuidora lópez');
});
test('agregar negocio MiniMarket → MULTI_BUSINESS ADD', () => {
    const r = detectIntent('agregar negocio MiniMarket Central');
    eq(r.intent, 'MULTI_BUSINESS');
    eq(r.entities.subIntent, 'ADD');
    eq(r.entities.businessName, 'minimarket central');
});

// Thank you / ack
test('gracias → GREETING', () => eq(detectIntent('gracias').intent, 'GREETING'));
test('dale → GREETING', () => eq(detectIntent('dale').intent, 'GREETING'));
test('perfecto → GREETING', () => eq(detectIntent('perfecto').intent, 'GREETING'));

// ═══════════════════════════════════════
// 💰 AMOUNT PARSING
// ═══════════════════════════════════════
results.push('\n💰 Amount Parsing');

function parseAmount(text) {
    const lower = text.toLowerCase().replace(/\./g, '').replace(/,/g, '');
    const millionMatch = lower.match(/(\d+(?:\.\d+)?)\s*(millon|millón|m\b|palo)/i);
    if (millionMatch) return parseFloat(millionMatch[1]) * 1000000;
    const milMatch = lower.match(/(\d+)\s*mil/);
    if (milMatch) return parseInt(milMatch[1]) * 1000;
    const kMatch = lower.match(/(\d+)\s*k\b/i);
    if (kMatch) return parseInt(kMatch[1]) * 1000;
    const numMatch = lower.match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1]);
    return null;
}

test('500 mil → 500000', () => eq(parseAmount('500 mil'), 500000));
test('500mil → 500000', () => eq(parseAmount('500mil'), 500000));
test('1 millon → 1000000', () => eq(parseAmount('1 millon'), 1000000));
test('2 millón → 2000000', () => eq(parseAmount('2 millón'), 2000000));
test('200K → 200000', () => eq(parseAmount('200K'), 200000));
test('50000 → 50000', () => eq(parseAmount('50000'), 50000));
test('300 → 300', () => eq(parseAmount('300'), 300));

// ═══════════════════════════════════════
// 🔐 AUTH PIN VALIDATION
// ═══════════════════════════════════════
results.push('\n🔐 Auth PIN Validation');

function isValidPin(pin) { return /^\d{4,6}$/.test(pin); }

test('4 digits valid', () => eq(isValidPin('1234'), true));
test('5 digits valid', () => eq(isValidPin('12345'), true));
test('6 digits valid', () => eq(isValidPin('123456'), true));
test('3 digits invalid', () => eq(isValidPin('123'), false));
test('7 digits invalid', () => eq(isValidPin('1234567'), false));
test('letters invalid', () => eq(isValidPin('abcd'), false));
test('empty invalid', () => eq(isValidPin(''), false));
test('mixed invalid', () => eq(isValidPin('12ab'), false));

// ═══════════════════════════════════════
// 💱 CURRENCY FORMATTING
// ═══════════════════════════════════════
results.push('\n💱 Currency Formatting');

function formatPYG(amount) {
    if (!amount) return 'Gs. 0';
    if (amount >= 1000000) return `Gs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Gs. ${Math.round(amount / 1000)}K`;
    return `Gs. ${amount}`;
}

test('0 → Gs. 0', () => eq(formatPYG(0), 'Gs. 0'));
test('null → Gs. 0', () => eq(formatPYG(null), 'Gs. 0'));
test('undefined → Gs. 0', () => eq(formatPYG(undefined), 'Gs. 0'));
test('500000 → Gs. 500K', () => eq(formatPYG(500000), 'Gs. 500K'));
test('1500000 → Gs. 1.5M', () => eq(formatPYG(1500000), 'Gs. 1.5M'));
test('10000000 → Gs. 10.0M', () => eq(formatPYG(10000000), 'Gs. 10.0M'));
test('500 → Gs. 500', () => eq(formatPYG(500), 'Gs. 500'));

// ═══════════════════════════════════════
// 💰 BILLING TIERS
// ═══════════════════════════════════════
results.push('\n💰 Billing Tiers');

function calculateBill(plan, totalRequests) {
    const config = {
        free: { freeReqs: 100, rate: 0.10 },
        starter: { freeReqs: 0, rate: 0.05 },
        pro: { freeReqs: 0, rate: 0.03 },
        enterprise: { freeReqs: 0, rate: 0.01 }
    };
    const tier = config[plan] || config.free;
    const billable = Math.max(0, totalRequests - tier.freeReqs);
    return Math.round(billable * tier.rate * 100) / 100;
}

test('free 50 reqs → $0', () => eq(calculateBill('free', 50), 0));
test('free 100 reqs → $0 (exactly at limit)', () => eq(calculateBill('free', 100), 0));
test('free 150 reqs → $5.00', () => eq(calculateBill('free', 150), 5.00));
test('starter 100 reqs → $5.00', () => eq(calculateBill('starter', 100), 5.00));
test('pro 1000 reqs → $30.00', () => eq(calculateBill('pro', 1000), 30.00));
test('enterprise 10000 reqs → $100.00', () => eq(calculateBill('enterprise', 10000), 100.00));
test('unknown plan uses free', () => eq(calculateBill('unknown_plan', 200), 10.00));

// ═══════════════════════════════════════
// 🎁 REFERRAL CODE
// ═══════════════════════════════════════
results.push('\n🎁 Referral Code Generation');

function generateReferralCode(name) {
    const namePart = (name || 'NEXO')
        .replace(/[^a-zA-Z]/g, '')
        .substring(0, 3)
        .toUpperCase();
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `${namePart}${randomPart}`;
}

test('code format: 3 letters + 4 digits', () => {
    const code = generateReferralCode('María González');
    ok(/^[A-Z]{3}\d{4}$/.test(code), `Code ${code} doesn't match format`);
});
test('code starts with MAR', () => {
    const code = generateReferralCode('María');
    ok(code.startsWith('MAR'), `Expected MAR, got ${code}`);
});
test('empty name → NEXO prefix', () => {
    const code = generateReferralCode('');
    ok(code.startsWith('NEX'), `Expected NEX, got ${code}`);
});
test('null name → NEXO prefix', () => {
    const code = generateReferralCode(null);
    ok(code.startsWith('NEX'), `Expected NEX, got ${code}`);
});

// ═══════════════════════════════════════
// 🟢 ONBOARDING PROGRESS BAR
// ═══════════════════════════════════════
results.push('\n🟢 Onboarding Progress Bar');

function progressBar(step) {
    const total = 8;
    const filled = '🟢'.repeat(step);
    const empty = '⚪'.repeat(total - step);
    return `${filled}${empty}`;
}

test('step 1 → 1 green 7 white', () => {
    const bar = progressBar(1);
    ok(bar.includes('🟢'), 'Should have green');
    // Count emojis - each is 2 chars in JS
    eq((bar.match(/🟢/g) || []).length, 1);
    eq((bar.match(/⚪/g) || []).length, 7);
});
test('step 4 → 4 green 4 white', () => {
    eq((progressBar(4).match(/🟢/g) || []).length, 4);
    eq((progressBar(4).match(/⚪/g) || []).length, 4);
});
test('step 8 → all green', () => {
    eq((progressBar(8).match(/🟢/g) || []).length, 8);
    eq((progressBar(8).match(/⚪/g) || []).length, 0);
});

// ═══════════════════════════════════════
// 🪪 CÉDULA FORMATTING
// ═══════════════════════════════════════
results.push('\n🪪 Cédula Formatting');

function formatCedula(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

test('4523871 → 4.523.871', () => eq(formatCedula('4523871'), '4.523.871'));
test('12345 → 12.345', () => eq(formatCedula('12345'), '12.345'));
test('123456789 → 123.456.789', () => eq(formatCedula('123456789'), '123.456.789'));

// ═══════════════════════════════════════
// 🌍 GUARANÍ DETECTION
// ═══════════════════════════════════════
results.push('\n🌍 Guaraní Language Detection');

function detectLanguage(text) {
    const lower = text.toLowerCase();
    if (/mba[''´]?[eé]|ndaje|che|nde|piko|pio|kóa|hína|ko[''´]?ã|upéi|avei|porã|vai|guasu|mitã|kuñataĩ|oñe|oje|ogue|niko|ha[''´]?e|japu/i.test(lower))
        return 'gn';
    return 'es';
}

test('mba\'épa → Guaraní', () => eq(detectLanguage('mba\'épa avendé'), 'gn'));
test('ndaje → Guaraní', () => eq(detectLanguage('ndaje opaga'), 'gn'));
test('hola → Spanish', () => eq(detectLanguage('hola como estas'), 'es'));
test('vendí 500 → Spanish', () => eq(detectLanguage('vendí 500 mil'), 'es'));

// ═══════════════════════════════════════
// 📊 SCORE TIER CALCULATION
// ═══════════════════════════════════════
results.push('\n📊 Score Tier Calculation');

function getTier(score) {
    if (score >= 700) return 'A';
    if (score >= 550) return 'B';
    if (score >= 400) return 'C';
    return 'D';
}

test('800 → Tier A', () => eq(getTier(800), 'A'));
test('700 → Tier A', () => eq(getTier(700), 'A'));
test('699 → Tier B', () => eq(getTier(699), 'B'));
test('550 → Tier B', () => eq(getTier(550), 'B'));
test('549 → Tier C', () => eq(getTier(549), 'C'));
test('400 → Tier C', () => eq(getTier(400), 'C'));
test('399 → Tier D', () => eq(getTier(399), 'D'));
test('0 → Tier D', () => eq(getTier(0), 'D'));

// ═══════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════
const summary = `\n${'═'.repeat(45)}\n🧪 NexoBot Test Suite v2 — Results\n${'═'.repeat(45)}\n${results.join('\n')}\n\n${'─'.repeat(45)}\n✅ Passed: ${passed}\n❌ Failed: ${failed}\n📊 Total:  ${passed + failed}\n${'═'.repeat(45)}\n`;

console.log(summary);
writeFileSync('test-results.txt', summary);
process.exit(failed > 0 ? 1 : 0);
