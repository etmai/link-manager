const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\maihu\\Documents\\Dinoz-App\\link-manager-Z-AI\\database.sqlite';
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, tables) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Tables:", tables.map(t => t.name));
    
    tables.forEach(table => {
        db.get(`SELECT COUNT(*) as count FROM ${table.name};`, (err, row) => {
            if (!err) {
                console.log(`Table ${table.name}: ${row.count} rows`);
            }
            if (table.name === 'sales_entries') {
                db.get("SELECT MAX(date) as maxDate FROM sales_entries", (err, row) => {
                    console.log("Max Sales Date:", row.maxDate);
                });
            }
        });
    });
});
