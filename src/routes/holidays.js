/**
 * Holiday routes — public USA holidays + authed POD holidays.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

module.exports = function (Router, db) {

    const router = Router();

    // ─── GET /api/usa-holidays — NO auth required ─────────────────
    router.get('/api/usa-holidays', async (req, res) => {
        try {
            const holidays = await db.usaHoliday.findMany({
                orderBy: { date: 'asc' },
            });
            res.json(holidays);
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

    return router;
};
