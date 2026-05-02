/**
 * Link routes.
 * Exports a function(router, db) that registers all /api/links endpoints.
 * `db` is a Prisma client instance.
 */
const { authenticateToken } = require('../middlewares/auth');
const { normalizeUrl } = require('../utils/normalizeUrl');

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
    router.get('/api/links', authenticateToken, async (req, res) => {
        try {
            const rows = await db.link.findMany();
            res.json(rows.map(parseCategories));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/links/batch — batch insert/update links
    router.post('/api/links/batch', authenticateToken, async (req, res) => {
        try {
            const { linksData, forceSaveCheckbox = false } = req.body;

            if (!Array.isArray(linksData) || linksData.length === 0) {
                return res.status(400).json({ error: 'linksData must be a non-empty array.' });
            }

            let newCount = 0;
            let updatedCount = 0;
            let forbiddenCount = 0;

            await db.$transaction(async (tx) => {
                for (const item of linksData) {
                    const { url, date, categories } = item;
                    if (!url || !date) continue; // skip malformed entries

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

                            const newCats = Array.isArray(categories) ? categories : [];
                            const merged = [...new Set([...existingCats, ...newCats])];

                            // Only admins (or the creator) can update
                            if (!canModify(req, existing)) {
                                forbiddenCount++;
                                continue;
                            }

                            await tx.link.update({
                                where: { id: existing.id },
                                data: {
                                    categories: JSON.stringify(merged),
                                    updatedAt: new Date().toISOString(),
                                    updatedBy: req.user.username,
                                },
                            });
                            updatedCount++;
                        }
                        // If !forceSaveCheckbox we silently skip duplicates
                    } else {
                        // Insert new link
                        const categoriesStr = JSON.stringify(Array.isArray(categories) ? categories : []);
                        await tx.link.create({
                            data: {
                                url: normalized,
                                date,
                                categories: categoriesStr,
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
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/links/:id — update a single link
    router.put('/api/links/:id', authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const { url, date, categories } = req.body;

            // Check link exists
            const existing = await db.link.findUnique({ where: { id } });
            if (!existing) {
                return res.status(404).json({ error: 'Link not found.' });
            }

            // Permission check
            if (!canModify(req, existing)) {
                return res.status(403).json({ error: 'You do not have permission to edit this link.' });
            }

            const normalized = url ? normalizeUrl(url) : existing.url;
            const categoriesStr = categories != null ? JSON.stringify(categories) : existing.categories;

            await db.link.update({
                where: { id },
                data: {
                    url: normalized,
                    date: date || existing.date,
                    categories: categoriesStr,
                    updatedAt: new Date().toISOString(),
                    updatedBy: req.user.username,
                },
            });

            // Return updated link
            const updated = await db.link.findUnique({ where: { id } });
            res.json(parseCategories(updated));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/links/:id — delete a single link
    router.delete('/api/links/:id', authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;

            // Check link exists
            const existing = await db.link.findUnique({ where: { id } });
            if (!existing) {
                return res.status(404).json({ error: 'Link not found.' });
            }

            // Permission check
            if (!canModify(req, existing)) {
                return res.status(403).json({ error: 'You do not have permission to delete this link.' });
            }

            await db.link.delete({ where: { id } });
            res.json({ message: 'Link deleted.', id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
