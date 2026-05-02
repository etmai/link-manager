/**
 * URL normalization utility.
 * Strips tracking params, lowercases hostname, removes trailing slashes.
 * @param {string} urlStr
 * @returns {string}
 */
function normalizeUrl(urlStr) {
    try {
        const { URL, URLSearchParams } = require('url');
        const url = new URL(urlStr.trim());

        url.hostname = url.hostname.toLowerCase();

        let pathname = url.pathname;
        if (pathname.endsWith('/') && pathname.length > 1) {
            pathname = pathname.slice(0, -1);
        }

        const discardParams = [
            'utm_source', 'utm_medium', 'utm_campaign',
            'utm_term', 'utm_content', 'ref', 'index', 'query_id',
        ];

        const params = new URLSearchParams(url.search);
        discardParams.forEach((p) => params.delete(p));

        const search = params.toString();
        return `${url.protocol}//${url.hostname}${pathname}${search ? '?' + search : ''}${url.hash}`.replace(/\/$/, '');
    } catch {
        return urlStr.trim();
    }
}

module.exports = { normalizeUrl };
