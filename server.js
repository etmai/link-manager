const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { randomUUID } = require('crypto');
const { URL, URLSearchParams } = require('url');
const https = require('https');
const http = require('http');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();
const { initTelegramBot, sendMessageToGroup } = require('./telegram-bot');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau.' }
});
app.use('/api/auth/', authLimiter);

// Prevent browser caching for HTML files to ensure updates are visible immediately
app.use((req, res, next) => {
    if (req.url === '/' || req.url.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Định tuyến trỏ HTML/CSS/JS thuần từ folder public
app.use(express.static(path.join(__dirname, 'public')));

let db;

// HELPERS
function normalizeUrl(urlStr) {
    try {
        const url = new URL(urlStr.trim());
        // Normalizing: lowercase hostname
        url.hostname = url.hostname.toLowerCase();
        
        // Normalizing: remove trailing slash from pathname
        let pathname = url.pathname;
        if (pathname.endsWith('/') && pathname.length > 1) {
            pathname = pathname.slice(0, -1);
        }
        
        // List of tracking/navigation parameters to discard
        const discardParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'index', 'query_id'];
        
        const params = new URLSearchParams(url.search);
        discardParams.forEach(p => params.delete(p));
        
        // Reconstruct
        const search = params.toString();
        return `${url.protocol}//${url.hostname}${pathname}${search ? '?' + search : ''}${url.hash}`.replace(/\/$/, ""); 
    } catch (e) {
        return urlStr.trim();
    }
}

// INITIALIZE DATABASE
async function initDb() {
    db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS categories (
            name TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            date TEXT NOT NULL,
            sampleDate TEXT,
            categories TEXT NOT NULL,
            updatedAt TEXT,
            createdAt TEXT NOT NULL,
            addedBy TEXT,
            updatedBy TEXT
        );
        CREATE TABLE IF NOT EXISTS sales_entries (
            id TEXT PRIMARY KEY,
            account TEXT NOT NULL,
            fulfillment TEXT DEFAULT '',
            design_id TEXT DEFAULT '',
            sku TEXT NOT NULL,
            title TEXT,
            ord_id TEXT DEFAULT '',
            custom TEXT DEFAULT '',
            size TEXT DEFAULT '',
            filename TEXT DEFAULT '',
            sales INTEGER NOT NULL DEFAULT 0,
            date TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            addedBy TEXT
        );
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS merchants (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fulfillments (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS work_schedule (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            userId TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            createdBy TEXT,
            creatorRole TEXT DEFAULT 'user',
            createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sample_requests (
            id TEXT PRIMARY KEY,
            designId TEXT NOT NULL,
            requester TEXT NOT NULL,
            requestDate TEXT NOT NULL,
            status TEXT DEFAULT 'Process',
            productLink TEXT DEFAULT 'N/A',
            expiryDate TEXT DEFAULT 'N/A',
            createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS finance_entries (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            fulfillment_cost REAL DEFAULT 0,
            fulfillment_note TEXT DEFAULT '',
            other_cost REAL DEFAULT 0,
            other_note TEXT DEFAULT '',
            payment REAL DEFAULT 0,
            payment_note TEXT DEFAULT '',
            createdAt TEXT NOT NULL,
            addedBy TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS task_comments (
            id TEXT PRIMARY KEY,
            taskId TEXT NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usa_holidays (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            days_left INTEGER,
            priority_group TEXT,
            updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            apiKey TEXT NOT NULL,
            priority INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS ai_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    // Add default system prompt if not exists
    const existingPrompt = await db.get("SELECT value FROM ai_settings WHERE key = 'system_prompt'");
    if (!existingPrompt) {
        const defaultPrompt = `Bạn là một chuyên gia nghiên cứu thị trường Print on Demand (POD) hàng đầu tại Mỹ. Hãy phân tích từ khóa: "{keyword}". Phân tích dựa trên các tiêu chí thẩm mỹ, tâm lý khách hàng Mỹ, và xu hướng thiết kế hiện tại.
Kết quả trả về phải là một đối tượng JSON hợp lệ với cấu trúc sau:
{
  "meaning": "Giải thích ngắn gọn ý nghĩa của ngách này trong văn hóa Mỹ.",
  "audience": "Mô tả chi tiết chân dung khách hàng (Sở thích, độ tuổi, lý do họ mua sản phẩm này).",
  "design_ideas": ["Ý tưởng thiết kế 1: chi tiết hình ảnh, text", "Ý tưởng thiết kế 2...", "Ý tưởng thiết kế 3..."],
  "keywords_related": ["từ khóa SEO 1", "từ khóa SEO 2...", "từ khóa SEO 3..."],
  "style_tips": "Gợi ý màu sắc, phông chữ (ví dụ: Vintage, Retro, Minimalist) và loại sản phẩm phù hợp nhất (T-shirt, Mug, Poster)."
}
Lưu ý: Chỉ trả về JSON duy nhất, không thêm bất kỳ văn bản giải thích nào trước hoặc sau JSON.`;
        await db.run("INSERT INTO ai_settings (key, value) VALUES ('system_prompt', ?)", [defaultPrompt]);
    }

    // Add columns if they don't exist (Migration)
    const columns = await db.all("PRAGMA table_info(links)");
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('addedBy')) {
        await db.run("ALTER TABLE links ADD COLUMN addedBy TEXT");
    }
    if (!columnNames.includes('updatedBy')) {
        await db.run("ALTER TABLE links ADD COLUMN updatedBy TEXT");
    }
    if (!columnNames.includes('sampleDate')) {
        await db.run("ALTER TABLE links ADD COLUMN sampleDate TEXT");
    }

    // Migration for work_schedule
    const scheduleCols = await db.all("PRAGMA table_info(work_schedule)");
    const scheduleColNames = scheduleCols.map(c => c.name);
    if (!scheduleColNames.includes('createdBy')) {
        await db.run("ALTER TABLE work_schedule ADD COLUMN createdBy TEXT");
    }
    if (!scheduleColNames.includes('trelloCardId')) {
        await db.run("ALTER TABLE work_schedule ADD COLUMN trelloCardId TEXT");
    }
    if (!scheduleColNames.includes('categories')) {
        await db.run("ALTER TABLE work_schedule ADD COLUMN categories TEXT");
    }
    if (!scheduleColNames.includes('creatorRole')) {
        await db.run("ALTER TABLE work_schedule ADD COLUMN creatorRole TEXT DEFAULT 'admin'");
        // Update existing rows creatorRole if possible
        await db.run(`
            UPDATE work_schedule 
            SET creatorRole = (SELECT role FROM users WHERE username = work_schedule.createdBy)
            WHERE EXISTS (SELECT 1 FROM users WHERE username = work_schedule.createdBy)
        `);
    }

    // Migration for sales_entries — ensure all required columns exist
    const salesCols = await db.all("PRAGMA table_info(sales_entries)");
    const salesColNames = salesCols.map(c => c.name);
    const salesNeeded = [
        ['fulfillment', "TEXT DEFAULT ''"],
        ['design_id',   "TEXT DEFAULT ''"],
        ['ord_id',      "TEXT DEFAULT ''"],
        ['custom',      "TEXT DEFAULT ''"],
        ['size',        "TEXT DEFAULT 'N/A'"],
        ['filename',    "TEXT DEFAULT ''"],
        ['title',       "TEXT DEFAULT ''"],
        ['account',     "TEXT DEFAULT ''"],
        ['sku',         "TEXT DEFAULT ''"],
        ['date',        "TEXT DEFAULT ''"],
        ['sales',       "INTEGER DEFAULT 0"],
        ['createdAt',   "TEXT DEFAULT ''"],
        ['addedBy',     "TEXT DEFAULT ''"],
    ];
    for (const [col, def] of salesNeeded) {
        if (!salesColNames.includes(col)) {
            await db.run(`ALTER TABLE sales_entries ADD COLUMN ${col} ${def}`);
        }
    }


    // Check if admin exists
    const admin = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!admin) {
        // Hash password before storing
        const hashedPassword = await bcrypt.hash('Hello0', 10);
        await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', hashedPassword, 'admin']);
    }

    // Default categories
    const countCats = await db.get('SELECT COUNT(*) as count FROM categories');
    if (countCats.count === 0) {
        const defaults = ["Tài liệu nội bộ", "Thiết kế UI/UX", "Mã nguồn", "Tham khảo ngoại bộ"];
        for (const cat of defaults) {
            await db.run('INSERT INTO categories (name) VALUES (?)', [cat]);
        }
    }

    // Default accounts
    const countAccs = await db.get('SELECT COUNT(*) as count FROM accounts');
    if (countAccs.count === 0) {
        const defaults = ["Amazon_Main", "Etsy_Shop1", "eBay_Direct"];
        for (const acc of defaults) {
            const id = randomUUID();
            await db.run('INSERT INTO accounts (id, name) VALUES (?, ?)', [id, acc]);
        }
    }

    // Default merchants
    const countMerchants = await db.get('SELECT COUNT(*) as count FROM merchants');
    if (countMerchants.count === 0) {
        const defaults = ["Amazon", "Etsy", "eBay", "Shopify", "Khác"];
        for (const m of defaults) {
            const id = randomUUID();
            await db.run('INSERT INTO merchants (id, name) VALUES (?, ?)', [id, m]);
        }
    }

    // Default fulfillments
    const countFulfillments = await db.get('SELECT COUNT(*) as count FROM fulfillments');
    if (countFulfillments.count === 0) {
        const defaults = ["Gearment", "CustomCat", "Printful", "Printify", "Khác"];
        for (const f of defaults) {
            const id = randomUUID();
            await db.run('INSERT INTO fulfillments (id, name) VALUES (?, ?)', [id, f]);
        }
    }
    console.log('SQL Database initialized successfully.');
}

// ACCOUNTS & MERCHANTS CRUD moved to bottom of API section

// MIDDLEWARES (BẢO VỆ NGUỒN REST API XÂM NHẬP TRÁI PHÉP BẰNG TOKENS)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN
    
    if (token == null) return res.status(401).json({ error: "Không tìm thấy token. Mời bạn đăng nhập lại!" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token không hợp lệ hoặc đã hết hạn." });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Chỉ Admin mới có đặc quyền gọi API này." });
    }
}

// =========== API ROUTES ===========

// DEBUG: Schema info (Admin only)
app.get('/api/debug/schema', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        const schema = {};
        for (const t of tables) {
            schema[t.name] = await db.all(`PRAGMA table_info(${t.name})`);
        }
        res.json(schema);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AUTH
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    
    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng!" });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [req.user.username]);
    
    if (!(await bcrypt.compare(oldPassword, user.password))) {
        return res.status(400).json({ error: "Mật khẩu cũ không chính xác!" });
    }
    // Hash new password before storing
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, req.user.username]);
    res.json({ success: true });
});

// USERS (Admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const users = await db.all('SELECT username, role FROM users');
    res.json(users);
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    const exists = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (exists) return res.status(400).json({ error: "Tên đăng nhập đã tồn tại!" });
    
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, role]);
    res.json({ success: true });
});

