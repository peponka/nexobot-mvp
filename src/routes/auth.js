// =============================================
// NexoBot MVP — Auth Routes
// =============================================

import { Router } from 'express';
import { login, validateToken } from '../services/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { "phone": "+595981234567", "pin": "1234" }
 * Returns: { success: true, token: "...", merchant: {...} }
 */
router.post('/login', async (req, res) => {
    try {
        const { phone, pin } = req.body;
        const result = await login(phone, pin);

        if (!result.success) {
            return res.status(401).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('Auth route error:', err);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/**
 * GET /api/auth/verify
 * Headers: { Authorization: "Bearer <token>" }
 * Returns: { valid: true, merchant: {...} }
 */
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({ valid: false });
        }

        const token = authHeader.replace('Bearer ', '');
        const result = await validateToken(token);
        res.json(result);
    } catch (err) {
        res.json({ valid: false });
    }
});

export default router;
