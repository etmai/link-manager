const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');

db.all('SELECT username, role FROM users', [], (err, rows) => {
    if (err) {
        console.error(err.message);
        return;
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
