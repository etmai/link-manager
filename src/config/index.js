/**
 * Centralized application configuration.
 * All config values are read from environment variables via dotenv.
 */
require('dotenv').config();

const config = {
    port: parseInt(process.env.PORT, 10) || 3000,
    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
        expiresIn: '7d',
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        groupId: process.env.TELEGRAM_GROUP_ID || '',
    },
    trello: {
        apiKey: process.env.TRELLO_API_KEY || '',
        token: process.env.TRELLO_TOKEN || '',
        listId: process.env.TRELLO_LIST_ID || '69e531239660a96cc9e9a0e6',
    },
    push: {
        secret: process.env.PUSH_SECRET || '',
    },
    evergreen: {
        sheetUrl: process.env.EVERGREEN_SHEET_URL || '',
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000,
    },
    authRateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 50,
    },
};

module.exports = config;
