/**
 * Trending & Evergreen keyword routes.
 */
const { authenticateToken, requireAdmin, verifyPushSecret } = require('../middlewares/auth');
const config = require('../config');
const { randomUUID } = require('crypto');
const { fetchWithRedirects } = require('../utils/fetch');
const { sendMessageToGroup } = require('../../telegram-bot');
const { Prisma } = require('@prisma/client');

module.exports = function (Router, db) {

    const router = Router();

    // ──────────────────────────────────────────────
    // EVERGREEN KEYWORDS
    // ──────────────────────────────────────────────

    // 1. GET /api/evergreen — list all evergreen keywords
    router.get('/api/evergreen', authenticateToken, async (req, res) => {
        try {
            const rows = await db.evergreenKeyword.findMany({
                orderBy: { createdAt: 'desc' },
            });
            res.json(rows);
        } catch (err) {
            console.error('[Evergreen GET]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 2. POST /api/evergreen/import — import N random keywords from Google Sheet CSV (selection only, no save)
    router.post('/api/evergreen/import', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const count = Math.min(Math.max(parseInt(req.body.count, 10) || 10, 1), 100);
            const sheetUrl = config.evergreen.sheetUrl;

            if (!sheetUrl) {
                return res.status(400).json({ error: 'EVERGREEN_SHEET_URL not configured.' });
            }

            const csv = await fetchWithRedirects(sheetUrl);
            const sheetKeywords = csv
                .split(/\r?\n/)
                .map(line => line.split(/[,;\t]/)[0].trim().replace(/^["']|["']$/g, ''))
                .filter(k => k.length > 0);

            // Filter out keywords that already exist in the DB
            const existing = await db.evergreenKeyword.findMany({ select: { keyword: true } });
            const existingSet = new Set(existing.map(r => r.keyword.toLowerCase()));
            const newAvailable = sheetKeywords.filter(k => !existingSet.has(k.toLowerCase()));

            // Randomly select N
            const selection = newAvailable.length > 0
                ? [...newAvailable]
                    .sort(() => Math.random() - 0.5)
                    .slice(0, count)
                    .map(k => ({ keyword: k, id: randomUUID() }))
                : [];

            res.json({ total_in_sheet: sheetKeywords.length, new_available: newAvailable.length, selection });
        } catch (err) {
            console.error('[Evergreen Import]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 3. POST /api/evergreen — add new evergreen keywords
    router.post('/api/evergreen', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { keywords, category } = req.body;
            if (!Array.isArray(keywords) || keywords.length === 0) {
                return res.status(400).json({ error: 'keywords array is required.' });
            }

            let added = 0;
            for (const keyword of keywords) {
                if (!keyword || typeof keyword !== 'string') continue;
                try {
                    await db.evergreenKeyword.create({
                        data: {
                            keyword: keyword.trim(),
                            category: category || 'general',
                            createdAt: new Date().toISOString(),
                        },
                    });
                    added++;
                } catch (e) {
                    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                        // Unique constraint — skip duplicate
                        continue;
                    }
                    throw e;
                }
            }

            res.json({ added, total: keywords.length });
        } catch (err) {
            console.error('[Evergreen POST]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 4. DELETE /api/evergreen/:id — remove an evergreen keyword
    router.delete('/api/evergreen/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            try {
                await db.evergreenKeyword.delete({ where: { id } });
            } catch (e) {
                if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                    return res.status(404).json({ error: 'Keyword not found.' });
                }
                throw e;
            }
            res.json({ deleted: true });
        } catch (err) {
            console.error('[Evergreen DELETE]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // TRENDING KEYWORDS
    // ──────────────────────────────────────────────

    // 5. GET /api/trends — list top 50 trending keywords
    router.get('/api/trends', authenticateToken, async (req, res) => {
        try {
            const rows = await db.trendingKeyword.findMany({
                orderBy: [
                    { is_pinned: 'desc' },
                    { fetched_at: 'desc' },
                ],
                take: 10,
            });
            res.json(rows);
        } catch (err) {
            console.error('[Trends GET]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 6. POST /api/trends — manually add a trending keyword
    router.post('/api/trends', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { keyword, category } = req.body;
            if (!keyword) {
                return res.status(400).json({ error: 'keyword is required.' });
            }

            let added = false;
            try {
                await db.trendingKeyword.create({
                    data: {
                        keyword: keyword.trim(),
                        category: category || 'general',
                        source: 'manual',
                        heat_score: 90,
                        fetched_at: new Date().toISOString(),
                    },
                });
                added = true;
            } catch (e) {
                if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                    // Duplicate — ignore
                } else {
                    throw e;
                }
            }

            res.json({ added, keyword });
        } catch (err) {
            console.error('[Trends POST]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 7. PATCH /api/trends/:id/pin — toggle pin status
    router.patch('/api/trends/:id/pin', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;

            const row = await db.trendingKeyword.findUnique({ where: { id } });
            if (!row) {
                return res.status(404).json({ error: 'Keyword not found.' });
            }

            const newPin = row.is_pinned ? 0 : 1;
            await db.trendingKeyword.update({
                where: { id },
                data: { is_pinned: newPin },
            });

            res.json({ id, is_pinned: !!newPin });
        } catch (err) {
            console.error('[Trends Pin PATCH]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 8. DELETE /api/trends/:id — remove a trending keyword
    router.delete('/api/trends/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            try {
                await db.trendingKeyword.delete({ where: { id } });
            } catch (e) {
                if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                    return res.status(404).json({ error: 'Keyword not found.' });
                }
                throw e;
            }
            res.json({ deleted: true });
        } catch (err) {
            console.error('[Trends DELETE]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PUSH ENDPOINTS (external)
    // ──────────────────────────────────────────────

    // 9. POST /api/push/trends — push Google Trends keywords (clear non-pinned first)
    router.post('/api/push/trends', verifyPushSecret, async (req, res) => {
        try {
            const { keywords } = req.body;
            if (!Array.isArray(keywords) || keywords.length === 0) {
                return res.status(400).json({ error: 'keywords array is required.' });
            }

            // Clear non-pinned google_trends entries
            await db.trendingKeyword.deleteMany({
                where: { source: 'google_trends', is_pinned: 0 },
            });

            let added = 0;
            const now = new Date().toISOString();
            for (const item of keywords) {
                try {
                    await db.trendingKeyword.create({
                        data: {
                            keyword: item.keyword,
                            category: item.category || 'general',
                            source: 'google_trends',
                            heat_score: item.heat_score || 80,
                            ai_summary: item.ai_summary || null,
                            fetched_at: now,
                        },
                    });
                    added++;
                } catch (e) {
                    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                        continue;
                    }
                    throw e;
                }
            }

            res.json({ received: keywords.length, added });
        } catch (err) {
            console.error('[Push Trends]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 10. POST /api/push/holidays — push POD holidays (clear all first)
    router.post('/api/push/holidays', verifyPushSecret, async (req, res) => {
        try {
            const { holidays } = req.body;
            if (!Array.isArray(holidays) || holidays.length === 0) {
                return res.status(400).json({ error: 'holidays array is required.' });
            }

            // Clear all existing holidays
            await db.podHoliday.deleteMany();

            for (const h of holidays) {
                await db.podHoliday.create({
                    data: {
                        name: h.name,
                        date: h.date,
                        heat_score: h.heat_score || 50,
                        prep_start: h.prep_start || null,
                        emoji: h.emoji || '',
                    },
                });
            }

            res.json({ imported: holidays.length });
        } catch (err) {
            console.error('[Push Holidays]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 11. POST /api/push/telegram-trends — push Telegram-sourced trends (NO middleware, internal secret check)
    router.post('/api/push/telegram-trends', async (req, res) => {
        try {
            const { keywords, secret } = req.body;

            // Internal secret check (skip if PUSH_SECRET is empty — backward compat)
            if (config.push.secret && secret !== config.push.secret) {
                return res.status(401).json({ error: 'Invalid secret.' });
            }

            if (!Array.isArray(keywords) || keywords.length === 0) {
                return res.status(400).json({ error: 'keywords array is required.' });
            }

            // Clear existing telegram-sourced keywords (preserve pinned)
            await db.trendingKeyword.deleteMany({
                where: { source: 'telegram', is_pinned: 0 },
            });

            let added = 0;
            const now = new Date().toISOString();
            for (const keyword of keywords) {
                if (!keyword || typeof keyword !== 'string') continue;
                try {
                    await db.trendingKeyword.create({
                        data: {
                            keyword: keyword.trim(),
                            category: 'general',
                            source: 'telegram',
                            heat_score: 85,
                            fetched_at: now,
                        },
                    });
                    added++;
                } catch (e) {
                    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                        continue;
                    }
                    throw e;
                }
            }

            // Send Telegram notification
            sendMessageToGroup(
                `📡 *Trending Update*\n\n${added} new keywords synced from Telegram.`
            );

            res.json({ received: keywords.length, added });
        } catch (err) {
            console.error('[Push Telegram Trends]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 12. POST /api/trends/analyze/:id — analyze keyword with AI
    router.post('/api/trends/analyze/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const keywordRow = await db.trendingKeyword.findUnique({ where: { id } });
            
            if (!keywordRow) {
                return res.status(404).json({ error: 'Keyword not found.' });
            }

            const { analyzeWithFailover } = require('../utils/ai');
            const { result, provider } = await analyzeWithFailover(db, keywordRow.keyword);

            // Update keyword with AI summary
            await db.trendingKeyword.update({
                where: { id },
                data: { ai_summary: JSON.stringify(result) }
            });

            res.json({ result, provider });
        } catch (err) {
            console.error('[Trends Analyze]', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
