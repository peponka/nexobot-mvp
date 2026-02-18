// =============================================
// NexoBot MVP — OCR Service (Cédula + Facturas)
// =============================================
// Uses GPT-4 Vision to extract data from images
// sent via WhatsApp (cédula photos, invoices, etc.)

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

// =============================================
// DOWNLOAD IMAGE from WhatsApp
// =============================================

/**
 * Download a media file from WhatsApp Business API
 * WhatsApp images come as media IDs — we need to:
 * 1. GET the media URL from Meta
 * 2. Download the actual image bytes
 * 3. Convert to base64 for GPT-4 Vision
 *
 * @param {string} mediaId - WhatsApp media ID
 * @returns {string|null} Base64 data URL for the image
 */
export async function downloadWhatsAppImage(mediaId) {
    const token = process.env.WHATSAPP_TOKEN;

    if (!token || token === 'your-whatsapp-token') {
        console.log('⚠️ OCR: WhatsApp not configured, cannot download image');
        return null;
    }

    try {
        // Step 1: Get the media URL from Meta
        const mediaRes = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const mediaData = await mediaRes.json();

        if (!mediaData.url) {
            console.error('❌ OCR: No URL in media response:', mediaData);
            return null;
        }

        // Step 2: Download the actual image
        const imageRes = await fetch(mediaData.url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!imageRes.ok) {
            console.error('❌ OCR: Failed to download image:', imageRes.status);
            return null;
        }

        const imageBuffer = await imageRes.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = mediaData.mime_type || 'image/jpeg';

        console.log(`📸 OCR: Image downloaded (${Math.round(imageBuffer.byteLength / 1024)}KB, ${mimeType})`);

        return `data:${mimeType};base64,${base64}`;

    } catch (error) {
        console.error('❌ OCR: Image download error:', error.message);
        return null;
    }
}

// =============================================
// OCR: Extract data from Cédula photo
// =============================================

/**
 * Extract personal data from a Paraguayan cédula (ID card) photo
 * Uses GPT-4 Vision to read the document
 *
 * @param {string} imageDataUrl - Base64 data URL of the image
 * @returns {Object|null} Extracted cédula data
 */
export async function extractCedulaData(imageDataUrl) {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-key') {
        console.log('⚠️ OCR: OpenAI not configured');
        return null;
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Analizá esta imagen de una cédula de identidad paraguaya.
Extraé TODOS los datos visibles. Respondé SOLO con JSON válido, sin markdown.

Formato exacto:
{
  "es_cedula": true/false,
  "nombre_completo": "...",
  "numero_cedula": "solo dígitos sin puntos",
  "fecha_nacimiento": "DD/MM/YYYY o null",
  "sexo": "M" o "F" o null,
  "nacionalidad": "...",
  "direccion": "si visible, o null",
  "fecha_emision": "DD/MM/YYYY o null",
  "fecha_vencimiento": "DD/MM/YYYY o null",
  "confianza": 0.0 a 1.0,
  "observaciones": "cualquier detalle relevante"
}

Si la imagen NO es una cédula, respondé: { "es_cedula": false, "observaciones": "descripción de qué es la imagen" }`
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: imageDataUrl,
                            detail: 'high'
                        }
                    }
                ]
            }],
            max_tokens: 500,
            temperature: 0.1
        });

        const content = response.choices[0].message.content.trim();

        // Clean markdown code blocks if present
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        console.log(`📸 OCR Cédula: ${parsed.es_cedula ? `✅ ${parsed.nombre_completo} (CI: ${parsed.numero_cedula})` : '❌ No es cédula'}`);

        return parsed;

    } catch (error) {
        console.error('❌ OCR Cédula error:', error.message);
        return null;
    }
}

// =============================================
// OCR: Extract data from invoice/receipt photo
// =============================================

/**
 * Extract data from a Paraguayan invoice or receipt
 * Future use for automatic transaction recording
 *
 * @param {string} imageDataUrl - Base64 data URL of the image
 * @returns {Object|null} Extracted invoice data
 */
export async function extractInvoiceData(imageDataUrl) {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-key') {
        return null;
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Analizá esta imagen de una factura/remito/recibo paraguayo.
Extraé los datos. Respondé SOLO con JSON válido, sin markdown.

{
  "es_factura": true/false,
  "tipo": "factura" | "remito" | "recibo" | "ticket" | "otro",
  "proveedor": "nombre del emisor",
  "ruc": "RUC si visible",
  "monto_total": número sin separadores,
  "moneda": "PYG" o "USD",
  "fecha": "DD/MM/YYYY o null",
  "items": [{"producto": "...", "cantidad": N, "precio": N}],
  "confianza": 0.0 a 1.0
}`
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: imageDataUrl,
                            detail: 'high'
                        }
                    }
                ]
            }],
            max_tokens: 800,
            temperature: 0.1
        });

        const content = response.choices[0].message.content.trim();
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error('❌ OCR Invoice error:', error.message);
        return null;
    }
}

export default { downloadWhatsAppImage, extractCedulaData, extractInvoiceData };
