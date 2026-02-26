// =============================================
// NexoBot MVP — Inventory Model
// =============================================

import supabase from '../config/supabase.js';

// In-memory store
const memoryStore = new Map(); // merchantId -> Map(productName -> details)

/**
 * Find or create inventory item
 */
export async function findOrCreate(merchantId, productName) {
    if (!productName) return null;
    const normalizedName = productName.toLowerCase().trim();

    if (!supabase) return findOrCreateMemory(merchantId, normalizedName);

    let { data: item } = await supabase
        .from('inventory')
        .select('*')
        .eq('merchant_id', merchantId)
        .ilike('product', normalizedName)
        .single();

    if (item) return item;

    const { data: newItem, error } = await supabase
        .from('inventory')
        .insert({
            merchant_id: merchantId,
            product: normalizedName
        })
        .select()
        .single();

    if (error) {
        console.error('DB Error creating inventory item:', error);
        return null;
    }

    return newItem;
}

/**
 * Update stock or price
 */
export async function updateItem(merchantId, productName, stockDiff = null, newPrice = null) {
    const item = await findOrCreate(merchantId, productName);
    if (!item) return null;

    if (!supabase) return updateItemMemory(item, merchantId, productName, stockDiff, newPrice);

    const updates = {};
    if (stockDiff !== null) updates.stock = (item.stock || 0) + stockDiff;
    if (newPrice !== null) updates.avg_price = newPrice;

    // update
    const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', item.id)
        .select()
        .single();

    if (error) {
        console.error('DB Error updating inventory item:', error);
        return null; // or throw
    }
    return data;
}

/**
 * Get item by exact match or similar
 */
export async function getItem(merchantId, productName) {
    if (!supabase) return getItemMemory(merchantId, productName);

    const { data } = await supabase
        .from('inventory')
        .select('*')
        .eq('merchant_id', merchantId)
        .ilike('product', `%${productName.trim()}%`)
        .limit(1)
        .single();

    return data;
}

// =============================================
// IN-MEMORY FALLBACK
// =============================================

function findOrCreateMemory(merchantId, name) {
    if (!memoryStore.has(merchantId)) memoryStore.set(merchantId, new Map());
    const items = memoryStore.get(merchantId);

    if (items.has(name)) return items.get(name);

    const item = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        merchant_id: merchantId,
        product: name,
        stock: 0,
        avg_price: 0,
        unit: 'unidades',
        created_at: new Date().toISOString()
    };
    items.set(name, item);
    return item;
}

function updateItemMemory(item, merchantId, name, stockDiff, newPrice) {
    if (stockDiff !== null) item.stock += stockDiff;
    if (newPrice !== null) item.avg_price = newPrice;
    return item;
}

function getItemMemory(merchantId, name) {
    if (!memoryStore.has(merchantId)) return null;
    const items = memoryStore.get(merchantId);
    for (let key of items.keys()) {
        if (key.includes(name.toLowerCase())) return items.get(key);
    }
    return null;
}

export default { findOrCreate, updateItem, getItem };
