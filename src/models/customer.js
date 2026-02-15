// =============================================
// NexoBot MVP — Customer Model
// =============================================

import supabase from '../config/supabase.js';

// In-memory store
const memoryStore = new Map(); // merchantId -> Map(name -> customer)

/**
 * Find or create a customer for a merchant
 */
export async function findOrCreate(merchantId, customerName) {
    if (!customerName) return null;

    const normalizedName = customerName.trim();

    if (!supabase) {
        return findOrCreateMemory(merchantId, normalizedName);
    }

    // Fuzzy match: try exact first, then ILIKE
    let { data: customer } = await supabase
        .from('merchant_customers')
        .select('*')
        .eq('merchant_id', merchantId)
        .ilike('name', normalizedName)
        .single();

    if (customer) return customer;

    // Create new
    const { data: newCustomer, error } = await supabase
        .from('merchant_customers')
        .insert({
            merchant_id: merchantId,
            name: normalizedName
        })
        .select()
        .single();

    if (error) {
        console.error('DB Error creating customer:', error);
        return null;
    }

    return newCustomer;
}

/**
 * Update customer debt
 */
export async function updateDebt(customerId, amount, type) {
    if (!supabase) {
        return updateDebtMemory(customerId, amount, type);
    }

    const { data: customer } = await supabase
        .from('merchant_customers')
        .select('total_debt, total_paid, total_transactions')
        .eq('id', customerId)
        .single();

    if (!customer) return;

    const updates = {
        total_transactions: (customer.total_transactions || 0) + 1,
        last_transaction_at: new Date().toISOString()
    };

    if (type === 'SALE_CREDIT') {
        updates.total_debt = (customer.total_debt || 0) + amount;
    } else if (type === 'PAYMENT') {
        updates.total_debt = Math.max(0, (customer.total_debt || 0) - amount);
        updates.total_paid = (customer.total_paid || 0) + amount;
    }

    // Update risk level based on debt
    if (updates.total_debt !== undefined) {
        if (updates.total_debt > 2000000) updates.risk_level = 'high';
        else if (updates.total_debt > 500000) updates.risk_level = 'medium';
        else updates.risk_level = 'low';
    }

    const { error } = await supabase
        .from('merchant_customers')
        .update(updates)
        .eq('id', customerId);

    if (error) console.error('DB Error updating customer:', error);
}

/**
 * Get all debtors for a merchant
 */
export async function getDebtors(merchantId) {
    if (!supabase) {
        return getDebtorsMemory(merchantId);
    }

    const { data, error } = await supabase
        .from('merchant_customers')
        .select('*')
        .eq('merchant_id', merchantId)
        .gt('total_debt', 0)
        .order('total_debt', { ascending: false });

    if (error) {
        console.error('DB Error getting debtors:', error);
        return [];
    }
    return data || [];
}

/**
 * Get customer by ID
 */
export async function getById(customerId) {
    if (!supabase) {
        return getByIdMemory(customerId);
    }

    const { data } = await supabase
        .from('merchant_customers')
        .select('*')
        .eq('id', customerId)
        .single();

    return data;
}

// =============================================
// IN-MEMORY FALLBACK
// =============================================

function findOrCreateMemory(merchantId, name) {
    if (!memoryStore.has(merchantId)) {
        memoryStore.set(merchantId, new Map());
    }
    const customers = memoryStore.get(merchantId);

    if (customers.has(name.toLowerCase())) {
        return customers.get(name.toLowerCase());
    }

    const customer = {
        id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        merchant_id: merchantId,
        name,
        total_debt: 0,
        total_paid: 0,
        total_transactions: 0,
        risk_level: 'low',
        last_transaction_at: null,
        created_at: new Date().toISOString()
    };

    customers.set(name.toLowerCase(), customer);
    return customer;
}

function updateDebtMemory(customerId, amount, type) {
    for (const [merchantId, customers] of memoryStore) {
        for (const [name, customer] of customers) {
            if (customer.id === customerId) {
                customer.total_transactions++;
                customer.last_transaction_at = new Date().toISOString();

                if (type === 'SALE_CREDIT') {
                    customer.total_debt += amount;
                } else if (type === 'PAYMENT') {
                    customer.total_debt = Math.max(0, customer.total_debt - amount);
                    customer.total_paid += amount;
                }

                if (customer.total_debt > 2000000) customer.risk_level = 'high';
                else if (customer.total_debt > 500000) customer.risk_level = 'medium';
                else customer.risk_level = 'low';

                return;
            }
        }
    }
}

function getDebtorsMemory(merchantId) {
    if (!memoryStore.has(merchantId)) return [];
    const customers = memoryStore.get(merchantId);
    return Array.from(customers.values())
        .filter(c => c.total_debt > 0)
        .sort((a, b) => b.total_debt - a.total_debt);
}

function getByIdMemory(customerId) {
    for (const [merchantId, customers] of memoryStore) {
        for (const [name, customer] of customers) {
            if (customer.id === customerId) return customer;
        }
    }
    return null;
}

export default { findOrCreate, updateDebt, getDebtors, getById };