app.delete('/api/users/:username', authenticateToken, requireAdmin, async (req, res) => {
    const { username } = req.params;
    if (username === req.user.username) return res.status(400).json({ error: "Không thể tự xóa bản thân!" });

    const target = await db.get('SELECT role FROM users WHERE username = ?', [username]);
    if (!target) return res.status(404).json({ error: "Người dùng không tồn tại!" });

    if (target.role === 'admin') {
        const countAdm = await db.get('SELECT COUNT(*) as c FROM users WHERE role = "admin"');
        if (countAdm.c <= 1) return res.status(400).json({ error: "Phải giữ lại ít nhất 1 Admin trong Database!" });
    }

    await db.run('DELETE FROM users WHERE username = ?', [username]);
    res.json({ success: true });
});

app.post('/api/users/:username/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    const { username } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: "Mật khẩu mới không được trống!" });
    
    const exists = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!exists) return res.status(404).json({ error: "Người dùng không tồn tại!" });
    
    // Hash new password before storing
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, username]);
    res.json({ success: true });
});

// CATEGORIES
app.get('/api/categories', authenticateToken, async (req, res) => {
    const cats = await db.all('SELECT name FROM categories');
    res.json(cats.map(c => c.name));
});

app.post('/api/categories', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    const exists = await db.get('SELECT * FROM categories WHERE name = ?', [name]);
    if (exists) return res.status(400).json({ error: "Danh mục đã tồn tại!" });
    
    await db.run('INSERT INTO categories (name) VALUES (?)', [name]);
    res.json({ success: true });
});

app.delete('/api/categories/:name', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.params;
    await db.run('DELETE FROM categories WHERE name = ?', [name]);
    
    // Xóa category khỏi các links
    const links = await db.all('SELECT id, categories FROM links');
    for (const link of links) {
        let cats = JSON.parse(link.categories);
        if (cats.includes(name)) {
            cats = cats.filter(c => c !== name);
            await db.run('UPDATE links SET categories = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(cats), new Date().toISOString(), link.id]);
        }
    }
    res.json({ success: true });
});

