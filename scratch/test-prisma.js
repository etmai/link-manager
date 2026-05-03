const prisma = require('../src/db/prisma');
async function test() {
    try {
        console.log('Keys:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
        console.log('aiProvider:', prisma.aiProvider);
        if (prisma.aiProvider) {
            const count = await prisma.aiProvider.count();
            console.log('Count:', count);
        } else {
            console.log('aiProvider is UNDEFINED');
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
test();
