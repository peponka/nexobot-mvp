// =============================================
// NexoBot MVP — Excel Export Service
// =============================================
// Generates Excel (.xlsx) files for merchants.
// Available exports:
//   - Ventas del mes
//   - Lista de deudores
//   - Historial completo
// 
// Triggered via WhatsApp or Dashboard API

import ExcelJS from 'exceljs';
import supabase from '../config/supabase.js';

const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// =============================================
// EXPORT: Monthly Sales
// =============================================

/**
 * Generate Excel with monthly sales data
 * @returns {Buffer} Excel file buffer
 */
export async function exportSales(merchantId, month = null, year = null) {
    if (!supabase) throw new Error('Database not available');

    const now = new Date();
    if (month === null) month = now.getMonth();
    if (year === null) year = now.getFullYear();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    // Fetch data
    const [merchantRes, txRes] = await Promise.all([
        supabase.from('merchants').select('*').eq('id', merchantId).single(),
        supabase.from('transactions')
            .select('*, merchant_customers(name)')
            .eq('merchant_id', merchantId)
            .gte('created_at', monthStart.toISOString())
            .lte('created_at', monthEnd.toISOString())
            .order('created_at', { ascending: false })
    ]);

    const merchant = merchantRes.data;
    const transactions = txRes.data || [];

    // Create workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'NexoBot';
    wb.created = new Date();

    // ── Sheet 1: Ventas ──
    const ws = wb.addWorksheet('Ventas', {
        properties: { tabColor: { argb: '6C5CE7' } }
    });

    // Header
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `Ventas - ${merchant?.business_name || 'Negocio'} - ${MONTHS_ES[month]} ${year}`;
    ws.getCell('A1').font = { size: 16, bold: true, color: { argb: '6C5CE7' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `Generado por NexoBot el ${new Date().toLocaleDateString('es-PY')}`;
    ws.getCell('A2').font = { size: 10, color: { argb: '888888' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    // Column headers
    ws.getRow(4).values = ['Fecha', 'Hora', 'Tipo', 'Cliente', 'Producto', 'Monto (Gs.)', 'Estado'];
    ws.getRow(4).font = { bold: true, color: { argb: 'FFFFFF' } };
    ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '6C5CE7' } };

    ws.columns = [
        { key: 'fecha', width: 14 },
        { key: 'hora', width: 10 },
        { key: 'tipo', width: 16 },
        { key: 'cliente', width: 22 },
        { key: 'producto', width: 20 },
        { key: 'monto', width: 18 },
        { key: 'status', width: 14 }
    ];

    // Data rows
    let totalCash = 0, totalCredit = 0, totalPayments = 0;

    transactions.forEach((tx, i) => {
        const date = new Date(tx.created_at);
        const typeLabels = {
            'SALE_CASH': 'Venta Contado',
            'SALE_CREDIT': 'Venta Fiado',
            'PAYMENT': 'Cobro',
            'EXPENSE': 'Gasto'
        };

        const row = ws.addRow({
            fecha: date.toLocaleDateString('es-PY'),
            hora: date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }),
            tipo: typeLabels[tx.type] || tx.type,
            cliente: tx.merchant_customers?.name || '-',
            producto: tx.product || '-',
            monto: tx.amount,
            status: tx.status || 'confirmado'
        });

        // Number format for amount
        row.getCell(6).numFmt = '#,##0';

        // Color by type
        if (tx.type === 'SALE_CASH') {
            totalCash += tx.amount;
            row.getCell(3).font = { color: { argb: '27AE60' } };
        } else if (tx.type === 'SALE_CREDIT') {
            totalCredit += tx.amount;
            row.getCell(3).font = { color: { argb: 'E67E22' } };
        } else if (tx.type === 'PAYMENT') {
            totalPayments += tx.amount;
            row.getCell(3).font = { color: { argb: '2980B9' } };
        }

        // Alternate row color
        if (i % 2 === 0) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8F8FA' } };
            });
        }
    });

    // Summary row
    const summaryRow = ws.addRow([]);
    ws.addRow([]);
    const s1 = ws.addRow(['', '', '', '', 'Ventas Contado:', totalCash]);
    s1.getCell(6).numFmt = '#,##0';
    s1.font = { bold: true };

    const s2 = ws.addRow(['', '', '', '', 'Ventas Fiado:', totalCredit]);
    s2.getCell(6).numFmt = '#,##0';

    const s3 = ws.addRow(['', '', '', '', 'TOTAL VENTAS:', totalCash + totalCredit]);
    s3.getCell(6).numFmt = '#,##0';
    s3.font = { bold: true, size: 13, color: { argb: '6C5CE7' } };

    const s4 = ws.addRow(['', '', '', '', 'Cobrado:', totalPayments]);
    s4.getCell(6).numFmt = '#,##0';
    s4.font = { color: { argb: '27AE60' } };

    // Auto-filter
    ws.autoFilter = { from: 'A4', to: 'G4' };

    // Return buffer
    return await wb.xlsx.writeBuffer();
}

