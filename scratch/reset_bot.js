const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

async function reset() {
    console.log('--- BOT RESET TOOL ---');
    console.log('Token:', token);
    
    if (!token) {
        console.error('No token found in .env');
        return;
    }

    try {
        const bot = new TelegramBot(token);
        
        console.log('1. Checking bot info...');
        const me = await bot.getMe();
        console.log(`   Bot Name: ${me.first_name}`);
        console.log(`   Username: @${me.username}`);
        console.log(`   ID: ${me.id}`);

        console.log('2. Deleting Webhook...');
        await bot.deleteWebHook();
        console.log('   Webhook deleted.');

        console.log('3. Trying to "steal" session by calling getUpdates...');
        // Calling getUpdates will terminate other polling connections
        const updates = await bot.getUpdates({ offset: -1, limit: 1, timeout: 0 });
        console.log('   Successfully stole session. Other instances should have been disconnected.');
        console.log('   Updates found:', updates.length);

        console.log('4. Done. You can now try running the main app.');
    } catch (err) {
        console.error('❌ Error during reset:', err.message);
    }
}

reset();
