import { PrismaClient } from '@prisma/client';

const store = globalThis.__drnibPrisma || (globalThis.__drnibPrisma = {});
export const db = store.client || (store.client = new PrismaClient());
