/**
 * Auth routes — login & change-password.
 * Uses Prisma ORM for database operations.
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { authenticateToken } = require('../middlewares/auth');

module.exports = function (Router, db) {
  const router = Router();

  // POST /api/auth/login
  router.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const user = await db.user.findUnique({ where: { username } });
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.json({
        token,
        user: { username: user.username, role: user.role }
      });
    } catch (err) {
      console.error('Login error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/auth/change-password
  router.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    try {
      const user = await db.user.findUnique({ where: { username: req.user.username } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await db.user.update({
        where: { username: user.username },
        data: { password: hash }
      });

      return res.json({ message: 'Password changed successfully' });
    } catch (err) {
      console.error('Change-password error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
