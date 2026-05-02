/**
 * Authentication & authorization middlewares.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Verify JWT token from Authorization header.
 * Sets req.user = { username, role } if valid.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (token == null) {
        return res.status(401).json({ error: 'Không tìm thấy token. Mời bạn đăng nhập lại!' });
    }

    jwt.verify(token, config.jwt.secret, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
        }
        req.user = user;
        next();
    });
}

/**
 * Require the authenticated user to have role === 'admin'.
 * Must be used AFTER authenticateToken.
 */
function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Chỉ Admin mới có đặc quyền gọi API này.' });
    }
}

/**
 * Verify x-push-secret header for external push endpoints.
 */
function verifyPushSecret(req, res, next) {
    // Only check secret if PUSH_SECRET is configured; skip when empty (backward compat)
    if (config.push.secret) {
        const secret = req.headers['x-push-secret'];
        if (secret !== config.push.secret) {
            return res.status(401).send('Unauthorized');
        }
    }
    next();
}

module.exports = { authenticateToken, requireAdmin, verifyPushSecret };