app.put('/api/categories/:oldName', authenticateToken, requireAdmin, async (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;
    
    const exists = await db.get('SELECT * FROM categories WHERE name = ?', [newName]);
    if (exists) return res.status(400).json({ error: "Tên danh mục mới đã bị trùng với bộ Data khác!" });
    
    await db.run('UPDATE categories SET name = ? WHERE name = ?', [newName, oldName]);
    
    // Cập nhật các link có category này
    const links = await db.all('SELECT id, categories FROM links');
    for (const link of links) {
        let cats = JSON.parse(link.categories);
        const idx = cats.indexOf(oldName);
        if (idx !== -1) {
            cats[idx] = newName;
            await db.run('UPDATE links SET categories = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(cats), new Date().toISOString(), link.id]);
        }
    }
    res.json({ success: true });
});

// LINKS
app.get('/api/links', authenticateToken, async (req, res) => {
    const rows = await db.all('SELECT * FROM links');
    // Parse JSON array
    const links = rows.map(r => ({
        ...r,
        categories: JSON.parse(r.categories)
    }));
    res.json(links);
});

app.post('/api/links/batch', authenticateToken, async (req, res) => {
    const { linksData, forceSaveCheckbox } = req.body; 
    
    let dbLinksRows = await db.all('SELECT * FROM links');
    let dbLinks = dbLinksRows.map(r => ({ ...r, categories: JSON.parse(r.categories) }));
    
    let updatedCount = 0;
    let newCount = 0;
    let forbiddenCount = 0;
    
    try {
        await db.exec('BEGIN TRANSACTION');
        for (const data of linksData) {
            const normalizedInput = normalizeUrl(data.url);
            const existingIndex = dbLinks.findIndex(l => normalizeUrl(l.url) === normalizedInput);
            if (existingIndex !== -1 && forceSaveCheckbox) {
                const existing = dbLinks[existingIndex];
                if (req.user.role === 'admin' || existing.addedBy === req.user.username) {
                    const mergedCats = [...new Set([...existing.categories, ...data.categories])];
                    await db.run('UPDATE links SET date = ?, sampleDate = ?, categories = ?, updatedAt = ?, updatedBy = ? WHERE id = ?',
                        [data.date, data.sampleDate || null, JSON.stringify(mergedCats), new Date().toISOString(), req.user.username, existing.id]);
                    updatedCount++;
                } else {
                    forbiddenCount++;
                }
            } else if (existingIndex === -1) {
                const newId = randomUUID();
                await db.run('INSERT INTO links (id, url, date, sampleDate, categories, createdAt, addedBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [newId, data.url, data.date, data.sampleDate || null, JSON.stringify(data.categories), new Date().toISOString(), req.user.username]);
                newCount++;
            }
        }
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Batch operation failed:', error);
        return res.status(500).json({ error: 'Không thể thực hiện thao tác batch. Đã rollback.' });
    }
    
    res.json({ newCount, updatedCount, forbiddenCount });
});

app.put('/api/links/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { url, date, sampleDate, categories } = req.body;
    
    const link = await db.get('SELECT * FROM links WHERE id = ?', [id]);
    if (!link) return res.status(404).json({ error: "Không tìm thấy link!" });

    // Admin or Creator can edit
    if (req.user.role !== 'admin' && link.addedBy !== req.user.username) {
        return res.status(403).json({ error: "Bạn không có quyền chỉnh sửa link của người khác!" });
    }
    
    await db.run('UPDATE links SET url = ?, date = ?, sampleDate = ?, categories = ?, updatedAt = ?, updatedBy = ? WHERE id = ?',
        [url, date, sampleDate || null, JSON.stringify(categories), new Date().toISOString(), req.user.username, id]);
    res.json({ success: true });
});

app.delete('/api/links/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    const link = await db.get('SELECT * FROM links WHERE id = ?', [id]);
    if (!link) return res.status(404).json({ error: "Không tìm thấy link!" });

    // Admin or Creator can delete
    if (req.user.role !== 'admin' && link.addedBy !== req.user.username) {
        return res.status(403).json({ error: "Bạn không có quyền xóa link của người khác!" });
    }

    await db.run('DELETE FROM links WHERE id = ?', [id]);
    res.json({ success: true });
});

// =========== SALES MANAGEMENT API ===========

// =========== WEB SCRAPING HELPERS ===========

// Helper function to extract title using multiple regex patterns
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
    } else if (platform === 'etsy') {
        patterns = [
            /<h1[^>]*data-buy-box-listing-title[^>]*>([\s\S]*?)<\/h1>/i,
            /<h1[^>]*class="[^"]*wt-text-body-01[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
            /<meta property="og:title" content="([\s\S]*?)"/i,
            /<title[^>]*>([\s\S]*?)<\/title>/i
        ];
    } else if (platform === 'ebay') {
        patterns = [
            /<h1[^>]*class="x-item-title__mainTitle"[^>]*>([\s\S]*?)<\/h1>/i,
            /<h1[^>]*id="itemTitle"[^>]*>([\s\S]*?)<\/h1>/i,
            /<meta property="og:title" content="([\s\S]*?)"/i,
            /<title[^>]*>([\s\S]*?)<\/title>/i
        ];
    }

    for (let regex of patterns) {
        const match = html.match(regex);
        if (match && match[1]) {
            let title = match[1].replace(/<[^>]*>/g, '').trim();
            if (platform === 'ebay') title = title.replace(/^Details about\s+/i, '');
            // Simple HTML entity decoding
            title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            // Filter out generic Amazon page titles
            if (platform === 'amazon' && (title.toLowerCase() === 'amazon.com' || title.toLowerCase() === 'amazon')) continue;
            if (title) return title;
        }
    }
    return null;
}

const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

app.get('/api/scrape/amazon/:asin', authenticateToken, async (req, res) => {
    const { asin } = req.params;
    console.log(`[SCRAPER] Amazon ASIN: ${asin}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    
    try {
        const response = await fetch(`https://www.amazon.com/dp/${asin}`, { 
            headers: SCRAPE_HEADERS,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const html = await response.text();
        console.log(`[SCRAPER] Amazon Response: ${response.status}, HTML Length: ${html.length}`);
        
        if (html.includes('api-services-support@amazon.com') || html.includes('To discuss automated access')) {
            console.warn('[SCRAPER] Amazon detected automated access (Robot Check).');
        }

        const title = extractTitleFromHtml(html, 'amazon');
        if (title) {
            console.log(`[SCRAPER] Success: ${title.substring(0, 50)}...`);
            res.json({ title });
        } else {
            console.error('[SCRAPER] Title not found in HTML.');
            res.status(404).json({ error: 'Không tìm thấy tiêu đề Amazon! (Regex failure or CAPTCHA)' });
        }
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`[SCRAPER] Amazon Error: ${error.message}`);
        res.status(500).json({ error: 'Lỗi Amazon: ' + error.message });
    }
});

app.get('/api/scrape/etsy/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(`https://www.etsy.com/listing/${id}`, { 
            headers: SCRAPE_HEADERS,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const html = await response.text();
        const title = extractTitleFromHtml(html, 'etsy');
        if (title) res.json({ title });
        else res.status(404).json({ error: 'Không tìm thấy tiêu đề Etsy!' });
    } catch (error) {
        clearTimeout(timeoutId);
        res.status(500).json({ error: 'Lỗi Etsy: ' + error.message });
    }
});

app.get('/api/scrape/ebay/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(`https://www.ebay.com/itm/${id}`, { 
            headers: SCRAPE_HEADERS,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const html = await response.text();
        const title = extractTitleFromHtml(html, 'ebay');
        if (title) res.json({ title });
        else res.status(404).json({ error: 'Không tìm thấy tiêu đề eBay!' });
    } catch (error) {
        clearTimeout(timeoutId);
        res.status(500).json({ error: 'Lỗi eBay: ' + error.message });
    }
});

