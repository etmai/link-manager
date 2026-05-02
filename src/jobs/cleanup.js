/**
 * Cron job: auto-reset expired sample links daily.
 * Uses Prisma ORM.
 * @param {import('@prisma/client').PrismaClient} db
 */
async function cleanupExpiredSamples(db) {
    try {
        const today = new Date().toISOString().split('T')[0];

        const result = await db.$executeRaw`
            UPDATE sample_requests
            SET productLink = 'N/A', status = 'Process', expiryDate = 'N/A'
            WHERE expiryDate != 'N/A' AND expiryDate < ${today}
        `;

        const count = Number(result) || 0;
        if (count === 0) {
            console.log('[JOB] No expired sample links to reset.');
        } else {
            console.log(`[JOB] Auto-reset ${count} expired sample links.`);
        }
    } catch (error) {
        console.error('[JOB] Cleanup expired samples failed:', error.message);
    }
}

module.exports = { cleanupExpiredSamples };
