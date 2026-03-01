import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'nexo-super-secret-jwt-2026';

// ── SUPERADMIN LOGIN ──
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
        }

        if (!supabase) {
            // Development fallback
            if (email === 'admin@nexofinanzas.com' && password === 'nexo_admin_secure_123') {
                const token = jwt.sign({ role: 'superadmin', email }, JWT_SECRET, { expiresIn: '12h' });
                return res.json({ success: true, token });
            }
            return res.status(503).json({ success: false, error: 'Base de datos no disponible' });
        }

        // Buscar admin
        const { data: admin, error } = await supabase
            .from('superadmins')
            .select('*')
            .eq('email', email)
            .eq('is_active', true)
            .single();

        if (error || !admin) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // Verificar contraseña (soporta texto plano para el setup inicial o bcrypt)
        let isMatch = false;
        if (admin.password_hash.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, admin.password_hash);
        } else {
            isMatch = password === admin.password_hash;
        }

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // Actualizar last_login
        await supabase.from('superadmins').update({ last_login_at: new Date().toISOString() }).eq('id', admin.id);

        // Generar JWT
        const token = jwt.sign({
            id: admin.id,
            role: admin.role,
            email: admin.email,
            name: admin.name
        }, JWT_SECRET, { expiresIn: '12h' });

        res.json({ success: true, token, user: { name: admin.name, role: admin.role } });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ success: false, error: 'Error interno de autenticación' });
    }
});

// ── B2B PARTNER LOGIN ──
router.post('/partner/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
        }

        if (!supabase) {
            // Development fallback
            if (email === 'demo@banco.com' && password === 'banco_demo_123') {
                const token = jwt.sign({ role: 'partner', email, apiKey: 'gl-demo-key-2026' }, JWT_SECRET, { expiresIn: '12h' });
                return res.json({ success: true, token });
            }
            return res.status(503).json({ success: false, error: 'Base de datos no disponible' });
        }

        // Buscar partner
        const { data: partner, error } = await supabase
            .from('partners')
            .select('*')
            .eq('email', email)
            .eq('is_active', true)
            .single();

        if (error || !partner) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // Verificar contraseña
        let isMatch = false;
        if (partner.password_hash && partner.password_hash.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, partner.password_hash);
        } else if (partner.password_hash) {
            isMatch = password === partner.password_hash;
        }

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // Generar JWT
        const token = jwt.sign({
            id: partner.id,
            role: 'partner',
            email: partner.email,
            name: partner.name,
            apiKey: partner.api_key,
            plan: partner.plan
        }, JWT_SECRET, { expiresIn: '12h' });

        res.json({
            success: true,
            token,
            partner: {
                name: partner.name,
                plan: partner.plan,
                apiKey: partner.api_key
            }
        });
    } catch (err) {
        console.error('Partner login error:', err);
        res.status(500).json({ success: false, error: 'Error interno de autenticación' });
    }
});

export default router;
