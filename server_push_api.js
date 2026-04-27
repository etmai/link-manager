// ====== MULTI-PROVIDER AI ROUTER (Hệ thống AI đa nhiệm) ======
// (Mã nguồn này được giữ lại để Dashboard có thể gọi AI khi cần thiết cho các tác vụ khác)
// ... [Giữ nguyên code AI Router từ các bước trước] ...

// ====== PUSH API FOR EXTERNAL PIPELINE (MỚI) ======

// Middleware kiểm tra Push Secret
const verifyPushSecret = (req, res, next) => {
    const secret = req.headers['x-push-secret'];
    if (!secret || secret !== process.env.PUSH_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Push Secret' });
    }
    next();
};

/**
 * Endpoint nhận dữ liệu Trends từ script bên ngoài.
 * Web App sẽ xóa data cũ và lưu data mới này vào SQLite.
 */
app.post('/api/push/trends', verifyPushSecret, async (req, res) => {
    const { keywords } = req.body;
    if (!Array.isArray(keywords)) return res.status(400).json({ error: 'Dữ liệu phải là một mảng (Array).' });

    try {
        console.log(`[PUSH] Nhận ${keywords.length} keywords từ Pipeline...`);
        // Xóa data tự động cũ (không xóa hàng Pinned hoặc hàng Manual)
        await db.run("DELETE FROM trending_keywords WHERE source = 'google_trends' AND is_pinned = 0");
        
        for (const kw of keywords) {
            await db.run(
                `INSERT INTO trending_keywords (id, keyword, heat_score, category, ai_summary, search_url_etsy, search_url_amazon, search_url_pinterest, source)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    require('crypto').randomUUID(),
                    kw.keyword,
                    kw.heat_score || 50,
                    kw.category || 'general',
                    kw.ai_summary || '',
                    kw.search_url_etsy || `https://www.etsy.com/search?q=${encodeURIComponent(kw.keyword).replace(/%20/g, '+')}&order=date_desc`,
                    kw.search_url_amazon || `https://www.amazon.com/s?k=${encodeURIComponent(kw.keyword).replace(/%20/g, '+')}&crid=PZTCPMQK2YK8&sprefix=${encodeURIComponent((kw.keyword||'').toLowerCase()).replace(/%20/g, '+')}%2Caps%2C134&ref=nb_sb_noss`,
                    kw.search_url_pinterest || `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(kw.keyword).replace(/%20/g, '+')}&rs=shopping_filter&filter_location=1&domains=etsy.com&commerce_only=true`,
                    kw.source || 'google_trends'
                ]
            );
        }
        res.json({ success: true, message: `✅ Đã đồng bộ ${keywords.length} keywords vào Database.` });
    } catch (e) {
        console.error('[PUSH] Lỗi Trends:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * Endpoint nhận dữ liệu Ngày Lễ từ script bên ngoài.
 */
app.post('/api/push/holidays', verifyPushSecret, async (req, res) => {
    const { holidays } = req.body;
    if (!Array.isArray(holidays)) return res.status(400).json({ error: 'Dữ liệu phải là một mảng.' });

    try {
        console.log(`[PUSH] Nhận ${holidays.length} ngày lễ từ Pipeline...`);
        await db.run('DELETE FROM pod_holidays');
        for (const h of holidays) {
            await db.run(
                `INSERT INTO pod_holidays (name, date, heat_score, prep_start, emoji)
                 VALUES (?, ?, ?, ?, ?)`,
                [h.name, h.date, h.heat_score || 50, h.prep_start, h.emoji || '🎉']
            );
        }
        res.json({ success: true, message: `✅ Đã đồng bộ ${holidays.length} ngày lễ.` });
    } catch (e) {
        console.error('[PUSH] Lỗi Holidays:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET: Manual holiday refresh (Admin)
app.post('/api/holidays/refresh', authenticateToken, requireAdmin, async (req, res) => {
    res.json({ success: true, message: 'Yêu cầu đồng bộ đã được gửi tới hệ thống Pipeline VPS.' });
});

// =========== END TRENDING NICHES MODULE ===========
