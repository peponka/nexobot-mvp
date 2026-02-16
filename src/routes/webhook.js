// =============================================
// NexoBot MVP — Webhook Routes
// =============================================
// Handles Meta WhatsApp Business API webhooks

import { Router } from 'express';
import { processMessage } from '../services/nlp.js';
import { handleMessage } from '../services/bot.js';
import { sendMessage, markAsRead, extractMessageFromWebhook } from '../services/whatsapp.js';

const router = Router();

/**
 * GET /webhook — Verification endpoint (required by Meta)
 */
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'nexobot-verify-2026';

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verified');
        return res.status(200).send(challenge);
    }

    console.warn('❌ Webhook verification failed');
    return res.sendStatus(403);
});

/**
 * POST /webhook — Receive messages from WhatsApp
 */
router.post('/', async (req, res) => {
    // Always respond 200 quickly (Meta requires < 5s)
    res.sendStatus(200);

    console.log('\n🔔 WEBHOOK RECEIVED:', JSON.stringify(req.body, null, 2));

    try {
        const messageData = extractMessageFromWebhook(req.body);

        if (!messageData || messageData.type !== 'text') {
            return; // Ignore non-text messages for now
        }

        console.log(`\n📩 From ${messageData.from}: "${messageData.text}"`);

        // Mark as read immediately
        await markAsRead(messageData.messageId);

        // Process with NLP
        const parsed = await processMessage(messageData.text);

        // Handle business logic
        const response = await handleMessage(
            messageData.from,
            messageData.contactName,
            messageData.text,
            parsed
        );

        // Send response via WhatsApp
        await sendMessage(messageData.from, response);

        console.log(`📤 Response sent to ${messageData.from}`);

    } catch (error) {
        console.error('❌ Webhook processing error:', error);
    }
});

export default router;
