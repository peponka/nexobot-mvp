// =============================================
// NexoBot MVP — Express Server (Production-Ready)
// =============================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import webhookRouter from './routes/webhook.js';
import dashboardRouter from './routes/dashboard.js';
import scoreRouter from './routes/score.js';
import greenlightRouter from './routes/greenlight.js';
import authRouter from './routes/auth.js';
import { requireAuth } from './services/auth.js';
import { startReminderCron } from './services/reminders.js';
import { startSummaryCron } from './services/dailySummary.js';
import { startScoringCron } from './services/scoring.js';
import { startExchangeRateCron } from './services/currency.js';
import { startEmailCron } from './services/email.js';
import { trackApiUsage, startBillingCron } from './services/billing.js';
import billingRouter from './routes/billing.js';
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

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: IS_PROD ? 200 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// =============================================
// ROUTES
// =============================================

// Health check — Render pings this to know the service is alive
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', version: VERSION, uptime: process.uptime() });
});

// Root info
app.get('/', (req, res) => {
    res.json({
        name: 'NexoBot MVP',
        version: VERSION,
        status: 'running',
        startedAt,
        timestamp: new Date().toISOString(),
        environment: IS_PROD ? 'production' : 'development',
        services: {
            database: process.env.SUPABASE_URL ? 'configured' : 'not configured (using memory)',
            nlp: process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-key'
                ? 'configured (OpenAI)' : 'fallback (regex)',
            whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TOKEN !== 'your-whatsapp-token'
                ? 'configured' : 'simulated'
        }
    });
});

// Static files (login, dashboard)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Root → landing page
app.get('/', (req, res) => {
    res.redirect('/landing.html');
});

// WhatsApp webhook
app.use('/webhook', webhookRouter);

// Auth API (public)
app.use('/api/auth', authRouter);

// Dashboard API (protected — requires login)
app.use('/api/dashboard', requireAuth, dashboardRouter);

// Score API (public for financieras, tracked for billing)
app.use('/api/score', trackApiUsage, scoreRouter);

// GreenLight API (real-time credit authorization, tracked)
app.use('/api/greenlight', trackApiUsage, greenlightRouter);

// Billing API (partners check usage/invoices)
app.use('/api/billing', billingRouter);

// Privacy Policy (required by Meta)
app.get('/privacy', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Política de Privacidad - NexoFinanzas</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333;line-height:1.6}
h1{color:#1a56db}h2{color:#374151;margin-top:24px}</style></head>
<body>
<h1>Política de Privacidad — NexoFinanzas</h1>
<p><strong>Última actualización:</strong> Febrero 2026</p>
<h2>1. Datos que recopilamos</h2>
<p>NexoFinanzas recopila datos transaccionales enviados voluntariamente por el usuario a través de WhatsApp, incluyendo: nombre del comerciante, montos de ventas, nombres de clientes y datos de cobros.</p>
<h2>2. Uso de los datos</h2>
<p>Los datos se utilizan exclusivamente para brindar servicios de gestión financiera al usuario, incluyendo registro de ventas, seguimiento de deudas y generación de reportes.</p>
<h2>3. Almacenamiento</h2>
<p>Los datos se almacenan de forma segura en servidores protegidos con encriptación. No compartimos datos con terceros.</p>
<h2>4. Eliminación de datos</h2>
<p>Podés solicitar la eliminación de todos tus datos enviando "borrar mis datos" al bot de WhatsApp o contactándonos directamente.</p>
<h2>5. Contacto</h2>
<p>Para consultas sobre privacidad, contactanos a través del bot de WhatsApp.</p>
</body></html>`);
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
