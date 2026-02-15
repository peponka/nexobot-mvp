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

        return {
            messageId: message.id,
            from: message.from,
            timestamp: message.timestamp,
            type: message.type,
            text: message.text?.body || '',
            contactName: contact?.profile?.name || 'Unknown',
            phoneNumberId: value.metadata?.phone_number_id
        };
    } catch (error) {
        console.error('Failed to extract message:', error.message);
        return null;
    }
}

export default { sendMessage, markAsRead, extractMessageFromWebhook };
