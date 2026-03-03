// =============================================
// NexoBot MVP — Express Server (Production-Ready)
// =============================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

// Sentry Monitoring
import * as Sentry from '@sentry/node';

import webhookRouter from './routes/webhook.js';
import dashboardRouter from './routes/dashboard.js';
import scoreRouter from './routes/score.js';
import greenlightRouter from './routes/greenlight.js';
import authRouter from './routes/auth.js';
import authAdminRouter from './routes/auth-admin.js';
import { requireAuth } from './services/auth.js';
import { startReminderCron } from './services/reminders.js';
import { startSummaryCron } from './services/dailySummary.js';
import { startScoringCron } from './services/scoring.js';
import { startExchangeRateCron } from './services/currency.js';
import { startEmailCron } from './services/email.js';
import { trackApiUsage, startBillingCron } from './services/billing.js';
import { startAlertsCron } from './services/smartAlerts.js';
import billingRouter from './routes/billing.js';
import paymentsRouter from './routes/payments.js';
import portalRouter from './routes/portal.js';
import reportsRouter from './routes/reports.js';
import adminRouter from './routes/admin.js';
import exportRouter from './routes/export.js';
import { webhookLimiter, apiLimiter, adminLimiter, exportLimiter, generalLimiter } from './middleware/rateLimit.js';
import { processMessage } from './services/nlp.js';
import { handleMessage } from './services/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const VERSION = '1.0.0';
const startedAt = new Date().toISOString();

// =============================================
// SENTRY INITIALIZATION
// =============================================
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Tracing
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    environment: process.env.NODE_ENV || 'development'
});

// =============================================
// MIDDLEWARE
// =============================================

// Security
// Trust proxy (Render, Railway, etc. — behind reverse proxy)
if (IS_PROD) app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(cors());

// Logging — short in production, dev-style locally
app.use(morgan(IS_PROD ? 'short' : 'dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (granular per route type)
app.use('/api', generalLimiter);

// =============================================
// ROUTES
// =============================================

// Health check — Render pings this to know the service is alive
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', version: VERSION, uptime: process.uptime() });
});

// Static files (login, dashboard, landing)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Root → homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Dashboard Web App
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// WhatsApp webhook
app.use('/webhook', webhookRouter);

// Auth API (public)
app.use('/api/auth', authRouter);

// Admin & Partner Login API
app.use('/api/auth-admin', authAdminRouter);

// B2B Leads capture
app.post('/api/leads', async (req, res) => {
    try {
        const lead = { ...req.body, created_at: new Date().toISOString(), source: req.body.source || 'empresas_page' };
        console.log('🎯 New B2B lead:', JSON.stringify(lead));
        if (supabase) {
            await supabase.from('leads').insert(lead).catch(() => { });
        }
        res.json({ success: true, message: 'Lead received' });
    } catch (err) {
        console.error('Lead capture error:', err);
        res.json({ success: true, message: 'Lead received' });
    }
});

// Contact form (alias for leads with contact source)
app.post('/api/contact', async (req, res) => {
    try {
        const lead = {
            name: `${req.body.nombre} ${req.body.apellido}`,
            email: req.body.email,
            phone: req.body.telefono,
            company: req.body.empresa,
            type: req.body.tipo,
            interest: req.body.interes,
            message: req.body.mensaje,
            created_at: new Date().toISOString(),
            source: 'contacto_page'
        };
        console.log('📩 Contact form:', JSON.stringify(lead));
        if (supabase) {
            await supabase.from('leads').insert(lead).catch(() => { });
        }
        res.json({ success: true, message: 'Mensaje recibido' });
    } catch (err) {
        console.error('Contact form error:', err);
        res.json({ success: true, message: 'Mensaje recibido' });
    }
});

// Dashboard API (protected — requires login)
app.use('/api/dashboard', requireAuth, dashboardRouter);

// Score API (public for financieras, tracked for billing)
app.use('/api/score', apiLimiter, trackApiUsage, scoreRouter);

// GreenLight API (real-time credit authorization, tracked)
app.use('/api/greenlight', apiLimiter, trackApiUsage, greenlightRouter);

// Billing API (partners check usage/invoices)
app.use('/api/billing', apiLimiter, billingRouter);

// Payments API (checkout sessions, webhook)
app.use('/api/payments', paymentsRouter);

// Partner Portal API (B2B dashboard data)
app.use('/api/portal', apiLimiter, portalRouter);

// Reports API (PDF generation)
app.use('/api/reports', exportLimiter, reportsRouter);

// Admin Dashboard API
app.use('/api/admin', adminLimiter, adminRouter);

