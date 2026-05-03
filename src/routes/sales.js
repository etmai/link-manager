/**
 * Sales routes — CRUD for SalesEntry.
 * Uses Prisma ORM with async/await.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { z } = require('zod');
const logger = require('../utils/logger');

module.exports = function (Router, db) {
  const router = Router();

  // GET /api/sales — list all sales entries (auth required)
  router.get('/api/sales', authenticateToken, async (req, res, next) => {
    try {
      const rows = await db.salesEntry.findMany({
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
      logger.info(`[Sales API] User ${req.user.username} fetched ${rows.length} records.`);
      return res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/sales — create a sales entry (auth + admin required)
  router.post('/api/sales', authenticateToken, requireAdmin, async (req, res, next) => {
    try {
      const schema = z.object({
        account: z.string().trim().min(1),
        fulfillment: z.string().trim().optional().default(''),
        design_id: z.string().trim().optional().default(''),
        sku: z.string().trim().min(1).transform(s => s.toUpperCase()),
        title: z.string().trim().optional().default(''),
        ord_id: z.string().trim().optional().default(''),
        custom: z.string().trim().optional().default(''),
        size: z.string().trim().optional().default('N/A'),
        filename: z.string().trim().optional().default(''),
        date: z.string().min(1),
        sales: z.union([z.number(), z.string()]).transform(v => parseInt(v, 10) || 0),
      });

      const data = schema.parse(req.body);

      const entry = await db.salesEntry.create({
        data: {
          ...data,
          merchant: '',
          category: '',
          createdAt: new Date().toISOString(),
          addedBy: req.user.username,
        },
      });

      return res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/sales/:id — update a sales entry (auth + admin required)
  router.put('/api/sales/:id', authenticateToken, requireAdmin, async (req, res, next) => {
    try {
      const schema = z.object({
        account: z.string().trim().min(1),
        fulfillment: z.string().trim().optional().default(''),
        design_id: z.string().trim().optional().default(''),
        sku: z.string().trim().min(1).transform(s => s.toUpperCase()),
        title: z.string().trim().optional().default(''),
        ord_id: z.string().trim().optional().default(''),
        custom: z.string().trim().optional().default(''),
        size: z.string().trim().optional().default('N/A'),
        filename: z.string().trim().optional().default(''),
        date: z.string().min(1),
        sales: z.union([z.number(), z.string()]).transform(v => parseInt(v, 10) || 0),
      });

      const data = schema.parse(req.body);
      const { id } = req.params;

      const row = await db.salesEntry.findUnique({ where: { id } });
      if (!row) {
        const error = new Error('Sales entry not found');
        error.statusCode = 404;
        error.isPublic = true;
        throw error;
      }

      const updated = await db.salesEntry.update({
        where: { id },
        data: {
          ...data,
          merchant: '',
          category: '',
        },
      });

      return res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/sales/:id — delete a sales entry (auth + admin required)
  router.delete('/api/sales/:id', authenticateToken, requireAdmin, async (req, res, next) => {
    try {
      const { id } = req.params;
      const row = await db.salesEntry.findUnique({ where: { id } });
      if (!row) {
        const error = new Error('Sales entry not found');
        error.statusCode = 404;
        error.isPublic = true;
        throw error;
      }

      await db.salesEntry.delete({ where: { id } });
      return res.json({ message: 'Sales entry deleted successfully', id });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/trending-keywords — NO auth required (public)
  router.get('/api/trending-keywords', async (req, res, next) => {
    try {
      const rows = await db.trendingKeyword.findMany({
        orderBy: [
          { is_pinned: 'desc' },
          { heat_score: 'desc' },
        ],
        take: 50,
      });
      return res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
};