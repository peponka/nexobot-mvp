// =============================================
// NexoBot MVP — Payment Gateway Service
// =============================================
// Handles payment processing for B2B clients.
// Supports Stripe (international) and Bancard (Paraguay).
// 
// Flow:
//   1. Partner receives invoice via /api/billing/invoice
//   2. Partner clicks "Pay" → creates checkout session
//   3. Webhook confirms payment → updates billing status
// =============================================

import Stripe from 'stripe';
import crypto from 'crypto';
import supabase from '../config/supabase.js';

// Initialize Stripe (if key is available)
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// Exchange rate for PYG → USD (approximate)
const PYG_TO_USD_RATE = 7500;

// =============================================
// CREATE CHECKOUT SESSION
// =============================================

/**
 * Create a Stripe checkout session for a partner invoice
 * @param {Object} params - { apiKey, period, successUrl, cancelUrl }
 * @returns {Object} { sessionId, url } or { error }
 */
export async function createCheckout({ apiKey, period, successUrl, cancelUrl }) {
    if (!stripe) {
        return { error: 'Payment system not configured. Contact support.' };
    }

    // Get current billing for this partner
    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('api_key', apiKey)
        .single();

    if (!partner) {
        return { error: 'Partner not found' };
    }

    // Get invoice amount
    const currentPeriod = period || getCurrentPeriod();

    const { data: usage } = await supabase
        .from('api_usage')
        .select('*')
        .eq('api_key', apiKey)
        .gte('created_at', `${currentPeriod}-01`)
        .lte('created_at', `${currentPeriod}-31`);

    const totalCalls = usage?.length || 0;
    const plan = partner.plan || 'starter';
    const billing = calculateAmount(totalCalls, plan);

    if (billing.total_pyg <= 0) {
        return { error: 'No amount due for this period', billing };
    }

    // Convert PYG to USD cents for Stripe
    const amountUSD = Math.ceil(billing.total_pyg / PYG_TO_USD_RATE * 100); // cents

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `NexoBot API - Plan ${plan.toUpperCase()}`,
                        description: `${totalCalls} API calls - ${currentPeriod} (Gs. ${billing.total_pyg.toLocaleString('es-PY')})`,
                    },
                    unit_amount: amountUSD,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: successUrl || `${process.env.BASE_URL || 'https://nexobot-mvp-1.onrender.com'}/pago-exitoso.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${process.env.BASE_URL || 'https://nexobot-mvp-1.onrender.com'}/pago-cancelado.html`,
            metadata: {
                partner_id: partner.id,
                api_key: apiKey,
                period: currentPeriod,
                amount_pyg: billing.total_pyg.toString(),
                plan: plan
            },
            customer_email: partner.email || undefined,
        });

        // Log the checkout attempt
        await supabase.from('payments').insert({
            partner_id: partner.id,
            period: currentPeriod,
            amount_pyg: billing.total_pyg,
            amount_usd: amountUSD / 100,
            status: 'pending',
            provider: 'stripe',
            provider_session_id: session.id,
            api_calls: totalCalls,
            plan: plan
        });

        return {
            sessionId: session.id,
            url: session.url,
            billing
        };
    } catch (err) {
        console.error('Stripe checkout error:', err);
        return { error: 'Payment system error: ' + err.message };
    }
}

// =============================================
// HANDLE STRIPE WEBHOOK
// =============================================

/**
 * Process Stripe webhook events
 * @param {Object} event - Stripe event object
 */
export async function handleStripeWebhook(event) {
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const { partner_id, period, amount_pyg } = session.metadata;

            // Update payment status
            await supabase
                .from('payments')
                .update({
                    status: 'completed',
                    paid_at: new Date().toISOString(),
                    provider_payment_id: session.payment_intent
                })
                .eq('provider_session_id', session.id);

            // Update partner billing status
            await supabase
                .from('billing_periods')
                .upsert({
                    partner_id,
                    period,
                    status: 'paid',
                    amount_pyg: parseInt(amount_pyg),
                    paid_at: new Date().toISOString()
                });

            console.log(`✅ Payment received: Partner ${partner_id}, Period ${period}, Gs. ${parseInt(amount_pyg).toLocaleString()}`);
            break;
        }

        case 'checkout.session.expired': {
            const session = event.data.object;
            await supabase
                .from('payments')
                .update({ status: 'expired' })
                .eq('provider_session_id', session.id);
            break;
        }

        case 'charge.refunded': {
            const charge = event.data.object;
            await supabase
                .from('payments')
                .update({ status: 'refunded' })
                .eq('provider_payment_id', charge.payment_intent);
            break;
        }
    }
}

