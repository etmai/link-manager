/**
 * Prisma Client singleton.
 * Reuses a single instance across the application.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || `file:${path.join(__dirname, 'database.sqlite')}`
    }
  },
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

module.exports = prisma;