// =============================================
// EXPORT: Debtors List
// =============================================

export async function exportDebtors(merchantId) {
    if (!supabase) throw new Error('Database not available');

    const [merchantRes, customersRes] = await Promise.all([
        supabase.from('merchants').select('*').eq('id', merchantId).single(),
        supabase.from('merchant_customers')
            .select('*')
            .eq('merchant_id', merchantId)
            .gt('total_debt', 0)
            .order('total_debt', { ascending: false })
    ]);

    const merchant = merchantRes.data;
    const debtors = customersRes.data || [];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'NexoBot';

    const ws = wb.addWorksheet('Deudores', {
        properties: { tabColor: { argb: 'E74C3C' } }
    });

    // Header
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `Lista de Deudores - ${merchant?.business_name || 'Negocio'}`;
    ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'E74C3C' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `Generado el ${new Date().toLocaleDateString('es-PY')} — ${debtors.length} deudores`;
    ws.getCell('A2').font = { size: 10, color: { argb: '888888' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    // Columns
    ws.getRow(4).values = ['#', 'Cliente', 'Teléfono', 'Deuda (Gs.)', 'Riesgo', 'Última Transacción'];
    ws.getRow(4).font = { bold: true, color: { argb: 'FFFFFF' } };
    ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E74C3C' } };

    ws.columns = [
        { width: 6 },
        { width: 24 },
        { width: 18 },
        { width: 18 },
        { width: 12 },
        { width: 20 }
    ];

    let totalDebt = 0;

    debtors.forEach((d, i) => {
        totalDebt += d.total_debt;
        const lastTx = d.last_transaction_at
            ? new Date(d.last_transaction_at).toLocaleDateString('es-PY')
            : 'Sin datos';

        const row = ws.addRow([
            i + 1,
            d.name,
            d.phone || '-',
            d.total_debt,
            d.risk_level === 'high' ? 'ALTO' : d.risk_level === 'medium' ? 'MEDIO' : 'BAJO',
            lastTx
        ]);

        row.getCell(4).numFmt = '#,##0';

        // Color risk
        const riskColor = d.risk_level === 'high' ? 'E74C3C' :
            d.risk_level === 'medium' ? 'F39C12' : '27AE60';
        row.getCell(5).font = { bold: true, color: { argb: riskColor } };

        if (i % 2 === 0) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5' } };
            });
        }
    });

    // Total
    ws.addRow([]);
    const totalRow = ws.addRow(['', '', 'TOTAL DEUDA:', totalDebt]);
    totalRow.getCell(4).numFmt = '#,##0';
    totalRow.font = { bold: true, size: 14, color: { argb: 'E74C3C' } };

    ws.autoFilter = { from: 'A4', to: 'F4' };

    return await wb.xlsx.writeBuffer();
}

export default { exportSales, exportDebtors };
