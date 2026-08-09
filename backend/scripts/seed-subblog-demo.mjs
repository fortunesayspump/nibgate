import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const vars = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return vars;
}

const subEnv = loadEnv(path.resolve(__dirname, '../../subblogs/backend/.env'));
const hubEnv = loadEnv(path.resolve(__dirname, '../.env'));
for (const [k, v] of Object.entries(hubEnv)) process.env[k] = v;

const { PrismaClient } = await import('../../subblogs/backend/node_modules/.prisma/client/index.js');
const subDb = new PrismaClient({ datasources: { db: { url: subEnv.DATABASE_URL } } });
const { db } = await import('@nibgate/internal/db.js');

const SITE_SECTION = { article: 'writing', photo: 'photos', music: 'music', video: 'video', document: 'docs' };
const HUB_TYPE = { photo: 'image' };

const PAYERS = [
  '0x7f7274b891a2efda5e795e97f5ca7bfebd90e100',
  '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
  '0x9c8d7e6f5a4b3c2d1e0f1a2b3c4d5e6f7a8b9c0d',
  '0x4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f',
  '0xf0e1d2c3b4a59687786a5b4c3d2e1f0a9b8c7d6e',
];

async function seed() {
  // 1. Hub owner + website for demo.nibgate.xyz
  const OWNER = '0x2c5c6423993ba5102e5b0e1ce3079b9c26aa23bd';
  let user = await db.user.findUnique({ where: { walletAddress: OWNER } });
  if (!user) {
    user = await db.user.create({ data: { walletAddress: OWNER, username: 'demo-owner' } });
  }
  const domain = 'demo.nibgate.xyz';
  let site = await db.website.findUnique({ where: { domain } });
  if (!site) {
    site = await db.website.create({
      data: {
        domain,
        name: 'Demo Blog',
        ownerId: user.id,
        isVerified: true,
        verificationStatus: 'verified',
        verifyToken: crypto.randomBytes(16).toString('hex'),
        siteToken: crypto.randomBytes(32).toString('hex'),
      },
    });
    console.log('created hub site', domain);
  } else {
    site = await db.website.update({
      where: { id: site.id },
      data: { isVerified: true, verificationStatus: 'verified', deletedAt: null },
    });
    console.log('existing hub site', domain);
  }

  // 2. Add 2 draft posts to the demo subblog if they don't exist
  const demo = await subDb.site.findUnique({ where: { subdomain: 'demo' } });
  const author = await subDb.user.findFirst({ where: { siteId: demo.id, email: 'author@example.com' } });
  const draftsToAdd = [
    { title: 'Draft: Modular Synth Buying Guide', slug: 'draft-modular-synth-buying-guide', type: 'article', price: '0.01', body: '# Modular Synth Buying Guide (draft)\n\nStill editing — case, power, first modules.' },
    { title: 'Draft: Winter Studio Tour', slug: 'draft-winter-studio-tour', type: 'photo', price: null, body: '# Winter Studio Tour (draft)\n\nNeeds photos from this week.' },
  ];
  for (const d of draftsToAdd) {
    const exists = await subDb.blogPost.findUnique({ where: { siteId_slug: { siteId: demo.id, slug: d.slug } } });
    if (!exists) {
      await subDb.blogPost.create({
        data: {
          siteId: demo.id, authorId: author.id, slug: d.slug, title: d.title, bodyMarkdown: d.body,
          excerpt: d.title.replace(/^Draft:\s*/, ''),
          type: d.type, price: d.price, status: 'draft', publishedAt: null, tags: '',
        },
      });
      console.log('added draft post:', d.slug);
    }
  }

  // 3. Upsert hub Content for every demo post
  const posts = await subDb.blogPost.findMany({ where: { siteId: demo.id }, select: { id: true, title: true, slug: true, type: true, price: true, status: true, createdAt: true } });

  let fixedPub = 0;
  for (const p of posts) {
    if (p.status === 'published' && !p.publishedAt && p.createdAt) {
      await subDb.blogPost.update({ where: { id: p.id }, data: { publishedAt: p.createdAt } });
      fixedPub += 1;
    }
  }
  if (fixedPub) console.log('backfilled publishedAt for', fixedPub, 'posts');

  let contentCount = 0;
  for (const p of posts) {
    const section = SITE_SECTION[p.type] || 'posts';
    const url = `https://demo.nibgate.xyz/${section}/${p.slug}`;
    const contentType = HUB_TYPE[p.type] || p.type;
    const price = p.price ? Number(p.price) : 0;
    const existing = await db.content.findFirst({ where: { websiteId: site.id, url } });
    if (!existing) {
      await db.content.create({
        data: { websiteId: site.id, title: p.title, url, path: `/${section}/${p.slug}`, contentType, price, currency: 'USDC', externalId: p.id },
      });
      contentCount += 1;
    }
  }
  console.log('content upserted (new:', contentCount, ')');

  // 4. Seed activity for a handful of popular paid posts
  const targetSlugs = ['understanding-nibgate-sdk', 'guide-modular-synthesis', 'midnight-protocol', 'modular-synth-performance', 'urban-geometry', 'welcome-to-your-new-blog'];
  for (const slug of targetSlugs) {
    const post = posts.find((p) => p.slug === slug);
    if (!post) continue;
    const section = SITE_SECTION[post.type] || 'posts';
    const url = `https://demo.nibgate.xyz/${section}/${post.slug}`;
    const content = await db.content.findFirst({ where: { websiteId: site.id, url } });
    if (!content) continue;

    await db.metric.deleteMany({ where: { contentId: content.id } });
    await db.unlockReceipt.deleteMany({ where: { contentId: content.id } });
    await db.contentRating.deleteMany({ where: { contentId: content.id } });

    const price = content.price || 0.01;
    const views = 4 + Math.floor(Math.random() * 7);
    for (let i = 0; i < views; i += 1) {
      await db.metric.create({
        data: { type: 'view', eventName: 'page_view', contentId: content.id, websiteId: site.id, visitorId: 'demo-' + crypto.randomBytes(6).toString('hex'), url, path: `/${section}/${post.slug}`, createdAt: new Date(Date.now() - Math.floor(Math.random() * 20 + 1) * 864e5) },
      });
    }

    const unlocks = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < unlocks; i += 1) {
      const amount = price;
      const payer = PAYERS[i % PAYERS.length];
      const when = new Date(Date.now() - Math.floor(Math.random() * 14 + 1) * 864e5);
      const txHash = '0x' + crypto.randomBytes(32).toString('hex');
      await db.unlockReceipt.create({
        data: { contentId: content.id, websiteId: site.id, payerWallet: payer, paymentId: 'demo-' + crypto.randomBytes(12).toString('hex'), paymentProvider: 'direct-transfer', txHash, amount, currency: 'USDC', recipientWallet: OWNER, status: 'verified', createdAt: when },
      });
      await db.metric.create({
        data: { type: 'unlock', eventName: 'unlock_completed', contentId: content.id, websiteId: site.id, revenue: amount, currency: 'USDC', visitorId: 'demo-' + crypto.randomBytes(6).toString('hex'), url, path: `/${section}/${post.slug}`, createdAt: when },
      });
    }

    const ratingCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < ratingCount; i += 1) {
      await db.contentRating.create({
        data: { contentId: content.id, websiteId: site.id, walletAddress: PAYERS[(unlocks + i) % PAYERS.length], ratingValue: 40 + Math.floor(Math.random() * 11), status: 'accepted', proof: 'onchain:' + crypto.randomBytes(32).toString('hex'), txHash: '0x' + crypto.randomBytes(32).toString('hex'), createdAt: new Date(Date.now() - Math.floor(Math.random() * 10 + 1) * 864e5) },
      });
    }
    console.log('seeded activity for:', post.slug, `(views ${views}, unlocks ${unlocks})`);
  }

  await db.$disconnect();
  await subDb.$disconnect();
  console.log('done.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
