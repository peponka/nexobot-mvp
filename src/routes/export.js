// =============================================
// NexoBot MVP — Excel Export API Routes
// =============================================

import { Router } from 'express';
import { exportSales, exportDebtors } from '../services/excelExport.js';

const router = Router();

// ── GET /api/export/:merchantId/sales ──
router.get('/:merchantId/sales', async (req, res) => {
    try {
        const { merchantId } = req.params;
        const month = req.query.month ? parseInt(req.query.month) : null;
        const year = req.query.year ? parseInt(req.query.year) : null;

        const buffer = await exportSales(merchantId, month, year);

        const now = new Date();
        const m = month !== null ? month : now.getMonth();
        const y = year !== null ? year : now.getFullYear();
        const filename = `ventas-nexobot-${y}-${String(m + 1).padStart(2, '0')}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('Excel sales export error:', error);
        res.status(500).json({ error: error.message || 'Error generando Excel' });
    }
});

// ── GET /api/export/:merchantId/debtors ──
router.get('/:merchantId/debtors', async (req, res) => {
    try {
        const { merchantId } = req.params;
        const buffer = await exportDebtors(merchantId);

        const filename = `deudores-nexobot-${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('Excel debtors export error:', error);
        res.status(500).json({ error: error.message || 'Error generando Excel' });
    }
});

export default router;
