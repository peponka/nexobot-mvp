// =============================================
// NexoBot MVP — Reports API Routes
// =============================================
// Endpoints for generating and downloading PDF reports

import { Router } from 'express';
import { generateReport } from '../services/reports.js';
import supabase from '../config/supabase.js';

const router = Router();

// -----------------------------------------------
// GET /api/reports/:merchantId — Download PDF report
// -----------------------------------------------
router.get('/:merchantId', async (req, res) => {
    try {
        const { merchantId } = req.params;
        const month = req.query.month ? parseInt(req.query.month) : null;
        const year = req.query.year ? parseInt(req.query.year) : null;

        const pdfBuffer = await generateReport(merchantId, month, year);

        const now = new Date();
        const m = month !== null ? month : now.getMonth();
        const y = year !== null ? year : now.getFullYear();
        const filename = `reporte-nexobot-${y}-${String(m + 1).padStart(2, '0')}.pdf`;

        // Track download
        if (supabase) {
            await supabase.from('generated_reports').insert({
                merchant_id: merchantId,
                report_type: 'monthly',
                period: `${y}-${String(m + 1).padStart(2, '0')}`
            }).catch(() => { });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ error: error.message || 'Error generando reporte' });
    }
});

// -----------------------------------------------
// GET /api/reports/:merchantId/preview — JSON preview
// -----------------------------------------------
router.get('/:merchantId/preview', async (req, res) => {
    try {
        const { merchantId } = req.params;

        if (!supabase) {
            return res.status(503).json({ error: 'Database not available' });
        }

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const [txRes, custRes] = await Promise.all([
            supabase.from('transactions')
                .select('type, amount')
                .eq('merchant_id', merchantId)
                .gte('created_at', monthStart.toISOString())
                .lte('created_at', monthEnd.toISOString()),
            supabase.from('merchant_customers')
                .select('name, total_debt')
                .eq('merchant_id', merchantId)
                .gt('total_debt', 0)
                .order('total_debt', { ascending: false })
                .limit(5)
        ]);

        const transactions = txRes.data || [];
        const totalCash = transactions.filter(t => t.type === 'SALE_CASH').reduce((s, t) => s + t.amount, 0);
        const totalCredit = transactions.filter(t => t.type === 'SALE_CREDIT').reduce((s, t) => s + t.amount, 0);
        const totalCollected = transactions.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + t.amount, 0);

        res.json({
            period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            totalSales: totalCash + totalCredit,
            salesCash: totalCash,
            salesCredit: totalCredit,
            collected: totalCollected,
            operations: transactions.length,
            topDebtors: (custRes.data || []).map(c => ({ name: c.name, debt: c.total_debt }))
        });

    } catch (error) {
        console.error('Report preview error:', error);
        res.status(500).json({ error: 'Error' });
    }
});

export default router;
