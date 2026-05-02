/**
 * HTTP fetch with redirect following support (for Google Sheets CSV).
 * @param {string} url
 * @param {number} [depth=0]
 * @returns {Promise<string>}
 */
function fetchWithRedirects(url, depth = 0) {
    if (depth > 5) throw new Error('Too many redirects');
    const https = require('https');

    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(fetchWithRedirects(res.headers.location, depth + 1));
            } else {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => resolve(data));
            }
        }).on('error', reject);
    });
}

module.exports = { fetchWithRedirects };
