/**
 * Category routes.
 * Uses Prisma ORM for database operations.
 * Exports a function(router, db) that registers all /api/categories endpoints.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

module.exports = function (Router, db) {
    const router = Router();

    // GET /api/categories — list all category names
    router.get('/api/categories', authenticateToken, async (req, res) => {
        try {
            const rows = await db.category.findMany({ select: { name: true } });
            res.json(rows.map((r) => r.name));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/categories — create a new category (admin only)
    router.post('/api/categories', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'Category name is required.' });
            }

            // Check duplicate
            const existing = await db.category.findUnique({ where: { name } });
            if (existing) {
                return res.status(409).json({ error: 'Category already exists.' });
            }

            await db.category.create({ data: { name } });
            res.status(201).json({ message: 'Category created.', name });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/categories/:name — delete category & clean up link references
    router.delete('/api/categories/:name', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { name } = req.params;

            // Check category exists
            const existing = await db.category.findUnique({ where: { name } });
            if (!existing) {
                return res.status(404).json({ error: 'Category not found.' });
            }

            // Delete category
            await db.category.delete({ where: { name } });

            // Update all links that reference this category in their JSON array
            const links = await db.link.findMany({
                where: { categories: { contains: name } },
                select: { id: true, categories: true }
            });
            for (const link of links) {
                let cats = [];
                try {
                    cats = JSON.parse(link.categories);
                } catch {
                    continue;
                }
                if (!Array.isArray(cats)) continue;

                const filtered = cats.filter((c) => c !== name);
                if (filtered.length !== cats.length) {
                    await db.link.update({
                        where: { id: link.id },
                        data: {
                            categories: JSON.stringify(filtered),
                            updatedAt: new Date().toISOString()
                        }
                    });
                }
            }

            res.json({ message: 'Category deleted.', name });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/categories/:oldName — rename a category (admin only)
    router.put('/api/categories/:oldName', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { oldName } = req.params;
            const { newName } = req.body;
            if (!newName) {
                return res.status(400).json({ error: 'New category name is required.' });
            }

            // Check old category exists
            const existing = await db.category.findUnique({ where: { name: oldName } });
            if (!existing) {
                return res.status(404).json({ error: 'Category not found.' });
            }

            // Check newName is not a duplicate (and not same as old — no-op is ok)
            if (newName !== oldName) {
                const dup = await db.category.findUnique({ where: { name: newName } });
                if (dup) {
                    return res.status(409).json({ error: 'A category with the new name already exists.' });
                }
            }

            // Update category name
            await db.category.update({
                where: { name: oldName },
                data: { name: newName }
            });

            // Update all links that reference the old category in their JSON array
            const links = await db.link.findMany({
                where: { categories: { contains: oldName } },
                select: { id: true, categories: true }
            });
            for (const link of links) {
                let cats = [];
                try {
                    cats = JSON.parse(link.categories);
                } catch {
                    continue;
                }
                if (!Array.isArray(cats)) continue;

                if (cats.includes(oldName)) {
                    const updated = cats.map((c) => (c === oldName ? newName : c));
                    await db.link.update({
                        where: { id: link.id },
                        data: {
                            categories: JSON.stringify(updated),
                            updatedAt: new Date().toISOString()
                        }
                    });
                }
            }

            res.json({ message: 'Category renamed.', oldName, newName });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
