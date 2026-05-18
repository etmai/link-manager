const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

function extractTitleFromHtml(html, platform) {
    let patterns = [];
    if (platform === 'amazon') {
        patterns = [
            /<span id="productTitle"[^>]*>([\s\S]*?)<\/span>/i,
            /<h1 id="title"[^>]*>([\s\S]*?)<\/h1>/i,
            /<meta name="title" content="([\s\S]*?)"/i,
            /<meta property="og:title" content="([\s\S]*?)"/i,
            /<title[^>]*>([\s\S]*?)<\/title>/i
        ];
    }

    for (let regex of patterns) {
        const match = html.match(regex);
        if (match && match[1]) {
            let title = match[1].replace(/<[^>]*>/g, '').trim();
            // Simple HTML entity decoding
            title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            console.log('Regex match:', regex, 'Raw title:', title);
            // Filter out generic Amazon page titles
            if (platform === 'amazon' && (title.toLowerCase() === 'amazon.com' || title.toLowerCase() === 'amazon' || title.toLowerCase() === 'amazon.com. spend less. smile more.')) {
                console.log('Filtered out title:', title);
                continue;
            }
            if (title) return title;
        }
    }
    return null;
}

async function test() {
    try {
        const res = await fetch('https://www.amazon.com/dp/B07FZ8S74R', { headers: SCRAPE_HEADERS });
        const html = await res.text();
        const title = extractTitleFromHtml(html, 'amazon');
        console.log('Extracted title:', title);
    } catch (e) {
        console.error(e);
    }
}
test();
