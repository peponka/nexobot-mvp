// =============================================
// NexoBot MVP — Billing API Routes
// =============================================
// Endpoints for partners to check their usage and billing.

import { Router } from 'express';
import { getUsageStats, calculateBilling, checkRateLimit } from '../services/billing.js';

const router = Router();

/**
 * GET /api/billing/usage
 * Get current month's usage for authenticated partner
 * Headers: { x-api-key: "your-key" }
 */
router.get('/usage', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.status(401).json({ error: 'API key required (x-api-key header)' });

        const period = req.query.period || null; // optional: ?period=2026-02
        const stats = await getUsageStats(apiKey, period);

        if (!stats) return res.status(404).json({ error: 'No usage data found' });

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/billing/invoice
 * Get billing summary for current or specified period
 * Headers: { x-api-key: "your-key" }
 */
router.get('/invoice', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        const period = req.query.period || null;
        const billing = await calculateBilling(apiKey, period);

        if (billing?.error) return res.status(400).json(billing);

        res.json(billing);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/billing/limits
 * Check remaining API calls for the month
 * Headers: { x-api-key: "your-key" }
 */
router.get('/limits', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        const limits = await checkRateLimit(apiKey);
        res.json(limits);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
