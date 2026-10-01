import { config } from './env.js';
import { PrismaClient } from '@prisma/client';

// One client per process, bound to *our* schema — never the hub's. The hub's
// client comes from @nibgate/internal and is a different instance entirely.
const store = globalThis.__drnibPrisma || (globalThis.__drnibPrisma = {});
export const db = store.client || (store.client = new PrismaClient({ datasourceUrl: config.drnibDatabaseUrl }));