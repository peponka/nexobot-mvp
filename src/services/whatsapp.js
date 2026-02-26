// =============================================
// NexoBot MVP — WhatsApp Service
// =============================================
// Handles sending messages via Meta WhatsApp Business API

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

/**
 * Send a text message via WhatsApp
 * @param {string} to - Phone number (with country code)
 * @param {string} message - Message text
 */
export async function sendMessage(to, message) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;

    if (!token || token === 'your-whatsapp-token') {
        console.log(`📱 [SIMULATED] To: ${to}`);
        console.log(`   Message: ${message.substring(0, 100)}...`);
        return { simulated: true, to, message };
    }

    try {
        const response = await fetch(
            `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: message
                    }
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            console.error('❌ WhatsApp API Error:', data.error);
            throw new Error(data.error.message);
        }

        console.log(`✅ Message sent to ${to} [ID: ${data.messages?.[0]?.id}]`);
        return data;
    } catch (error) {
        console.error('❌ WhatsApp send error:', error.message);
        throw error;
    }
}

/**
 * Send an audio message via WhatsApp by uploading the media buffer
 * @param {string} to - Phone number
 * @param {Buffer} audioBuffer - Audio data as a Buffer
 * @param {string} mimeType - Media type (audio/ogg)
 */
export async function sendAudioMessage(to, audioBuffer, mimeType = 'audio/ogg') {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;

    if (!token || token === 'your-whatsapp-token') {
        console.log(`📱 [SIMULATED AUDIO] To: ${to}`);
        return { simulated: true, to, audio: true };
    }

    try {
        console.log(`📤 Uploading audio to Meta (${audioBuffer.length} bytes)...`);

        // 1. Upload media to WhatsApp
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');

        // Use global Blob for Node 18+ to attach binary data to global FormData
        const blob = new Blob([audioBuffer], { type: mimeType });
        const ext = mimeType.includes('mpeg') ? 'mp3' : 'ogg';
        formData.append('file', blob, `audio.${ext}`);

        const uploadRes = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
            // The global fetch automatically generates the multipart boundary
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error.message);
        const mediaId = uploadData.id;

        console.log(`✅ Media Uploaded! ID: ${mediaId}`);

        // 2. Send media ID as message
        console.log(`📬 Sending audio message...`);
        const sendRes = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'audio',
                audio: {
                    id: mediaId
                }
            })
        });

        const sendData = await sendRes.json();
        if (sendData.error) throw new Error(sendData.error.message);

        console.log(`✅ Audio message sent to ${to} [ID: ${sendData.messages?.[0]?.id}]`);
        return sendData;
    } catch (error) {
        console.error('❌ WhatsApp send audio error:', error.message);
        throw error;
    }
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;

    if (!token || token === 'your-whatsapp-token') return;

    try {
        await fetch(
            `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    status: 'read',
                    message_id: messageId
                })
            }
        );
    } catch (error) {
        console.error('Failed to mark as read:', error.message);
    }
}

/**
 * Extract message data from webhook payload
 */
export function extractMessageFromWebhook(body) {
    try {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value?.messages?.[0]) return null;

        const message = value.messages[0];
        const contact = value.contacts?.[0];

        const result = {
            messageId: message.id,
            from: message.from,
            timestamp: message.timestamp,
            type: message.type,
            text: message.text?.body || '',
            contactName: contact?.profile?.name || 'Unknown',
            phoneNumberId: value.metadata?.phone_number_id
        };

        // Extract image data if present
        if (message.type === 'image' && message.image) {
            result.image = {
                id: message.image.id,
                mimeType: message.image.mime_type,
                sha256: message.image.sha256,
                caption: message.image.caption || ''
            };
        }

        // Extract audio data if present
        if (message.type === 'audio' && message.audio) {
            result.audio = {
                id: message.audio.id,
                mimeType: message.audio.mime_type
            };
        }

        return result;
    } catch (error) {
        console.error('Failed to extract message:', error.message);
        return null;
    }
}

export default { sendMessage, sendAudioMessage, markAsRead, extractMessageFromWebhook };
