/**
 * Link routes.
 * Exports a function(router, db) that registers all /api/links endpoints.
 * `db` is a Prisma client instance.
 */
const { authenticateToken } = require('../middlewares/auth');
const { normalizeUrl } = require('../utils/normalizeUrl');
const { z } = require('zod');

/**
 * Helper: check whether the current user is allowed to modify a link.
 * Admins can modify anything; regular users can only modify their own links.
 */
function canModify(req, link) {
    return req.user.role === 'admin' || req.user.username === link.addedBy;
}

/**
 * Helper: safely parse the categories JSON column on a link row.
 */
function parseCategories(link) {
    try {
        return { ...link, categories: JSON.parse(link.categories) };
    } catch {
        return { ...link, categories: [] };
    }
}

module.exports = function (Router, db) {
    const router = Router();

    // GET /api/links — fetch all links
    router.get('/api/links', authenticateToken, async (req, res, next) => {
        try {
            const rows = await db.link.findMany();
            res.json(rows.map(parseCategories));
        } catch (err) {
            next(err);
        }
    });

    // POST /api/links/batch — batch insert/update links
    router.post('/api/links/batch', authenticateToken, async (req, res, next) => {
        try {
            const schema = z.object({
                linksData: z.array(z.object({
                    url: z.string().url(),
                    date: z.string(),
                    sampleDate: z.string().optional().nullable(),
                    categories: z.array(z.string()).optional().default([]),
                })).min(1),
                forceSaveCheckbox: z.boolean().optional().default(false),
            });

            const { linksData, forceSaveCheckbox } = schema.parse(req.body);

            let newCount = 0;
            let updatedCount = 0;
            let forbiddenCount = 0;

            await db.$transaction(async (tx) => {
                for (const item of linksData) {
                    const { url, date, sampleDate, categories } = item;
                    const normalized = normalizeUrl(url);
                    const existing = await tx.link.findFirst({ where: { url: normalized } });

                    if (existing) {
                        // Duplicate found
                        if (forceSaveCheckbox) {
                            // Merge categories
                            let existingCats = [];
                            try {
                                existingCats = JSON.parse(existing.categories);
                            } catch {
                                existingCats = [];
                            }
                            if (!Array.isArray(existingCats)) existingCats = [];

                            const merged = [...new Set([...existingCats, ...categories])];

                            // Only admins (or the creator) can update
                            if (!canModify(req, existing)) {
                                forbiddenCount++;
                                continue;
                            }

                            await tx.link.update({
                                where: { id: existing.id },
                                data: {
                                    categories: JSON.stringify(merged),
                                    date: date || existing.date,
                                    sampleDate: sampleDate || existing.sampleDate,
                                    updatedAt: new Date().toISOString(),
                                    updatedBy: req.user.username,
                                },
                            });
                            updatedCount++;
                        }
                    } else {
                        // Insert new link
                        await tx.link.create({
                            data: {
                                url: normalized,
                                date,
                                sampleDate: sampleDate || null,
                                categories: JSON.stringify(categories),
                                createdAt: new Date().toISOString(),
                                addedBy: req.user.username,
                            },
                        });
                        newCount++;
                    }
                }
            });

            res.status(201).json({ newCount, updatedCount, forbiddenCount });
        } catch (err) {
            next(err);
        }
    });

    // PUT /api/links/:id — update a single link
    router.put('/api/links/:id', authenticateToken, async (req, res, next) => {
        try {
            const schema = z.object({
                url: z.string().url().optional(),
                date: z.string().optional(),
                sampleDate: z.string().optional().nullable(),
                categories: z.array(z.string()).optional(),
            });

            const { url, date, sampleDate, categories } = schema.parse(req.body);
            const { id } = req.params;

            // Check link exists
            const existing = await db.link.findUnique({ where: { id } });
            if (!existing) {
                const error = new Error('Link not found.');
                error.statusCode = 404;
                error.isPublic = true;
                throw error;
            }

            // Permission check
            if (!canModify(req, existing)) {
                const error = new Error('You do not have permission to edit this link.');
                error.statusCode = 403;
                error.isPublic = true;
                throw error;
            }

            const normalized = url ? normalizeUrl(url) : existing.url;
            const categoriesStr = categories != null ? JSON.stringify(categories) : existing.categories;

            await db.link.update({
                where: { id },
                data: {
                    url: normalized,
                    date: date || existing.date,
                    sampleDate: sampleDate !== undefined ? sampleDate : existing.sampleDate,
                    categories: categoriesStr,
                    updatedAt: new Date().toISOString(),
                    updatedBy: req.user.username,
                },
            });

            // Return updated link
            const updated = await db.link.findUnique({ where: { id } });
            res.json(parseCategories(updated));
        } catch (err) {
            next(err);
        }
    });

    // DELETE /api/links/:id — delete a single link
    router.delete('/api/links/:id', authenticateToken, async (req, res, next) => {
        try {
            const { id } = req.params;

            // Check link exists
            const existing = await db.link.findUnique({ where: { id } });
            if (!existing) {
                const error = new Error('Link not found.');
                error.statusCode = 404;
                error.isPublic = true;
                throw error;
            }

            // Permission check
            if (!canModify(req, existing)) {
                const error = new Error('You do not have permission to delete this link.');
                error.statusCode = 403;
                error.isPublic = true;
                throw error;
            }

            await db.link.delete({ where: { id } });
            res.json({ message: 'Link deleted.', id });
        } catch (err) {
            next(err);
        }
    });

    return router;
};
