const { authenticateToken, requireAdmin } = require('../middlewares/auth');

module.exports = function (Router, db) {
    const router = Router();

    // GET /api/debug/schema — inspect full database schema
    router.get('/api/debug/schema', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const tables = await db.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
            const schema = {};
            for (const t of tables) {
                schema[t.name] = await db.$queryRaw`PRAGMA table_info(${t.name})`;
            }
            res.json(schema);
        } catch (err) {
            console.error('Schema fetch error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