// =============================================
// BANCARD INTEGRATION (Paraguay local)
// =============================================

/**
 * Create a Bancard vPOS checkout (for PYG payments)
 * @param {Object} params - Same as createCheckout
 * @returns {Object} { processId, url } or { error }
 */
export async function createBancardCheckout({ apiKey, period }) {
    const bancardPublicKey = process.env.BANCARD_PUBLIC_KEY;
    const bancardPrivateKey = process.env.BANCARD_PRIVATE_KEY;

    if (!bancardPublicKey || !bancardPrivateKey) {
        return { error: 'Bancard not configured. Use Stripe checkout or contact support.' };
    }

    // Get partner and billing
    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('api_key', apiKey)
        .single();

    if (!partner) return { error: 'Partner not found' };

    const currentPeriod = period || getCurrentPeriod();
    const { data: usage } = await supabase
        .from('api_usage')
        .select('*')
        .eq('api_key', apiKey)
        .gte('created_at', `${currentPeriod}-01`)
        .lte('created_at', `${currentPeriod}-31`);

    const totalCalls = usage?.length || 0;
    const plan = partner.plan || 'starter';
    const billing = calculateAmount(totalCalls, plan);

    if (billing.total_pyg <= 0) {
        return { error: 'No amount due', billing };
    }

    // Generate unique shop process ID
    const shopProcessId = `NXB-${partner.id}-${currentPeriod}-${Date.now()}`;

    try {
        // Bancard SingleBuy API
        const response = await fetch('https://vpos.infonet.com.py/vpos/api/0.3/single_buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                public_key: bancardPublicKey,
                operation: {
                    token: generateBancardToken(shopProcessId, billing.total_pyg, bancardPrivateKey),
                    shop_process_id: shopProcessId,
                    amount: billing.total_pyg.toString(),
                    currency: 'PYG',
                    additional_data: '',
                    description: `NexoBot API - ${currentPeriod}`,
                    return_url: `${process.env.BASE_URL || 'https://nexobot-mvp-1.onrender.com'}/pago-exitoso.html`,
                    cancel_url: `${process.env.BASE_URL || 'https://nexobot-mvp-1.onrender.com'}/pago-cancelado.html`
                }
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            await supabase.from('payments').insert({
                partner_id: partner.id,
                period: currentPeriod,
                amount_pyg: billing.total_pyg,
                status: 'pending',
                provider: 'bancard',
                provider_session_id: shopProcessId,
                api_calls: totalCalls,
                plan: plan
            });

            return {
                processId: result.process_id,
                url: `https://vpos.infonet.com.py/payment/single_buy?process_id=${result.process_id}`,
                billing
            };
        }

        return { error: 'Bancard error: ' + (result.messages?.[0]?.dsc || 'Unknown error') };
    } catch (err) {
        console.error('Bancard error:', err);
        return { error: 'Bancard connection error' };
    }
}

// =============================================
// GET PAYMENT HISTORY
// =============================================

export async function getPaymentHistory(apiKey) {
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('api_key', apiKey)
        .single();

    if (!partner) return [];

    const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false })
        .limit(24);

    return data || [];
}

// =============================================
// HELPERS
// =============================================

function getCurrentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function calculateAmount(totalCalls, plan) {
    const pricing = {
        starter: { free: 100, rate: 53000 },      // Gs. 53,000/call
        professional: { free: 500, rate: 42000 },  // Gs. 42,000/call
        enterprise: { free: Infinity, rate: 0 }    // Custom
    };

    const { free, rate } = pricing[plan] || pricing.starter;
    const billable = Math.max(0, totalCalls - free);
    const total = billable * rate;

    return {
        total_calls: totalCalls,
        free_calls: Math.min(totalCalls, free),
        billable_calls: billable,
        rate_per_call: rate,
        total_pyg: total,
        plan
    };
}

function generateBancardToken(shopProcessId, amount, privateKey) {
    // Bancard token: MD5(privateKey + shopProcessId + amount + currency)
    return crypto
        .createHash('md5')
        .update(`${privateKey}${shopProcessId}${amount}PYG`)
        .digest('hex');
}

export default {
    createCheckout,
    createBancardCheckout,
    handleStripeWebhook,
    getPaymentHistory
};
