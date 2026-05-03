/**
 * Settings routes — Accounts, Merchants, Fulfillments CRUD.
 * Uses Prisma ORM with async/await.
 */
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { Prisma } = require('@prisma/client');

/** Prisma unique-constraint error code */
const P2002 = 'P2002';

/** Prisma record-not-found error code */
const P2025 = 'P2025';

module.exports = function (Router, db) {
  const router = Router();

  // ─── Accounts ────────────────────────────────────────────────

  router.get('/api/accounts', authenticateToken, async (req, res) => {
    try {
      const rows = await db.account.findMany({ orderBy: { name: 'asc' } });
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/accounts', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên account không được để trống!' });
    }
    try {
      const account = await db.account.create({ data: { name: name.trim() } });
      return res.status(201).json({ id: account.id, name: account.name });
    } catch (err) {
      if (err.code === P2002) {
        return res.status(400).json({ error: 'Tên account đã tồn tại!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/accounts/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      await db.account.delete({ where: { id: req.params.id } });
      return res.json({ message: 'Xóa account thành công!' });
    } catch (err) {
      if (err.code === P2025) {
        return res.status(404).json({ error: 'Không tìm thấy account!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/accounts/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên account không được để trống!' });
    }
    try {
      const account = await db.account.update({
        where: { id: req.params.id },
        data: { name: name.trim() },
      });
      return res.json({ id: account.id, name: account.name });
    } catch (err) {
      if (err.code === P2025) {
        return res.status(404).json({ error: 'Không tìm thấy account!' });
      }
      if (err.code === P2002) {
        return res.status(400).json({ error: 'Tên account đã tồn tại!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Merchants ───────────────────────────────────────────────

  router.get('/api/merchants', authenticateToken, async (req, res) => {
    try {
      const rows = await db.merchant.findMany({ orderBy: { name: 'asc' } });
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/merchants', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên merchant không được để trống!' });
    }
    try {
      const merchant = await db.merchant.create({ data: { name: name.trim() } });
      return res.status(201).json({ id: merchant.id, name: merchant.name });
    } catch (err) {
      if (err.code === P2002) {
        return res.status(400).json({ error: 'Tên merchant đã tồn tại!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      await db.merchant.delete({ where: { id: req.params.id } });
      return res.json({ message: 'Xóa merchant thành công!' });
    } catch (err) {
      if (err.code === P2025) {
        return res.status(404).json({ error: 'Không tìm thấy merchant!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên merchant không được để trống!' });
    }
    try {
      const merchant = await db.merchant.update({
        where: { id: req.params.id },
        data: { name: name.trim() },
      });
      return res.json({ id: merchant.id, name: merchant.name });
    } catch (err) {
      if (err.code === P2025) {
        return res.status(404).json({ error: 'Không tìm thấy merchant!' });
      }
      if (err.code === P2002) {
        return res.status(400).json({ error: 'Tên merchant đã tồn tại!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Fulfillments ────────────────────────────────────────────

  router.get('/api/fulfillments', authenticateToken, async (req, res) => {
    try {
      const rows = await db.fulfillment.findMany({ orderBy: { name: 'asc' } });
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/fulfillments', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên fulfillment không được để trống!' });
    }
    try {
      const fulfillment = await db.fulfillment.create({ data: { name: name.trim() } });
      return res.status(201).json({ id: fulfillment.id, name: fulfillment.name });
    } catch (err) {
      if (err.code === P2002) {
        return res.status(400).json({ error: 'Tên fulfillment đã tồn tại!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/fulfillments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      await db.fulfillment.delete({ where: { id: req.params.id } });
      return res.json({ message: 'Xóa fulfillment thành công!' });
    } catch (err) {
      if (err.code === P2025) {
        return res.status(404).json({ error: 'Không tìm thấy fulfillment!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/fulfillments/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên fulfillment không được để trống!' });
    }
    try {
      const fulfillment = await db.fulfillment.update({
        where: { id: req.params.id },
        data: { name: name.trim() },
      });
      return res.json({ id: fulfillment.id, name: fulfillment.name });
    } catch (err) {
      if (err.code === P2025) {
        return res.status(404).json({ error: 'Không tìm thấy fulfillment!' });
      }
      if (err.code === P2002) {
        return res.status(400).json({ error: 'Tên fulfillment đã tồn tại!' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── AI Providers ───────────────────────────────────────────
  
  router.get('/api/ai/providers', authenticateToken, async (req, res) => {
    try {
      const rows = await db.aiProvider.findMany({ orderBy: { priority: 'asc' } });
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/ai/providers', authenticateToken, requireAdmin, async (req, res) => {
    const { name, model, apiKey, priority, enabled } = req.body;
    try {
      const provider = await db.aiProvider.create({
        data: { 
          name, 
          model, 
          apiKey: apiKey || '', 
          priority: parseInt(priority, 10) || 0,
          enabled: enabled !== undefined ? enabled : true
        }
      });
      return res.status(201).json(provider);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/ai/providers/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { name, model, apiKey, priority, enabled } = req.body;
    try {
      const data = {};
      if (name !== undefined) data.name = name;
      if (model !== undefined) data.model = model;
      if (apiKey !== undefined) data.apiKey = apiKey;
      if (priority !== undefined) data.priority = parseInt(priority, 10);
      if (enabled !== undefined) data.enabled = enabled;

      const provider = await db.aiProvider.update({
        where: { id: req.params.id },
        data
      });
      return res.json(provider);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/ai/providers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      await db.aiProvider.delete({ where: { id: req.params.id } });
      return res.json({ message: 'Xóa AI provider thành công!' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── AI Settings ─────────────────────────────────────────────

  router.get('/api/ai/settings', authenticateToken, async (req, res) => {
    try {
      const rows = await db.aiSetting.findMany();
      const settings = {};
      rows.forEach(r => settings[r.key] = r.value);
      return res.json(settings);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/ai/settings', authenticateToken, requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    try {
      const setting = await db.aiSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      });
      return res.json(setting);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Test Connection ─────────────────────────────────────────

  router.post('/api/ai/test-connection', authenticateToken, requireAdmin, async (req, res) => {
    const { name, model, apiKey } = req.body;
    if (!name || !model || !apiKey) {
      return res.status(400).json({ error: 'Thiếu thông tin Agent, Model hoặc API Key!' });
    }

    try {
      const { callAgent } = require('../utils/ai');
      const testPrompt = "Please respond with exactly 'Connection Successful' and nothing else.";
      const response = await callAgent({ name, model, apiKey }, testPrompt);
      
      return res.json({ message: response || 'No response' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
