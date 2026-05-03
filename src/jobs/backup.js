const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('../utils/logger'); // Assuming winston logger from Phase 1

const DB_PATH = path.join(__dirname, '../../database.sqlite');
const BACKUP_DIR = path.join(__dirname, '../../backups');
const MAX_BACKUPS = 7;

/**
 * Creates a backup of the SQLite database file.
 */
function performBackup() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `database_backup_${timestamp}.sqlite`);

    try {
        fs.copyFileSync(DB_PATH, backupPath);
        logger.info(`[Backup] Successfully backed up database to ${backupPath}`);
        
        rotateBackups();
    } catch (err) {
        logger.error(`[Backup] Failed to backup database: ${err.message}`);
    }
}

/**
 * Keeps only the latest MAX_BACKUPS in the backup directory.
 */
function rotateBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('database_backup_') && f.endsWith('.sqlite'))
            .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);

        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            toDelete.forEach(f => {
                fs.unlinkSync(path.join(BACKUP_DIR, f.name));
                logger.info(`[Backup] Deleted old backup: ${f.name}`);
            });
        }
    } catch (err) {
        logger.error(`[Backup] Rotation failed: ${err.message}`);
    }
}

// Schedule: 2:00 AM daily
cron.schedule('0 2 * * *', () => {
    logger.info('[Backup] Starting scheduled backup...');
    performBackup();
});

module.exports = { performBackup };
