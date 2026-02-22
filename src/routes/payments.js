// =============================================
// NexoBot MVP — Payment Routes
// =============================================
// Endpoints for creating checkout sessions and
// processing payment webhooks.

import { Router } from 'express';
import { createCheckout, createBancardCheckout, handleStripeWebhook, getPaymentHistory } from '../services/payments.js';

const router = Router();

/**
 * POST /api/payments/checkout
 * Create a Stripe checkout session
 * Body: { apiKey, period?, successUrl?, cancelUrl? }
 */
router.post('/checkout', async (req, res) => {
    try {
        const { apiKey, period, successUrl, cancelUrl } = req.body;
        if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

        const result = await createCheckout({ apiKey, period, successUrl, cancelUrl });

        if (result.error) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/payments/bancard
 * Create a Bancard vPOS checkout (PYG local payments)
 * Body: { apiKey, period? }
 */
router.post('/bancard', async (req, res) => {
    try {
        const { apiKey, period } = req.body;
        if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

        const result = await createBancardCheckout({ apiKey, period });

        if (result.error) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/payments/history
 * Get payment history for a partner
 * Headers: { x-api-key: "your-key" }
 */
router.get('/history', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        const history = await getPaymentHistory(apiKey);
        res.json({ payments: history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/payments/webhook/stripe
 * Stripe webhook handler — called by Stripe on payment events
 */
router.post('/webhook/stripe', async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;
        if (webhookSecret && sig) {
            // Verify webhook signature in production
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // In development, trust the event
            event = req.body;
        }

        await handleStripeWebhook(event);
        res.json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

export default router;
