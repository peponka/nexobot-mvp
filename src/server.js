// =============================================
// NexoBot MVP — Express Server
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { processMessage } from './services/nlp.js';
import { handleMessage } from './services/bot.js';

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// MIDDLEWARE
// =============================================

// Security
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(cors());

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
});
app.use('/api', limiter);

// =============================================
// ROUTES
// =============================================

// Health check
app.get('/', (req, res) => {
    res.json({
        name: 'NexoBot MVP',
        version: '0.1.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        services: {
            database: process.env.SUPABASE_URL ? 'configured' : 'not configured (using memory)',
            nlp: process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-key'
                ? 'configured (OpenAI)' : 'fallback (regex)',
            whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TOKEN !== 'your-whatsapp-token'
                ? 'configured' : 'simulated'
        }
    });
});

// Static files (dashboard)
app.use(express.static(path.join(__dirname, '..', 'public')));

// WhatsApp webhook
app.use('/webhook', webhookRouter);

// Dashboard API
app.use('/api/dashboard', dashboardRouter);

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

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// =============================================
// START SERVER
// =============================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║          🤖 NexoBot MVP v0.1.0           ║
║═══════════════════════════════════════════║
║  Server:    http://localhost:${PORT}         ║
║  Webhook:   http://localhost:${PORT}/webhook  ║
║  Simulate:  POST /api/simulate           ║
╠═══════════════════════════════════════════╣
║  DB:   ${process.env.SUPABASE_URL ? '✅ Supabase connected' : '⚠️  Memory mode (no Supabase)'}      ║
║  NLP:  ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-key' ? '✅ OpenAI GPT-4o-mini' : '⚠️  Fallback parser (no OpenAI)'}    ║
║  WA:   ${process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TOKEN !== 'your-whatsapp-token' ? '✅ WhatsApp connected' : '⚠️  Simulated (no WhatsApp)'}     ║
╚═══════════════════════════════════════════╝
    `);
});

export default app;
