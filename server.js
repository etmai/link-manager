const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const jwt = require('jsonwebtoken');
const path = require('path');
const { URL, URLSearchParams } = require('url');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'super-secret-key-link-manager-v4'; // Key bảo mật token

app.use(express.json());
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
            categories TEXT NOT NULL,
            updatedAt TEXT,
            createdAt TEXT NOT NULL,
            addedBy TEXT,
            updatedBy TEXT
        );
        CREATE TABLE IF NOT EXISTS sales_entries (
            id TEXT PRIMARY KEY,
            account TEXT NOT NULL,
            sku TEXT NOT NULL,
            title TEXT,
            merchant TEXT NOT NULL,
            category TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS work_schedule (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            userId TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            createdBy TEXT,
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
    `);

    // Add columns if they don't exist (Migration)
    const columns = await db.all("PRAGMA table_info(links)");
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('addedBy')) {
        await db.run("ALTER TABLE links ADD COLUMN addedBy TEXT");
    }
    if (!columnNames.includes('updatedBy')) {
        await db.run("ALTER TABLE links ADD COLUMN updatedBy TEXT");
    }

    // Migration for work_schedule
    const scheduleCols = await db.all("PRAGMA table_info(work_schedule)");
    const scheduleColNames = scheduleCols.map(c => c.name);
    if (!scheduleColNames.includes('createdBy')) {
        await db.run("ALTER TABLE work_schedule ADD COLUMN createdBy TEXT");
    }

    // Check if admin exists
    const admin = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!admin) {
        await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', 'Hello0', 'admin']);
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
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            await db.run('INSERT INTO accounts (id, name) VALUES (?, ?)', [id, acc]);
        }
    }

    // Default merchants
    const countMerchants = await db.get('SELECT COUNT(*) as count FROM merchants');
    if (countMerchants.count === 0) {
        const defaults = ["Amazon", "Etsy", "eBay", "Shopify", "Khác"];
        for (const m of defaults) {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            await db.run('INSERT INTO merchants (id, name) VALUES (?, ?)', [id, m]);
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

// AUTH
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    
    if (user) {
        const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng!" });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [req.user.username]);
    
    if (user.password !== oldPassword) {
        return res.status(400).json({ error: "Mật khẩu cũ không chính xác!" });
    }
    await db.run('UPDATE users SET password = ? WHERE username = ?', [newPassword, req.user.username]);
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
    
    await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
    res.json({ success: true });
});

app.delete('/api/users/:username', authenticateToken, requireAdmin, async (req, res) => {
    const { username } = req.params;
    if (username === req.user.username) return res.status(400).json({ error: "Không thể tự xóa bản thân!" });
    
    const countAdm = await db.get('SELECT COUNT(*) as c FROM users WHERE role = "admin"');
    const target = await db.get('SELECT role FROM users WHERE username = ?', [username]);
    if (target.role === 'admin' && countAdm.c <= 1) {
        return res.status(400).json({ error: "Phải giữ lại ít nhất 1 Admin trong Database!" });
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
    
    await db.run('UPDATE users SET password = ? WHERE username = ?', [newPassword, username]);
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
    
    for (const data of linksData) {
        const normalizedInput = normalizeUrl(data.url);
        const existingIndex = dbLinks.findIndex(l => normalizeUrl(l.url) === normalizedInput);
        if (existingIndex !== -1 && forceSaveCheckbox) {
            // MERGE (Update existing)
            const existing = dbLinks[existingIndex];
            
            // Check permission: Admin or Creator
            if (req.user.role === 'admin' || existing.addedBy === req.user.username) {
                const mergedCats = [...new Set([...existing.categories, ...data.categories])];
                await db.run('UPDATE links SET date = ?, categories = ?, updatedAt = ?, updatedBy = ? WHERE id = ?', 
                    [data.date, JSON.stringify(mergedCats), new Date().toISOString(), req.user.username, existing.id]);
                updatedCount++;
            } else {
                forbiddenCount++;
            }
        } else if (existingIndex === -1) {
            // NEW
            const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            await db.run('INSERT INTO links (id, url, date, categories, createdAt, addedBy) VALUES (?, ?, ?, ?, ?, ?)',
                [newId, data.url, data.date, JSON.stringify(data.categories), new Date().toISOString(), req.user.username]);
            newCount++;
        }
    }
    
    res.json({ newCount, updatedCount, forbiddenCount });
});

app.put('/api/links/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { url, date, categories } = req.body;
    
    const link = await db.get('SELECT * FROM links WHERE id = ?', [id]);
    if (!link) return res.status(404).json({ error: "Không tìm thấy link!" });

    // Admin or Creator can edit
    if (req.user.role !== 'admin' && link.addedBy !== req.user.username) {
        return res.status(403).json({ error: "Bạn không có quyền chỉnh sửa link của người khác!" });
    }
    
    await db.run('UPDATE links SET url = ?, date = ?, categories = ?, updatedAt = ?, updatedBy = ? WHERE id = ?',
        [url, date, JSON.stringify(categories), new Date().toISOString(), req.user.username, id]);
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

// Hàm tự động lấy tiêu đề sản phẩm từ Amazon bằng SKU (scrape nhẹ)
function fetchAmazonTitle(sku) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'www.amazon.com',
            path: `/dp/${sku}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 8000
        };

        const req = https.request(options, (res) => {
            // Follow redirects
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                resolve(`Amazon Product (SKU: ${sku})`);
                return;
            }

            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                // Extract title from <title> tag
                const titleMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    let title = titleMatch[1].trim();
                    // Clean up Amazon's title format: "Product Name: Amazon.com: ..."
                    title = title.replace(/\s*:\s*Amazon\.com.*$/i, '').replace(/Amazon\.com\s*:\s*/i, '').trim();
                    if (title && title.toLowerCase() !== 'amazon' && title.length > 3) {
                        resolve(title);
                    } else {
                        resolve(`Amazon Product (SKU: ${sku})`);
                    }
                } else {
                    resolve(`Amazon Product (SKU: ${sku})`);
                }
            });
        });

        req.on('error', () => resolve(`Amazon Product (SKU: ${sku})`));
        req.on('timeout', () => { req.destroy(); resolve(`Amazon Product (SKU: ${sku})`); });
        req.end();
    });
}

