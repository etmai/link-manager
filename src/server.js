/**
 * Server entry point — Prisma ORM version.
 * Initializes database, creates Express app, starts listening.
 */
const path = require('path');

// Load .env from PROJECT ROOT (not from src/)
const envPath = path.join(__dirname, '..', '.env');
console.log('[BOOT] Loading .env from:', envPath);
require('dotenv').config({ path: envPath });

// Ensure DATABASE_URL is set (used by Prisma)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(__dirname, '..', 'database.sqlite')}`;
}
console.log('[BOOT] DATABASE_URL:', process.env.DATABASE_URL);
console.log('[BOOT] NODE_VERSION:', process.version);

const prisma = require('./db/prisma');
const { initDatabase } = require('./db/init');
const { createApp } = require('./app');
const { initTelegramBot } = require('../telegram-bot');
const { cleanupExpiredSamples } = require('./jobs/cleanup');
const config = require('./config');

console.log('[BOOT] config.port:', config.port);

async function startServer() {
    try {
        // 1. Connect to database & run migrations/seed
        console.log('[BOOT] Connecting to database via Prisma...');
        await prisma.$connect();
        console.log('[BOOT] Database connected.');
        await initDatabase(prisma);

        // 2. Create Express app with all routes mounted
        console.log('[BOOT] Creating Express app...');
        const app = createApp(prisma);

        // 3. Start scheduled jobs
        cleanupExpiredSamples(prisma);
        setInterval(() => cleanupExpiredSamples(prisma), 24 * 60 * 60 * 1000);

        // 4. Start HTTP server
        const server = app.listen(config.port, () => {
            console.log(`🚀 Dinoz Server is LIVE on http://localhost:${config.port}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(
                    `❌ Lỗi: Cổng ${config.port} đã bị chiếm dụng. Vui lòng tắt ứng dụng đang dùng cổng này hoặc đổi PORT trong file .env`,
                );
                process.exit(1);
            } else {
                console.error('❌ Lỗi khởi động server:', err);
            }
        });

        // 5. Start Telegram bot integration
        initTelegramBot(prisma);

        // 6. Graceful shutdown
        process.on('SIGINT', async () => {
            await prisma.$disconnect();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            await prisma.$disconnect();
            process.exit(0);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
