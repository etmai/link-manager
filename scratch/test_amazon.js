const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

async function test() {
    try {
        const res = await fetch('https://www.amazon.com/dp/B07FZ8S74R', { headers: SCRAPE_HEADERS });
        console.log('Status:', res.status);
        const html = await res.text();
        console.log('HTML Length:', html.length);
        if (html.includes('api-services-support@amazon.com') || html.includes('To discuss automated access')) {
            console.log('Robot check detected');
        } else {
            console.log('Title match?', html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
        }
    } catch (e) {
        console.error(e);
    }
}
test();