// USA Holiday Countdown
app.get('/api/usa-holidays', async (req, res) => {
    try {
        const holidays = await db.all('SELECT * FROM usa_holidays ORDER BY date ASC');
        res.json(holidays);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trending Keywords Endpoints
app.get('/api/trending-keywords', async (req, res) => {
    const rows = await db.all('SELECT * FROM sales_entries ORDER BY date DESC, createdAt DESC');
    res.json(rows);
});

// GET: Lấy tất cả sales entries
app.get('/api/sales', authenticateToken, async (req, res) => {
    const rows = await db.all('SELECT * FROM sales_entries ORDER BY date DESC, createdAt DESC');
    res.json(rows);
});

// POST: Thêm bản ghi sales mới (Admin only)
app.post('/api/sales', authenticateToken, requireAdmin, async (req, res) => {
    const body = req.body || {};
    const account = (body.account || '').toString().trim();
    const fulfillment = (body.fulfillment || '').toString().trim();
    const design_id = (body.design_id || '').toString().trim();
    const sku = (body.sku || '').toString().trim().toUpperCase();
    const title = (body.title || '').toString().trim();
    const ord_id = (body.ord_id || '').toString().trim();
    const custom = (body.custom || '').toString().trim();
    const size = (body.size || 'N/A').toString().trim() || 'N/A';
    const filename = (body.filename || '').toString().trim();
    const date = (body.date || '').toString().trim();
    const salesNum = parseInt(body.sales ?? 0) || 0;

    if (!account || !sku || !date) {
        const missing = [!account && 'Account', !sku && 'SKU', !date && 'Ngày'].filter(Boolean).join(', ');
        console.error('[SALES POST] Thiếu fields:', { account, sku, date, body: req.body });
        return res.status(400).json({ error: `Thiếu thông tin bắt buộc: ${missing}` });
    }

    const id = randomUUID();
    try {
        await db.run(
            'INSERT INTO sales_entries (id, account, merchant, category, fulfillment, design_id, sku, title, ord_id, custom, size, filename, sales, date, createdAt, addedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, account, '', '', fulfillment, design_id, sku, title, ord_id, custom, size, filename, salesNum, date, new Date().toISOString(), req.user.username]
        );
        res.json({ success: true, id });
    } catch (error) {
        console.error('Sales insert failed:', error);
        res.status(500).json({ error: `Không thể thêm bản ghi sales: ${error.message}` });
    }
});

// PUT: Cập nhật bản ghi sales (Admin only)
app.put('/api/sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    const account = (body.account || '').toString().trim();
    const fulfillment = (body.fulfillment || '').toString().trim();
    const design_id = (body.design_id || '').toString().trim();
    const sku = (body.sku || '').toString().trim().toUpperCase();
    const title = (body.title || '').toString().trim();
    const ord_id = (body.ord_id || '').toString().trim();
    const custom = (body.custom || '').toString().trim();
    const size = (body.size || 'N/A').toString().trim() || 'N/A';
    const filename = (body.filename || '').toString().trim();
    const date = (body.date || '').toString().trim();
    const salesNum = parseInt(body.sales ?? 0) || 0;

    const entry = await db.get('SELECT * FROM sales_entries WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy bản ghi!' });

    try {
        await db.run(
            'UPDATE sales_entries SET account=?, merchant=?, category=?, fulfillment=?, design_id=?, sku=?, title=?, ord_id=?, custom=?, size=?, filename=?, sales=?, date=? WHERE id=?',
            [account, '', '', fulfillment, design_id, sku, title, ord_id, custom, size, filename, salesNum, date, id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Sales update failed:', error);
        res.status(500).json({ error: 'Không thể cập nhật bản ghi sales.' });
    }
});

// DELETE: Xóa bản ghi sales (Admin only)
app.delete('/api/sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const entry = await db.get('SELECT * FROM sales_entries WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy bản ghi!' });

    await db.run('DELETE FROM sales_entries WHERE id = ?', [id]);
    res.json({ success: true });
});

// =========== ACCOUNTS CRUD ===========
app.get('/api/accounts', authenticateToken, async (req, res) => {
    const rows = await db.all('SELECT * FROM accounts ORDER BY name ASC');
    res.json(rows);
});

app.post('/api/accounts', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên account không được để trống!' });
    const id = randomUUID();
    try {
        await db.run('INSERT INTO accounts (id, name) VALUES (?, ?)', [id, name.trim()]);
        res.json({ success: true, id });
    } catch (err) { res.status(400).json({ error: 'Tên account đã tồn tại!' }); }
});

app.delete('/api/accounts/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    await db.run('DELETE FROM accounts WHERE id = ?', [id]);
    res.json({ success: true });
});

app.put('/api/accounts/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên account không được để trống!' });
    try {
        await db.run('UPDATE accounts SET name = ? WHERE id = ?', [name.trim(), id]);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ error: 'Tên account đã tồn tại hoặc lỗi!' }); }
});

// =========== MERCHANTS CRUD ===========
app.get('/api/merchants', authenticateToken, async (req, res) => {
    const rows = await db.all('SELECT * FROM merchants ORDER BY name ASC');
    res.json(rows);
});

app.post('/api/merchants', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên merchant không được để trống!' });
    const id = randomUUID();
    try {
        await db.run('INSERT INTO merchants (id, name) VALUES (?, ?)', [id, name.trim()]);
        res.json({ success: true, id });
    } catch (err) { res.status(400).json({ error: 'Tên merchant đã tồn tại!' }); }
});

app.delete('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    await db.run('DELETE FROM merchants WHERE id = ?', [id]);
    res.json({ success: true });
});

app.put('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên merchant không được để trống!' });
    try {
        await db.run('UPDATE merchants SET name = ? WHERE id = ?', [name.trim(), id]);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ error: 'Tên merchant đã tồn tại hoặc lỗi!' }); }
});

// =========== FULFILLMENTS CRUD ===========
app.get('/api/fulfillments', authenticateToken, async (req, res) => {
    const rows = await db.all('SELECT * FROM fulfillments ORDER BY name ASC');
    res.json(rows);
});

app.post('/api/fulfillments', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên fulfillment không được để trống!' });
    const id = randomUUID();
    try {
        await db.run('INSERT INTO fulfillments (id, name) VALUES (?, ?)', [id, name.trim()]);
        res.json({ success: true, id });
    } catch (err) { res.status(400).json({ error: 'Tên fulfillment đã tồn tại!' }); }
});

app.delete('/api/fulfillments/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    await db.run('DELETE FROM fulfillments WHERE id = ?', [id]);
    res.json({ success: true });
});

app.put('/api/fulfillments/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên fulfillment không được để trống!' });
    try {
        await db.run('UPDATE fulfillments SET name = ? WHERE id = ?', [name.trim(), id]);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ error: 'Tên fulfillment đã tồn tại hoặc lỗi!' }); }
});

// =========== WORK SCHEDULE CRUD ===========
app.get('/api/schedule', authenticateToken, async (req, res) => {
    const { user } = req.query;
    let query = 'SELECT * FROM work_schedule';
    let params = [];

    if (req.user.role === 'admin') {
        if (user && user !== 'all') {
            query += ' WHERE userId = ?';
            params.push(user);
        }
    } else {
        // Regular user only see their own
        query += ' WHERE userId = ?';
        params.push(req.user.username);
    }
    
    query += ' ORDER BY date ASC, createdAt ASC';
    const rows = await db.all(query, params);
    res.json(rows);
});

