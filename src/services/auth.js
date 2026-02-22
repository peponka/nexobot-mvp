// =============================================
// NexoBot MVP — Auth Service
// =============================================
// Simple PIN-based auth for the merchant dashboard.
// Each merchant sets a 4-6 digit PIN during onboarding
// and uses it to access their dashboard.

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import supabase from '../config/supabase.js';

const SALT_ROUNDS = 10;

const TOKEN_EXPIRY_HOURS = 72; // 3 days
const SECRET = process.env.NEXO_API_KEY || 'nexo-dev-secret-key';

// =============================================
// TOKEN GENERATION
// =============================================

/**
 * Generate a secure token for a merchant session
 * @param {string} merchantId - Merchant UUID
 * @returns {string} Hex token
 */
function generateToken(merchantId) {
    const payload = `${merchantId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

// =============================================
// LOGIN
// =============================================

/**
 * Authenticate a merchant with phone + PIN
 * @param {string} phone - Phone number
 * @param {string} pin - 4-6 digit PIN
 * @returns {{ success: boolean, token?: string, merchant?: object, error?: string }}
 */
export async function login(phone, pin) {
    if (!phone || !pin) {
        return { success: false, error: 'Teléfono y PIN son requeridos' };
    }

    // Normalize phone
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 8) {
        return { success: false, error: 'Número de teléfono inválido' };
    }

    // Validate PIN format
    if (!/^\d{4,6}$/.test(pin)) {
        return { success: false, error: 'PIN debe ser 4-6 dígitos' };
    }

    try {
        if (!supabase) {
            return { success: false, error: 'Database not configured' };
        }

        // Find merchant by phone
        const { data: merchant, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('phone', cleanPhone)
            .single();

        if (error || !merchant) {
            return { success: false, error: 'Comerciante no encontrado' };
        }

        // Check if PIN is set
        if (!merchant.dashboard_pin) {
            return { success: false, error: 'PIN no configurado. Enviá "pin 1234" al bot para crear tu PIN.' };
        }

        // Verify PIN (bcrypt hash or legacy plaintext)
        const pinMatch = merchant.dashboard_pin.startsWith('$2')
            ? await bcrypt.compare(pin, merchant.dashboard_pin)
            : merchant.dashboard_pin === pin;

        if (!pinMatch) {
            return { success: false, error: 'PIN incorrecto' };
        }

        // Generate token
        const token = generateToken(merchant.id);
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        // Save token to database
        await supabase
            .from('merchants')
            .update({
                dashboard_token: token,
                token_expires_at: expiresAt.toISOString()
            })
            .eq('id', merchant.id);

        return {
            success: true,
            token,
            expiresAt: expiresAt.toISOString(),
            merchant: {
                id: merchant.id,
                name: merchant.name,
                phone: merchant.phone,
                business_name: merchant.business_name
            }
        };
    } catch (err) {
        console.error('Auth login error:', err);
        return { success: false, error: 'Error interno de autenticación' };
    }
}

// =============================================
// TOKEN VALIDATION
// =============================================

/**
 * Validate a dashboard token
 * @param {string} token - Bearer token
 * @returns {{ valid: boolean, merchant?: object }}
 */
export async function validateToken(token) {
    if (!token || !supabase) {
        return { valid: false };
    }

    try {
        const { data: merchant, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('dashboard_token', token)
            .single();

        if (error || !merchant) {
            return { valid: false };
        }

        // Check expiry
        if (merchant.token_expires_at && new Date(merchant.token_expires_at) < new Date()) {
            return { valid: false, error: 'Token expirado' };
        }

        return {
            valid: true,
            merchant: {
                id: merchant.id,
                name: merchant.name,
                phone: merchant.phone,
                business_name: merchant.business_name
            }
        };
    } catch (err) {
        console.error('Auth validate error:', err);
        return { valid: false };
    }
}

// =============================================
// SET PIN (called from bot or API)
// =============================================

/**
 * Set or update a merchant's dashboard PIN
 * @param {string} merchantId - Merchant UUID
 * @param {string} pin - 4-6 digit PIN
 * @returns {{ success: boolean, error?: string }}
 */
export async function setPin(merchantId, pin) {
    if (!/^\d{4,6}$/.test(pin)) {
        return { success: false, error: 'PIN debe ser 4-6 dígitos' };
    }

    try {
        if (!supabase) {
            return { success: false, error: 'Database not configured' };
        }

        const { error } = await supabase
            .from('merchants')
            .update({ dashboard_pin: pin })
            .eq('id', merchantId);

        if (error) throw error;

        return { success: true };
    } catch (err) {
        console.error('Auth setPin error:', err);
        return { success: false, error: 'Error guardando PIN' };
    }
}

// =============================================
// MIDDLEWARE
// =============================================

/**
 * Express middleware to protect dashboard routes
 * Checks Bearer token in Authorization header
 */
export async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido', code: 'NO_TOKEN' });
    }

    const token = authHeader.replace('Bearer ', '');
    const result = await validateToken(token);

    if (!result.valid) {
        return res.status(401).json({ error: result.error || 'Token inválido', code: 'INVALID_TOKEN' });
    }

    // Attach merchant to request
    req.merchant = result.merchant;
    next();
}

export default { login, validateToken, setPin, requireAuth };
