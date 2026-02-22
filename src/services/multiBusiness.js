// =============================================
// NexoBot MVP — Multi-Business Service
// =============================================
// Allows a merchant to manage multiple businesses
// from the same WhatsApp number.
//
// Commands:
//   "mis negocios" → List all businesses
//   "cambiar a [nombre]" → Switch active business
//   "agregar negocio [nombre]" → Create new business
//
// Each "business" is a separate merchant profile
// linked via the multi_business_owner_id field.

import supabase from '../config/supabase.js';

// In-memory active business selection
// Key: phone, Value: merchantId (the currently active business)
const activeBusiness = new Map();

// =============================================
// CORE FUNCTIONS
// =============================================

/**
 * Get the active merchant ID for a phone number
 * If multi-business is not set up, returns the main merchant
 */
export async function getActiveMerchant(phone) {
    // If they have an active selection in memory, use it
    if (activeBusiness.has(phone)) {
        const activeId = activeBusiness.get(phone);
        const { data } = await supabase
            .from('merchants')
            .select('*')
            .eq('id', activeId)
            .single();
        if (data) return data;
    }

    // Otherwise return default (main) merchant for this phone
    return null; // Let normal flow handle it
}

/**
 * List all businesses for a phone number
 */
export async function listBusinesses(merchantId) {
    if (!supabase) return [];

    // Get the owner ID (either this merchant or their parent)
    const { data: merchant } = await supabase
        .from('merchants')
        .select('id, multi_business_owner_id')
        .eq('id', merchantId)
        .single();

    if (!merchant) return [];

    const ownerId = merchant.multi_business_owner_id || merchant.id;

    // Get all businesses for this owner
    const { data: businesses } = await supabase
        .from('merchants')
        .select('id, business_name, business_type, city, total_sales, status')
        .or(`id.eq.${ownerId},multi_business_owner_id.eq.${ownerId}`)
        .order('created_at', { ascending: true });

    return businesses || [];
}

/**
 * Switch active business
 */
export async function switchBusiness(phone, merchantId, targetName) {
    const businesses = await listBusinesses(merchantId);

    if (businesses.length <= 1) {
        return {
            success: false,
            message: `Solo tenés un negocio registrado.\n\n` +
                `Para agregar otro, escribí:\n` +
                `_"agregar negocio [nombre del negocio]"_`
        };
    }

    // Find matching business by name
    const lower = targetName.toLowerCase();
    const match = businesses.find(b =>
        (b.business_name || '').toLowerCase().includes(lower)
    );

    if (!match) {
        let msg = `⚠️ No encontré un negocio con ese nombre.\n\n`;
        msg += `Tus negocios:\n`;
        businesses.forEach((b, i) => {
            msg += `${i + 1}️⃣ *${b.business_name || 'Sin nombre'}*\n`;
        });
        msg += `\n_Escribí "cambiar a [nombre]"_`;
        return { success: false, message: msg };
    }

    // Set active business
    activeBusiness.set(phone, match.id);

    return {
        success: true,
        merchantId: match.id,
        message: `✅ *Cambiaste a: ${match.business_name}*\n\n` +
            `Todas las ventas, cobros y consultas ahora se registran en este negocio.\n\n` +
            `📊 Ventas totales: Gs. ${(match.total_sales || 0).toLocaleString('es-PY')}\n` +
            `📍 ${match.city || 'Sin ciudad'}\n\n` +
            `_Para volver, escribí "cambiar a [otro negocio]"_`
    };
}

/**
 * Create a new business for the merchant
 */
export async function addBusiness(phone, merchantId, businessName, businessType = 'general') {
    if (!supabase) return { success: false, message: 'Base de datos no disponible' };

    // Get current merchant
    const { data: owner } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', merchantId)
        .single();

    if (!owner) return { success: false, message: 'Error' };

    const ownerId = owner.multi_business_owner_id || owner.id;

    // Ensure the owner has the multi_business_owner_id set on itself
    if (!owner.multi_business_owner_id) {
        await supabase
            .from('merchants')
            .update({ multi_business_owner_id: owner.id })
            .eq('id', owner.id);
    }

    // Create new merchant profile for the new business
    const { data: newBiz, error } = await supabase
        .from('merchants')
        .insert({
            phone: `${phone}_biz_${Date.now()}`, // Unique phone for DB constraint
            name: owner.name,
            cedula: owner.cedula,
            email: owner.email,
            business_name: businessName,
            business_type: businessType,
            city: owner.city,
            address: owner.address,
            multi_business_owner_id: ownerId,
            multi_business_phone: phone, // Real phone for message routing
            status: 'active'
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating business:', error);
        return { success: false, message: 'Error al crear el negocio' };
    }

    // Switch to the new business
    activeBusiness.set(phone, newBiz.id);

    return {
        success: true,
        merchantId: newBiz.id,
        message: `🏪 *¡Nuevo negocio creado!*\n\n` +
            `📋 ${businessName}\n` +
            `📍 ${owner.city || ''}\n\n` +
            `Ya estás usando este negocio. Todas las ventas y cobros se registran acá.\n\n` +
            `_Para cambiar de negocio, escribí "mis negocios"_`
    };
}

// =============================================
// BOT HANDLER
// =============================================

/**
 * Handle multi-business intents
 */
export async function handleMultiBusinessIntent(merchant, phone, subIntent, entities = {}) {
    switch (subIntent) {
        case 'LIST': {
            const businesses = await listBusinesses(merchant.id);

            if (businesses.length <= 1) {
                return `🏪 Tenés *1 negocio* registrado: *${merchant.business_name || 'Sin nombre'}*\n\n` +
                    `Para agregar otro, escribí:\n` +
                    `_"agregar negocio Distribuidora López"_`;
            }

            const activeId = activeBusiness.get(phone) || merchant.id;
            let msg = `🏪 *Tus negocios:*\n\n`;

            businesses.forEach((b, i) => {
                const isActive = b.id === activeId;
                msg += `${i + 1}️⃣ ${isActive ? '👉 ' : ''}*${b.business_name || 'Sin nombre'}*`;
                if (isActive) msg += ' _(activo)_';
                msg += `\n   ${b.business_type || 'general'} · ${b.city || ''}`;
                msg += `\n   Ventas: Gs. ${(b.total_sales || 0).toLocaleString('es-PY')}\n\n`;
            });

            msg += `_Para cambiar, escribí "cambiar a [nombre]"_\n`;
            msg += `_Para agregar, escribí "agregar negocio [nombre]"_`;

            return msg;
        }

        case 'SWITCH': {
            const targetName = entities.businessName;
            if (!targetName) {
                return `📱 Decime a qué negocio querés cambiar.\n\n` +
                    `_Ej: "cambiar a Distribuidora López"_\n\n` +
                    `_O escribí "mis negocios" para ver la lista_`;
            }
            const result = await switchBusiness(phone, merchant.id, targetName);
            return result.message;
        }

        case 'ADD': {
            const bizName = entities.businessName;
            if (!bizName) {
                return `🏪 Decime el nombre del nuevo negocio.\n\n` +
                    `_Ej: "agregar negocio Distribuidora López"_`;
            }
            const result = await addBusiness(phone, merchant.id, bizName);
            return result.message;
        }

        default:
            return null;
    }
}

export default { getActiveMerchant, listBusinesses, switchBusiness, addBusiness, handleMultiBusinessIntent };
