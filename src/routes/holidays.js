/**
 * Holiday routes — public USA holidays + authed POD holidays.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const config = require('../config');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Check if uuid is available or use crypto
const crypto = require('crypto');

module.exports = function (Router, db) {

    const router = Router();

    // ─── GET /api/usa-holidays — NO auth required ─────────────────
    router.get('/api/usa-holidays', async (req, res) => {
        try {
            const today = new Date();
            const holidays = await db.usaHoliday.findMany({
                orderBy: { date: 'asc' },
            });

            const seen = new Set();
            const filtered = holidays.map(h => {
                const hDate = new Date(h.date);
                const diffTime = hDate - today;
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return { ...h, days_left: daysLeft };
            }).filter(h => {
                // 1. De-duplicate by name + date
                const key = `${h.name}|${h.date}`;
                if (seen.has(key)) return false;
                seen.add(key);

                // 2. Hide if less than 7 days left (applies to ALL holidays now)
                if (h.days_left < 7) {
                    return false;
                }
                return true;
            });

            res.json(filtered);
        } catch (err) {
            console.error('[Holidays] GET usa-holidays error:', err);
            res.status(500).json({ error: 'Failed to fetch USA holidays.' });
        }
    });

    // ─── GET /api/holidays — auth required ─────────────────────────
    router.get('/api/holidays', authenticateToken, async (req, res) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const holidays = await db.podHoliday.findMany({
                where: { date: { gte: today } },
                orderBy: { date: 'asc' },
                take: 15,
            });
            res.json(holidays);
        } catch (err) {
            console.error('[Holidays] GET pod-holidays error:', err);
            res.status(500).json({ error: 'Failed to fetch POD holidays.' });
        }
    });

    // ─── POST /api/holidays/import-unofficial ───────────────────
    router.post('/api/holidays/import-unofficial', authenticateToken, requireAdmin, async (req, res) => {
        const sheetUrl = config.holidays.unofficialSheetUrl;

        if (!sheetUrl) {
            return res.status(400).json({ error: 'Chưa cấu hình UNOFFICIAL_HOLIDAY_SHEET_URL trong .env' });
        }

        try {
            const response = await axios.get(sheetUrl);
            const csvData = response.data;
            const lines = csvData.split(/\r?\n/).filter(line => line.trim());
            
            if (lines[0].toLowerCase().includes('event_name')) {
                lines.shift();
            }

            const holidays = lines.map(line => {
                const parts = line.split(',');
                if (parts.length < 2) return null;
                return {
                    name: parts[0].replace(/"/g, '').trim(),
                    date: parts[1].replace(/"/g, '').trim()
                };
            }).filter(h => h && h.name && h.date);

            if (holidays.length === 0) {
                return res.status(400).json({ error: 'Không tìm thấy dữ liệu ngày lễ trong sheet.' });
            }

            // Delete old unofficial holidays
            await db.usaHoliday.deleteMany({
                where: { source: 'google_sheet' }
            });

            const today = new Date();
            const newHolidays = holidays.map(h => {
                const hDate = new Date(h.date);
                const diffTime = hDate - today;
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (daysLeft >= -1) {
                    return {
                        id: crypto.randomUUID(),
                        name: h.name,
                        date: h.date,
                        days_left: daysLeft,
                        priority_group: 'Unofficial',
                        source: 'google_sheet',
                        updatedAt: new Date().toISOString()
                    };
                }
                return null;
            }).filter(Boolean);

            await db.usaHoliday.createMany({
                data: newHolidays
            });

            res.json({ success: true, count: newHolidays.length });
        } catch (err) {
            console.error('[Holidays] Import error:', err);
            res.status(500).json({ error: 'Lỗi import: ' + err.message });
        }
    });

    return router;
};