// GET: Lấy tiêu đề sản phẩm Amazon từ SKU
app.get('/api/amazon/title/:sku', authenticateToken, async (req, res) => {
    const { sku } = req.params;
    if (!sku || sku.length < 3) return res.status(400).json({ error: 'SKU không hợp lệ!' });

    try {
        const title = await fetchAmazonTitle(sku.trim().toUpperCase());
        res.json({ sku, title });
    } catch (err) {
        res.json({ sku, title: `Amazon Product (SKU: ${sku})` });
    }
});

// GET: Lấy tất cả sales entries
app.get('/api/sales', authenticateToken, async (req, res) => {
    const rows = await db.all('SELECT * FROM sales_entries ORDER BY date DESC, createdAt DESC');
    res.json(rows);
});

// POST: Thêm bản ghi sales mới (Admin only)
app.post('/api/sales', authenticateToken, requireAdmin, async (req, res) => {
    const { account, sku, title, merchant, category, sales, date } = req.body;
    if (!account || !sku || !merchant || !category || !date) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc!' });
    }
    if (isNaN(parseInt(sales)) || parseInt(sales) < 0) {
        return res.status(400).json({ error: 'Số lượng bán phải là số nguyên không âm!' });
    }

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    await db.run(
        'INSERT INTO sales_entries (id, account, sku, title, merchant, category, sales, date, createdAt, addedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, account.trim(), sku.trim().toUpperCase(), title || '', merchant.trim(), category.trim(), parseInt(sales), date, new Date().toISOString(), req.user.username]
    );
    res.json({ success: true, id });
});

// PUT: Cập nhật bản ghi sales (Admin only)
app.put('/api/sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { account, sku, title, merchant, category, sales, date } = req.body;

    const entry = await db.get('SELECT * FROM sales_entries WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy bản ghi!' });

    await db.run(
        'UPDATE sales_entries SET account=?, sku=?, title=?, merchant=?, category=?, sales=?, date=? WHERE id=?',
        [account, sku.toUpperCase(), title || '', merchant, category, parseInt(sales), date, id]
    );
    res.json({ success: true });
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
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
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
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
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
    const { title, description, date, userId } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Tiêu đề và ngày không được để trống!' });
    
    // Default to self, but admin can assign to others
    let targetUser = req.user.username;
    if (req.user.role === 'admin' && userId) {
        targetUser = userId;
    }

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    await db.run(
        'INSERT INTO work_schedule (id, title, description, date, userId, status, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, title.trim(), description || '', date, targetUser, 'pending', req.user.username, new Date().toISOString()]
    );
    res.json({ success: true, id });
});

app.put('/api/schedule/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, date, status, userId } = req.body;
    
    const entry = await db.get('SELECT * FROM work_schedule WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy công việc!' });
    
    // Permission check: owner or admin
    if (entry.userId !== req.user.username && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bạn không có quyền sửa công việc này!' });
    }

    // Admin can reassign
    let targetUser = entry.userId;
    if (req.user.role === 'admin' && userId) {
        targetUser = userId;
    }

    await db.run(
        'UPDATE work_schedule SET title = ?, description = ?, date = ?, status = ?, userId = ? WHERE id = ?',
        [title || entry.title, description !== undefined ? description : entry.description, date || entry.date, status || entry.status, targetUser, id]
    );
    res.json({ success: true });
});

app.delete('/api/schedule/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const entry = await db.get('SELECT * FROM work_schedule WHERE id = ?', [id]);
    if (!entry) return res.status(404).json({ error: 'Không tìm thấy công việc!' });
    
    // Permission check: owner or admin
    if (entry.userId !== req.user.username && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bạn không có quyền xóa công việc này!' });
    }

    await db.run('DELETE FROM work_schedule WHERE id = ?', [id]);
    res.json({ success: true });
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

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
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
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Node Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to init Database Server:', err);
});
