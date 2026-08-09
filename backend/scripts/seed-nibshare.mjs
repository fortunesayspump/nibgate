import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
}

const { db } = await import('@nibgate/internal/db.js');
const { generateContentKey, encryptBytes, packCipherBlob, contentHashFor, wrapKey } = await import('@nibgate/sdk/server');
const { registerProvider, putBlob } = await import('@nibgate/sdk/server');
const { createNibgateProvider } = await import('../src/server/lib/nibgate-provider.js');

const KEK_SECRET = crypto.createHash('sha256').update(process.env.NIBGATE_SHARE_KEY_SECRET || process.env.NIB_SHARE_KEY_SECRET || 'nibshare-local-key-wrapping-secret').digest();

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
  console.error('Missing R2 config in backend/.env');
  process.exit(1);
}
registerProvider('nibgate', createNibgateProvider, { endpoint, accessKeyId, secretAccessKey, bucket, publicUrl });

const OWNER = process.env.SHARE_OWNER || '0x2c5c6423993ba5102e5b0e1ce3079b9c26aa23bd';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function slugFromBytes(buf) {
  let n = BigInt('0x' + buf.toString('hex'));
  let out = '';
  const base = BigInt(58);
  while (n > 0n) {
    out = BASE58[Number(n % base)] + out;
    n = n / base;
  }
  return (out.padStart(8, BASE58[0])).slice(0, 8);
}

async function uniqueSlug() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = slugFromBytes(crypto.randomBytes(8));
    const existing = await db.nibShare.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new Error('Could not generate a unique slug');
}

function daysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 864e5 - hours * 3600e3);
}

function daysAhead(days, hours = 0) {
  return new Date(Date.now() + days * 864e5 + hours * 3600e3);
}

function txHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