app.post('/api/schedule', authenticateToken, async (req, res) => {
    const { title, description, date, userId, categories } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Tiêu đề và ngày không được để trống!' });
    
    // Default to self, but admin can assign to others
    let targetUser = req.user.username;
    if (req.user.role === 'admin' && userId) {
        targetUser = userId;
    }

    const id = randomUUID();
    await db.run(
        'INSERT INTO work_schedule (id, title, description, date, userId, status, createdBy, creatorRole, createdAt, categories) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, title.trim(), description || '', date, targetUser, 'pending', req.user.username, req.user.role, new Date().toISOString(), JSON.stringify(categories || [])]
    );
    res.json({ success: true, id });
});

app.put('/api/schedule/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, date, status, userId, categories } = req.body;
    
    const entry = await db.get('SELECT * FROM work_schedule WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy công việc!' });
    
    // Permission check
    const isAdmin = req.user.role === 'admin';
    const isCreator = entry.createdBy === req.user.username;
    const isAssignee = entry.userId === req.user.username;
    const isAdminCreated = entry.creatorRole === 'admin';

    // Users can view/comment/complete Admin-created tasks
    if (!isAdmin && !isCreator && !isAssignee && !isAdminCreated) {
        return res.status(403).json({ error: 'Bạn không có quyền thao tác trên công việc này!' });
    }

    // If not Admin and not Creator, can ONLY update status
    // If it's an Admin-created task, any user can update status (according to request)
    if (!isAdmin && !isCreator) {
        if (title || description || date || userId || categories) {
            return res.status(403).json({ error: 'Bạn chỉ có quyền cập nhật trạng thái (Hoàn thành) cho công việc này!' });
        }
    }

    // Admin can reassign
    let targetUser = entry.userId;
    if (req.user.role === 'admin' && userId) {
        targetUser = userId;
    }

    await db.run(
        'UPDATE work_schedule SET title = ?, description = ?, date = ?, status = ?, userId = ?, categories = ? WHERE id = ?',
        [title || entry.title, description !== undefined ? description : entry.description, date || entry.date, status || entry.status, targetUser, JSON.stringify(categories || JSON.parse(entry.categories || '[]')), id]
    );
    res.json({ success: true });
});

app.delete('/api/schedule/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const entry = await db.get('SELECT * FROM work_schedule WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy công việc!' });
    
    // Permission check: Only admin or creator can delete
    const isAdmin = req.user.role === 'admin';
    const isCreator = entry.createdBy === req.user.username;

    if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: 'Bạn không có quyền xóa công việc này!' });
    }

    // Secondary check: Non-admins cannot delete Admin-created tasks
    if (!isAdmin && entry.creatorRole === 'admin') {
        return res.status(403).json({ error: 'Bạn không thể xóa công việc được tạo bởi Admin!' });
    }

    // Delete from Trello if synced
    if (entry.trelloCardId) {
        const key = process.env.TRELLO_API_KEY;
        const token = process.env.TRELLO_TOKEN;
        try {
            await fetch(`https://api.trello.com/1/cards/${entry.trelloCardId}?key=${key}&token=${token}`, {
                method: 'DELETE'
            });
        } catch (trelloErr) {
            console.error('Trello card deletion failed (skipping):', trelloErr.message);
        }
    }

    await db.run('DELETE FROM work_schedule WHERE id = ?', [id]);
    // Delete comments
    await db.run('DELETE FROM task_comments WHERE taskId = ?', [id]);
    res.json({ success: true });
});

// Task comments
app.get('/api/schedule/:taskId/comments', authenticateToken, async (req, res) => {
    const { taskId } = req.params;
    const rows = await db.all('SELECT * FROM task_comments WHERE taskId = ? ORDER BY createdAt ASC', [taskId]);
    res.json(rows);
});

app.post('/api/schedule/:taskId/comments', authenticateToken, async (req, res) => {
    const { taskId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Nội dung bình luận không được để trống!' });

    const id = randomUUID();
    await db.run(
        'INSERT INTO task_comments (id, taskId, username, content, createdAt) VALUES (?, ?, ?, ?, ?)',
        [id, taskId, req.user.username, content, new Date().toISOString()]
    );
    res.json({ success: true, id });
});

// =========== SAMPLE REQUESTS CRUD ===========
app.get('/api/samples', authenticateToken, async (req, res) => {
    let query = 'SELECT * FROM sample_requests';
    let params = [];

    if (req.user.role !== 'admin') {
        query += ' WHERE requester = ?';
        params.push(req.user.username);
    }
    
    query += ' ORDER BY createdAt DESC';
    const rows = await db.all(query, params);
    res.json(rows);
});

app.post('/api/samples', authenticateToken, async (req, res) => {
    const { designId } = req.body;
    if (!designId) return res.status(400).json({ error: 'Mã Design không được để trống!' });
    
    // Check for unique designId
    const exists = await db.get('SELECT * FROM sample_requests WHERE designId = ?', [designId.trim()]);
    if (exists) return res.status(400).json({ error: 'Mã Design này đã tồn tại trong hệ thống!' });

    const id = randomUUID();
    const now = new Date().toISOString();
    const dateStr = now.split('T')[0];

    await db.run(
        'INSERT INTO sample_requests (id, designId, requester, requestDate, status, productLink, expiryDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, designId.trim(), req.user.username, dateStr, 'Process', 'N/A', 'N/A', now]
    );
    res.json({ success: true, id });
});

app.put('/api/samples/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { productLink } = req.body;
    
    const entry = await db.get('SELECT * FROM sample_requests WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy yêu cầu!' });
    
    // Calculate expiry date: now + 29 days
    const now = new Date();
    const expiry = new Date(now);
    expiry.setDate(now.getDate() + 29);
    const expiryStr = expiry.toISOString().split('T')[0];

    await db.run(
        'UPDATE sample_requests SET productLink = ?, status = ?, expiryDate = ? WHERE id = ?',
        [productLink || 'N/A', productLink ? 'Live' : 'Process', productLink ? expiryStr : 'N/A', id]
    );
    res.json({ success: true });
});

app.delete('/api/samples/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const entry = await db.get('SELECT * FROM sample_requests WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy yêu cầu!' });
    
    if (req.user.role !== 'admin' && entry.requester !== req.user.username) {
        return res.status(403).json({ error: 'Bạn không có quyền xóa yêu cầu này!' });
    }

    await db.run('DELETE FROM sample_requests WHERE id = ?', [id]);
    res.json({ success: true });
});

// Reset expired sample links (manual trigger via button)
app.post('/api/samples/cleanup-expired', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const expiredSamples = await db.all(
            'SELECT * FROM sample_requests WHERE expiryDate != ? AND expiryDate < ?',
            ['N/A', today]
        );

        if (expiredSamples.length === 0) {
            return res.json({ updatedCount: 0, message: 'Không có mẫu nào hết hạn.' });
        }

        await Promise.all(expiredSamples.map(sample =>
            db.run(
                'UPDATE sample_requests SET productLink = ?, status = ?, expiryDate = ? WHERE id = ?',
                ['N/A', 'Process', 'N/A', sample.id]
            )
        ));

        res.json({
            updatedCount: expiredSamples.length,
            message: `Đã xóa link của ${expiredSamples.length} mẫu hết hạn.`
        });
    } catch (error) {
        console.error('Cleanup expired samples failed:', error);
        res.status(500).json({ error: 'Không thể xử lý các mẫu hết hạn.' });
    }
});

