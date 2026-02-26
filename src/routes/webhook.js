// =============================================
// NexoBot MVP — Webhook Routes
// =============================================
// Handles Meta WhatsApp Business API webhooks

import { Router } from 'express';
import { processMessage } from '../services/nlp.js';
import { handleMessage } from '../services/bot.js';
import { sendMessage, sendAudioMessage, markAsRead, extractMessageFromWebhook } from '../services/whatsapp.js';
import { expectsImage } from '../services/onboarding.js';
import { transcribeAudio } from '../services/audio.js';
import { generateAudioFromText } from '../services/tts.js';

const router = Router();

// In-memory cache to prevent processing the same message twice (Meta retries)
const processedMessages = new Set();
// Clean up old messages every hour to prevent memory leaks
setInterval(() => processedMessages.clear(), 60 * 60 * 1000);

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

        if (!messageData) return;

        // Idempotency check: Don't process the same message twice
        if (processedMessages.has(messageData.messageId)) {
            console.log(`♻️ Skipping already processed message: ${messageData.messageId}`);
            return;
        }
        processedMessages.add(messageData.messageId);

        // Handle image messages (cédula photos during onboarding)
        if (messageData.type === 'image') {
            console.log(`\n📸 Image from ${messageData.from} (${messageData.image?.mimeType})`);

            // Check if this user is in onboarding and expects an image
            if (expectsImage(messageData.from)) {
                await markAsRead(messageData.messageId);

                const response = await handleMessage(
                    messageData.from,
                    messageData.contactName,
                    messageData.image?.caption || '[Foto de cédula]',
                    { intent: 'IMAGE_CEDULA', entities: {}, confidence: 1 },
                    { mediaId: messageData.image?.id, mimeType: messageData.image?.mimeType }
                );

                await sendMessage(messageData.from, response);
                console.log(`📤 Response sent to ${messageData.from}`);
            } else {
                // Image received outside onboarding — send helpful message
                await markAsRead(messageData.messageId);
                await sendMessage(messageData.from,
                    `📸 Recibí tu imagen, pero por ahora solo proceso fotos de *cédula* durante el registro.\n\n` +
                    `Pronto podré leer facturas y remitos también. 🚀\n\n` +
                    `Para registrar operaciones, escribime. Ej:\n` +
                    `_"Vendí 500 mil a Carlos, fiado"_`
                );
            }
            return;
        }

        if (messageData.type === 'audio') {
            await markAsRead(messageData.messageId);
            try {
                // Send "typing..." or acknowledgement optionally
                const transcriptionText = await transcribeAudio(messageData.audio.id);
                console.log(`\n🎧 Audio from ${messageData.from} transcribed to: "${transcriptionText}"`);

                if (!transcriptionText || transcriptionText.trim() === '') {
                    await sendMessage(messageData.from, "🎙️ No pude escuchar lo que dijiste. ¿Podés repetirme o escribirlo?");
                    return;
                }

                messageData.text = transcriptionText; // Treat the transcribed text as if they typed it
            } catch (error) {
                console.error('Audio transcription error:', error);
                await sendMessage(messageData.from, "⚠️ Hubo un error al procesar tu audio. Por favor, escribime el mensaje.");
                return;
            }
        } else if (messageData.type !== 'text') {
            return; // Ignore other message types (video, document, etc.)
        }

        console.log(`\n📩 From ${messageData.from}: "${messageData.text}"`);

        await markAsRead(messageData.messageId);

        const parsed = await processMessage(messageData.text);

        const response = await handleMessage(
            messageData.from,
            messageData.contactName,
            messageData.text,
            parsed
        );

        // Always send text
        await sendMessage(messageData.from, response);
        console.log(`📤 Response sent to ${messageData.from}`);

        // If user sent audio, let's reply with audio too!
        if (messageData.type === 'audio') {
            try {
                // Remove some heavy emojis for TTS if needed, or just send directly
                const audioResponseBuffer = await generateAudioFromText(response);
                await sendAudioMessage(messageData.from, audioResponseBuffer, 'audio/mpeg');
            } catch (ttsError) {
                console.error('❌ Error sending audio reply:', ttsError);
            }
        }

    } catch (error) {
        console.error('❌ Webhook processing error:', error);
    }
});

export default router;