const shares = [
  {
    title: 'The craft of digital woodworking',
    summary: 'Notes on hand tools, jigs, and slow mornings in the shop.',
    contentType: 'article',
    price: 0,
    createdAt: daysAgo(9, 4),
    expiresAt: daysAgo(1),
    body: `# The craft of digital woodworking

Some people think a CNC is cheating. I think a chisel and a router table are the same conversation, just different punctuation.

## Jigs > skill

Every problem I've ever had in the shop was really a fixture problem in disguise. Build the jig first and the work follows.

- A sled that never drifts
- Feather boards you trust
- A zero-clearance insert for every blade

## Slow mornings

The best pieces happen before noon, with coffee, and no deadline anywhere near the bench.`,
  },
  {
    title: 'Studio window light study',
    summary: 'Four frames, same window, different hours.',
    contentType: 'photo',
    price: 0,
    createdAt: daysAgo(7, 2),
    expiresAt: daysAhead(4),
    body: JSON.stringify({
      type: 'photo',
      media: [
        { url: 'https://images.unsplash.com/photo-1494891848038-7bd202a2afeb?w=1200', caption: 'Golden hour', storageRef: null, encryptedKey: null },
        { url: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1200', caption: 'Noon flat', storageRef: null, encryptedKey: null },
        { url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=1200', caption: 'Blue hour', storageRef: null, encryptedKey: null },
        { url: 'https://images.unsplash.com/photo-1474692295473-66ba4d54e0d2?w=1200', caption: 'Night', storageRef: null, encryptedKey: null }
      ],
      coverKey: '',
      caption: 'One window, four hours.'
    }),
  },
  {
    title: 'Analog tape warmth, decoded',
    summary: 'A 12-minute essay on saturation, tape hiss, and why "warm" is measurable.',
    contentType: 'music',
    price: 1.5,
    createdAt: daysAgo(5, 5),
    expiresAt: daysAhead(6),
    body: JSON.stringify({
      type: 'music',
      coverUrl: 'https://images.unsplash.com/photo-1521302080334-4bebac2763a6?w=600',
      audio: { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
      caption: 'Tape is just a low-pass filter with feelings.'
    }),
  },
  {
    title: 'RC planes for people who overthink',
    summary: 'Buy a foamie. That is the whole guide. Everything else is rationalization.',
    contentType: 'video',
    price: 2.99,
    createdAt: daysAgo(3, 6),
    expiresAt: daysAhead(2),
    body: JSON.stringify({
      type: 'video',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      caption: 'Why every serious pilot secretly flies foam.'
    }),
  },
  {
    title: 'Annotated: the 2026 CNC maintenance schedule',
    summary: 'The checklist PDF I actually follow, with my margin notes.',
    contentType: 'document',
    price: 5,
    createdAt: daysAgo(2, 1),
    expiresAt: daysAhead(7),
    body: JSON.stringify({
      type: 'document',
      coverUrl: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600',
      document: {
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        name: 'cnc-maintenance-2026.pdf',
        size: 1048576
      },
      caption: 'Weekly, monthly, and quarterly checks.'
    }),
  },
  {
    title: 'Coffee, rated on vibes only',
    summary: 'A totally scientific ranking of the coffee beans on my shelf.',
    contentType: 'article',
    price: 0.5,
    createdAt: daysAgo(1, 3),
    expiresAt: daysAhead(0, 5),
    body: `# Coffee, rated on vibes only

1. The one from the farm on the hill — obviously.
2. Anything roasted on a Tuesday.
3. The supermarket bag that has been there since winter (do not).

That is the entire list.`
  },
  {
    title: 'Revoked: prototype comp jig (private)',
    summary: 'Early prototype. Kept for the record, no longer shared.',
    contentType: 'document',
    price: 0,
    status: 'revoked',
    createdAt: daysAgo(12, 8),
    body: JSON.stringify({
      type: 'document',
      coverUrl: null,
      document: { url: 'https://example.com/proto.pdf', name: 'proto.pdf', size: 204800 },
      caption: 'Do not share.'
    }),
  },
  {
    title: 'Draft: winter shop series',
    summary: 'Notes for a future post.',
    contentType: 'article',
    price: 0,
    status: 'draft',
    createdAt: daysAgo(0, 5),
    body: `# Winter shop series (draft)

Dust collection, lighting, and why the garage heater is the real MVP. Needs photos.`
  },
  {
    title: 'Draft: router table comparison',
    summary: 'Still editing.',
    contentType: 'video',
    price: 0,
    status: 'draft',
    createdAt: daysAgo(0, 2),
    body: JSON.stringify({
      type: 'video',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      caption: 'Cutting the B-roll this week.'
    }),
  }
];

const payers = [
  '0x4b1fd44f11b3df96e0d8d8cd93105d1f0d0c4f6e',
  '0x8a7b2c9d31e504f86a1b2c3d4e5f60718293a4b5',
  '0x9f1e0d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e'
];

let created = 0;
const existing = await db.nibShare.findMany({ where: { ownerWallet: OWNER } });
for (const row of existing) {
  await db.nibShareReceipt.deleteMany({ where: { shareId: row.id } });
  await db.nibShareEntitlement.deleteMany({ where: { shareId: row.id } });
}
await db.nibShare.deleteMany({ where: { ownerWallet: OWNER } });
if (existing.length) console.log(`cleared ${existing.length} existing rows for ${OWNER}`);
for (const s of shares) {
  const plaintext = typeof s.body === 'string' ? s.body : JSON.stringify(s.body);
  const plaintextBytes = Buffer.byteLength(plaintext, 'utf8');
  const contentKey = generateContentKey();
  const enc = encryptBytes(contentKey, Buffer.from(plaintext, 'utf8'));
  const blob = packCipherBlob(enc);
  const id = crypto.randomUUID();
  const slug = await uniqueSlug();
  const r2Key = `nibshare/${id}/body.bin`;
  const { storageRef, url } = await putBlob({ key: r2Key, data: blob });
  const contentHash = contentHashFor(OWNER, storageRef, plaintext);

  const share = await db.nibShare.create({
    data: {
      id,
      ownerWallet: OWNER,
      title: s.title,
      summary: s.summary,
      contentType: s.contentType,
      bodyLength: plaintextBytes,
      price: s.price,
      currency: 'USDC',
      expiresAt: s.expiresAt ?? null,
      whitelist: [],
      storageProvider: 'nibgate',
      storageRef,
      ciphertextUrl: url,
      contentHash,
      keyProvider: 'server',
      encryptedKey: wrapKey(KEK_SECRET, contentKey),
      decryptMode: 'server',
      status: s.status || 'active',
      slug,
      createdAt: s.createdAt,
      updatedAt: s.createdAt
    }
  });
  created += 1;
  console.log(`created ${s.contentType.padEnd(9)} ${String(s.price).padEnd(5)} ${slug}  ${s.title}`);

  if (s.price > 0 && s.status !== 'revoked') {
    const n = 1 + (created % 2);
    let unlockCount = 0;
    for (let i = 0; i < n; i += 1) {
      const payer = payers[(created + i) % payers.length];
      const unlockedAt = new Date(s.createdAt.getTime() + (i + 1) * 864e5);
      await db.nibShareReceipt.create({
        data: { shareId: share.id, payerWallet: payer, amount: s.price, currency: 'USDC', txHash: txHash(), unlockedAt, keyGrantedAt: unlockedAt }
      });
      await db.nibShareEntitlement.create({
        data: { shareId: share.id, wallet: payer, status: 'active', grantedAt: unlockedAt }
      });
      unlockCount += 1;
    }
    await db.nibShare.update({ where: { id: share.id }, data: { unlockCount } });
    console.log(`          + ${n} receipt(s) / entitlement(s)`);
  }

  if (s.status !== 'draft' && s.status !== 'revoked') {
    const viewCount = 2 + (created % 4);
    let seeded = 0;
    for (let i = 0; i < viewCount; i += 1) {
      const viewedAt = new Date(s.createdAt.getTime() + (i + 1) * 3 * 3600e3);
      if (viewedAt > new Date()) break;
      await db.nibShareEvent.create({ data: { shareId: share.id, type: 'view', wallet: payers[i % payers.length], createdAt: viewedAt } });
      seeded += 1;
    }
    if (seeded) await db.nibShare.update({ where: { id: share.id }, data: { viewCount: seeded } });
  }

  if (s.status === 'revoked') {
    await db.nibShareEvent.create({
      data: { shareId: share.id, type: 'revoke', wallet: payers[0], createdAt: new Date(s.createdAt.getTime() + 2 * 864e5) }
    });
  }
}

const total = await db.nibShare.count({ where: { ownerWallet: OWNER } });
const mine = await db.nibShare.findMany({ where: { ownerWallet: OWNER }, orderBy: { createdAt: 'desc' }, include: { receipts: true } });
console.log(`\nDB now has ${total} NibShare rows for ${OWNER}`);
console.log('Slugs (for /ns/<slug>):', mine.map((m) => m.slug).join(' '));
await db.$disconnect();
