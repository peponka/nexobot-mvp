// =============================================
// NexoBot MVP — NLP Service (Fast + Smart)
// =============================================
// Strategy: Try FAST regex parser first (0ms).
// Only call OpenAI for complex/ambiguous messages.
// This gives instant responses for 80%+ of messages.

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =============================================
// MAIN ENTRY POINT
// =============================================

/**
 * Process a merchant's message
 * Strategy: Regex first (instant), OpenAI fallback (1-2s)
 */
export async function processMessage(message) {
    const startTime = Date.now();

    // Step 1: Try fast regex parser
    const fastResult = fastParser(message);

    // If regex is confident enough, return immediately (0ms!)
    if (fastResult.confidence >= 0.8) {
        fastResult.processing_time_ms = Date.now() - startTime;
        console.log(`⚡ NLP: "${message}" → ${fastResult.intent} (${fastResult.confidence}) [${fastResult.processing_time_ms}ms] [FAST]`);
        return fastResult;
    }

    // Step 2: For ambiguous messages, try OpenAI
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-key') {
        try {
            const aiResult = await openaiParser(message);
            aiResult.processing_time_ms = Date.now() - startTime;
            console.log(`🧠 NLP: "${message}" → ${aiResult.intent} (${aiResult.confidence}) [${aiResult.processing_time_ms}ms] [AI]`);
            return aiResult;
        } catch (error) {
            console.error('❌ OpenAI Error, using fast parser:', error.message);
        }
    }

    // Step 3: Return fast result even if low confidence
    fastResult.processing_time_ms = Date.now() - startTime;
    console.log(`⚠️ NLP: "${message}" → ${fastResult.intent} (${fastResult.confidence}) [${fastResult.processing_time_ms}ms] [FALLBACK]`);
    return fastResult;
}

// =============================================
// FAST REGEX PARSER (0ms, handles 80%+ of messages)
// =============================================

