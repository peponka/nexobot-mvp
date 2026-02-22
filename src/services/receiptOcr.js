// =============================================
// NexoBot MVP — Receipt/Invoice OCR Handler
// =============================================
// When a merchant sends a photo (not during onboarding),
// we try to extract invoice data and auto-register
// the transaction.

import supabase from '../config/supabase.js';
import { downloadWhatsAppImage, extractInvoiceData } from './ocr.js';

/**
 * Format amount in Guaraníes
 */
function formatPYG(amount) {
    if (!amount || amount === 0) return 'Gs. 0';
    if (amount >= 1000000) return `Gs. ${(amount / 1000000).toFixed(1)} millones`;
    if (amount >= 1000) return `Gs. ${Math.round(amount / 1000)} mil`;
    return `Gs. ${amount}`;
}

/**
 * Process a receipt/invoice photo sent by a merchant
 * Downloads the image, runs OCR, and returns extracted data
 * 
 * @param {Object} merchant - Merchant object with id, phone
 * @param {Object} imageData - WhatsApp image data with mediaId
 * @returns {string} Bot response with extracted data
 */
export async function handleReceiptPhoto(merchant, imageData) {
    try {
        // Download image from WhatsApp
        const imageDataUrl = await downloadWhatsAppImage(imageData.mediaId);

        if (!imageDataUrl) {
            return `⚠️ No pude descargar la imagen. Intentá de nuevo.\n\n` +
                `_Si querés registrar una compra manualmente, escribí:_\n` +
                `_"Me llegó 50 unidades de aceite a 15mil c/u"_`;
        }

        // Run invoice OCR
        const ocrResult = await extractInvoiceData(imageDataUrl);

        if (!ocrResult || !ocrResult.es_factura) {
            return `📸 Recibí tu foto pero *no reconozco una factura o boleta*.\n\n` +
                `Podés enviarme fotos de:\n` +
                `📄 Facturas de proveedores\n` +
                `🧾 Remitos de entrega\n` +
                `🎫 Tickets de compra\n\n` +
                `_O registrá manualmente: "Me llegó mercadería de 500 mil"_`;
        }

        // Build confirmation message
        const confianza = Math.round((ocrResult.confianza || 0) * 100);
        let msg = `📄 *¡Boleta escaneada!* (${confianza}% confianza)\n\n`;

        msg += `📋 Tipo: *${ocrResult.tipo || 'factura'}*\n`;
        if (ocrResult.proveedor) msg += `🏢 Proveedor: *${ocrResult.proveedor}*\n`;
        if (ocrResult.ruc) msg += `📝 RUC: ${ocrResult.ruc}\n`;
        if (ocrResult.fecha) msg += `📅 Fecha: ${ocrResult.fecha}\n`;

        const monto = ocrResult.monto_total || 0;
        const moneda = ocrResult.moneda || 'PYG';
        msg += `💰 Total: *${moneda === 'PYG' ? formatPYG(monto) : `USD ${monto}`}*\n`;

        // Show items if available
        if (ocrResult.items && ocrResult.items.length > 0) {
            msg += `\n📦 *Productos:*\n`;
            for (const item of ocrResult.items.slice(0, 8)) {
                msg += `  • ${item.producto}`;
                if (item.cantidad) msg += ` × ${item.cantidad}`;
                if (item.precio) msg += ` (${formatPYG(item.precio)} c/u)`;
                msg += `\n`;
            }
            if (ocrResult.items.length > 8) {
                msg += `  _... y ${ocrResult.items.length - 8} más_\n`;
            }
        }

        msg += `\n━━━━━━━━━━━━━━━━━━\n`;

        // Auto-register as inventory if we have items
        if (ocrResult.items && ocrResult.items.length > 0 && supabase) {
            let registered = 0;
            for (const item of ocrResult.items) {
                if (item.producto && item.cantidad) {
                    const { error } = await supabase
                        .from('inventory')
                        .upsert({
                            merchant_id: merchant.id,
                            product: item.producto.substring(0, 100),
                            stock: item.cantidad,
                            avg_price: item.precio || 0,
                            last_restocked_at: new Date().toISOString()
                        }, {
                            onConflict: 'merchant_id,product',
                            ignoreDuplicates: false
                        });

                    if (!error) registered++;
                }
            }

            if (registered > 0) {
                msg += `✅ *${registered} productos* registrados en tu inventario\n\n`;
            }
        }

        // Record the transaction
        if (monto > 0 && supabase) {
            await supabase.from('transactions').insert({
                merchant_id: merchant.id,
                type: 'EXPENSE',
                amount: monto,
                currency: moneda,
                product: ocrResult.proveedor || 'Compra con factura',
                raw_message: `OCR: ${ocrResult.tipo} - ${ocrResult.proveedor || 'proveedor'}`,
                parsed_intent: 'OCR_RECEIPT',
                parsed_confidence: ocrResult.confianza || 0,
                parsed_entities: ocrResult
            });

            msg += `📝 Compra de *${formatPYG(monto)}* registrada automáticamente\n`;
        }

        msg += `\n_Si algo no está bien, escribí "anular última"_`;

        return msg;

    } catch (error) {
        console.error('❌ Receipt OCR error:', error);
        return `⚠️ Hubo un error procesando la imagen.\n\n` +
            `_Podés registrar la compra manualmente:_\n` +
            `_"Me llegó mercadería de 500 mil"_`;
    }
}

export default { handleReceiptPhoto };
