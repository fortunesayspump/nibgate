// E2E helper: clear any verified site/contents for a domain so a random site
// starts unresolved (hold path) on repeat runs.
import { PrismaClient } from '../packages/cli/generated/client/index.js';

const domain = process.argv[2];
if (!domain) {
  console.error('usage: node reset-domain.mjs <domain>');
  process.exit(2);
}

const db = new PrismaClient();
try {
  const sites = await db.website.findMany({ where: { domain } });
  for (const site of sites) {
    await db.website.update({ where: { id: site.id }, data: { isVerified: false, verificationStatus: 'unverified', deletedAt: new Date(), verifyToken: `reset-${Date.now()}` } });
  }
  await db.tipDomainClaim.deleteMany({ where: { domain } }).catch(() => {});
  console.log(JSON.stringify({ reset: sites.length }));
} finally {
  await db.$disconnect();
}
