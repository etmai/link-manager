// prisma.config.js
// Cấu hình cho Prisma 7 CLI (Migrate, Introspect)
module.exports = {
  migrate: {
    url: process.env.DATABASE_URL || "file:/var/www/link-manager/database.sqlite"
  }
};
