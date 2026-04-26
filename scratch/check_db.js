const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all('SELECT id, title, trelloCardId FROM work_schedule LIMIT 10', (err, rows) => {
    if (err) console.error(err);
    else console.table(rows);
    db.close();
});