// =========== FINANCE CRUD ===========
app.get('/api/finance', authenticateToken, requireAdmin, async (req, res) => {
    const rows = await db.all('SELECT * FROM finance_entries ORDER BY date DESC, createdAt DESC');
    res.json(rows);
});

app.post('/api/finance', authenticateToken, requireAdmin, async (req, res) => {
    const body = req.body || {};
    const date = (body.date || '').toString().trim();
    if (!date) return res.status(400).json({ error: 'Ngày không được để trống!' });

    const fulfillment_cost = parseFloat(body.fulfillment_cost) || 0;
    const fulfillment_note = (body.fulfillment_note || '').toString().trim();
    const other_cost = parseFloat(body.other_cost) || 0;
    const other_note = (body.other_note || '').toString().trim();
    const payment = parseFloat(body.payment) || 0;
    const payment_note = (body.payment_note || '').toString().trim();

    const id = randomUUID();
    const now = new Date().toISOString();
    await db.run(
        'INSERT INTO finance_entries (id, date, fulfillment_cost, fulfillment_note, other_cost, other_note, payment, payment_note, createdAt, addedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, date, fulfillment_cost, fulfillment_note, other_cost, other_note, payment, payment_note, now, req.user.username]
    );
    res.json({ success: true, id });
});

app.put('/api/finance/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    const date = (body.date || '').toString().trim();
    if (!date) return res.status(400).json({ error: 'Ngày không được để trống!' });

    const fulfillment_cost = parseFloat(body.fulfillment_cost) || 0;
    const fulfillment_note = (body.fulfillment_note || '').toString().trim();
    const other_cost = parseFloat(body.other_cost) || 0;
    const other_note = (body.other_note || '').toString().trim();
    const payment = parseFloat(body.payment) || 0;
    const payment_note = (body.payment_note || '').toString().trim();

    await db.run(
        'UPDATE finance_entries SET date=?, fulfillment_cost=?, fulfillment_note=?, other_cost=?, other_note=?, payment=?, payment_note=? WHERE id=?',
        [date, fulfillment_cost, fulfillment_note, other_cost, other_note, payment, payment_note, id]
    );
    res.json({ success: true });
});

app.delete('/api/finance/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    await db.run('DELETE FROM finance_entries WHERE id = ?', [id]);
    res.json({ success: true });
});

// Auto-reset expired sample links on server startup and every 24 hours
async function cleanupExpiredSamples() {
    try {
        const today = new Date().toISOString().split('T')[0];

        const expiredSamples = await db.all(
            'SELECT * FROM sample_requests WHERE expiryDate != ? AND expiryDate < ?',
            ['N/A', today]
        );

        if (expiredSamples.length === 0) {
            console.log('No expired sample links to reset.');
            return;
        }

        await Promise.all(expiredSamples.map(sample =>
            db.run(
                'UPDATE sample_requests SET productLink = ?, status = ?, expiryDate = ? WHERE id = ?',
                ['N/A', 'Process', 'N/A', sample.id]
            )
        ));

        console.log(`✅ Auto-reset ${expiredSamples.length} expired sample links.`);
    } catch (error) {
        console.error('Cleanup expired samples failed:', error);
    }
}

// =========== TRELLO INTEGRATION ===========
app.post('/api/trello/sync/:taskId', authenticateToken, async (req, res) => {
    const { taskId } = req.params;
    const task = await db.get('SELECT * FROM work_schedule WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc!' });

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;
    const listId = '69e531239660a96cc9e9a0e6'; // Dinoz-App list

    try {
        let cardId = task.trelloCardId;
        let response;

        if (cardId) {
            // Update existing card
            response = await fetch(`https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: task.title,
                    desc: task.description
                })
            });
        } else {
            // Create new card
            response = await fetch(`https://api.trello.com/1/cards?idList=${listId}&key=${key}&token=${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: task.title,
                    desc: task.description,
                    pos: 'top'
                })
            });
            const data = await response.json();
            cardId = data.id;
            await db.run('UPDATE work_schedule SET trelloCardId = ? WHERE id = ?', [cardId, taskId]);
        }

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Trello API error');
        }

        res.json({ success: true, trelloCardId: cardId });
    } catch (error) {
        console.error('Trello sync failed:', error);
        res.status(500).json({ error: 'Không thể đồng bộ với Trello: ' + error.message });
    }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/trello/upload/:taskId', authenticateToken, upload.single('file'), async (req, res) => {
    const { taskId } = req.params;
    const task = await db.get('SELECT * FROM work_schedule WHERE id = ?', [taskId]);
    if (!task || !task.trelloCardId) return res.status(400).json({ error: 'Công việc chưa được đồng bộ với Trello!' });

    if (!req.file) return res.status(400).json({ error: 'Không có tệp nào được tải lên!' });

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;
    const cardId = task.trelloCardId;

    try {
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('file', blob, req.file.originalname);

        const response = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${key}&token=${token}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Trello upload error');
        }

        const data = await response.json();
        res.json({ success: true, attachment: data });
    } catch (error) {
        console.error('Trello upload failed:', error);
        res.status(500).json({ error: 'Không thể tải tệp lên Trello: ' + error.message });
    }
});

app.get('/api/trello/attachments/:taskId', authenticateToken, async (req, res) => {
    const { taskId } = req.params;
    const task = await db.get('SELECT * FROM work_schedule WHERE id = ?', [taskId]);
    if (!task || !task.trelloCardId) return res.json([]);

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;

    try {
        const response = await fetch(`https://api.trello.com/1/cards/${task.trelloCardId}/attachments?key=${key}&token=${token}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/trello/attachments/:taskId/:attachmentId', authenticateToken, async (req, res) => {
    const { taskId, attachmentId } = req.params;
    
    try {
        const task = await db.get('SELECT trelloCardId FROM work_schedule WHERE id = ?', [taskId]);
        if (!task || !task.trelloCardId) {
            return res.status(404).json({ error: 'Không tìm thấy công việc hoặc thẻ Trello tương ứng.' });
        }

        const key = process.env.TRELLO_API_KEY;
        const token = process.env.TRELLO_TOKEN;

        const response = await fetch(`https://api.trello.com/1/cards/${task.trelloCardId}/attachments/${attachmentId}?key=${key}&token=${token}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Trello delete failed');
        }

        res.json({ success: true, message: 'Đã xóa tệp đính kèm trên Trello thành công' });
    } catch (error) {
        console.error('Trello attachment delete failed:', error);
        res.status(500).json({ error: 'Không thể xóa tệp trên Trello: ' + error.message });
    }
});

