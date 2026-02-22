// =============================================
// NexoBot MVP — Referral Service
// =============================================
// Merchants earn rewards for referring other merchants.
//
// How it works:
//   1. Each merchant gets a unique referral code
//   2. New merchant enters referral code during onboarding
//   3. Both referrer and referee get credit/benefit
//   4. Track referral chain for analytics
//
// Commands:
//   "mi código" / "referir" → Show referral code
//   "invitar a [phone]" → Send invite to a phone number

import supabase from '../config/supabase.js';
import { sendMessage } from './whatsapp.js';

// =============================================
// GENERATE REFERRAL CODE
// =============================================

/**
 * Generate or retrieve referral code for a merchant
 */
export async function getReferralCode(merchantId) {
    if (!supabase) return null;

    // Check if merchant already has a code
    const { data: merchant } = await supabase
        .from('merchants')
        .select('id, name, business_name, phone, referral_code')
        .eq('id', merchantId)
        .single();

    if (!merchant) return null;

    // If already has code, return it
    if (merchant.referral_code) {
        return {
            code: merchant.referral_code,
            merchantName: merchant.business_name || merchant.name
        };
    }

    // Generate new code: first 3 letters of name + random 4 digits
    const namePart = (merchant.name || 'NEXO')
        .replace(/[^a-zA-Z]/g, '')
        .substring(0, 3)
        .toUpperCase();
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const code = `${namePart}${randomPart}`;

    // Save to database
    await supabase
        .from('merchants')
        .update({ referral_code: code })
        .eq('id', merchantId);

    return {
        code,
        merchantName: merchant.business_name || merchant.name
    };
}

// =============================================
// PROCESS REFERRAL (during onboarding)
// =============================================

/**
 * Validate and apply a referral code
 * Called during onboarding when new merchant provides a code
 */
export async function applyReferral(newMerchantId, referralCode) {
    if (!supabase || !referralCode) return null;

    const code = referralCode.trim().toUpperCase();

    // Find the referrer
    const { data: referrer } = await supabase
        .from('merchants')
        .select('id, name, business_name, phone')
        .eq('referral_code', code)
        .single();

    if (!referrer) {
        return { success: false, message: 'Código de referido no encontrado' };
    }

    // Don't allow self-referral
    if (referrer.id === newMerchantId) {
        return { success: false, message: 'No podés usar tu propio código' };
    }

    // Record the referral
    await supabase.from('referrals').insert({
        referrer_id: referrer.id,
        referred_id: newMerchantId,
        referral_code: code,
        status: 'completed'
    });

    // Update referral count for the referrer
    await supabase.rpc('increment_referral_count', { merchant_uuid: referrer.id });

    // Notify the referrer
    const referrerName = referrer.business_name || referrer.name;
    await sendMessage(referrer.phone,
        `🎉 *¡Nuevo referido!*\n\n` +
        `Alguien se registró usando tu código *${code}*.\n\n` +
        `¡Gracias por recomendar NexoBot, ${referrerName}! 🙌\n\n` +
        `Seguí compartiendo tu código para acumular beneficios.`
    );

    return {
        success: true,
        referrerName,
        message: `✅ ¡Código aplicado! Gracias a ${referrerName} por la recomendación.`
    };
}

// =============================================
// SEND INVITE via WhatsApp
// =============================================

/**
 * Send an invite message to a phone number
 */
export async function sendInvite(merchantId, targetPhone) {
    if (!supabase) return null;

    const referral = await getReferralCode(merchantId);
    if (!referral) return { success: false, message: 'Error al obtener código' };

    // Clean phone number
    let phone = targetPhone.replace(/[^0-9+]/g, '');
    if (!phone.startsWith('+') && !phone.startsWith('595')) {
        phone = `+595${phone.replace(/^0/, '')}`;
    }

    // Send invite message
    await sendMessage(phone,
        `👋 Hola! *${referral.merchantName}* te invita a usar *NexoBot* 🦄\n\n` +
        `NexoBot es un asistente por WhatsApp que te ayuda a:\n` +
        `✅ Registrar tus ventas\n` +
        `✅ Controlar quién te debe\n` +
        `✅ Recibir resúmenes diarios de tu negocio\n\n` +
        `Es *gratis* y se configura en 1 minuto.\n\n` +
        `📱 Escribile a este número para empezar.\n` +
        `Cuando te pregunte, usá el código: *${referral.code}*\n\n` +
        `_Enviado por NexoBot en nombre de ${referral.merchantName}_`
    );

    return {
        success: true,
        message: `✅ *Invitación enviada* a ${phone}\n\n` +
            `Tu código de referido: *${referral.code}*\n` +
            `Cuando se registre usando tu código, ambos ganan! 🎉`
    };
}

// =============================================
// GET REFERRAL STATS
// =============================================

/**
 * Get referral statistics for a merchant
 */
export async function getReferralStats(merchantId) {
    if (!supabase) return null;

    const referral = await getReferralCode(merchantId);
    if (!referral) return null;

    const { data: referrals, count } = await supabase
        .from('referrals')
        .select('*, merchants!referred_id(name, business_name)', { count: 'exact' })
        .eq('referrer_id', merchantId)
        .order('created_at', { ascending: false });

    return {
        code: referral.code,
        totalReferrals: count || 0,
        referrals: (referrals || []).map(r => ({
            name: r.merchants?.business_name || r.merchants?.name || 'Desconocido',
            date: r.created_at,
            status: r.status
        }))
    };
}

// =============================================
// BOT HANDLER
// =============================================

/**
 * Handle referral-related intents from the bot
 */
export async function handleReferralIntent(merchant, subIntent, entities = {}) {
    switch (subIntent) {
        case 'GET_CODE': {
            const referral = await getReferralCode(merchant.id);
            if (!referral) return '❌ Error al obtener tu código de referido.';

            const stats = await getReferralStats(merchant.id);
            const totalRefs = stats?.totalReferrals || 0;

            return `🎁 *Tu código de referido:*\n\n` +
                `\`${referral.code}\`\n\n` +
                `📊 Referidos activos: *${totalRefs}*\n\n` +
                `Compartí este código con otros comerciantes. ` +
                `Cuando se registren en NexoBot con tu código, ¡ambos ganan!\n\n` +
                `Para invitar directamente, escribí:\n` +
                `_"invitar a 0981234567"_`;
        }

        case 'SEND_INVITE': {
            const phone = entities.phone;
            if (!phone) {
                return `📱 Decime el número de teléfono del comerciante que querés invitar.\n\n` +
                    `_Ej: "invitar a 0981234567"_`;
            }
            const result = await sendInvite(merchant.id, phone);
            return result.message;
        }

        default:
            return null;
    }
}

export default { getReferralCode, applyReferral, sendInvite, getReferralStats, handleReferralIntent };
