/**
 * Express application setup.
 * Configures middleware, mounts all route modules.
 * Does NOT start the server — that's src/server.js responsibility.
 */
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// ---------- Route Modules ----------
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const linkRoutes = require('./routes/links');
const salesRoutes = require('./routes/sales');
const scrapingRoutes = require('./routes/scraping');
const settingsRoutes = require('./routes/settings');
const scheduleRoutes = require('./routes/schedule');
const sampleRoutes = require('./routes/samples');
const financeRoutes = require('./routes/finance');
const holidayRoutes = require('./routes/holidays');
const trendingRoutes = require('./routes/trending');
const debugRoutes = require('./routes/debug');

/**
 * Create and configure the Express app.
 * @param {import('sqlite').Database} db
 * @returns {express.Application}
 */
function createApp(db) {
    const app = express();

    // ---------- Trust proxy (for rate limiting behind reverse proxy) ----------
    app.set('trust proxy', 1);

    // ---------- Security ----------
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));
    app.use(cors());
    app.use(express.json());

    // ---------- Rate Limiting ----------
    const apiLimiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
    });
    app.use('/api/', apiLimiter);

    const authLimiter = rateLimit({
        windowMs: config.authRateLimit.windowMs,
        max: config.authRateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau.' },
    });
    app.use('/api/auth/', authLimiter);

    // ---------- Static files (frontend) ----------
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // ---------- Mount Routes ----------
    // Each route module exports fn(Router, db) → returns an Express Router.
    app.use(authRoutes(express.Router, db));
    app.use(categoryRoutes(express.Router, db));
    app.use(linkRoutes(express.Router, db));
    app.use(salesRoutes(express.Router, db));
    app.use(scrapingRoutes(express.Router, db));
    app.use(settingsRoutes(express.Router, db));
    app.use(scheduleRoutes(express.Router, db));
    app.use(sampleRoutes(express.Router, db));
    app.use(holidayRoutes(express.Router, db));
    app.use(trendingRoutes(express.Router, db));
    
    // Admin-only or restricted routers at the bottom
    app.use(financeRoutes(express.Router, db));
    app.use(userRoutes(express.Router, db));
    app.use(debugRoutes(express.Router, db));

    return app;
}

module.exports = { createApp };
