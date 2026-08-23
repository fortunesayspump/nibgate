import pkg from '../../cli/generated/client/index.js';
const { PrismaClient } = pkg;

// PrismaClient is attached to the `global` object in development to prevent 
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis;

export const db = globalForPrisma.prisma || new PrismaClient({});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
