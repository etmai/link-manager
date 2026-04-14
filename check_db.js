const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');

db.all('SELECT * FROM work_schedule', [], (err, rows) => {
    if (err) {
        console.error(err.message);
        return;
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