// ====== TRENDING NICHES (PUSH VERSION) ======
async function initTrendingTables() {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS trending_keywords (
            id TEXT PRIMARY KEY, keyword TEXT UNIQUE NOT NULL, heat_score INTEGER DEFAULT 50,
            category TEXT DEFAULT 'general', ai_summary TEXT, search_url_etsy TEXT,
            search_url_amazon TEXT, search_url_pinterest TEXT, is_pinned INTEGER DEFAULT 0,
            source TEXT DEFAULT 'google_trends', fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            ai_analysis TEXT
        );
        CREATE TABLE IF NOT EXISTS pod_holidays (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL,
            heat_score INTEGER DEFAULT 50, prep_start TEXT, emoji TEXT DEFAULT '🎉'
        );
        CREATE TABLE IF NOT EXISTS evergreen_keywords (
            id TEXT PRIMARY KEY, keyword TEXT UNIQUE NOT NULL,
            category TEXT, source TEXT DEFAULT 'google_sheet',
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            ai_analysis TEXT
        );
    `);

    // Migration for existing tables
    const trendCols = await db.all("PRAGMA table_info(trending_keywords)");
    if (!trendCols.map(c => c.name).includes('ai_analysis')) {
        await db.run("ALTER TABLE trending_keywords ADD COLUMN ai_analysis TEXT");
    }
    const everCols = await db.all("PRAGMA table_info(evergreen_keywords)");
    if (!everCols.map(c => c.name).includes('ai_analysis')) {
        await db.run("ALTER TABLE evergreen_keywords ADD COLUMN ai_analysis TEXT");
    }
}

const verifyPushSecret = (req, res, next) => {
    if (req.headers['x-push-secret'] !== process.env.PUSH_SECRET) return res.status(401).send('Unauthorized');
    next();
};

app.post('/api/push/trends', verifyPushSecret, async (req, res) => {
    try {
        const { keywords } = req.body;
        await db.run("DELETE FROM trending_keywords WHERE source = 'google_trends' AND is_pinned = 0");
        for (const kw of keywords) {
            await db.run(`INSERT INTO trending_keywords (id, keyword, heat_score, category, ai_summary, source) VALUES (?, ?, ?, ?, ?, ?)`,
                [require('crypto').randomUUID(), kw.keyword, kw.heat_score, kw.category, kw.ai_summary, 'google_trends']);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/push/holidays', verifyPushSecret, async (req, res) => {
    try {
        const { holidays } = req.body;
        await db.run('DELETE FROM pod_holidays');
        for (const h of holidays) {
            await db.run(`INSERT INTO pod_holidays (name, date, heat_score, prep_start, emoji) VALUES (?, ?, ?, ?, ?)`,
                [h.name, h.date, h.heat_score, h.prep_start, h.emoji]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== EVERGREEN KEYWORDS ENDPOINTS ======
app.get('/api/evergreen', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM evergreen_keywords ORDER BY createdAt DESC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper to fetch data and follow redirects (needed for Google Sheets)
async function fetchWithRedirects(url, depth = 0) {
    if (depth > 5) throw new Error('Too many redirects');
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(fetchWithRedirects(res.headers.location, depth + 1));
            } else {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        }).on('error', reject);
    });
}

app.post('/api/evergreen/import', authenticateToken, requireAdmin, async (req, res) => {
    const { count = 10 } = req.body;
    const sheetUrl = process.env.EVERGREEN_SHEET_URL;

    if (!sheetUrl || sheetUrl.includes('YOUR_SHEET_ID_HERE')) {
        return res.status(400).json({ error: 'Chưa cấu hình EVERGREEN_SHEET_URL trong .env' });
    }

    try {
        // Fetch CSV from Google Sheet (now following redirects)
        const csvData = await fetchWithRedirects(sheetUrl);

        // Parse CSV (simple line-based parsing)
        const lines = csvData.split(/\r?\n/).filter(line => line.trim());
        const sheetKeywords = lines.map(line => {
            const parts = line.split(',');
            return parts[0].replace(/"/g, '').trim(); // Assume keyword is in first column
        }).filter(kw => kw && kw.toLowerCase() !== 'keyword' && kw.toLowerCase() !== 'niche');

        // Get existing evergreen keywords to avoid duplicates
        const existingRows = await db.all('SELECT keyword FROM evergreen_keywords');
        const existingSet = new Set(existingRows.map(r => r.keyword.toLowerCase()));

        // Filter for new keywords only
        const newKeywords = sheetKeywords.filter(kw => !existingSet.has(kw.toLowerCase()));

        // Randomly pick N keywords
        const shuffled = newKeywords.sort(() => 0.5 - Math.random());
        const selection = shuffled.slice(0, count);

        res.json({
            total_in_sheet: sheetKeywords.length,
            new_available: newKeywords.length,
            selection: selection
        });
    } catch (e) {
        res.status(500).json({ error: 'Lỗi import từ Google Sheet: ' + e.message });
    }
});

app.post('/api/evergreen', authenticateToken, requireAdmin, async (req, res) => {
    const { keywords, category = 'Evergreen' } = req.body;
    if (!Array.isArray(keywords)) return res.status(400).json({ error: 'Keywords must be an array' });

    try {
        for (const kw of keywords) {
            await db.run(
                'INSERT OR IGNORE INTO evergreen_keywords (id, keyword, category, createdAt) VALUES (?, ?, ?, ?)',
                [randomUUID(), kw.trim(), category, new Date().toISOString()]
            );
        }
        res.json({ success: true, message: `Đã thêm ${keywords.length} keywords.` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/evergreen/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM evergreen_keywords WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trends', authenticateToken, async (req, res) => {
    try { res.json(await db.all('SELECT * FROM trending_keywords ORDER BY is_pinned DESC, fetched_at DESC LIMIT 10')); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trends', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { keyword, category } = req.body;
        if (!keyword) return res.status(400).json({ error: 'Vui lòng cung cấp keyword!' });
        
        const id = require('crypto').randomUUID();
        await db.run(
            `INSERT OR IGNORE INTO trending_keywords (id, keyword, category, source, heat_score) 
             VALUES (?, ?, ?, ?, ?)`,
            [id, keyword, category || 'general', 'manual', 90]
        );
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ====== AI CONFIGURATION ENDPOINTS ======
app.get('/api/ai/providers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const providers = await db.all('SELECT * FROM ai_providers ORDER BY priority ASC, name ASC');
        res.json(providers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/providers', authenticateToken, requireAdmin, async (req, res) => {
    const { id, name, model, apiKey, priority, enabled } = req.body;
    try {
        if (id) {
            await db.run(
                'UPDATE ai_providers SET name = ?, model = ?, apiKey = ?, priority = ?, enabled = ? WHERE id = ?',
                [name, model, apiKey, priority, enabled ? 1 : 0, id]
            );
            res.json({ success: true });
        } else {
            const newId = randomUUID();
            await db.run(
                'INSERT INTO ai_providers (id, name, model, apiKey, priority, enabled) VALUES (?, ?, ?, ?, ?, ?)',
                [newId, name, model, apiKey, priority || 0, enabled ? 1 : 0]
            );
            res.json({ success: true, id: newId });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ai/providers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM ai_providers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const settings = await db.all('SELECT * FROM ai_settings');
        const config = {};
        settings.forEach(s => config[s.key] = s.value);
        res.json(config);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/settings', authenticateToken, requireAdmin, async (req, res) => {
    const { settings } = req.body; // { key: value }
    try {
        for (const [key, value] of Object.entries(settings)) {
            await db.run('INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)', [key, value]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI NICHE ANALYSIS ENDPOINT
app.post('/api/trends/analyze', authenticateToken, async (req, res) => {
    const { keyword, type } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Thiếu keyword để phân tích!' });

    const tableName = type === 'evergreen' ? 'evergreen_keywords' : 'trending_keywords';

    try {
        // 1. Check Cache
        const existing = await db.get(`SELECT ai_analysis FROM ${tableName} WHERE keyword = ?`, [keyword]);
        if (existing && existing.ai_analysis) {
            return res.json({ analysis: JSON.parse(existing.ai_analysis), source: 'cache' });
        }

        // 2. Get AI Config
        const providers = await db.all('SELECT * FROM ai_providers WHERE enabled = 1 ORDER BY priority ASC');
        const settings = await db.all('SELECT * FROM ai_settings');
        const config = {};
        settings.forEach(s => config[s.key] = s.value);
        
        let systemPrompt = config.system_prompt || 'Phân tích niche: "{keyword}"';
        systemPrompt = systemPrompt.replace('{keyword}', keyword);

        if (providers.length === 0) {
            throw new Error('Chưa cấu hình AI Provider nào trong Cài Đặt Chung.');
        }

        // 3. Try each provider (Failover logic)
        let lastError = null;
        for (const provider of providers) {
            try {
                let apiEndpoint = '';
                let headers = { 'Content-Type': 'application/json' };
                let body = {};

                // Map providers to endpoints
                const name = provider.name.toLowerCase();
                if (name.includes('gemini')) {
                    apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;
                    body = { contents: [{ parts: [{ text: systemPrompt }] }] };
                } else if (name.includes('groq')) {
                    apiEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
                    headers['Authorization'] = `Bearer ${provider.apiKey}`;
                    body = { model: provider.model, messages: [{ role: 'user', content: systemPrompt }] };
                } else if (name.includes('openrouter')) {
                    apiEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
                    headers['Authorization'] = `Bearer ${provider.apiKey}`;
                    body = { model: provider.model, messages: [{ role: 'user', content: systemPrompt }] };
                } else if (name.includes('deepseek')) {
                    apiEndpoint = 'https://api.deepseek.com/v1/chat/completions';
                    headers['Authorization'] = `Bearer ${provider.apiKey}`;
                    body = { model: provider.model, messages: [{ role: 'user', content: systemPrompt }] };
                } else {
                    // Default OpenAI-compatible
                    apiEndpoint = provider.name.includes('http') ? provider.name : `https://api.${name}.com/v1/chat/completions`;
                    headers['Authorization'] = `Bearer ${provider.apiKey}`;
                    body = { model: provider.model, messages: [{ role: 'user', content: systemPrompt }] };
                }

                const aiRes = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    timeout: 10000
                });

                if (!aiRes.ok) throw new Error(`HTTP ${aiRes.status}`);

                const data = await aiRes.json();
                let aiText = '';

                // Extract text based on provider format
                if (name.includes('gemini')) {
                    aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                } else {
                    aiText = data.choices?.[0]?.message?.content || '';
                }

                if (!aiText) throw new Error('AI không trả về nội dung.');

                const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('Định dạng trả về không phải JSON.');
                
                const analysis = JSON.parse(jsonMatch[0]);

                // Save to DB
                await db.run(`UPDATE ${tableName} SET ai_analysis = ? WHERE keyword = ?`, [JSON.stringify(analysis), keyword]);

                return res.json({ analysis, source: provider.name });

            } catch (err) {
                console.warn(`[AI Failover] Provider ${provider.name} failed:`, err.message);
                lastError = err;
                continue; // Try next provider
            }
        }

        throw new Error(`Tất cả AI Provider đều thất bại. Lỗi cuối: ${lastError?.message}`);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/holidays', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        res.json(await db.all('SELECT * FROM pod_holidays WHERE date >= ? ORDER BY date ASC LIMIT 15', [today]));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/trends/:id/pin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const row = await db.get('SELECT is_pinned FROM trending_keywords WHERE id = ?', [req.params.id]);
        if (row) await db.run('UPDATE trending_keywords SET is_pinned = ? WHERE id = ?', [row.is_pinned ? 0 : 1, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trends/:id', authenticateToken, requireAdmin, async (req, res) => {
    try { 
        console.log(`[TRENDS] Attempting to delete keyword with ID: ${req.params.id}`);
        const result = await db.run('DELETE FROM trending_keywords WHERE id = ?', [req.params.id]); 
        if (result.changes === 0) {
            console.warn(`[TRENDS] No keyword found with ID: ${req.params.id}`);
        }
        res.json({ success: true, changes: result.changes }); 
    }
    catch (e) { 
        console.error('[TRENDS] Delete error:', e.message);
        res.status(500).json({ error: e.message }); 
    }
});

