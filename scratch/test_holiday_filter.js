const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function test() {
    const db = await open({
        filename: 'database.sqlite',
        driver: sqlite3.Database
    });

    const today = new Date();
    console.log('Today:', today.toISOString().split('T')[0]);

    const holidays = await db.all('SELECT * FROM usa_holidays ORDER BY date ASC');
    
    const seen = new Set();
    const filtered = holidays.map(h => {
        const hDate = new Date(h.date);
        const diffTime = hDate - today;
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...h, days_left: daysLeft };
    }).filter(h => {
        // 1. De-duplicate by name + date
        const key = `${h.name}|${h.date}`;
        if (seen.has(key)) return false;
        seen.add(key);

        // 2. Hide if less than 7 days left (applies to ALL)
        if (h.days_left < 7) {
            return false;
        }
        return true;
    });

    console.log('Filtered Holidays Count:', filtered.length);
    filtered.forEach(h => {
        console.log(`${h.name} (${h.date}) - Days Left: ${h.days_left} - Group: ${h.priority_group}`);
    });

    await db.close();
}

test().catch(console.error);
