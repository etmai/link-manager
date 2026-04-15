const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
const bcrypt = require('bcryptjs');

db.all('SELECT * FROM users', [], async (err, rows) => {
    if (err) {
        console.error(err.message);
        return;
    }
    console.log('Users in DB:');
    for (const row of rows) {
        const isMatch = await bcrypt.compare('Hello0', row.password);
        console.log(`Username: ${row.username}, Role: ${row.role}, Password Match 'Hello0': ${isMatch}`);
    }
    db.close();
});
