/**
 * Prisma Client singleton.
 * Reuses a single instance across the application.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

module.exports = prisma;