function fastParser(message) {
    const lower = message.toLowerCase().trim();
    const original = message.trim();
    const result = {
        intent: 'UNKNOWN',
        confidence: 0.5,
        entities: {},
        language: detectLanguage(lower),
        parser: 'fast'
    };

    // ─── INTENT DETECTION ─── (order matters!)

    // 0. SET PIN (dashboard access)
    const pinMatch = lower.match(/^pin\s+(\d{4,6})(?:\s+(?:ci|c[eé]dula|c\.i\.?)\s*([\d\.]+))?$/);
    if (pinMatch) {
        result.intent = 'SET_PIN';
        result.confidence = 0.99;
        result.entities.pin = pinMatch[1];
        if (pinMatch[2]) {
            result.entities.cedula = pinMatch[2].replace(/[^0-9]/g, '');
        }
        return result;
    }

    // 0.5 FORGOT PIN
    if (/olvid[eé]\s*(mi)?\s*pin|reset\s*pin|recuperar\s*pin|no\s*se\s*mi\s*pin/i.test(lower)) {
        result.intent = 'FORGOT_PIN';
        result.confidence = 0.99;
        return result;
    }

    // 1. GREETINGS (short messages, check first)
    if (/^(hola|buenas?|buen[oa]?s?\s*(d[ií]as?|tardes?|noches?)?|qu[eé]\s*tal|hey|hi|ola|epa|que\s*hay|alo|aló|mba[''´]?[eé]ichapa|nde\s*haku|mba[''´]?eichapa\s*nde|iporã|ipo|terere|holi|holaa*|buena|wenas|saludos|bienvenido|mba[''´]?[eé]iko|ndeko|nde\s*py[''´]a\s*guasu)/i.test(lower) && lower.length < 40) {
        result.intent = 'GREETING';
        result.confidence = 0.95;
        return result;
    }

    // 2. HELP
    if (/^(ayuda|help|menu|menú|comandos|opciones|que\s*(podes|pod[eé]s|puedo|puedes)\s*hacer|c[oó]mo\s*(funciona|te\s*uso|uso)|instrucciones|info|que\s*sos|para\s*qu[eé]\s*serv[ií]s|que\s*haces|funciones|pytyvõ|epytyvõ\s*che|mba[''´]?[eé]pa\s*ejapo)/i.test(lower)) {
        result.intent = 'HELP';
        result.confidence = 0.95;
        return result;
    }

    // 3. REMINDER REQUEST (merchant asks to remind a customer)
    if (/record[aá]le|mand[aá]le\s*(un\s*)?(mensaje|recordatorio|aviso)|avis[aá]le|cobr[aá]le|decile\s*que\s*(pague|me\s*debe)|envi[aá]le\s*(un\s*)?recordatorio/i.test(lower)) {
        result.intent = 'REMINDER';
        result.confidence = 0.9;
        extractEntities(lower, original, result);
        return result;
    }

    // 4. DEBT QUERY (before sales to avoid conflicts)
    if (/cu[áa]nto\s*me\s*deben|qui[eé]n(es)?\s*me\s*debe|deudas?|pendientes?|saldos?|deudores?|morosos?|qui[eé]n\s*me\s*debe\s*m[aá]s|lista\s*de\s*deud(?:ores|as)|me\s*deben|los\s*que\s*me\s*deben|gente\s*que\s*me\s*debe|cu[aá]nto\s*deben|clientes?\s*que\s*deben|cobrar|por\s*cobrar|cuentas?\s*pendientes?|fiados?\s*pendientes?|mo[oõ]pa\s*oje[''´]?debe|mbovy\s*oje[''´]?debe\s*ch[eé]ve|m[aá]vapa\s*oje[''´]?debe|mbovy\s*ojedebe|quien\s*falta\s*pagar|falta\s*cobrar|quien\s*no\s*pago/i.test(lower)) {
        result.intent = 'DEBT_QUERY';
        result.confidence = 0.9;
        extractEntities(lower, original, result);
        return result;
    }

    // 4. SALES QUERY (before sale registration)
    if (/cu[áa]nto\s*vend[ií]|resumen|mis\s*ventas|ventas?\s*de\s*(hoy|esta\s*semana|este\s*mes|ayer)|total\s*de\s*ventas|cu[áa]nto\s*hice|c[oó]mo\s*(me\s*fue|estoy|voy|va|ando)|estad[ií]sticas?|reporte|balance|como\s*va\s*el\s*negocio|como\s*anda\s*el\s*negocio|mba[''´]?[eé]pa\s*avend[eé]|cuanto\s*gane|cuanto\s*gan[eé]|ganancia|utilidad|mbovy\s*avendé|mba[''´]?[eé]ichapa\s*che\s*negocio/i.test(lower)) {
        result.intent = 'SALES_QUERY';
        result.confidence = 0.9;
        return result;
    }

    // 5. PAYMENT / COLLECTION
    if (/cobr[eéé]|me\s*pag[oó]|recib[ií]\s*pago|me\s*trajo|ya\s*pag[oó]|me\s*cancel[oó]|entr[oó]\s*plata|me\s*deposit[oó]|pag[oó]\s*su\s*deuda|sald[oó]\s*su\s*cuenta|abon[oó]|pago\s*parcial|pag[oó]\s*algo|me\s*dio|me\s*dej[oó]\s*plata|ohepaga|ohepyty|cancel[oó]\s*su|liqui?d[oó]|acobr[aé]|vino\s*a\s*pagar|acerc[oó]\s*plata|me\s*transfiri[oó]|transferencia\s*de|giro\s*de/i.test(lower) ||
        /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+(?:me\s+)?pag[oó]/i.test(original)) {
        result.intent = 'PAYMENT';
        result.confidence = 0.85;
        extractEntities(lower, original, result);
        return result;
    }

    // 6. SALE CREDIT (fiado)
    if (/fiad[oa]|fi[eé]|a\s*cr[eé]dito|le\s*(di|dej[eé]|fi[eé]|llev[oó])\s*a|a\s*cuenta|le\s*anot[eé]|anot[aá]le|carg[aá]le|me\s*qued[oó]\s*debiendo|le\s*entregu[eé]|se\s*llev[oó]\s*fiado|dej[oó]\s*a\s*deber|qued[oó]\s*debiendo|va\s*a\s*pagar\s*despu[eé]s|despu[eé]s\s*me\s*paga|le\s*abr[ií]\s*cuenta|oñeme[''´]?[eê]|afi[eé]|anot[aá]\s*en\s*su\s*cuenta|para\s*fin\s*de\s*mes|llev[oó]\s*para\s*pagar/i.test(lower)) {
        result.intent = 'SALE_CREDIT';
        result.confidence = 0.9;
        extractEntities(lower, original, result);
        return result;
    }

    // 7. SALE CASH
    if (/al\s*contado|en\s*efectivo|cash|pag[oó]\s*al\s*toque|pag[oó]\s*en\s*el\s*momento|cobr[eé]\s*al\s*momento|ya\s*me\s*pag[oó]|pago\s*t[uú]k[aá]t[aeé]|taka\s*taka|tiki\s*taka|efectivo|vendi\s*al\s*contado|venta\s*contado/i.test(lower)) {
        result.intent = 'SALE_CASH';
        result.confidence = 0.85;
        extractEntities(lower, original, result);
        return result;
    }

    // 8. General SALE (need to determine credit vs cash)
    if (/vend[ií]|vendido|venta\s|le\s*vend[ií]|hice\s*una\s*venta|cerr[eé]\s*una\s*venta|sal[ií][oó]?\s*una\s*venta|compr[oó]|me\s*compr[oó]|le\s*despa(ch|ché)|se\s*llev[oó]|avendé|avend[eé]/i.test(lower)) {
        // Determine if credit or cash based on context
        if (/fiad[oa]|fi[eé]|cr[eé]dito|le\s*di|le\s*dej[eé]|a\s*cuenta|despu[eé]s\s*paga|me\s*va\s*a\s*pagar/i.test(lower)) {
            result.intent = 'SALE_CREDIT';
        } else if (/contado|efectivo|cash|pag[oó]\s*ya/i.test(lower)) {
            result.intent = 'SALE_CASH';
        } else {
            // Default to SALE_CASH if no credit indicator
            result.intent = 'SALE_CASH';
            result.confidence = 0.75; // Lower confidence - might need clarification
        }
        result.confidence = Math.max(result.confidence, 0.85);
        extractEntities(lower, original, result);
        return result;
    }

    // 9. INVENTORY
    if (/lleg[aoóa]r?on|me\s*lleg[oó]|recibi|mercader[ií]a|stock|inventario|tengo\s+\d+|me\s*trajeron|descarg[ueé]|entr[oó]\s*mercader|reponer|repuse|repos?ici[oó]n|oguah[eẽ]/i.test(lower)) {
        result.intent = 'INVENTORY_IN';
        result.confidence = 0.8;
        extractEntities(lower, original, result);
        return result;
    }

    // 10. REFERRAL
    if (/mi\s*c[oó]digo|c[oó]digo\s*de\s*referido|referir|refer[ií]|programa\s*de\s*referidos|compartir\s*c[oó]digo/i.test(lower)) {
        result.intent = 'REFERRAL';
        result.entities.subIntent = 'GET_CODE';
        result.confidence = 0.9;
        return result;
    }
    if (/invitar\s*a\s*|invitale\s*a|enviar\s*invitaci[oó]n/i.test(lower)) {
        result.intent = 'REFERRAL';
        result.entities.subIntent = 'SEND_INVITE';
        // Extract phone number
        const phoneMatch = lower.match(/(\+?\d[\d\s-]{7,})/);
        if (phoneMatch) result.entities.phone = phoneMatch[1].replace(/[\s-]/g, '');
        result.confidence = 0.9;
        return result;
    }

    // 11. REPORT (PDF)
    if (/mi\s*reporte|reporte\s*(mensual|pdf|del\s*mes)|descargar\s*reporte|generar\s*reporte|baj[aá]r?\s*reporte|link\s*reporte/i.test(lower)) {
        result.intent = 'REPORT';
        result.confidence = 0.9;
        return result;
    }

    // 12. MULTI-BUSINESS
    if (/mis\s*negocios|mis\s*comercios|mis\s*tiendas|listar\s*negocios/i.test(lower)) {
        result.intent = 'MULTI_BUSINESS';
        result.entities.subIntent = 'LIST';
        result.confidence = 0.9;
        return result;
    }
    const switchMatch = lower.match(/cambiar\s*a\s+(.+)/i);
    if (switchMatch) {
        result.intent = 'MULTI_BUSINESS';
        result.entities.subIntent = 'SWITCH';
        result.entities.businessName = switchMatch[1].trim();
        result.confidence = 0.9;
        return result;
    }
    const addBizMatch = lower.match(/agregar\s*negocio\s+(.+)/i);
    if (addBizMatch) {
        result.intent = 'MULTI_BUSINESS';
        result.entities.subIntent = 'ADD';
        result.entities.businessName = addBizMatch[1].trim();
        result.confidence = 0.9;
        return result;
    }

    // 13. EXPORT (Excel)
    if (/exportar|descargar\s*(excel|ventas|deudas|datos)|bajar\s*(excel|ventas|datos)|mi\s*excel|excel\s*de\s*(ventas|deudores|deudas)/i.test(lower)) {
        result.intent = 'EXPORT';
        // Determine what to export
        if (/deud|fiado|pendiente/i.test(lower)) {
            result.entities.exportType = 'debtors';
        } else {
            result.entities.exportType = 'sales';
        }
        result.confidence = 0.9;
        return result;
    }

    // 14. THANK YOU (treat as informal greeting/ack)
    if (/^(gracias|gracia|dale|ok|oki|bueno|perfecto|genial|excelente|listo|joya|barbaro|10|diez|crack|sos\s*crack|gra[cs]|ty|thanks?|piola|masa|de\s*una|sale|vamo|vamos)/i.test(lower) && lower.length < 30) {
        result.intent = 'GREETING';
        result.confidence = 0.8;
        return result;
    }

    // If we found entities even without clear intent, try to infer
    extractEntities(lower, original, result);
    if (result.entities.amount && result.entities.customer_name) {
        // Has amount + name = probably a sale
        result.intent = 'SALE_CASH';
        result.confidence = 0.65; // Low confidence → will go to OpenAI
    }

    return result;
}

