const { authenticateToken, requireAdmin } = require('../middlewares/auth');

module.exports = function (Router, db) {
    const router = Router();

    // GET /api/debug/schema — inspect full database schema
    router.get('/api/debug/schema', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const tables = await db.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
            const schema = {};
            for (const t of tables) {
                schema[t.name] = await db.$queryRaw`PRAGMA table_info(${t.name})`;
            }
            res.json(schema);
        } catch (err) {
            console.error('Schema fetch error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/debug/prisma-file — view schema.prisma content
    router.get('/api/debug/prisma-file', async (req, res) => {
        // Bypass auth if secret pwd provided
        const isSecret = req.query.pwd === 'dinoz_fix_2026';
        if (!isSecret) {
            return res.status(401).json({ error: 'Unauthorized. Use ?pwd=...' });
        }

        const fs = require('fs');
        const path = require('path');
        const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
        if (fs.existsSync(schemaPath)) {
            const content = fs.readFileSync(schemaPath, 'utf8');
            res.type('text/plain').send(content);
        } else {
            res.status(404).send('schema.prisma not found');
        }
    });

    // GET /api/debug/migrate — Run prisma generate & push on hosting
    router.get('/api/debug/migrate', async (req, res) => {
        // Bypass auth if secret pwd provided
        const isSecret = req.query.pwd === 'dinoz_fix_2026';
        if (!isSecret) {
            return res.status(401).json({ error: 'Unauthorized. Use ?pwd=...' });
        }

        const { exec } = require('child_process');
        const path = require('path');
        
        const projectRoot = path.resolve(__dirname, '../../');
        const prismaBinary = path.join(projectRoot, 'node_modules', '.bin', 'prisma');
        
        console.log('[DEBUG] Starting migration on hosting at:', projectRoot);
        console.log('[DEBUG] Using prisma binary at:', prismaBinary);
        
        const cmd = `"${prismaBinary}" generate && "${prismaBinary}" db push`;
        
        exec(cmd, { cwd: projectRoot }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[DEBUG] Migration error: ${error.message}`);
                return res.status(500).json({ 
                    error: error.message, 
                    stdout: stdout.split('\n'),
                    stderr: stderr.split('\n')
                });
            }
            console.log(`[DEBUG] Migration stdout: ${stdout}`);
            res.json({ 
                message: 'Migration successful!', 
                stdout: stdout.split('\n'),
                stderr: stderr.split('\n')
            });
        });
    });

    return router;
};
