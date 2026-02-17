// =============================================
// NexoBot MVP — Onboarding Service v2
// =============================================
// Guides new merchants through a setup flow
// collecting identity data for the NexoFinanzas database.
// 
// Flow: Welcome → Nombre completo → Cédula → Dirección → 
//       Ciudad → Tipo de negocio → Nombre del negocio → Volumen
// After completing → normal bot mode

import supabase from '../config/supabase.js';

// In-memory onboarding state (survives during server uptime)
// Key: phone number, Value: { step, data }
const onboardingState = new Map();

// =============================================
// ONBOARDING STEPS (expanded with personal data)
// =============================================

const STEPS = {
    WELCOME: 0,
    FULL_NAME: 1,
    CEDULA: 2,
    ADDRESS: 3,
    CITY: 4,
    BUSINESS_TYPE: 5,
    BUSINESS_NAME: 6,
    VOLUME: 7,
    COMPLETE: 8
};

const BUSINESS_TYPES = {
    '1': 'almacen',
    '2': 'despensa',
    '3': 'distribuidora',
    '4': 'kiosco',
    '5': 'ferretería',
    '6': 'farmacia',
    '7': 'restaurante',
    '8': 'taller / servicio',
    '9': 'otro'
};

// =============================================
// CORE: Check and handle onboarding
// =============================================

/**
 * Check if a merchant needs onboarding
 * @returns {boolean} true if merchant is in onboarding flow
 */
export function needsOnboarding(merchant) {
    // If already in onboarding flow (in memory)
    if (onboardingState.has(merchant.phone)) {
        return true;
    }

    // If merchant has no name or cedula → new user, start onboarding
    if (!merchant.name && !merchant.business_name) {
        return true;
    }

    return false;
}

/**
 * Handle onboarding step
 * @returns {string} Bot response for the current step
 */
