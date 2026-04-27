const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function check() {
    // Try both filenames
    const files = ['database.sqlite', 'database.db'];
    
    for (const file of files) {
        console.log(`\n--- CHECKING ${file} ---`);
        const dbPath = path.join(__dirname, '..', file);
        try {
            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
            console.log('Tables found:', tables.map(t => t.name).join(', '));

            if (tables.some(t => t.name === 'trending_keywords')) {
                const duplicates = await db.all(`
                    SELECT keyword, COUNT(*) as count 
                    FROM trending_keywords 
                    GROUP BY keyword 
                    HAVING count > 1
                `);

                if (duplicates.length > 0) {
                    console.log(`Found ${duplicates.length} keywords with duplicates!`);
                    duplicates.forEach(d => console.log(` - "${d.keyword}": ${d.count} times`));
                    
                    console.log('Cleaning up duplicates...');
                    await db.run(`
                        DELETE FROM trending_keywords 
                        WHERE id NOT IN (
                            SELECT MIN(id) 
                            FROM trending_keywords 
                            GROUP BY keyword
                        )
                    `);
                    console.log('Cleanup complete.');
                } else {
                    console.log('No duplicate keywords found.');
                }
            } else {
                console.log('Table trending_keywords not found in this file.');
            }
            await db.close();
        } catch (e) {
            console.error(`Error checking ${file}:`, e.message);
        }
    }
}

check().catch(err => console.error(err));
