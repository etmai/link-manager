const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

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
        });
    });
});
