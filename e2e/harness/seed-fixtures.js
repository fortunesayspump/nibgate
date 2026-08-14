// Seed a FULL access-control fixture matrix on both backends for the graded
// e2e stress suite. Deterministic slugs/titles. Reads backend/.env + subblogs
// .env so it can hit each DB directly.
//
// Hub: uses backend service.createShare (real R2 bodies + provider) so every
// status/tier combo is reachable through the live API.
// Subblogs: seeds a dedicated site "stresslab", promotes the test wallet
// (W_MAIN) to admin so its SIWE JWT can drive admin endpoints, and creates
// posts via the blog service.
//
// Run:  node seed-fixtures.js   (from /tmp/opencode/e2e)

const path = require('node:path');
const fs = require('node:fs');
const RE = '/Users/fortune/Documents/Workflows/nibgate-repo';

// ---- load backend/.env (mirrors seed-nibshare-demo.mjs) ----
function loadEnv(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = val;
    }
  } catch {}
}
loadEnv(path.join(RE, 'backend/.env'));
loadEnv(path.join(RE, 'subblogs/backend/.env'));

const W_MAIN = '0xb2152b415306a83bc658cb481fcc4829c571177a';
const W_IMP = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const W = {
  main: W_MAIN,
  imp: W_IMP,
  alice: '0x1111111111111111111111111111111111111111',
  bob: '0x2222222222222222222222222222222222222222',
};

const md = (title, extra = '') => `# ${title}

A fixture for the graded e2e access-control suite. ${extra}

## Body

Lots of plaintext so reads and gates have something to serve. The server
decrypts and hands back UTF-8; nothing here is secret.
`;

