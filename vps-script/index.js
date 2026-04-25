const cron = require('node-cron');
const fetch = require('node-fetch');
require('dotenv').config();

// --- CONFIGURATION ---
const {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    WEBAPP_URL,
    PUSH_SECRET,
    TRENDS_GEO = 'US'
} = process.env;

const CATEGORY_EMOJIS = {
    pets: '🐾', family: '👨‍👩‍👧', hobbies: '🎸', fashion: '👗',
    seasonal: '🍂', humor: '😄', motivation: '💪', patriotic: '🇺🇸',
    general: '✨', shopping: '🛍️', public: '📅', gift: '🎁'
};

// --- HELPERS ---

async function sendTelegram(text, inlineButtons = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const body = {
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
    };
    if (inlineButtons) {
        body.reply_markup = { inline_keyboard: inlineButtons };
    }
    
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error('[TELEGRAM] Error:', e.message);
    }
}

async function pushToWebApp(endpoint, data) {
    try {
        const res = await fetch(`${WEBAPP_URL}/api/push/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-push-secret': PUSH_SECRET
            },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        console.log(`[PUSH] ${endpoint} result:`, result);
        return result;
    } catch (e) {
        console.error(`[PUSH] ${endpoint} error:`, e.message);
    }
}

// --- LOGIC: GOOGLE TRENDS ---

async function runTrendsPipeline() {
    console.log('[TRENDS] Starting pipeline...');
    try {
        const res = await fetch(`https://trends.google.com/trending/rss?geo=${TRENDS_GEO}`);
        const xml = await res.text();
        
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        
        while ((match = itemRegex.exec(xml)) !== null) {
            const content = match[1];
            const titleMatch = content.match(/<title>(.*?)<\/title>/);
            const trafficMatch = content.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
            
            if (titleMatch) {
                const keyword = titleMatch[1].trim();
                const trafficStr = trafficMatch ? trafficMatch[1].replace('+', '').replace(/,/g, '') : '0';
                items.push({ keyword, traffic: parseInt(trafficStr) || 0 });
            }
        }

        // Sort & Score
        const top15 = items.sort((a, b) => b.traffic - a.traffic).slice(0, 15);
        const keywords = top15.map((item, idx) => ({
            keyword: item.keyword,
            heat_score: Math.max(40, 95 - (idx * 4)),
            category: 'general', // VPS script doesn't need AI for basic push
            source: 'google_trends'
        }));

        // 1. Push to Web
        await pushToWebApp('trends', { keywords });

        // 2. Notify Telegram
        const dateStr = new Date().toLocaleDateString('vi-VN');
        const heatBar = (score) => '█'.repeat(Math.round(score/10)) + '░'.repeat(10-Math.round(score/10));
        
        let msg = `🔥 *HOT NICHES — ${dateStr}*\n\n`;
        keywords.slice(0, 10).forEach((kw, i) => {
            msg += `${i+1}. *${kw.keyword}*  [${heatBar(kw.heat_score)}] ${kw.heat_score}\n`;
        });
        
        const buttons = [[
            { text: '🚀 Xem trên Dinoz.cc', url: `${WEBAPP_URL}/#trending-niches` }
        ]];
        
        await sendTelegram(msg, buttons);
        console.log('[TRENDS] Pipeline completed.');

    } catch (e) {
        console.error('[TRENDS] Pipeline failed:', e.message);
    }
}

// --- LOGIC: HOLIDAYS ---

const HOLIDAYS_BASE = [
    { name: "Mother's Day", date: "05-11", emoji: "💐", heat: 95, prep_weeks: 8 },
    { name: "Father's Day", date: "06-15", emoji: "👔", heat: 90, prep_weeks: 8 },
    { name: "Independence Day", date: "07-04", emoji: "🎆", heat: 95, prep_weeks: 8 },
    { name: "Back to School", date: "08-15", emoji: "🍎", heat: 80, prep_weeks: 6 },
    { name: "Halloween", date: "10-31", emoji: "🎃", heat: 98, prep_weeks: 10 },
    { name: "Christmas", date: "12-25", emoji: "🎄", heat: 100, prep_weeks: 12 },
];

async function runHolidaysPipeline() {
    console.log('[HOLIDAYS] Starting pipeline...');
    try {
        const today = new Date();
        const year = today.getFullYear();
        
        const holidays = HOLIDAYS_BASE.map(h => {
            let hDate = new Date(`${year}-${h.date}`);
            if (hDate < today) hDate = new Date(`${year + 1}-${h.date}`);
            
            const pDate = new Date(hDate);
            pDate.setDate(pDate.getDate() - (h.prep_weeks * 7));
            
            return {
                name: h.name,
                date: hDate.toISOString().split('T')[0],
                heat_score: h.heat,
                prep_start: pDate.toISOString().split('T')[0],
                emoji: h.emoji,
                days_until: Math.ceil((hDate - today) / 86400000)
            };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        // 1. Push to Web
        await pushToWebApp('holidays', { holidays });

        // 2. Notify Telegram (chỉ gửi 3 cái gần nhất)
        const upcoming = holidays.slice(0, 3);
        let msg = `📅 *POD HOLIDAY COUNTDOWN*\n\n`;
        upcoming.forEach(h => {
            msg += `${h.emoji} *${h.name}*\n`;
            msg += `   → Còn ${h.days_until} ngày | 🔥${h.heat_score}\n`;
            if (new Date(h.prep_start) <= today) msg += `   ⚠️ *BẮT ĐẦU THIẾT KẾ NGAY!*\n`;
            msg += `\n`;
        });

        await sendTelegram(msg);
        console.log('[HOLIDAYS] Pipeline completed.');
        
    } catch (e) {
        console.error('[HOLIDAYS] Pipeline failed:', e.message);
    }
}

// --- SCHEDULER ---

// Mỗi ngày lúc 7:00 AM (giờ VPS)
cron.schedule('0 7 * * *', () => {
    console.log('[CRON] Morning Trends Refresh...');
    runTrendsPipeline();
});

// Mỗi thứ 2 lúc 8:00 AM
cron.schedule('0 8 * * 1', () => {
    console.log('[CRON] Weekly Holiday Update...');
    runHolidaysPipeline();
});

// Run once on startup for testing
console.log('[BOT] Dinoz Trends Bot is active!');
// runTrendsPipeline(); 
// runHolidaysPipeline();
