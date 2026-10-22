const { PrismaClient } = require('../../prisma/generated/client');
const { withDatabasePoolDefaults } = require('./database-pool');

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient({
  datasourceUrl: withDatabasePoolDefaults(process.env.DATABASE_URL),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
