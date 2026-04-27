const TelegramBot = require('node-telegram-bot-api');
const { randomUUID } = require('crypto');

/**
 * Initialize the Telegram Bot integration
 * @param {object} db - The SQLite database instance
 */
function initTelegramBot(db) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const allowedGroupId = process.env.TELEGRAM_GROUP_ID;

    if (!token) {
        console.warn('⚠️ [Telegram] Missing TELEGRAM_BOT_TOKEN in .env. Bot disabled.');
        return;
    }

    const bot = new TelegramBot(token, { polling: true });

    console.log('🤖 [Telegram] Bot integration module started.');

    bot.on('message', async (msg) => {
        try {
            const chatId = msg.chat.id;
            const text = msg.text;

            if (!text) return;

            // Log incoming messages for debugging
            console.log(`📩 [Telegram] Incoming from ${chatId} (Type: ${msg.chat.type}): ${text.substring(0, 40)}...`);

            // COMMAND: /id - Helps user find the correct Chat ID
            if (text === '/id') {
                bot.sendMessage(chatId, `🆔 Chat ID của bạn/group này là: ${chatId}`);
                return;
            }

            // Detect if message contains the keywords header (more flexible detection)
            if (text.toUpperCase().includes('TỪ KHÓA TÌM KIẾM')) {
                const lines = text.split('\n');
                
                // Parse keywords: Trim, remove empty, and filter out header/emoji lines
                const keywords = lines
                    .map(l => l.trim())
                    .filter(l => l && !l.includes('🔑') && !l.toUpperCase().includes('TỪ KHÓA'));

                if (keywords.length > 0) {
                    console.log(`📡 [Telegram] Found keywords: ${keywords.join(', ')}`);

                    // Transactional-like update: Clear old telegram-sourced entries (non-pinned)
                    await db.run("DELETE FROM trending_keywords WHERE source = 'telegram' AND is_pinned = 0");

                    // Insert new ones
                    for (const kw of keywords) {
                        const id = randomUUID();
                        await db.run(
                            `INSERT OR IGNORE INTO trending_keywords (id, keyword, heat_score, category, source) 
                             VALUES (?, ?, ?, ?, ?)`,
                            [id, kw, 85, 'general', 'telegram']
                        );
                    }

                    // Send confirmation back to the group
                    bot.sendMessage(chatId, `✅ Dashboard đã cập nhật ${keywords.length} Niches mới nhất từ Telegram!`);
                    console.log(`✅ [Telegram] Successfully updated ${keywords.length} niches in database.`);
                } else {
                    console.warn('⚠️ [Telegram] Detected header but no keywords found in the message.');
                }
            }
        } catch (error) {
            console.error('❌ [Telegram] Module Error:', error.message);
        }
    });

    bot.on('polling_error', (error) => {
        // Log more details for ETELEGRAM errors
        if (error.code === 'ETELEGRAM') {
            console.error(`❌ [Telegram] API Error: ${error.message} (Check for token conflicts or invalid token)`);
        } else if (error.code !== 'EFATAL') {
            console.warn(`⚠️ [Telegram] Polling warning: ${error.code}`);
        } else {
            console.error('❌ [Telegram] Fatal Polling Error:', error);
        }
    });
}

/**
 * Send a message to the configured group
 * @param {string} text - The message content
 */
function sendMessageToGroup(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_GROUP_ID;
    if (!token || !chatId) return;

    // We create a temporary bot instance to send the message if needed, 
    // or we could use the existing one. For simplicity, we use a direct fetch or the instance.
    const bot = new TelegramBot(token);
    bot.sendMessage(chatId, text).catch(err => console.error('❌ [Telegram] Push Message Failed:', err.message));
}

module.exports = { initTelegramBot, sendMessageToGroup };