export async function handleOnboarding(merchant, message) {
    const phone = merchant.phone;
    const lower = message.toLowerCase().trim();

    // Initialize onboarding state if new
    if (!onboardingState.has(phone)) {
        onboardingState.set(phone, {
            step: STEPS.WELCOME,
            data: {}
        });
    }

    const state = onboardingState.get(phone);

    // Allow skipping onboarding
    if (lower === 'saltar' || lower === 'skip' || lower === 'omitir') {
        onboardingState.delete(phone);
        return `⏭️ ¡Dale! Saltamos el registro.\n\n` +
            `Podés empezar a usar el bot ahora. Escribí *ayuda* para ver qué puedo hacer 💪`;
    }

    switch (state.step) {
        case STEPS.WELCOME:
            state.step = STEPS.FULL_NAME;
            return `🦄 *¡Bienvenido a NexoFinanzas!* 🇵🇾\n\n` +
                `Soy *NexoBot*, tu asistente comercial por WhatsApp.\n\n` +
                `Vamos a crear tu cuenta en 1 minuto. Necesito algunos datos para que tu perfil quede completo y seguro.\n\n` +
                `👤 *¿Cuál es tu nombre completo?*\n` +
                `_(Ej: "Juan Carlos Pérez González")_\n\n` +
                `_Escribí "saltar" si querés configurar después_`;

        case STEPS.FULL_NAME:
            // Validate: at least 2 words
            const nameParts = message.trim().split(/\s+/);
            if (nameParts.length < 2) {
                return `⚠️ Necesito tu *nombre completo* (nombre y apellido).\n\n` +
                    `👤 *¿Cuál es tu nombre y apellido?*\n` +
                    `_(Ej: "Juan Carlos Pérez")_`;
            }
            state.data.full_name = capitalize(message.trim());
            state.step = STEPS.CEDULA;
            return `👍 *${state.data.full_name}* — ¡un gusto!\n\n` +
                `🪪 *¿Cuál es tu número de cédula?*\n` +
                `_(Solo los números, sin puntos. Ej: 4523871)_`;

        case STEPS.CEDULA:
            // Extract only digits
            const cedulaDigits = message.replace(/[^0-9]/g, '');
            if (cedulaDigits.length < 5 || cedulaDigits.length > 10) {
                return `⚠️ Ese número no parece una cédula válida.\n\n` +
                    `🪪 *Escribí tu número de cédula* (solo los números).\n` +
                    `_(Ej: 4523871)_`;
            }
            state.data.cedula = cedulaDigits;
            // Format with dots for display
            state.data.cedula_display = formatCedula(cedulaDigits);
            state.step = STEPS.ADDRESS;
            return `✅ Cédula: *${state.data.cedula_display}*\n\n` +
                `🏠 *¿Cuál es tu dirección?*\n` +
                `_(Calle, número, barrio. Ej: "Av. Mariscal López 1234, Barrio Jara")_`;

        case STEPS.ADDRESS:
            if (message.trim().length < 5) {
                return `⚠️ Necesito una dirección más completa.\n\n` +
                    `🏠 *Escribí tu dirección* (calle, número, barrio).\n` +
                    `_(Ej: "Av. Mariscal López 1234, Barrio Jara")_`;
            }
            state.data.address = message.trim();
            state.step = STEPS.CITY;
            return `✅ Dirección registrada.\n\n` +
                `📍 *¿En qué ciudad estás?*\n` +
                `_(Ej: Asunción, Ciudad del Este, Encarnación, Luque...)_`;

        case STEPS.CITY:
            state.data.city = capitalize(message.trim());
            state.step = STEPS.BUSINESS_TYPE;
            return `📍 *${state.data.city}* — perfecto!\n\n` +
                `🏪 *¿Qué tipo de negocio tenés?*\n\n` +
                `Respondé con el número:\n` +
                `1️⃣ Almacén / Supermercado\n` +
                `2️⃣ Despensa / Minimarket\n` +
                `3️⃣ Distribuidora\n` +
                `4️⃣ Kiosco\n` +
                `5️⃣ Ferretería\n` +
                `6️⃣ Farmacia\n` +
                `7️⃣ Restaurante / Bar\n` +
                `8️⃣ Taller / Servicio\n` +
                `9️⃣ Otro`;

        case STEPS.BUSINESS_TYPE:
            // Parse business type
            const typeKey = lower.replace(/[^1-9]/g, '').charAt(0);
            if (BUSINESS_TYPES[typeKey]) {
                state.data.business_type = BUSINESS_TYPES[typeKey];
            } else {
                // Try to match text
                if (/almac[eé]n|super/i.test(lower)) state.data.business_type = 'almacen';
                else if (/despensa|mini/i.test(lower)) state.data.business_type = 'despensa';
                else if (/distribu/i.test(lower)) state.data.business_type = 'distribuidora';
                else if (/kiosco|kiosko/i.test(lower)) state.data.business_type = 'kiosco';
                else if (/ferret/i.test(lower)) state.data.business_type = 'ferretería';
                else if (/farma/i.test(lower)) state.data.business_type = 'farmacia';
                else if (/restau|bar|comida/i.test(lower)) state.data.business_type = 'restaurante';
                else if (/taller|servicio|mec[aá]nic/i.test(lower)) state.data.business_type = 'taller / servicio';
                else state.data.business_type = lower.substring(0, 50);
            }

            state.step = STEPS.BUSINESS_NAME;
            return `✅ Tipo: *${capitalize(state.data.business_type)}*\n\n` +
                `🏷️ *¿Cómo se llama tu negocio?*\n` +
                `_(Ej: "Despensa Don Carlos", "Distribuidora López")_`;

        case STEPS.BUSINESS_NAME:
            state.data.business_name = message.trim();
            state.step = STEPS.VOLUME;
            return `👍 *${state.data.business_name}* — ¡buenísimo!\n\n` +
                `💰 *¿Cuánto vendés aproximadamente por mes?*\n\n` +
                `Respondé con el número:\n` +
                `1️⃣ Menos de 5 millones Gs.\n` +
                `2️⃣ 5 a 20 millones Gs.\n` +
                `3️⃣ 20 a 50 millones Gs.\n` +
                `4️⃣ 50 a 100 millones Gs.\n` +
                `5️⃣ Más de 100 millones Gs.`;

        case STEPS.VOLUME:
            // Parse volume
            const volumeMap = {
                '1': 'menos_5m',
                '2': '5m_20m',
                '3': '20m_50m',
                '4': '50m_100m',
                '5': 'mas_100m'
            };
            const volKey = lower.replace(/[^1-5]/g, '').charAt(0);
            state.data.volume = volumeMap[volKey] || 'no_especificado';

            // SAVE to database
            await saveOnboardingData(merchant.id, state.data);
            onboardingState.delete(phone);

            return `🎉 *¡Registro completo!*\n\n` +
                `📋 Tu perfil NexoFinanzas:\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `👤 ${state.data.full_name}\n` +
                `🪪 CI: ${state.data.cedula_display}\n` +
                `🏠 ${state.data.address}\n` +
                `📍 ${state.data.city}\n` +
                `🏪 ${state.data.business_name} (${capitalize(state.data.business_type)})\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `✅ Tu cuenta está verificada y segura.\n\n` +
                `Ya podés empezar a usar NexoBot. Probá:\n\n` +
                `📝 _"Vendí 500 mil a Carlos, fiado"_\n` +
                `💰 _"Cobré 200 mil de María"_\n` +
                `📋 _"¿Cuánto me deben?"_\n\n` +
                `Escribí *ayuda* para ver todo lo que puedo hacer 💪🇵🇾`;

        default:
            // Reset
            onboardingState.delete(phone);
            return null; // Let normal bot handle it
    }
}

// =============================================
// HELPERS
// =============================================

/**
 * Save onboarding data to merchant profile in Supabase
 */
async function saveOnboardingData(merchantId, data) {
    if (!supabase) {
        console.log('⚠️ No Supabase - onboarding data not saved:', data);
        return;
    }

    const updates = {
        name: data.full_name,
        cedula: data.cedula,
        address: data.address,
        city: data.city,
        business_name: data.business_name,
        business_type: data.business_type,
        monthly_volume: data.volume,
        onboarded_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('merchants')
        .update(updates)
        .eq('id', merchantId);

    if (error) {
        console.error('❌ Error saving onboarding data:', error);
    } else {
        console.log(`✅ Onboarding complete: ${data.full_name} (CI: ${data.cedula}) — ${data.business_name}, ${data.city}`);
    }
}

/**
 * Capitalize first letter of each word
 */
function capitalize(str) {
    return str.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format cédula with dots (e.g., 4.523.871)
 */
function formatCedula(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Force reset onboarding for a phone (admin use)
 */
export function resetOnboarding(phone) {
    onboardingState.delete(phone);
}

export default { needsOnboarding, handleOnboarding, resetOnboarding };
