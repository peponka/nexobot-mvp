// Quick test runner that outputs to file
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

// ── NLP INTENT DETECTION ──
results.push('\n📝 NLP Intent Detection');

function detectIntent(message) {
    const lower = message.toLowerCase().trim();
    const pinMatch = lower.match(/^pin\s+(\d{4,6})$/);
    if (pinMatch) return { intent: 'SET_PIN', pin: pinMatch[1] };
    if (/^(hola|buenas?|buen[oa]?s?\s*(d[ií]as?|tardes?|noches?)?|qu[eé]\s*tal|hey|hi|ola|epa)/i.test(lower) && lower.length < 40)
        return { intent: 'GREETING' };
    if (/^(ayuda|help|menu|menú|comandos|opciones)/i.test(lower))
        return { intent: 'HELP' };
    if (/fi(ado|é|ar)|cred|prest[eéaó]|debe/i.test(lower) && /\d/.test(lower))
        return { intent: 'SALE_CREDIT' };
    if (/vend[ií]|cobr[eé].*contado|venta|factur/i.test(lower) && /\d/.test(lower))
        return { intent: 'SALE_CASH' };
    if (/cobr[eé]|pag[oó]|abono|cancel[oó]|recib[ií]/i.test(lower) && /\d/.test(lower))
        return { intent: 'PAYMENT' };
    if (/cu[aá]nto\s*(me\s*)?deb|deud|qué\s*deb|quien\s*debe|list.*deud/i.test(lower))
        return { intent: 'DEBT_QUERY' };
    if (/c[oó]mo\s*(me\s*)?fu[eé]|resumen|reporte|estad[ií]stic|balance|cuanto\s*vend/i.test(lower))
        return { intent: 'SALES_QUERY' };
    return { intent: 'UNKNOWN' };
}

test('hola → GREETING', () => eq(detectIntent('hola').intent, 'GREETING'));
test('buenas tardes → GREETING', () => eq(detectIntent('buenas tardes').intent, 'GREETING'));
test('buenos días → GREETING', () => eq(detectIntent('buenos días').intent, 'GREETING'));
test('qué tal → GREETING', () => eq(detectIntent('qué tal').intent, 'GREETING'));
test('ayuda → HELP', () => eq(detectIntent('ayuda').intent, 'HELP'));
test('menú → HELP', () => eq(detectIntent('menú').intent, 'HELP'));
test('pin 1234 → SET_PIN', () => { const r = detectIntent('pin 1234'); eq(r.intent, 'SET_PIN'); eq(r.pin, '1234'); });
test('pin 123456 → SET_PIN (6 digits)', () => eq(detectIntent('pin 123456').intent, 'SET_PIN'));
test('pin abc → NOT SET_PIN', () => { if (detectIntent('pin abc').intent === 'SET_PIN') throw new Error('Should not be SET_PIN'); });
test('vendí 500 mil a Carlos fiado → SALE_CREDIT', () => eq(detectIntent('vendí 500 mil a Carlos fiado').intent, 'SALE_CREDIT'));
test('fié 200 a María → SALE_CREDIT', () => eq(detectIntent('fié 200 a María').intent, 'SALE_CREDIT'));
test('vendí 100 mil → SALE_CASH', () => eq(detectIntent('vendí 100 mil').intent, 'SALE_CASH'));
test('cobré 300 de Pedro → PAYMENT', () => eq(detectIntent('cobré 300 de Pedro').intent, 'PAYMENT'));
test('pagó 150 mil Juan → PAYMENT', () => eq(detectIntent('pagó 150 mil Juan').intent, 'PAYMENT'));
test('cuánto me deben → DEBT_QUERY', () => eq(detectIntent('cuánto me deben').intent, 'DEBT_QUERY'));
test('lista de deudas → DEBT_QUERY', () => eq(detectIntent('lista de deudas').intent, 'DEBT_QUERY'));
test('cómo me fue esta semana → SALES_QUERY', () => eq(detectIntent('cómo me fue esta semana').intent, 'SALES_QUERY'));
test('resumen → SALES_QUERY', () => eq(detectIntent('resumen').intent, 'SALES_QUERY'));

