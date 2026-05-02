/**
 * Database initialization — seed default data.
 * Prisma handles schema via prisma db push / migrate.
 */
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

/**
 * Initialize the database: seed defaults.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function initDatabase(prisma) {
    try {
        // Default admin user
        const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
        if (!admin) {
            const hash = await bcrypt.hash('Hello0', 10);
            await prisma.user.create({
                data: { username: 'admin', password: hash, role: 'admin' },
            });
            console.log('[SEED] Default admin user created.');
        }

        // Default categories
        const catCount = await prisma.category.count();
        if (catCount === 0) {
            const cats = ['Tài liệu nội bộ', 'Thiết kế UI/UX', 'Mã nguồn', 'Tham khảo ngoại bộ'];
            for (const name of cats) {
                await prisma.category.create({ data: { name } });
            }
            console.log('[SEED] Default categories created.');
        }

        // Default accounts
        const accCount = await prisma.account.count();
        if (accCount === 0) {
            const accs = ['Amazon_Main', 'Etsy_Shop1', 'eBay_Direct'];
            for (const name of accs) {
                await prisma.account.create({ data: { id: randomUUID(), name } });
            }
            console.log('[SEED] Default accounts created.');
        }

        // Default merchants
        const merCount = await prisma.merchant.count();
        if (merCount === 0) {
            const names = ['Amazon', 'Etsy', 'eBay', 'Shopify', 'Khác'];
            for (const name of names) {
                await prisma.merchant.create({ data: { id: randomUUID(), name } });
            }
            console.log('[SEED] Default merchants created.');
        }

        // Default fulfillments
        const fulCount = await prisma.fulfillment.count();
        if (fulCount === 0) {
            const names = ['Gearment', 'CustomCat', 'Printful', 'Printify', 'Khác'];
            for (const name of names) {
                await prisma.fulfillment.create({ data: { id: randomUUID(), name } });
            }
            console.log('[SEED] Default fulfillments created.');
        }

        console.log('[DB] Seed data initialized.');
    } catch (err) {
        console.error('[DB] Seed error (non-fatal):', err.message);
    }
}

module.exports = { initDatabase };
