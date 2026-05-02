const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const count = await db.link.count();
  console.log(JSON.stringify({ linksCount: count }, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
