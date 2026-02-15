// =============================================
// NexoBot MVP — Merchant Model
// =============================================

import supabase from '../config/supabase.js';

// In-memory store for development without Supabase
const memoryStore = new Map();

/**
 * Find or create a merchant by phone number
 */
export async function findOrCreate(phone, contactName) {
    if (!supabase) {
        return findOrCreateMemory(phone, contactName);
    }

    // Try to find existing
    let { data: merchant, error } = await supabase
        .from('merchants')
        .select('*')
        .eq('phone', phone)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('DB Error finding merchant:', error);
    }

    if (merchant) return merchant;

    // Create new merchant
    const { data: newMerchant, error: createError } = await supabase
        .from('merchants')
        .insert({
            phone,
            name: contactName || null,
            onboarded_at: new Date().toISOString()
        })
        .select()
        .single();

    if (createError) {
        console.error('DB Error creating merchant:', createError);
        return null;
    }

    console.log(`👤 New merchant: ${contactName} (${phone})`);
    return newMerchant;
}

/**
 * Update merchant stats
 */
export async function updateStats(merchantId, updates) {
    if (!supabase) {
        return updateStatsMemory(merchantId, updates);
    }

    const { error } = await supabase
        .from('merchants')
        .update(updates)
        .eq('id', merchantId);

    if (error) console.error('DB Error updating merchant:', error);
}

/**
 * Get merchant summary
 */
export async function getSummary(merchantId) {
    if (!supabase) {
        return getSummaryMemory(merchantId);
    }

    const { data, error } = await supabase
        .from('merchant_summary')
        .select('*')
        .eq('id', merchantId)
        .single();

    if (error) {
        console.error('DB Error getting summary:', error);
        return null;
    }
    return data;
}

// =============================================
// IN-MEMORY FALLBACK (dev without Supabase)
// =============================================

function findOrCreateMemory(phone, contactName) {
    if (memoryStore.has(phone)) return memoryStore.get(phone);

    const merchant = {
        id: `mem_${Date.now()}`,
        phone,
        name: contactName,
        business_name: null,
        nexo_score: 0,
        total_sales: 0,
        total_credit_given: 0,
        total_collected: 0,
        status: 'active',
        created_at: new Date().toISOString()
    };

    memoryStore.set(phone, merchant);
    console.log(`👤 New merchant (memory): ${contactName} (${phone})`);
    return merchant;
}

function updateStatsMemory(merchantId, updates) {
    for (const [phone, merchant] of memoryStore) {
        if (merchant.id === merchantId) {
            Object.assign(merchant, updates);
            return;
        }
    }
}

function getSummaryMemory(merchantId) {
    for (const [phone, merchant] of memoryStore) {
        if (merchant.id === merchantId) return merchant;
    }
    return null;
}

export default { findOrCreate, updateStats, getSummary };