// ====== AUTOMATED PUSH API ======
/**
 * Endpoint for external systems to push keywords directly.
 * It updates the DB and sends a notification to Telegram.
 */
app.post('/api/push/telegram-trends', async (req, res) => {
    try {
        const { keywords, secret } = req.body;

        // Optional: Security check
        if (process.env.PUSH_SECRET && secret !== process.env.PUSH_SECRET) {
            return res.status(401).json({ error: 'Unauthorized push' });
        }

        if (!keywords || !Array.isArray(keywords)) {
            return res.status(400).json({ error: 'Keywords must be an array' });
        }

        console.log(`📡 [API Push] Receiving ${keywords.length} keywords from external system...`);

        // Clear old telegram-sourced keywords
        await db.run("DELETE FROM trending_keywords WHERE source = 'telegram' AND is_pinned = 0");

        // Insert new ones
        for (const kw of keywords) {
            const id = randomUUID();
            await db.run(
                `INSERT OR IGNORE INTO trending_keywords (id, keyword, heat_score, category, source) 
                 VALUES (?, ?, ?, ?, ?)`,
                [id, kw, 85, 'general', 'telegram']
            );
        }

        // Notify Telegram
        const message = `✅ [Hệ thống] Đã tự động cập nhật ${keywords.length} Niches mới lên Dashboard!`;
        sendMessageToGroup(message);

        res.json({ success: true, count: keywords.length });
    } catch (e) {
        console.error('❌ [API Push] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});



// ====== STARTUP ======
initDb().then(async () => {
    cleanupExpiredSamples();
    setInterval(cleanupExpiredSamples, 24 * 60 * 60 * 1000);
    
    await initTrendingTables();



    const server = app.listen(PORT, () => {
        console.log(`🚀 Dinoz Server is LIVE on http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Lỗi: Cổng ${PORT} đã bị chiếm dụng. Vui lòng tắt ứng dụng đang dùng cổng này hoặc đổi PORT trong file .env`);
            process.exit(1);
        } else {
            console.error('❌ Lỗi khởi động server:', err);
        }
    });

    // Start Telegram Bot Integration
    initTelegramBot(db);
}).catch(err => {
    console.error('Failed to init Database Server:', err);
});



