// =============================================
// NexoBot MVP — Rate Limiting Middleware
// =============================================
// In-memory rate limiter — no external deps needed.
// Protects against:
//   - API abuse (B2B endpoints)
//   - WhatsApp webhook flooding
//   - Brute force on admin/auth
//
// Tiers:
//   - webhook: 60 req/min per IP (WhatsApp)
//   - api: 100 req/min per API key
//   - admin: 20 req/min per IP
//   - export: 10 req/min per IP
//   - general: 200 req/min per IP

// Store: Map<key, { count, resetAt }>
const store = new Map();

// Clean expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.resetAt) {
            store.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Create a rate limiter middleware
 * @param {Object} options
 * @param {number} options.max - Max requests per window
 * @param {number} options.windowMs - Window in milliseconds
 * @param {string} options.keyPrefix - Prefix for the store key
 * @param {Function} options.keyGenerator - Function(req) => key
 * @param {string} options.message - Error message
 */
export function rateLimit({
    max = 100,
    windowMs = 60 * 1000,
    keyPrefix = 'rl',
    keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'unknown',
    message = 'Demasiadas solicitudes. Intentá de nuevo en un momento.'
} = {}) {
    return (req, res, next) => {
        const clientKey = `${keyPrefix}:${keyGenerator(req)}`;
        const now = Date.now();

        let entry = store.get(clientKey);

        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            store.set(clientKey, entry);
        }

        entry.count++;

        // Set headers
        const remaining = Math.max(0, max - entry.count);
        const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetSeconds);

        if (entry.count > max) {
            res.setHeader('Retry-After', resetSeconds);
            return res.status(429).json({
                error: 'Too Many Requests',
                message,
                retryAfter: resetSeconds
            });
        }

        next();
    };
}

// ── PRE-CONFIGURED LIMITERS ──

/** WhatsApp webhook: 60/min per IP */
export const webhookLimiter = rateLimit({
    max: 60,
    windowMs: 60 * 1000,
    keyPrefix: 'wh',
    message: 'Webhook rate limit exceeded'
});

/** B2B API: 100/min per API key */
export const apiLimiter = rateLimit({
    max: 100,
    windowMs: 60 * 1000,
    keyPrefix: 'api',
    keyGenerator: (req) => req.headers['x-api-key'] || req.query.apiKey || req.ip,
    message: 'API rate limit exceeded. Please slow down your requests.'
});

/** Admin: 20/min per IP */
export const adminLimiter = rateLimit({
    max: 20,
    windowMs: 60 * 1000,
    keyPrefix: 'admin',
    message: 'Too many admin requests'
});

/** Export/Reports: 10/min per IP — heavy operations */
export const exportLimiter = rateLimit({
    max: 10,
    windowMs: 60 * 1000,
    keyPrefix: 'export',
    message: 'Demasiadas descargas. Esperá un momento.'
});

/** General: 200/min per IP */
export const generalLimiter = rateLimit({
    max: 200,
    windowMs: 60 * 1000,
    keyPrefix: 'gen'
});

/**
 * Get current rate limit stats (for admin dashboard)
 */
export function getRateLimitStats() {
    const stats = { totalKeys: store.size, byPrefix: {} };
    for (const [key, entry] of store) {
        const prefix = key.split(':')[0];
        if (!stats.byPrefix[prefix]) stats.byPrefix[prefix] = { keys: 0, totalHits: 0 };
        stats.byPrefix[prefix].keys++;
        stats.byPrefix[prefix].totalHits += entry.count;
    }
    return stats;
}

export default {
    rateLimit,
    webhookLimiter,
    apiLimiter,
    adminLimiter,
    exportLimiter,
    generalLimiter,
    getRateLimitStats
};
