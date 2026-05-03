const ExcelJS = require('exceljs');
const { authenticateToken } = require('../middlewares/auth');
const logger = require('../utils/logger');

module.exports = function (Router, db) {
    const router = Router();

    /**
     * GET /api/export/links/excel
     * Exports links to Excel (.xlsx) format.
     */
    router.get('/api/export/links/excel', authenticateToken, async (req, res) => {
        try {
            const links = await db.link.findMany({
                orderBy: { date: 'desc' }
            });

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Links');

            worksheet.columns = [
                { header: 'STT', key: 'stt', width: 10 },
                { header: 'URL', key: 'url', width: 50 },
                { header: 'Ngày Nhập', key: 'date', width: 15 },
                { header: 'Người Thêm', key: 'addedBy', width: 15 },
                { header: 'Người Cập Nhật', key: 'updatedBy', width: 15 },
                { header: 'Danh Mục', key: 'categories', width: 30 },
            ];

            links.forEach((l, index) => {
                let cats = [];
                try {
                    cats = typeof l.categories === 'string' ? JSON.parse(l.categories) : (l.categories || []);
                } catch(e) {
                    cats = [l.categories];
                }

                worksheet.addRow({
                    stt: index + 1,
                    url: l.url,
                    date: l.date,
                    addedBy: l.addedBy,
                    updatedBy: l.updatedBy || '',
                    categories: Array.isArray(cats) ? cats.join(', ') : cats
                });
            });

            // Styling
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Dinoz_Links_Export_${new Date().getTime()}.xlsx`);

            await workbook.xlsx.write(res);
            res.end();
        } catch (err) {
            logger.error(`[Export] Excel export failed: ${err.message}`);
            res.status(500).json({ error: 'Không thể xuất file Excel' });
        }
    });

    return router;
};