// ── AMOUNT PARSING ──
results.push('\n💰 Amount Parsing');

function parseAmount(text) {
    const lower = text.toLowerCase().replace(/\./g, '').replace(/,/g, '');
    const milMatch = lower.match(/(\d+)\s*mil/);
    if (milMatch) return parseInt(milMatch[1]) * 1000;
    const millionMatch = lower.match(/(\d+(?:\.\d+)?)\s*(millon|millón|m\b)/i);
    if (millionMatch) return parseFloat(millionMatch[1]) * 1000000;
    const kMatch = lower.match(/(\d+)\s*k\b/i);
    if (kMatch) return parseInt(kMatch[1]) * 1000;
    const numMatch = lower.match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1]);
    return null;
}

test('500 mil → 500000', () => eq(parseAmount('500 mil'), 500000));
test('500mil → 500000', () => eq(parseAmount('500mil'), 500000));
test('200K → 200000', () => eq(parseAmount('200K'), 200000));
test('50000 → 50000', () => eq(parseAmount('50000'), 50000));

// ── AUTH PIN VALIDATION ──
results.push('\n🔐 Auth PIN Validation');

function isValidPin(pin) { return /^\d{4,6}$/.test(pin); }

test('4 digits valid', () => eq(isValidPin('1234'), true));
test('6 digits valid', () => eq(isValidPin('123456'), true));
test('3 digits invalid', () => eq(isValidPin('123'), false));
test('7 digits invalid', () => eq(isValidPin('1234567'), false));
test('letters invalid', () => eq(isValidPin('abcd'), false));
test('empty invalid', () => eq(isValidPin(''), false));

// ── CURRENCY FORMATTING ──
results.push('\n💱 Currency Formatting');

function formatPYG(amount) {
    if (!amount) return 'Gs. 0';
    if (amount >= 1000000) return `Gs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Gs. ${Math.round(amount / 1000)}K`;
    return `Gs. ${amount}`;
}

test('0 → Gs. 0', () => eq(formatPYG(0), 'Gs. 0'));
test('null → Gs. 0', () => eq(formatPYG(null), 'Gs. 0'));
test('500000 → Gs. 500K', () => eq(formatPYG(500000), 'Gs. 500K'));
test('1500000 → Gs. 1.5M', () => eq(formatPYG(1500000), 'Gs. 1.5M'));
test('500 → Gs. 500', () => eq(formatPYG(500), 'Gs. 500'));

// ── BILLING TIERS ──
results.push('\n💰 Billing Tiers');

function calculateBill(plan, totalRequests) {
    const config = { free: { freeReqs: 100, rate: 0.10 }, starter: { freeReqs: 0, rate: 0.05 }, pro: { freeReqs: 0, rate: 0.03 }, enterprise: { freeReqs: 0, rate: 0.01 } };
    const tier = config[plan] || config.free;
    const billable = Math.max(0, totalRequests - tier.freeReqs);
    return Math.round(billable * tier.rate * 100) / 100;
}

test('free 50 reqs → $0', () => eq(calculateBill('free', 50), 0));
test('free 150 reqs → $5.00', () => eq(calculateBill('free', 150), 5.00));
test('starter 100 reqs → $5.00', () => eq(calculateBill('starter', 100), 5.00));
test('pro 1000 reqs → $30.00', () => eq(calculateBill('pro', 1000), 30.00));
test('enterprise 10000 reqs → $100.00', () => eq(calculateBill('enterprise', 10000), 100.00));

// ── RESULTS ──
const summary = `\n${'═'.repeat(40)}\n🧪 NexoBot Test Suite Results\n${'═'.repeat(40)}\n${results.join('\n')}\n\n${'─'.repeat(40)}\n✅ Passed: ${passed}\n❌ Failed: ${failed}\n📊 Total:  ${passed + failed}\n${'═'.repeat(40)}\n`;

console.log(summary);
writeFileSync('test-results.txt', summary);
process.exit(failed > 0 ? 1 : 0);
