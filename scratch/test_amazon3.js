const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

async function test() {
    try {
        const res = await fetch('https://www.amazon.com/dp/B07FZ8S74R', { headers: SCRAPE_HEADERS });
        console.log('Status:', res.status);
        const html = await res.text();
        console.log('Title match?', html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    } catch (e) {
        console.error(e);
    }
}
test();
