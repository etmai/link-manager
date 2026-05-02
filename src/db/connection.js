/**
 * Database connection singleton.
 * Opens the SQLite database once and reuses the connection.
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

let _db = null;

/**
 * Returns the singleton database instance.
 * Creates it on first call.
 * @returns {Promise<import('sqlite').Database>}
 */
async function getDb() {
    if (!_db) {
        // __dirname = src/db/ → go up 2 levels to project root
        // Supports custom DB path via DATABASE_PATH env var
        const dbPath = process.env.DATABASE_PATH
            || path.join(__dirname, '..', '..', 'database.sqlite');
        _db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        console.log('[DB] SQLite connection opened:', dbPath);
    }
    return _db;
}

/**
 * Closes the database connection (used in tests / graceful shutdown).
 */
async function closeDb() {
    if (_db) {
        await _db.close();
        _db = null;
        console.log('[DB] SQLite connection closed.');
    }
}

module.exports = { getDb, closeDb };