// =============================================
// ENTITY EXTRACTION (shared by fast + fallback)
// =============================================

function extractEntities(lower, original, result) {
    // ─── AMOUNT PARSING ───
    let amount = null;
    let detectedCurrency = 'PYG'; // Default

    // ─── USD Detection FIRST (before PYG) ───

    // "$50", "$100", "$1500" — dollar sign prefix
    let amountMatch = lower.match(/\$\s*(\d+[.,]?\d*)/);
    if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(',', '.'));
        detectedCurrency = 'USD';
    }

    // "50 dólares", "100 dolares", "200 dolar"
    if (!amount) {
        amountMatch = lower.match(/(\d+[.,]?\d*)\s*d[oó]lar(?:es)?/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.'));
            detectedCurrency = 'USD';
        }
    }

    // "50 verdes" (Paraguayan slang for USD)
    if (!amount) {
        amountMatch = lower.match(/(\d+[.,]?\d*)\s*verdes?/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.'));
            detectedCurrency = 'USD';
        }
    }

    // "50 usd", "100 USD"
    if (!amount) {
        amountMatch = lower.match(/(\d+[.,]?\d*)\s*usd/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.'));
            detectedCurrency = 'USD';
        }
    }

    // ─── PYG Amounts ───

    // "1 millón", "2 millones", "1.5 millón", "medio millón"
    if (!amount) {
        amountMatch = lower.match(/medio\s*mill[oó]n/i);
        if (amountMatch) {
            amount = 500000;
        }
    }

    if (!amount) {
        amountMatch = lower.match(/(\d+[\.,]?\d*)\s*mill[oó]n/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000000;
        }
    }

    // "1 palo", "2 palos" (Paraguayan slang for million)
    if (!amount) {
        amountMatch = lower.match(/(\d+[\.,]?\d*)\s*palos?/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000000;
        }
    }

    // "1 luca" = 1000, "500 lucas" = 500,000 (sometimes used)
    if (!amount) {
        amountMatch = lower.match(/(\d+[\.,]?\d*)\s*lucas?/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000;
        }
    }

    // "500 mil", "500mil", "1500 mil" 
    if (!amount) {
        amountMatch = lower.match(/(\d+[\.,]?\d*)\s*mil\b/i);
        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(',', '.')) * 1000;
        }
    }

    // "500.000" or "1.000.000" (dot-separated thousands)
    if (!amount) {
        amountMatch = lower.match(/(\d{1,3}(?:[\.,]\d{3})+)/);
        if (amountMatch) {
            amount = parseInt(amountMatch[1].replace(/[\.,]/g, ''));
        }
    }

    // Plain large number "500000", "50000"
    if (!amount) {
        amountMatch = lower.match(/\b(\d{4,})\b/);
        if (amountMatch) {
            amount = parseInt(amountMatch[1]);
        }
    }

    // Small numbers with "k" = thousands: "500k", "200k"
    if (!amount) {
        amountMatch = lower.match(/(\d+)\s*k\b/i);
        if (amountMatch) {
            amount = parseInt(amountMatch[1]) * 1000;
        }
    }

    if (amount) {
        result.entities.amount = amount;
    }

    // ─── CURRENCY ─── (can also be set above during amount detection)
    if (/d[oó]lar(es)?|usd|\$\s*\d|verdes?\b/i.test(lower)) {
        detectedCurrency = 'USD';
    }
    result.entities.currency = detectedCurrency;

    // ─── CUSTOMER NAME EXTRACTION ───
    const skipWords = new Set([
        'la', 'el', 'un', 'una', 'los', 'las', 'mi', 'su', 'al', 'del',
        'contado', 'efectivo', 'credito', 'crédito', 'fiado', 'semana',
        'hoy', 'ayer', 'mes', 'pago', 'cobro', 'venta', 'mil', 'millon',
        'millón', 'millones', 'cuenta', 'lunes', 'martes', 'miercoles',
        'jueves', 'viernes', 'sabado', 'domingo', 'enero', 'febrero',
        'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
        'septiembre', 'octubre', 'noviembre', 'diciembre',
        'cada', 'total', 'cliente', 'plata', 'guaranies', 'dolares',
        'cerveza', 'gaseosa', 'arroz', 'aceite', 'yerba', 'contado'
    ]);

    let customerName = null;

    // Pattern: "a Don/Doña Carlos", "de Don/Doña María"
    let nameMatch = original.match(/(?:a|de)\s+(?:[Dd]on|[Dd]o[ñn]a)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
    if (nameMatch && !skipWords.has(nameMatch[1].toLowerCase().split(' ')[0])) {
        customerName = nameMatch[1];
    }

    // Pattern: "a Carlos", "de María"
    if (!customerName) {
        nameMatch = original.match(/\b(?:a|de)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
        if (nameMatch && !skipWords.has(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    // Pattern: "María pagó", "Carlos abonó" — name at start before verb
    if (!customerName && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+(?:me\s+)?(?:pag[oó]|abon[oó]|cancel[oó]|trajo|deposit[oó])/i.test(original)) {
        nameMatch = original.match(/^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
        if (nameMatch && !skipWords.has(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    // Pattern: "cobré X de María"
    if (!customerName) {
        nameMatch = original.match(/\d+\s*(?:mil|mill[oó]n|k)?\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i);
        if (nameMatch && !skipWords.has(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    // Pattern: "para Carlos", "cliente Carlos"  
    if (!customerName) {
        nameMatch = original.match(/(?:para|cliente)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i);
        if (nameMatch && !skipWords.has(nameMatch[1].toLowerCase())) {
            customerName = nameMatch[1];
        }
    }

    if (customerName) {
        // Capitalize first letter of each word
        result.entities.customer_name = customerName.split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    // ─── PRODUCT EXTRACTION ───
    const products = [
        // Bebidas
        'cerveza', 'birra', 'pilsen', 'brahma', 'bavaria', 'munich', 'corona', 'heineken', 'ourogot', 'skol',
        'gaseosa', 'coca', 'coca cola', 'coca-cola', 'pepsi', 'fanta', 'sprite', 'guaraná', 'guarana', 'nik', 'pulp',
        'agua', 'agua mineral', 'jugo', 'ades', 'frugos', 'tampico',
        'terere', 'tereré', 'mate', 'cocido',
        'vino', 'uvita', 'sante', 'santa helena', 'caña', 'caña blanca', 'tres leones', 'aristocrata',
        'whisky', 'ron', 'vodka', 'tres plumas',
        // Yerba
        'yerba', 'pajarito', 'kurupi', 'selecta', 'campesino', 'indio',
        // Alimentos básicos y Despensa
        'pan', 'galleta', 'coquito', 'rosquita', 'palito',
        'leche', 'trébol', 'lactolanda', 'los colonos', 'arroz', 'fideo', 'fideos',
        'aceite', 'mirasol', 'natura', 'soja', 'azúcar', 'azucar', 'sal', 'sal fina', 'sal gruesa',
        'harina', 'almidón', 'almidon', 'mandioca', 'batata', 'cebolla', 'tomate', 'locote', 'papa', 'zanahoria',
        'poroto', 'frejol', 'lenteja', 'arveja',
        'galletitas', 'galletas', 'chocolinas', 'oreo', 'merengada', 'alfajor', 'caramelo', 'chicle',
        // Carnes, Lácteos y Fiambres
        'carne', 'vaca', 'cerdo', 'chancho', 'pollo', 'pescado', 'chorizo', 'pancho', 'morcilla', 'hamburguesa',
        'huevos', 'huevo', 'plancha de huevos', 'maple',
        'queso', 'queso paraguay', 'queso sándwich', 'muzzarella', 'manteca', 'margarina',
        'jamón', 'jamon', 'fiambre', 'mortadela', 'pate', 'paté',
        // Limpieza e Higiene
        'jabón', 'jabon', 'jabon de olor', 'jabon en polvo', 'omo', 'skip', 'ariel',
        'detergente', 'activa', 'lavandina', 'desodorante de ambiente', 'espiral', 'raid',
        'papel higiénico', 'rollo de cocina', 'servilleta',
        'shampoo', 'acondicionador', 'crema dental', 'kolynos', 'colgate', 'cepillo', 'desodorante', 'rexona', 'axe',
        // Tabaco
        'cigarrillos', 'cigarro', 'pucho', 'kent', 'marlboro', 'palermo', 'eight', 'hudson', 'box', 'atado',
        // Snacks locales
        'chipa', 'chipá', 'chipa guazu', 'sopa paraguaya', 'empanada', 'croqueta', 'mbeju', 'mbejú', 'milanesa', 'sandwich',
        // Otros Comercios
        'gas', 'garrafa', 'hielo', 'carbón', 'carbon', 'leña',
        'celular', 'tarjeta', 'crédito celular', 'saldo', 'carga de saldo', 'tigo', 'personal', 'claro',
        'bolsa', 'bolsas', 'hielo',
        // Ferretería
        'cemento', 'cal', 'vallemi', 'yguazu', 'ladrillo', 'clavo', 'hierro', 'varilla', 'arena', 'piedra', 'pintura',
        'foco', 'cable', 'enchufe', 'cinta', 'pegamento', 'pvc'
    ];

    for (const p of products) {
        if (lower.includes(p)) {
            result.entities.product = p;
            break;
        }
    }

    // ─── QUANTITY ───
    const qtyMatch = lower.match(/(\d+)\s*(?:cajas?|packs?|unidad(?:es)?|kilos?|kg|bolsas?|litros?|lt|docenas?|botellas?|latas?|sobres?|paquetes?|metros?|planchas?|atados?|cartones?|rollos?|bidones?|garrafas?|sacos?)/i);
    if (qtyMatch) {
        result.entities.quantity = parseInt(qtyMatch[1]);
    }

    if (!qtyMatch) {
        const simpleQty = lower.match(/(?:tengo|hay|quedan?|llegaron?|recibi)\s+(\d+)\s+/i);
        if (simpleQty) {
            result.entities.quantity = parseInt(simpleQty[1]);
        }
    }

    // ─── UNIT PRICE ───
    const unitPriceMatch = lower.match(/(\d+[\.,]?\d*)\s*(?:mil\s+)?(?:c\/u|cada\s*uno|cada\s*una|por\s*unidad|c\.u\.|la\s*unidad)/i);
    if (unitPriceMatch) {
        let unitPrice = parseFloat(unitPriceMatch[1].replace(',', '.'));
        if (lower.match(new RegExp(unitPriceMatch[1] + '\\s*mil\\s*(?:c\\/u|cada)'))) {
            unitPrice *= 1000;
        }
        result.entities.unit_price = unitPrice;
    }

    // Calculate total if quantity × unit_price
    if (result.entities.quantity && result.entities.unit_price && !result.entities.amount) {
        result.entities.amount = result.entities.quantity * result.entities.unit_price;
    }

    // If amount looks like unit price (small) and we have quantity
    if (result.entities.quantity && result.entities.amount && !result.entities.unit_price) {
        if (result.entities.amount < 200000 && result.entities.quantity > 1) {
            result.entities.unit_price = result.entities.amount;
            result.entities.amount = result.entities.quantity * result.entities.unit_price;
        }
    }
}

// =============================================
// OPENAI PARSER (for complex messages only)
// =============================================

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
- "fiado", "a crédito", "me debe", "le fié", "le dejé", "a cuenta" → SALE_CREDIT
- "al contado", "en efectivo", "cash", "pagó ya" → SALE_CASH
- Si dice "vendí" sin indicar fiado/contado → SALE_CASH
- "cobré", "me pagó", "recibí pago", "abonó", "canceló", "liquidó" → PAYMENT
- "cuánto me deben", "deudas", "pendiente", "morosos" → DEBT_QUERY
- "cuánto vendí", "ventas", "resumen", "cómo me fue" → SALES_QUERY
- "me llegó", "llegaron", "recibí mercadería", "stock" → INVENTORY_IN
- Moneda: siempre PYG (guaraníes) salvo que diga "dólares" o "USD"
- "500 mil" = 500000, "1 millón" = 1000000, "1 palo" = 1000000, "medio millón" = 500000
- "500k" = 500000, "200 lucas" = 200000
- Si dice "a Don X" o "de Doña X", extraer nombre sin el Don/Doña
- Si no hay monto explícito pero hay cantidad × precio, calcular total
- "c/u" o "cada uno" = unit_price
- Nombres siempre capitalizar: "carlos" → "Carlos"
- Entender jopará: "oñeme'ê" = vender, "ohepaga" = pagar, "mba'épa" = qué
`;

async function openaiParser(message) {
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
    parsed.parser = 'openai';
    return parsed;
}

// =============================================
// LANGUAGE DETECTION
// =============================================

function detectLanguage(text) {
    // Pure guaraní indicators
    const gnWords = /mba[''´]?[eé]|nde\s|mo[oõ]pa|ohé|oje[''´]?|oñeme|ohepaga|iporã|guarani|avendé|acobra|mbovy|oguahẽ|aikotevẽ|aikuaa|ndaikatú|ehai|che\s|péva|haguã|oĩ|ndéve|chéve|ñande|opavave|pytyvõ|ko['']?ãga|ko\s?ára|reipota|upépe|péicha|ha['']?e|mávapa|ndaipóri|jey/;
    if (gnWords.test(text)) return 'gn';

    // Jopará (guaraní + spanish mixed)
    if (/luego|nde|pio|pa\b|ko\b/.test(text) && /\b(de|el|la|en)\b/.test(text)) return 'jopara';

    return 'es';
}

export default { processMessage };
