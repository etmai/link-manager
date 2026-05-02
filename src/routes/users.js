/**
 * User management routes — list, create, delete, reset-password (Admin only).
 * Uses Prisma ORM for database operations.
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

module.exports = function (Router, db) {
  const router = Router();

  // --- SELF SERVICE ROUTES ---
  router.post('/api/users/me/change-password', authenticateToken, async (req, res) => {
    const { username } = req.user;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Mật khẩu mới là bắt buộc' });
    }

    try {
      const hash = await bcrypt.hash(newPassword, 10);
      await db.user.update({
        where: { username },
        data: { password: hash }
      });
      return res.json({ message: 'Đổi mật khẩu thành công!' });
    } catch (err) {
      console.error('Self password change error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // All endpoints below require admin access
  router.use(authenticateToken, requireAdmin);

  // GET /api/users — list all users
  router.get('/api/users', async (req, res) => {
    try {
      const users = await db.user.findMany({
        select: { username: true, role: true }
      });
      return res.json(users);
    } catch (err) {
      console.error('Fetch users error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/users — create a new user
  router.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      // Check for duplicate username
      const existing = await db.user.findUnique({ where: { username } });
      if (existing) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const hash = await bcrypt.hash(password, 10);
      const validRoles = ['admin', 'user'];
      const userRole = validRoles.includes(role) ? role : 'user';

      await db.user.create({
        data: { username, password: hash, role: userRole }
      });

      return res.status(201).json({
        message: 'User created',
        user: { username, role: userRole }
      });
    } catch (err) {
      console.error('Insert user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/users/:username — delete a user
  router.delete('/api/users/:username', async (req, res) => {
    const { username } = req.params;

    // Cannot delete self
    if (req.user.username === username) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    try {
      // Check user exists
      const target = await db.user.findUnique({
        where: { username },
        select: { username: true, role: true }
      });
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If deleting an admin, ensure at least one admin remains
      if (target.role === 'admin') {
        const adminCount = await db.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin' });
        }
      }

      await db.user.delete({ where: { username } });
      return res.json({ message: `User '${username}' deleted` });
    } catch (err) {
      console.error('Delete user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/users/:username/reset-password — reset a user's password
  router.post('/api/users/:username/reset-password', async (req, res) => {
    const { username } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    try {
      // Check user exists
      const user = await db.user.findUnique({ where: { username } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await db.user.update({
        where: { username },
        data: { password: hash }
      });

      return res.json({ message: `Password reset for user '${username}'` });
    } catch (err) {
      console.error('Password reset error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