// Excel Export API
app.use('/api/export', exportLimiter, exportRouter);

// Privacy Policy (required by Meta)
app.get('/privacy', (req, res) => {
    res.sendFile('privacy.html', { root: './public' });
});

// =============================================
// TEST / SIMULATE ENDPOINT (for development)
// =============================================

/**
 * POST /api/simulate
 * Body: { "message": "Vendí 500 mil a Carlos, fiado", "phone": "+595981234567" }
 * 
 * Simulates receiving a WhatsApp message without needing the actual API.
 * Perfect for testing NLP + business logic locally.
 */
app.post('/api/simulate', async (req, res) => {
    const { message, phone = '+595981234567', name = 'Comerciante Test' } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        console.log(`\n🧪 SIMULATE from ${phone}: "${message}"`);

        // Process NLP
        const parsed = await processMessage(message);

        // Handle bot logic
        const botResponse = await handleMessage(phone, name, message, parsed);

        return res.json({
            input: message,
            nlp: {
                intent: parsed.intent,
                confidence: parsed.confidence,
                entities: parsed.entities,
                language: parsed.language,
                processing_time_ms: parsed.processing_time_ms,
                parser: parsed.parser || 'openai'
            },
            response: botResponse
        });
    } catch (error) {
        console.error('Simulation error:', error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/simulate/:message
 * Quick test endpoint - just pass the message as URL
 */
app.get('/api/simulate/:message', async (req, res) => {
    const { message } = req.params;
    const phone = '+595981234567';
    const name = 'Comerciante Test';

    try {
        const parsed = await processMessage(decodeURIComponent(message));
        const botResponse = await handleMessage(phone, name, decodeURIComponent(message), parsed);

        return res.json({
            input: decodeURIComponent(message),
            nlp: {
                intent: parsed.intent,
                confidence: parsed.confidence,
                entities: parsed.entities
            },
            response: botResponse
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// =============================================
// ERROR HANDLING
// =============================================

// 404 handler — must be after all routes
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Sentry Error Handler - Must be before any other error middleware!
Sentry.setupExpressErrorHandler(app);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: IS_PROD ? undefined : err.message
    });
});

// =============================================
// START SERVER
// =============================================

const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║        🤖 NexoBot MVP v${VERSION}           ║
║═══════════════════════════════════════════║
║  Env:      ${IS_PROD ? '🟢 PRODUCTION' : '🟡 DEVELOPMENT'}                ║
║  Server:   http://localhost:${PORT}          ║
║  Health:   http://localhost:${PORT}/health    ║
║  Webhook:  http://localhost:${PORT}/webhook   ║
╠═══════════════════════════════════════════╣
║  DB:   ${process.env.SUPABASE_URL ? '✅ Supabase connected' : '⚠️  Memory mode (no Supabase)'}      ║
║  NLP:  ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-key' ? '✅ OpenAI GPT-4o-mini' : '⚠️  Fallback parser (no OpenAI)'}    ║
║  WA:   ${process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TOKEN !== 'your-whatsapp-token' ? '✅ WhatsApp connected' : '⚠️  Simulated (no WhatsApp)'}     ║
║  🔔:  Reminders cron active              ║
║  📊:  Daily summary cron active          ║
║  🎯:  NexoScore cron active (2am PY)     ║
║  🟢:  GreenLight API: /api/greenlight    ║
║  💱:  Exchange rate cron active (6h)     ║
║  📈:  Score API: /api/score/:identifier  ║
╚═══════════════════════════════════════════╝
    `);

    // Start daily cron jobs
    startReminderCron();       // 9am PY - debt reminders
    startAlertsCron();         // 10am PY - smart alerts
    startSummaryCron();        // 8pm PY - daily summary
    startScoringCron();        // 2am PY - recalculate all NexoScores
    startExchangeRateCron();   // Every 6h - update USD/PYG rate
    startEmailCron();          // Monday 8am PY - weekly summary emails
    startBillingCron();        // Daily - API usage billing summaries
});

// =============================================
// GRACEFUL SHUTDOWN
// =============================================
// Render sends SIGTERM before stopping the service.
// We close the HTTP server cleanly so in-flight
// requests finish before the process exits.

const shutdown = (signal) => {
    console.log(`\n⏳ ${signal} received — shutting down gracefully…`);
    server.close(() => {
        console.log('✅ HTTP server closed. Bye!');
        process.exit(0);
    });
    // Force exit after 10s if connections won't close
    setTimeout(() => {
        console.error('⚠️  Forced exit after timeout');
        process.exit(1);
    }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