async function main() {
  const { registerProvider } = await import('@nibgate/sdk/server');
  const { createNibgateProvider } = await import(`${RE}/backend/src/server/lib/nibgate-provider.js`);
  const { db } = await import('@nibgate/internal/db.js');
  const service = await import(`${RE}/backend/src/server/nibshare/service.js`);

  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  registerProvider('nibgate', createNibgateProvider, {
    endpoint: R2_ENDPOINT, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET, publicUrl: R2_PUBLIC_URL.replace(/\/+$/, ''),
  });

  // ---- Hub state: wipe this owner's shares + reseed ----
  await db.nibShareEvent.deleteMany({ where: { share: { ownerWallet: W_MAIN } } });
  await db.nibShareReceipt.deleteMany({ where: { share: { ownerWallet: W_MAIN } } });
  await db.nibShareEntitlement.deleteMany({ where: { share: { ownerWallet: W_MAIN } } });
  await db.nibShare.deleteMany({ where: { ownerWallet: W_MAIN } });

  let seq = 0;
  const fakeTx = () => `0x${String(seq++).padStart(2, '0')}${'b'.repeat(62)}`;
  const out = { hub: {}, subblogs: {} };

  const createShare = async ({ title, slug, price = '0', whitelist = [], whitelistPrice, publicAccess = true, status = 'active', expiresAt = null }) => {
    const share = await service.createShare({
      title, summary: title, coverUrl: null,
      content: md(title, `slug=${slug}`),
      price, expiresAt, whitelist, whitelistPrice, publicAccess,
      storageProvider: 'nibgate', contentType: 'article', status, ownerWallet: W_MAIN,
    });
    if (slug) await db.nibShare.update({ where: { id: share.id }, data: { slug, title } });
    const s = await db.nibShare.findUnique({ where: { id: share.id } });
    return s;
  };

  // H1 free public
  out.hub['free-public'] = await createShare({ title: 'H1 free public fixture', slug: 'h1freepub' });
  // H2 paid public $1
  out.hub['paid-public'] = await createShare({ title: 'H2 paid public fixture', slug: 'h2paidpub', price: '1' });
  // H3 free invite-only (whitelist = W_MAIN only)
  out.hub['free-invite-main'] = await createShare({ title: 'H3 free invite main', slug: 'h3invmain', whitelist: [W_MAIN], publicAccess: false });
  // H4 free invite-only (whitelist = W_IMP only) -> W_MAIN is NOT on it
  out.hub['free-invite-imp'] = await createShare({ title: 'H4 free invite imp', slug: 'h4invimp', whitelist: [W_IMP], publicAccess: false });
  // H5 paid invite-only, whitelist=W_MAIN pays whitelistPrice 0.5, others 403
  out.hub['paid-invite-main'] = await createShare({ title: 'H5 paid invite main', slug: 'h5paidinv', price: '1', whitelist: [W_MAIN], whitelistPrice: '0.5', publicAccess: false });
  // H6 paid public with whitelist free tier: W_MAIN unlocks free, others pay $1
  out.hub['paid-wl-free'] = await createShare({ title: 'H6 paid wl free', slug: 'h6wlfree', price: '1', whitelist: [W_MAIN], whitelistPrice: '0' });
  // H7 draft
  out.hub['draft'] = await createShare({ title: 'H7 draft fixture', slug: 'h7draft', status: 'draft' });
  // H8 revoked
  const h8 = await createShare({ title: 'H8 revoked fixture', slug: 'h8revoked' });
  await service.revokeShare(h8);
  out.hub['revoked'] = await db.nibShare.findUnique({ where: { id: h8.id } });
  // H9 expired
  out.hub['expired'] = await createShare({ title: 'H9 expired fixture', slug: 'h9expired', expiresAt: '2020-01-01T00:00:00Z' });
  // H10 paid public, whitelist w/ price tier discount only (no free tier)
  out.hub['paid-wl-discount'] = await createShare({ title: 'H10 paid wl discount', slug: 'h10wldisc', price: '2', whitelist: [W_MAIN], whitelistPrice: '1.25' });

  // Entitlement states on the above (hub grants; W_MAIN pays on H2 -> active)
  // H2 paid-public: grant W_MAIN an active paid entitlement (real unlocked paid)
  const h2 = out.hub['paid-public'];
  await service.grantUnlock({ share: h2, payer: W_MAIN, txHash: fakeTx(), amount: '1' });
  // H2: ban W_IMP (banned wallet tests)
  await service.banEntitlement({ share: h2, wallet: W_IMP });
  // H2: soft-revoke alice (revoked entitlement on paid share -> can re-pay)
  const h2a = await service.grantUnlock({ share: h2, payer: W.alice, txHash: fakeTx(), amount: '1' });
  await db.nibShareReceipt.update({ where: { id: h2a.receipt.id }, data: { unlockedAt: new Date() } });
  await service.revokeEntitlement({ share: h2, wallet: W.alice });
  // H3 free-invite-main: grant W_MAIN free entitlement (possessed read)
  await service.grantEntitlement({ share: out.hub['free-invite-main'], wallet: W_MAIN });
  // H4 free-invite-imp: ban W_MAIN (proves ban blocks even the possessor if listed)
  await service.banEntitlement({ share: out.hub['free-invite-imp'], wallet: W_MAIN });

  // Cutoff-wallet fixture on H6: give alice/bob paid entitlements, then owner will
  // remove them via PUT access-control in the admin-flow tests. Seed state now:
  for (const w of [W.alice, W.bob]) {
    await service.grantUnlock({ share: out.hub['paid-wl-free'], payer: w, txHash: fakeTx(), amount: '1' });
  }

  const hubCounts = await db.nibShare.count({ where: { ownerWallet: W_MAIN } });
  console.log('hub shares seeded:', hubCounts);
  for (const k of Object.keys(out.hub)) {
    console.log(`  hub.${k} = /ns/${out.hub[k].slug}  price=${out.hub[k].price} wl=${out.hub[k].whitelist.length} wlPrice=${out.hub[k].whitelistPrice} public=${out.hub[k].publicAccess} status=${out.hub[k].status}`);
  }

  // ---- Subblogs: dedicated site + admin promote + posts ----
  const { PrismaClient } = require(`${RE}/subblogs/backend/node_modules/@prisma/client`);
  const bp = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

  const SUBSITE = 'stresslab';
  let site = await bp.site.findFirst({ where: { subdomain: SUBSITE } });
  if (!site) {
    site = await bp.site.create({
      data: { subdomain: SUBSITE, name: 'Stress Lab', description: 'e2e access-control fixture site',
        hostnames: JSON.stringify([]), verifyToken: null, ownerUserId: null, createdAt: new Date(), updatedAt: new Date() },
    });
  }
  console.log('subblogs site:', site.id, site.subdomain);
  const out2 = out.subblogs;

  // Promote W_MAIN user to admin on this site (create if absent) so its SIWE JWT
  // authorizes admin endpoints. Also create an author@ co-owner for authz tests.
  const upWallet = W_MAIN.toLowerCase();
  let adminUser = await bp.user.findFirst({ where: { siteId: site.id, walletAddress: upWallet } });
  if (!adminUser) {
    adminUser = await bp.user.create({
      data: { siteId: site.id, name: 'E2E Admin', email: `wallet-${upWallet.replace(/^0x/, '')}@wallets.nibgate.xyz`,
        password: require('node:crypto').randomBytes(24).toString('hex'), role: 'admin', walletAddress: upWallet, createdAt: new Date(), updatedAt: new Date() },
    });
  } else {
    adminUser = await bp.user.update({ where: { id: adminUser.id }, data: { role: 'admin' } });
  }
  let otherUser = await bp.user.findFirst({ where: { siteId: site.id, role: 'author' } });
  if (!otherUser) {
    otherUser = await bp.user.create({
      data: { siteId: site.id, name: 'Other Author', email: 'e2e-other@nibgate.xyz', password: require('node:crypto').randomBytes(24).toString('hex'), role: 'author', createdAt: new Date(), updatedAt: new Date() },
    });
  }
  console.log('subblogs adminUserId:', adminUser.id, ' otherAuthorId:', otherUser.id);

  // Wipe previous fixture posts on this site
  await bp.entitlement.deleteMany({ where: { post: { siteId: site.id } } });
  await bp.receipt.deleteMany({ where: { post: { siteId: site.id } } });
  await bp.blogPost.deleteMany({ where: { siteId: site.id } });

  const createPost = async ({ slug, title, type = 'article', price = '0', whitelist = [], whitelistPrice, publicAccess = true, status = 'published', authorId = adminUser.id }) => {
    const post = await bp.blogPost.create({
      data: {
        siteId: site.id, slug, title, authorId, type, status,
        bodyMarkdown: md(title, `slug=${slug}`),
        price: price === '0' ? null : price,
        whitelist, whitelistPrice, publicAccess,
        publishedAt: status === 'published' ? new Date() : null,
        createdAt: new Date(), updatedAt: new Date(),
      },
    });
    return post;
  };

  // P1 free published
  out2['free'] = await createPost({ slug: 'p1-free', title: 'P1 free post' });
  // P2 paid published $1
  out2['paid'] = await createPost({ slug: 'p2-paid', title: 'P2 paid post', price: '1' });
  // P3 free invite-only (whitelist W_MAIN)
  out2['free-invite'] = await createPost({ slug: 'p3-free-invite', title: 'P3 free invite', whitelist: [W_MAIN], publicAccess: false });
  // P4 paid invite-only whitelist W_MAIN @ 0.5
  out2['paid-invite'] = await createPost({ slug: 'p4-paid-invite', title: 'P4 paid invite', price: '1', whitelist: [W_MAIN], whitelistPrice: '0.5', publicAccess: false });
  // P5 paid w/ whitelist free tier
  out2['paid-wl-free'] = await createPost({ slug: 'p5-paid-wl-free', title: 'P5 paid wl free', price: '1', whitelist: [W_MAIN], whitelistPrice: '0' });
  // P6 draft
  out2['draft'] = await createPost({ slug: 'p6-draft', title: 'P6 draft', status: 'draft' });
  // P7 paid post owned by OTHER author (author-authz fixture)
  out2['other-author'] = await createPost({ slug: 'p7-other', title: 'P7 other author', price: '1', authorId: otherUser.id });

  // Media-bearing paid post for media gate tests (photos come from the media JSON)
  const mediaPost = await createPost({ slug: 'p8-mediapub', title: 'P8 media paid', price: '1', type: 'photo' });
  const mediaJson = JSON.stringify([
    { storageRef: 'stresslab/media/photo-a.bin', encryptedKey: 'aGVsbG8=', contentType: 'image/webp', name: 'photo-a.webp' },
  ]);
  await bp.blogPost.update({ where: { id: mediaPost.id }, data: { media: mediaJson } });
  out2['media-paid'] = await bp.blogPost.findUnique({ where: { id: mediaPost.id } });

  // Entitlement/bans on subblogs via access.service
  const access = await import(`${RE}/subblogs/backend/src/services/access.service.js`);
  // P2 paid: W_MAIN active entitlement, W_IMP banned
  await access.grantUnlock({ post: out2.paid, payer: W_MAIN, txHash: fakeTx(), amount: '1' });
  await access.banEntitlement({ post: out2.paid, wallet: W_IMP });
  // P3 free-invite: W_MAIN granted free
  await access.grantEntitlement({ post: out2['free-invite'], wallet: W_MAIN });
  // P5 paid-wl-free: alice+bob paid (for cutoff fixtures)
  for (const w of [W.alice, W.bob]) {
    await access.grantUnlock({ post: out2['paid-wl-free'], payer: w, txHash: fakeTx(), amount: '1' });
  }

  for (const k of Object.keys(out2)) {
    const p = out2[k];
    console.log(`  subblogs.${k} = /${p.type}/${p.slug}  price=${p.price} wl=${p.whitelist.length} wlPrice=${p.whitelistPrice} public=${p.publicAccess}`);
  }

  fs.writeFileSync('/tmp/opencode/e2e/fixtures.json', JSON.stringify(out, null, 2));
  await db.$disconnect();
  await bp.$disconnect();
  console.log('\nfixtures.json written');
}

main().catch((e) => { console.error('SEED FAIL:', e); process.exit(1); });