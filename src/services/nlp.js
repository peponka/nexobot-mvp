// =============================================
// NexoBot MVP — NLP Service (OpenAI)
// =============================================
// Processes natural language messages from merchants
// and extracts structured transaction data.

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres el motor NLP de NexoFinanzas, un bot de WhatsApp para comerciantes informales en Paraguay.

Tu trabajo es analizar mensajes en español (paraguayo), guaraní o jopará y extraer información estructurada.

DEBES responder SOLO con JSON válido, sin texto adicional.

## Intents posibles:
- SALE_CREDIT: Venta a crédito / fiado
- SALE_CASH: Venta al contado
- PAYMENT: Cobro / pago recibido
- DEBT_QUERY: Consulta de deudas
- SALES_QUERY: Consulta de ventas / resumen
- INVENTORY_IN: Llegada de mercadería
- GREETING: Saludo
- HELP: Pedido de ayuda
- UNKNOWN: No se entiende

## Formato de respuesta:
{
  "intent": "SALE_CREDIT",
  "confidence": 0.95,
  "entities": {
    "amount": 500000,
    "currency": "PYG",
    "customer_name": "Carlos",
    "product": "cerveza",
    "quantity": 10,
    "unit_price": 50000
  },
  "language": "es"
}

## Reglas:
- "fiado", "a crédito", "me debe" → SALE_CREDIT
- "al contado", "en efectivo", "cash" → SALE_CASH
- "cobré", "me pagó", "recibí pago" → PAYMENT  
- "cuánto me deben", "deudas", "pendiente" → DEBT_QUERY
- "cuánto vendí", "ventas", "resumen" → SALES_QUERY
- "me llegó", "llegaron", "recibí mercadería" → INVENTORY_IN
- Moneda: siempre PYG (guaraníes) salvo que diga "dólares" o "USD"
- "500 mil" = 500000, "1 millón" = 1000000, "1 palo" = 1000000
- Si dice "a Don X" o "de Doña X", extraer nombre sin el Don/Doña
- Si no hay monto explícito pero hay cantidad × precio, calcular total
- Si dice "c/u" o "cada uno", es unit_price
- Nombres siempre capitalizar: "carlos" → "Carlos"
`;

/**
 * Process a merchant's message with OpenAI
 * @param {string} message - Raw message from merchant
 * @returns {Object} Parsed intent and entities
 */
export async function processMessage(message) {
    const startTime = Date.now();

    try {
        // If OpenAI is not configured, use fallback regex parser
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-key') {
            console.log('⚠️  OpenAI not configured, using fallback parser');
            return fallbackParser(message);
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: message }
            ],
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content);
        parsed.processing_time_ms = Date.now() - startTime;

        console.log(`🧠 NLP: "${message}" → ${parsed.intent} (${parsed.confidence}) [${parsed.processing_time_ms}ms]`);

        return parsed;
    } catch (error) {
        console.error('❌ NLP Error:', error.message);
        // Fallback to regex parser
        return fallbackParser(message);
    }
}

/**
 * Fallback regex-based parser (works without OpenAI)
 * Handles Paraguayan Spanish, Guaraní and Jopará
 */
function fallbackParser(message) {
    const lower = message.toLowerCase().trim();
    const original = message.trim();
    const result = {
        intent: 'UNKNOWN',
        confidence: 0.6,
        entities: {},
        language: detectLanguage(lower),
        processing_time_ms: 0,
        parser: 'fallback'
    };

    // ─── Intent detection (ORDER MATTERS: specific queries BEFORE generic patterns) ───

    // 1. Greetings (check first — short messages)
    if (/^(hola|buenas|buen d[ií]a|que tal|hey|ola|mba[''´]?[eé]ichapa|nde)/i.test(lower)) {
        result.intent = 'GREETING';
        result.confidence = 0.9;
    }
    // 2. Help
    else if (/ayuda|help|c[oó]mo funciona|que pu[eé]s hacer|que pod[eé]s/.test(lower)) {
        result.intent = 'HELP';
        result.confidence = 0.9;
    }
    // 3. Debt query (BEFORE sale patterns — "quiénes me deben" should not match "venden")
    else if (/cu[áa]nto me deben|qui[eé]n(es)? me debe|deudas?|pendientes?|saldos?|deudores|mo[oõ]pa oje[''´]?debe|quienes me deben|me deben/.test(lower)) {
        result.intent = 'DEBT_QUERY';
        result.confidence = 0.85;
    }
    // 4. Sales query (BEFORE sale patterns — "cuánto vendí" shouldn't register a sale)
    else if (/cu[áa]nto vend[ií]|resumen|ventas de (hoy|esta semana|este mes)|mis ventas|total de ventas|cu[áa]nto hice|mba[''´]?[eé]pa avend[eé]/.test(lower)) {
        result.intent = 'SALES_QUERY';
        result.confidence = 0.85;
    }
    // 5. Payment / collection
    else if (/cobr[eé]|me pag[oó]|recib[ií] pago|pag[oó]\s+\d|me trajo|\bpag[oó]\b.*\d|\d.*\bpag[oó]\b|ohepaga/.test(lower)) {
        result.intent = 'PAYMENT';
        result.confidence = 0.8;
    }
    // 6. Sale (credit or cash)
    else if (/vend[ií]|vendido|venta|fiad[oa]|fi[eé]|cr[eé]dito|le di|le dej[eé]|le llev[oó]|oñeme[''´]?[eê]/.test(lower)) {
        result.intent = /fiad[oa]|fi[eé]|cr[eé]dito|le di|le dej[eé]/.test(lower) ? 'SALE_CREDIT' : 'SALE_CASH';
        result.confidence = 0.8;
    }
    // 7. Inventory
    else if (/lleg[aoóa]ron|me lleg|recibi|recibi.*mercader|stock|inventario|tengo\s+\d+\s+(?:unidad|cajas?|kilos?|bolsas?)/.test(lower)) {
        result.intent = 'INVENTORY_IN';
        result.confidence = 0.75;
    }
    // 8. Name + "pagó" pattern: "María pagó 200mil" (name first, then verb)
    else if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+(?:me\s+)?pag[oó]/i.test(original)) {
        result.intent = 'PAYMENT';
        result.confidence = 0.8;
    }

    // ─── Entity extraction ───

    // Amount parsing (priority order): "1 millón" > "1 palo" > "500 mil" > "500.000" > "500000"
    let amount = null;

    // "1 millón", "2 millones", "1.5 millón"
    let amountMatch = lower.match(/(\d+[\.,]?\d*)\s*mill[oó]n/i);
    if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000000;
    }

    // "1 palo", "2 palos" (Paraguayan slang for million)
    if (!amount) {
        amountMatch = lower.match(/(\d+[\.,]?\d*)\s*palos?/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000000;
        }
    }

    // "500 mil", "500mil"
    if (!amount) {
        amountMatch = lower.match(/(\d+[\.,]?\d*)\s*mil\b/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000;
        }
    }

    // "500.000" or "1.000.000" (dot-separated)
    if (!amount) {
        amountMatch = lower.match(/(\d{1,3}(?:[\.,]\d{3})+)/);
        if (amountMatch) {
            amount = parseInt(amountMatch[1].replace(/[\.,]/g, ''));
        }
    }

    // Plain number "500000"
    if (!amount) {
        amountMatch = lower.match(/(\d{4,})/);
        if (amountMatch) {
            amount = parseInt(amountMatch[1]);
        }
    }

    if (amount) {
        result.entities.amount = amount;
    }

    // Currency
    result.entities.currency = /d[oó]lar|usd/i.test(lower) ? 'USD' : 'PYG';

    // ─── Customer name extraction (improved) ───
    const skipWords = ['la', 'el', 'un', 'una', 'los', 'las', 'mi', 'su',
        'contado', 'efectivo', 'credito', 'crédito', 'fiado', 'semana',
        'hoy', 'ayer', 'mes', 'pago', 'cobro', 'venta', 'mil', 'millon'];

    let customerName = null;

    // Pattern: "a Don/Doña Carlos"
    let nameMatch = original.match(/(?:a|de)\s+(?:[Dd]on|[Dd]o[ñn]a)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
    if (nameMatch && !skipWords.includes(nameMatch[1].toLowerCase())) {
        customerName = nameMatch[1];
    }

    // Pattern: "a Carlos", "de María" (but not "a crédito", "de ayer")
    if (!customerName) {
        nameMatch = original.match(/\b(?:a|de)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
        if (nameMatch && !skipWords.includes(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    // Pattern: "le fié a Carlos 800mil" → extract after "a"
    if (!customerName) {
        nameMatch = original.match(/\ba\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
        if (nameMatch && !skipWords.includes(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    // Pattern: "María pagó 200mil" — name at start before verb
    if (!customerName && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+(?:me\s+)?pag[oó]/i.test(original)) {
        nameMatch = original.match(/^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
        if (nameMatch && !skipWords.includes(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    // Pattern: "cobré [amount] de María" — name after amount + de
    if (!customerName) {
        nameMatch = original.match(/\d+\s*(?:mil|mill[oó]n)?\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i);
        if (nameMatch && !skipWords.includes(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    if (customerName) {
        result.entities.customer_name = customerName.charAt(0).toUpperCase() + customerName.slice(1);
    }

    // ─── Product extraction ───
    const products = [
        'cerveza', 'gaseosa', 'coca', 'pepsi', 'fanta',
        'terere', 'tereré', 'yerba', 'mate',
        'agua', 'jugo',
        'pan', 'leche', 'arroz', 'aceite', 'azúcar', 'azucar', 'sal', 'harina',
        'fideos', 'galletitas', 'galletas',
        'cigarrillos', 'cigarro', 'pucho',
        'huevos', 'queso', 'manteca',
        'jabón', 'jabon', 'detergente'
    ];
    for (const p of products) {
        if (lower.includes(p)) {
            result.entities.product = p.replace('tereré', 'terere').replace('azúcar', 'azucar');
            break;
        }
    }

    // Quantity: "30 cajas", "50 unidades", "10 kilos", "5 bolsas"
    const qtyMatch = lower.match(/(\d+)\s*(?:cajas?|packs?|unidad(?:es)?|kilos?|kg|bolsas?|litros?|lt|docenas?|botellas?|latas?|sobres?|paquetes?)/i);
    if (qtyMatch) {
        result.entities.quantity = parseInt(qtyMatch[1]);
    }

    // Also match "tengo 50 unidades de arroz" pattern for inventory
    if (!qtyMatch) {
        const simpleQty = lower.match(/(?:tengo|hay|quedan?)\s+(\d+)\s+/);
        if (simpleQty) {
            result.entities.quantity = parseInt(simpleQty[1]);
        }
    }

    // Calculate total if we have quantity and unit_price
    if (result.entities.quantity && result.entities.amount && !result.entities.unit_price) {
        if (result.entities.amount < 200000 && result.entities.quantity > 1) {
            result.entities.unit_price = result.entities.amount;
            result.entities.amount = result.entities.quantity * result.entities.unit_price;
        }
    }

    return result;
}

/**
 * Detect language (es, gn, jopara)
 */
function detectLanguage(text) {
    if (/mba[''´]?[eé]|nde|mo[oõ]pa|ohé|oje[''´]?|guarani|py/.test(text)) return 'gn';
    if (/luego|nde|pio|pa|ko/.test(text) && /\b(de|el|la|en)\b/.test(text)) return 'jopara';
    return 'es';
}

export default { processMessage };
