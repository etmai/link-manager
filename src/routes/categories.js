/**
 * Category routes.
 * Uses Prisma ORM for database operations.
 * Exports a function(router, db) that registers all /api/categories endpoints.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { z } = require('zod');

module.exports = function (Router, db) {
    const router = Router();

    // GET /api/categories — list all category names
    router.get('/api/categories', authenticateToken, async (req, res, next) => {
        try {
            const rows = await db.category.findMany({ select: { name: true } });
            res.json(rows.map((r) => r.name));
        } catch (err) {
            next(err);
        }
    });

    // POST /api/categories — create a new category (admin only)
    router.post('/api/categories', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const schema = z.object({
                name: z.string().trim().min(1).max(50),
            });
            const { name } = schema.parse(req.body);

            // Check duplicate
            const existing = await db.category.findUnique({ where: { name } });
            if (existing) {
                const error = new Error('Category already exists.');
                error.statusCode = 409;
                error.isPublic = true;
                throw error;
            }

            await db.category.create({ data: { name } });
            res.status(201).json({ message: 'Category created.', name });
        } catch (err) {
            next(err);
        }
    });

    // DELETE /api/categories/:name — delete category & clean up link references
    router.delete('/api/categories/:name', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const { name } = req.params;

            // Check category exists
            const existing = await db.category.findUnique({ where: { name } });
            if (!existing) {
                const error = new Error('Category not found.');
                error.statusCode = 404;
                error.isPublic = true;
                throw error;
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
            next(err);
        }
    });

    // PUT /api/categories/:oldName — rename a category (admin only)
    router.put('/api/categories/:oldName', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const schema = z.object({
                newName: z.string().trim().min(1).max(50),
            });
            const { newName } = schema.parse(req.body);
            const { oldName } = req.params;

            // Check old category exists
            const existing = await db.category.findUnique({ where: { name: oldName } });
            if (!existing) {
                const error = new Error('Category not found.');
                error.statusCode = 404;
                error.isPublic = true;
                throw error;
            }

            // Check newName is not a duplicate (and not same as old — no-op is ok)
            if (newName !== oldName) {
                const dup = await db.category.findUnique({ where: { name: newName } });
                if (dup) {
                    const error = new Error('A category with the new name already exists.');
                    error.statusCode = 409;
                    error.isPublic = true;
                    throw error;
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
            next(err);
        }
    });

    return router;
};
