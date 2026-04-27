const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function migrate() {
    const db = await open({
        filename: path.join(__dirname, '..', 'database.sqlite'),
        driver: sqlite3.Database
    });

    console.log('--- STARTING DATABASE MIGRATION ---');

    try {
        // 1. Clean up any existing duplicates first
        await db.run(`
            DELETE FROM trending_keywords 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM trending_keywords 
                GROUP BY keyword
            )
        `);
        console.log('1. Duplicates cleaned up.');

        // 2. Create new table with UNIQUE constraint
        await db.exec(`
            CREATE TABLE trending_keywords_new (
                id TEXT PRIMARY KEY, 
                keyword TEXT UNIQUE NOT NULL, 
                heat_score INTEGER DEFAULT 50,
                category TEXT DEFAULT 'general', 
                ai_summary TEXT DEFAULT '', 
                search_url_etsy TEXT DEFAULT '',
                search_url_amazon TEXT DEFAULT '', 
                search_url_pinterest TEXT DEFAULT '', 
                is_pinned INTEGER DEFAULT 0,
                is_manual INTEGER DEFAULT 0,
                source TEXT DEFAULT 'manual', 
                fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('2. New table created.');

        // 3. Copy data
        await db.exec(`
            INSERT INTO trending_keywords_new (
                id, keyword, heat_score, category, ai_summary, 
                search_url_etsy, search_url_amazon, search_url_pinterest, 
                is_pinned, is_manual, source, fetched_at
            )
            SELECT 
                id, keyword, heat_score, category, ai_summary, 
                search_url_etsy, search_url_amazon, search_url_pinterest, 
                is_pinned, is_manual, source, fetched_at
            FROM trending_keywords;
        `);
        console.log('3. Data copied.');

        // 4. Swap tables
        await db.exec(`DROP TABLE trending_keywords;`);
        await db.exec(`ALTER TABLE trending_keywords_new RENAME TO trending_keywords;`);
        console.log('4. Tables swapped.');

        console.log('--- MIGRATION SUCCESSFUL ---');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await db.close();
    }
}

migrate();
