/**
 * Sales routes — CRUD for SalesEntry.
 * Uses Prisma ORM with async/await.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

module.exports = function (Router, db) {
  const router = Router();

  // GET /api/sales — list all sales entries (auth required)
  router.get('/api/sales', authenticateToken, async (req, res) => {
    try {
      const rows = await db.salesEntry.findMany({
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
      console.log(`[Sales API] User ${req.user.username} fetched ${rows.length} records.`);
      return res.json(rows);
    } catch (err) {
      console.error('Fetch sales error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  // POST /api/sales — create a sales entry (auth + admin required)
  router.post('/api/sales', authenticateToken, requireAdmin, async (req, res) => {
    const fields = [
      'account', 'fulfillment', 'design_id', 'sku', 'title',
      'ord_id', 'custom', 'size', 'filename', 'date', 'sales',
    ];

    const data = {};
    for (const field of fields) {
      data[field] = typeof req.body[field] === 'string'
        ? req.body[field].trim()
        : req.body[field];
    }

    if (!data.account || !data.sku || !data.date) {
      return res.status(400).json({
        error: 'account, sku, and date are required fields',
      });
    }

    data.sku = data.sku.toUpperCase();

    try {
      const entry = await db.salesEntry.create({
        data: {
          account: data.account,
          merchant: '',
          category: '',
          fulfillment: data.fulfillment || '',
          design_id: data.design_id || '',
          sku: data.sku,
          title: data.title || '',
          ord_id: data.ord_id || '',
          custom: data.custom || '',
          size: data.size || 'N/A',
          filename: data.filename || '',
          sales: parseInt(data.sales, 10) || 0,
          date: data.date,
          createdAt: new Date().toISOString(),
          addedBy: req.user.username,
        },
      });

      return res.status(201).json({
        id: entry.id,
        account: entry.account,
        fulfillment: entry.fulfillment,
        design_id: entry.design_id,
        sku: entry.sku,
        title: entry.title,
        ord_id: entry.ord_id,
        custom: entry.custom,
        size: entry.size,
        filename: entry.filename,
        sales: entry.sales,
        date: entry.date,
        addedBy: entry.addedBy,
      });
    } catch (err) {
      console.error('Insert sales error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  // PUT /api/sales/:id — update a sales entry (auth + admin required)
  router.put('/api/sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    const fields = [
      'account', 'fulfillment', 'design_id', 'sku', 'title',
      'ord_id', 'custom', 'size', 'filename', 'date', 'sales',
    ];

    const data = {};
    for (const field of fields) {
      data[field] = typeof req.body[field] === 'string'
        ? req.body[field].trim()
        : req.body[field];
    }

    if (!data.account || !data.sku || !data.date) {
      return res.status(400).json({
        error: 'account, sku, and date are required fields',
      });
    }

    data.sku = data.sku.toUpperCase();

    try {
      const row = await db.salesEntry.findUnique({ where: { id } });
      if (!row) {
        return res.status(404).json({ error: 'Sales entry not found' });
      }

      await db.salesEntry.update({
        where: { id },
        data: {
          account: data.account,
          merchant: '',
          category: '',
          fulfillment: data.fulfillment || '',
          design_id: data.design_id || '',
          sku: data.sku,
          title: data.title || '',
          ord_id: data.ord_id || '',
          custom: data.custom || '',
          size: data.size || 'N/A',
          filename: data.filename || '',
          sales: parseInt(data.sales, 10) || 0,
          date: data.date,
        },
      });

      return res.json({ id, ...data });
    } catch (err) {
      console.error('Update sales error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  // DELETE /api/sales/:id — delete a sales entry (auth + admin required)
  router.delete('/api/sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      const row = await db.salesEntry.findUnique({ where: { id } });
      if (!row) {
        return res.status(404).json({ error: 'Sales entry not found' });
      }

      await db.salesEntry.delete({ where: { id } });
      return res.json({ message: 'Sales entry deleted successfully', id });
    } catch (err) {
      console.error('Delete sales error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  // GET /api/trending-keywords — NO auth required (public)
  router.get('/api/trending-keywords', async (req, res) => {
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
      console.error('Fetch trending-keywords error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  });

  return router;
};