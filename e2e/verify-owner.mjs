// E2E helper: simulate the owner completing site verification (owner-link),
// binding a domain to an owner wallet. Mirrors what the hub does after the
// blog-link/ownership checks. Prints { siteId, token, domain, ownerWallet }.
import crypto from 'node:crypto';
import { PrismaClient } from '../packages/cli/generated/client/index.js';

const domain = process.argv[2];
const wallet = (process.argv[3] || '').toLowerCase();
if (!domain || !wallet) {
  console.error('usage: node verify-owner.mjs <domain> <ownerWallet>');
  process.exit(2);
}

const db = new PrismaClient();
try {
  await db.tipDomainClaim.deleteMany({ where: { domain } }).catch(() => {});
  let user = await db.user.findUnique({ where: { walletAddress: wallet } });
  if (!user) {
    user = await db.user.create({ data: { walletAddress: wallet, wallets: { create: { address: wallet, isPrimary: true } } } });
  }
  let site = await db.website.findFirst({ where: { domain } });
  if (site) {
    site = await db.website.update({
      where: { id: site.id },
      data: { ownerId: user.id, isVerified: true, verificationStatus: 'verified', verificationSource: 'owner-link', deletedAt: null },
    });
  } else {
    site = await db.website.create({
      data: {
        domain,
        name: domain,
        ownerId: user.id,
        verifyToken: crypto.randomBytes(16).toString('hex'),
        siteToken: `e2e-${domain}-${Date.now()}`,
        isVerified: true,
        verificationStatus: 'verified',
        verificationSource: 'owner-link',
      },
    });
  }
  console.log(JSON.stringify({ siteId: site.id, token: site.verifyToken, domain, ownerWallet: wallet }));
} finally {
  await db.$disconnect();
}
