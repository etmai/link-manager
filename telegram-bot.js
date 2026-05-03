const TelegramBot = require('node-telegram-bot-api');
const { randomUUID } = require('crypto');

let botInstance = null;

/**
 * Initialize the Telegram Bot integration
 * @param {object} db - The SQLite database instance
 */
function initTelegramBot(db) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const allowedGroupId = (process.env.TELEGRAM_GROUP_ID || '').trim();

    // Helper for database compatibility (Prisma vs SQLite standard)
    const executeQuery = async (sql, params = []) => {
        if (!db) throw new Error("Database instance is missing");
        
        // Check if it's a Prisma instance
        if (db.$executeRawUnsafe) {
            const result = await db.$executeRawUnsafe(sql, ...params);
            return { changes: result };
        } 
        // Assume it's a standard sqlite instance
        if (typeof db.run === 'function') {
            return new Promise((resolve, reject) => {
                db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes, lastID: this.lastID });
                });
            });
        }
        // Fallback for some wrappers that return promises directly
        if (db.run && typeof db.run.then === 'function' || db.constructor.name === 'Database') {
             return db.run(sql, params);
        }

        throw new Error("Unsupported database instance (no .run or .$executeRawUnsafe function found)");
    };

    console.log(`🔍 [Telegram] Debug: Init attempt at ${new Date().toISOString()} | Token: ${token ? token.substring(0, 10) + '...' : 'MISSING'}`);

    if (!token) {
        console.warn('⚠️ [Telegram] Missing TELEGRAM_BOT_TOKEN in .env. Bot disabled.');
        return null;
    }

    // Initialize bot with polling after a short delay to avoid 409 conflicts during restarts
    setTimeout(async () => {
        if (botInstance) return;
        
        try {
            console.log('🤖 [Telegram] Preparing bot instance...');
            const bot = new TelegramBot(token);
            
            // Critical: Delete any existing webhook to ensure polling works
            await bot.deleteWebHook();
            console.log('🤖 [Telegram] Webhook cleared.');

            botInstance = new TelegramBot(token, { polling: true });
            console.log('🤖 [Telegram] Polling started.');

            botInstance.on('message', async (msg) => {
                try {
                    const chatId = msg.chat.id;
                    const text = msg.text;
                    if (!text) return;

                    console.log(`📩 [Telegram] Message from ${chatId}: ${text.substring(0, 40)}...`);

                    // Health check command
                    if (text === '/check' || text === '/check@dinoz_trendbot') {
                        botInstance.sendMessage(chatId, `✅ Dinoz Bot đang hoạt động! \n🆔 Group ID: ${chatId}\n📡 Trạng thái: Sẵn sàng cập nhật keyword.`);
                        return;
                    }

                    if (text === '/id' || text === '/id@bot_username') {
                        botInstance.sendMessage(chatId, `🆔 Chat ID: ${chatId}`);
                        return;
                    }

                    // Strict security check: Only process messages from the allowed group
                    const targetGroupId = String(allowedGroupId || '').trim();
                    const incomingChatId = String(chatId || '').trim();

                    if (targetGroupId && incomingChatId !== targetGroupId) {
                        console.warn(`⚠️ [Telegram] Ignoring message from unauthorized chat: "${incomingChatId}" (Expected: "${targetGroupId}")`);
                        return;
                    }

                    // Header detection for "BÁO CÁO NGÀY LỆ US"
                    if (text.toUpperCase().includes('BÁO CÁO NGÀY LỆ US')) {
                        const lines = text.split('\n');
                        let currentGroup = 'General';
                        let addedCount = 0;

                        // Clear old holidays before updating with the new report
                        await executeQuery("DELETE FROM usa_holidays");

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;

                            // Detect Priority Group (e.g., [60-90 NGÀY])
                            if (trimmed.includes('[') && trimmed.includes('NGÀY')) {
                                currentGroup = trimmed.replace(/[⚠️🌟]/g, '').trim();
                                continue;
                            }

                            // Detect Holiday Line: ➡️ Name (YYYY-MM-DD) - Còn X ngày
                            if (trimmed.includes('➡️')) {
                                const match = trimmed.match(/➡️\s*(.+)\s*\((\d{4}-\d{2}-\d{2})\)\s*-\s*Còn\s*(\d+)\s*ngày/);
                                if (match) {
                                    const [_, name, date, daysLeft] = match;
                                    const id = randomUUID();
                                    await executeQuery(
                                        `INSERT INTO usa_holidays (id, name, date, days_left, priority_group, updatedAt) 
                                         VALUES (?, ?, ?, ?, ?, ?)`,
                                        [id, name.trim(), date, parseInt(daysLeft), currentGroup, new Date().toISOString()]
                                    );
                                    addedCount++;
                                }
                            }
                        }

                        if (addedCount > 0) {
                            botInstance.sendMessage(chatId, `🎉 Đã cập nhật ${addedCount} ngày lễ US mới vào lịch countdown!`);
                            console.log(`✅ [Telegram] Updated ${addedCount} holidays.`);
                        }
                    }

                    // Strict header detection for "TỪ KHÓA TÌM KIẾM"
                    if (text.toUpperCase().includes('TỪ KHÓA TÌM KIẾM')) {
                        const lines = text.split('\n');
                        
                        // Extract keywords: ignore empty lines and header lines
                        // Improved: Strips 🔑 and other symbols instead of skipping the line
                        const keywords = lines
                            .map(l => l.trim().replace(/[🔑➡️📍✨]/g, '').trim())
                            .filter(l => l && !l.toUpperCase().includes('TỪ KHÓA'));

                        if (keywords.length > 0) {
                            console.log(`📡 [Telegram] Processing ${keywords.length} keywords.`);

                            let addedCount = 0;
                            for (const kw of keywords) {
                                const id = randomUUID();
                                // INSERT OR IGNORE ensures no duplicates based on 'keyword' UNIQUE constraint
                                const result = await executeQuery(
                                    `INSERT OR IGNORE INTO trending_keywords (id, keyword, heat_score, category, source) 
                                     VALUES (?, ?, ?, ?, ?)`,
                                    [id, kw, 85, 'general', 'telegram']
                                );
                                if (result.changes > 0) addedCount++;
                            }

                            botInstance.sendMessage(chatId, `✅ Đã cập nhật ${addedCount} keywords mới! (Bỏ qua ${keywords.length - addedCount} trùng lặp)`);
                            console.log(`✅ [Telegram] Added ${addedCount} new keywords.`);
                        }
                    }
                } catch (error) {
                    console.error('❌ [Telegram] Message handling error:', error.message);
                }
            });

            botInstance.on('polling_error', (error) => {
                if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
                    console.error('❌ [Telegram] Conflict 409: Một bot khác đang chạy. Đang dừng polling...');
                    botInstance.stopPolling();
                    // Reset instance so it can retry on next initialization if needed
                    botInstance = null;
                } else if (error.code !== 'EFATAL') {
                    console.warn(`⚠️ [Telegram] Polling warning: ${error.message}`);
                }
            });

        } catch (err) {
            console.error('❌ [Telegram] Failed to init bot:', err.message);
        }
    }, 3000); // 3 second delay

    // Handle graceful shutdown
    const shutdown = () => {
        if (botInstance) {
            console.log('🤖 [Telegram] Stopping bot polling...');
            botInstance.stopPolling();
            botInstance = null;
        }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return null;
}

/**
 * Send a message to the configured group
 * @param {string} text - The message content
 */
function sendMessageToGroup(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_GROUP_ID;
    if (!token || !chatId) return;

    const bot = botInstance || new TelegramBot(token);
    bot.sendMessage(chatId, text).catch(err => console.error('❌ [Telegram] Push Message Failed:', err.message));
}

module.exports = { initTelegramBot, sendMessageToGroup };
