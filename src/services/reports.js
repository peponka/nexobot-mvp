// =============================================
// NexoBot MVP — PDF Report Service
// =============================================
// Generates monthly PDF reports for merchants.
// Can be triggered by:
//   - WhatsApp: "mi reporte", "reporte mensual"
//   - Dashboard: /api/reports/:merchantId
// 
// Report includes:
//   - Business info header
//   - Monthly sales summary (cash vs credit)
//   - Top customers (by sales volume)
//   - Outstanding debts list
//   - NexoScore overview
//   - Transaction history

import PDFDocument from 'pdfkit';
import supabase from '../config/supabase.js';

function formatPYG(amount) {
    if (!amount || amount === 0) return 'Gs. 0';
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('es-PY', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// =============================================
// CORE: Generate PDF report
// =============================================

/**
 * Generate a monthly PDF report for a merchant
 * @param {string} merchantId - Merchant UUID
 * @param {number} month - Month (0-11)
 * @param {number} year - Full year
 * @returns {Buffer} PDF buffer
 */
export async function generateReport(merchantId, month = null, year = null) {
    if (!supabase) throw new Error('Database not available');

    const now = new Date();
    if (month === null) month = now.getMonth();
    if (year === null) year = now.getFullYear();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const monthName = MONTHS_ES[month];

    // Fetch all data in parallel
    const [merchantRes, txRes, customersRes, scoreRes] = await Promise.all([
        supabase.from('merchants').select('*').eq('id', merchantId).single(),
        supabase.from('transactions')
            .select('*')
            .eq('merchant_id', merchantId)
            .gte('created_at', monthStart.toISOString())
            .lte('created_at', monthEnd.toISOString())
            .order('created_at', { ascending: false }),
        supabase.from('merchant_customers')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('total_debt', { ascending: false }),
        supabase.from('nexo_scores')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false })
            .limit(1)
    ]);

    const merchant = merchantRes.data;
    const transactions = txRes.data || [];
    const customers = customersRes.data || [];
    const latestScore = scoreRes.data?.[0];

    if (!merchant) throw new Error('Merchant not found');

    // Calculate statistics
    const salesCash = transactions.filter(t => t.type === 'SALE_CASH');
    const salesCredit = transactions.filter(t => t.type === 'SALE_CREDIT');
    const payments = transactions.filter(t => t.type === 'PAYMENT');

    const totalSalesCash = salesCash.reduce((s, t) => s + t.amount, 0);
    const totalSalesCredit = salesCredit.reduce((s, t) => s + t.amount, 0);
    const totalSales = totalSalesCash + totalSalesCredit;
    const totalCollected = payments.reduce((s, t) => s + t.amount, 0);
    const totalDebt = customers.reduce((s, c) => s + (c.total_debt > 0 ? c.total_debt : 0), 0);
    const debtors = customers.filter(c => c.total_debt > 0);

    // Generate PDF
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 },
            info: {
                Title: `Reporte ${monthName} ${year} - ${merchant.business_name || merchant.name}`,
                Author: 'NexoBot - NexoFinanzas',
                Subject: 'Reporte Mensual de Negocio'
            }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 100; // margins

        // -----------------------------------------------
        // HEADER
        // -----------------------------------------------
        doc.fontSize(24).font('Helvetica-Bold').text('NexoFinanzas', 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
            .text('Reporte generado por NexoBot', 50, 78);

        doc.moveTo(50, 95).lineTo(545, 95).stroke('#6C5CE7');

        // Business info
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
            .text(merchant.business_name || merchant.name || 'Comerciante', 50, 110);
        doc.fontSize(10).font('Helvetica').fillColor('#444444');
        doc.text(`📞 ${merchant.phone}`, 50, 132);
        if (merchant.city) doc.text(`📍 ${merchant.city}`, 200, 132);
        if (merchant.cedula) doc.text(`🪪 CI: ${merchant.cedula}`, 350, 132);

        // Report period
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#6C5CE7')
            .text(`Reporte de ${monthName} ${year}`, 50, 158);

        let y = 185;

        // -----------------------------------------------
        // KPIs
        // -----------------------------------------------
        const kpiBoxWidth = pageWidth / 4 - 8;
        const kpis = [
            { label: 'Ventas Totales', value: formatPYG(totalSales), color: '#27AE60' },
            { label: 'Al Contado', value: formatPYG(totalSalesCash), color: '#2980B9' },
            { label: 'Fiado', value: formatPYG(totalSalesCredit), color: '#E67E22' },
            { label: 'Cobrado', value: formatPYG(totalCollected), color: '#8E44AD' }
        ];

        kpis.forEach((kpi, i) => {
            const x = 50 + i * (kpiBoxWidth + 10);
            doc.rect(x, y, kpiBoxWidth, 55).fill('#F8F9FA').stroke('#EEEEEE');
            doc.fontSize(8).font('Helvetica').fillColor('#666666')
                .text(kpi.label, x + 8, y + 8, { width: kpiBoxWidth - 16 });
            doc.fontSize(11).font('Helvetica-Bold').fillColor(kpi.color)
                .text(kpi.value, x + 8, y + 24, { width: kpiBoxWidth - 16 });
        });

        y += 75;

        // -----------------------------------------------
        // OPERATIONS SUMMARY
        // -----------------------------------------------
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000')
            .text('Resumen de Operaciones', 50, y);
        y += 20;

        doc.fontSize(10).font('Helvetica').fillColor('#333333');
        doc.text(`• Total de operaciones: ${transactions.length}`, 60, y); y += 16;
        doc.text(`• Ventas al contado: ${salesCash.length} operaciones`, 60, y); y += 16;
        doc.text(`• Ventas a crédito (fiado): ${salesCredit.length} operaciones`, 60, y); y += 16;
        doc.text(`• Cobros registrados: ${payments.length} operaciones`, 60, y); y += 16;

        if (totalSales > 0) {
            const cashPct = Math.round((totalSalesCash / totalSales) * 100);
            doc.text(`• Mix: ${cashPct}% contado / ${100 - cashPct}% fiado`, 60, y); y += 16;
        }

        y += 10;

        // -----------------------------------------------
        // TOP CUSTOMERS
        // -----------------------------------------------
        if (customers.length > 0) {
            doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000')
                .text('Clientes Principales', 50, y);
            y += 20;

            // Table header
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666');
            doc.text('Cliente', 60, y);
            doc.text('Ventas', 250, y);
            doc.text('Deuda', 350, y);
            doc.text('Riesgo', 450, y);
            y += 4;
            doc.moveTo(50, y + 10).lineTo(545, y + 10).stroke('#EEEEEE');
            y += 16;

            // Table rows (top 10)
            doc.font('Helvetica').fillColor('#333333');
            const topCustomers = customers.slice(0, 10);
            for (const customer of topCustomers) {
                if (y > 720) {
                    doc.addPage();
                    y = 50;
                }
                doc.fontSize(9);
                doc.text(customer.name, 60, y, { width: 180 });
                doc.text(formatPYG(customer.total_paid), 250, y);
                doc.text(customer.total_debt > 0 ? formatPYG(customer.total_debt) : '-', 350, y);
                const riskColor = customer.risk_level === 'high' ? '#E74C3C' :
                    customer.risk_level === 'medium' ? '#F39C12' : '#27AE60';
                doc.fillColor(riskColor).text(
                    customer.risk_level === 'high' ? 'Alto' :
                        customer.risk_level === 'medium' ? 'Medio' : 'Bajo',
                    450, y
                );
                doc.fillColor('#333333');
                y += 18;
            }
            y += 10;
        }

        // -----------------------------------------------
        // OUTSTANDING DEBTS
        // -----------------------------------------------
        if (debtors.length > 0) {
            if (y > 650) { doc.addPage(); y = 50; }

            doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000')
                .text('Deudas Pendientes', 50, y);
            y += 6;
            doc.fontSize(10).font('Helvetica').fillColor('#E74C3C')
                .text(`Total pendiente: ${formatPYG(totalDebt)} (${debtors.length} deudores)`, 50, y + 14);
            y += 36;

            doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666');
            doc.text('Cliente', 60, y);
            doc.text('Monto', 300, y);
            doc.text('Días', 420, y);
            y += 4;
            doc.moveTo(50, y + 10).lineTo(545, y + 10).stroke('#EEEEEE');
            y += 16;

            doc.font('Helvetica').fillColor('#333333');
            for (const debtor of debtors.slice(0, 15)) {
                if (y > 720) { doc.addPage(); y = 50; }

                const daysSince = debtor.last_transaction_at
                    ? Math.floor((new Date() - new Date(debtor.last_transaction_at)) / (1000 * 60 * 60 * 24))
                    : '?';

                doc.fontSize(9);
                doc.text(debtor.name, 60, y, { width: 230 });
                doc.fillColor('#E74C3C').text(formatPYG(debtor.total_debt), 300, y);
                doc.fillColor('#666666').text(`${daysSince} días`, 420, y);
                doc.fillColor('#333333');
                y += 18;
            }
            y += 10;
        }

        // -----------------------------------------------
        // NEXO SCORE
        // -----------------------------------------------
        if (latestScore) {
            if (y > 650) { doc.addPage(); y = 50; }

            doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000')
                .text('NexoScore', 50, y);
            y += 22;

            const score = latestScore.score;
            const tier = score >= 700 ? 'A' : score >= 550 ? 'B' : score >= 400 ? 'C' : 'D';
            const tierColor = tier === 'A' ? '#27AE60' : tier === 'B' ? '#2980B9' :
                tier === 'C' ? '#F39C12' : '#E74C3C';

            doc.fontSize(36).font('Helvetica-Bold').fillColor(tierColor)
                .text(`${score}`, 60, y);
            doc.fontSize(14).font('Helvetica').fillColor(tierColor)
                .text(`Tier ${tier}`, 130, y + 10);
            doc.fontSize(9).font('Helvetica').fillColor('#666666')
                .text(`Actualizado: ${formatDate(latestScore.created_at)}`, 200, y + 12);
            y += 50;
        }

        // -----------------------------------------------
        // FOOTER
        // -----------------------------------------------
        const footerY = doc.page.height - 60;
        doc.fontSize(8).font('Helvetica').fillColor('#999999');
        doc.text(
            `Reporte generado por NexoBot el ${formatDate(new Date())} · nexofinanzas.com · Datos confidenciales`,
            50, footerY, { align: 'center', width: pageWidth }
        );

        doc.end();
    });
}

/**
 * Get the WhatsApp-friendly message about the report
 */
export function getReportMessage(merchantName, month, year) {
    const monthName = MONTHS_ES[month];
    return `📄 *Tu reporte de ${monthName} ${year}* está listo!\n\n` +
        `Descargalo desde tu dashboard:\n` +
        `🔗 nexobot-mvp-1.onrender.com/app.html\n\n` +
        `O pedí el link escribiendo *"link reporte"*`;
}

export default { generateReport, getReportMessage };
