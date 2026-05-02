/**
 * Web scraping helpers for Amazon, Etsy, eBay.
 */

const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
};

const SCRAPE_TIMEOUT_MS = 12000;

/**
 * Extract product title from raw HTML using regex patterns.
 * @param {string} html
 * @param {'amazon'|'etsy'|'ebay'} platform
 * @returns {string|null}
 */
function extractTitleFromHtml(html, platform) {
    let patterns = [];

    if (platform === 'amazon') {
        patterns = [
            /<span id="productTitle"[^>]*>([\s\S]*?)<\/span>/i,
            /<h1 id="title"[^>]*>([\s\S]*?)<\/h1>/i,
            /<meta name="title" content="([\s\S]*?)"/i,
            /<meta property="og:title" content="([\s\S]*?)"/i,
            /<title[^>]*>([\s\S]*?)<\/title>/i,
        ];
    } else if (platform === 'etsy') {
        patterns = [
            /<h1[^>]*data-buy-box-listing-title[^>]*>([\s\S]*?)<\/h1>/i,
            /<h1[^>]*class="[^"]*wt-text-body-01[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
            /<meta property="og:title" content="([\s\S]*?)"/i,
            /<title[^>]*>([\s\S]*?)<\/title>/i,
        ];
    } else if (platform === 'ebay') {
        patterns = [
            /<h1[^>]*class="x-item-title__mainTitle"[^>]*>([\s\S]*?)<\/h1>/i,
            /<h1[^>]*id="itemTitle"[^>]*>([\s\S]*?)<\/h1>/i,
            /<meta property="og:title" content="([\s\S]*?)"/i,
            /<title[^>]*>([\s\S]*?)<\/title>/i,
        ];
    }

    for (const regex of patterns) {
        const match = html.match(regex);
        if (match && match[1]) {
            let title = match[1].replace(/<[^>]*>/g, '').trim();
            if (platform === 'ebay') title = title.replace(/^Details about\s+/i, '');
            title = title
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
            if (platform === 'amazon' && (title.toLowerCase() === 'amazon.com' || title.toLowerCase() === 'amazon')) {
                continue;
            }
            if (title) return title;
        }
    }
    return null;
}

/**
 * Scrape a product page and return the title.
 * @param {'amazon'|'etsy'|'ebay'} platform
 * @param {string} id - ASIN for Amazon, listing ID for Etsy, item ID for eBay
 * @returns {Promise<{title: string}>}
 */
async function scrapeProduct(platform, id) {
    const urls = {
        amazon: `https://www.amazon.com/dp/${id}`,
        etsy: `https://www.etsy.com/listing/${id}`,
        ebay: `https://www.ebay.com/itm/${id}`,
    };

    const url = urls[platform];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: SCRAPE_HEADERS,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const html = await response.text();
        const title = extractTitleFromHtml(html, platform);

        if (!title) {
            const err = new Error(`Không tìm thấy tiêu đề ${platform}!`);
            err.status = 404;
            throw err;
        }
        return { title };
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = { SCRAPE_HEADERS, extractTitleFromHtml, scrapeProduct };
