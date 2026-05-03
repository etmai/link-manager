const prisma = require('../src/db/prisma');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        const hash = await bcrypt.hash('Hello0', 10);
        const user = await prisma.user.upsert({
            where: { username: 'admin' },
            update: { password: hash, role: 'admin' },
            create: { username: 'admin', password: hash, role: 'admin' }
        });
        console.log('Admin user upserted:', user.username);
    } catch (e) {
        console.error('Error creating admin:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
createAdmin();
