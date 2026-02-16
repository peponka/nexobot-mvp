// =============================================
// NexoBot MVP — Onboarding Service
// =============================================
// Guides new merchants through a setup flow
// when they first interact with the bot.
// 
// Flow: Name → Business Type → City → Volume
// After completing → normal bot mode

import supabase from '../config/supabase.js';

// In-memory onboarding state (survives during server uptime)
// Key: phone number, Value: { step, data }
const onboardingState = new Map();

// =============================================
// ONBOARDING STEPS
// =============================================

const STEPS = {
    WELCOME: 0,
    BUSINESS_NAME: 1,
    BUSINESS_TYPE: 2,
    CITY: 3,
    VOLUME: 4,
    COMPLETE: 5
};

const BUSINESS_TYPES = {
    '1': 'almacen',
    '2': 'despensa',
    '3': 'distribuidora',
    '4': 'kiosco',
    '5': 'ferretería',
    '6': 'farmacia',
    '7': 'restaurante',
    '8': 'otro'
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

    // If merchant has no business_name → new user, start onboarding
    if (!merchant.business_name && !merchant.city) {
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
            state.step = STEPS.BUSINESS_NAME;
            return `🦄 *¡Bienvenido a NexoFinanzas!* 🇵🇾\n\n` +
                `Soy *NexoBot*, tu asistente comercial por WhatsApp.\n\n` +
                `Voy a hacerte unas preguntas rápidas para configurar tu cuenta (30 segundos).\n\n` +
                `📝 *¿Cómo se llama tu negocio?*\n` +
                `_(Ej: "Despensa Don Carlos", "Distribuidora López")_\n\n` +
                `_Escribí "saltar" si querés configurar después_`;

        case STEPS.BUSINESS_NAME:
            // Save business name
            state.data.business_name = message.trim();
            state.step = STEPS.BUSINESS_TYPE;
            return `👍 *${state.data.business_name}* — ¡buenísimo!\n\n` +
                `🏪 *¿Qué tipo de negocio es?*\n\n` +
                `Respondé con el número:\n` +
                `1️⃣ Almacén / Supermercado\n` +
                `2️⃣ Despensa / Minimarket\n` +
                `3️⃣ Distribuidora\n` +
                `4️⃣ Kiosco\n` +
                `5️⃣ Ferretería\n` +
                `6️⃣ Farmacia\n` +
                `7️⃣ Restaurante / Bar\n` +
                `8️⃣ Otro`;

        case STEPS.BUSINESS_TYPE:
            // Parse business type
            const typeKey = lower.replace(/[^1-8]/g, '').charAt(0);
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
                else state.data.business_type = lower.substring(0, 50);
            }

            state.step = STEPS.CITY;
            return `✅ Tipo: *${capitalize(state.data.business_type)}*\n\n` +
                `📍 *¿En qué ciudad estás?*\n` +
                `_(Ej: Asunción, Ciudad del Este, Encarnación, Luque...)_`;

        case STEPS.CITY:
            state.data.city = capitalize(message.trim());
            state.step = STEPS.VOLUME;
            return `📍 *${state.data.city}* — perfecto!\n\n` +
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
                `📋 Tu perfil:\n` +
                `🏪 ${state.data.business_name}\n` +
                `📦 ${capitalize(state.data.business_type)}\n` +
                `📍 ${state.data.city}\n\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
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
    if (!supabase) return;

    const updates = {
        business_name: data.business_name,
        business_type: data.business_type,
        city: data.city
    };

    const { error } = await supabase
        .from('merchants')
        .update(updates)
        .eq('id', merchantId);

    if (error) {
        console.error('❌ Error saving onboarding data:', error);
    } else {
        console.log(`✅ Onboarding complete for merchant ${merchantId}: ${data.business_name} (${data.city})`);
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
 * Force reset onboarding for a phone (admin use)
 */
export function resetOnboarding(phone) {
    onboardingState.delete(phone);
}

export default { needsOnboarding, handleOnboarding, resetOnboarding };
