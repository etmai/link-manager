const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
};

async function test() {
    try {
        const res = await fetch('https://www.amazon.com/dp/b07fz8s74r', { headers: SCRAPE_HEADERS });
        console.log('Status:', res.status);
    } catch (e) {
        console.error(e);
    }
}
test();
