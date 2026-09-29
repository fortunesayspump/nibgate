// Idempotent seed for the local tip DB. Imports the generated Prisma client
// by relative path (no workspace specifier needed). Writes e2e/.fixtures.json
// for specs that need real site credentials (claim flow).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { PrismaClient } = await import('../packages/cli/generated/client/index.js');
const db = new PrismaClient();

const creator = '0x7e27afba45d880ba94b0c08efd1523d2dee627fe';

let user = await db.user.findUnique({ where: { walletAddress: creator } });
if (!user) {
  user = await db.user.create({
    data: { walletAddress: creator, wallets: { create: { address: creator, isPrimary: true } } },
  });
}

let site = await db.website.findFirst({ where: { domain: 'shelflife.local' } });
if (!site) {
  site = await db.website.create({
    data: {
      domain: 'shelflife.local',
      name: 'Shelflife Local',
      ownerId: user.id,
      verifyToken: crypto.randomBytes(16).toString('hex'),
      siteToken: crypto.randomBytes(24).toString('hex'),
      isVerified: true,
      verificationStatus: 'verified',
      verificationSource: 'owner-link',
    },
  });
}

let content = await db.content.findFirst({ where: { url: 'https://shelflife.local/e2e-tip' } });
if (!content) {
  content = await db.content.create({
    data: {
      id: crypto.randomUUID(),
      websiteId: site.id,
      url: 'https://shelflife.local/e2e-tip',
      title: 'E2E Tip',
      contentType: 'article',
      currency: 'USDC',
      price: 0.5,
      recipientWallet: creator,
      network: 'testnet',
    },
  });
}

fs.writeFileSync(
  path.join(here, '.fixtures.json'),
  JSON.stringify({ siteId: site.id, token: site.verifyToken, domain: site.domain, ownerWallet: creator }, null, 2),
);
console.log('[e2e] seeded shelflife.local');
await db.$disconnect();
