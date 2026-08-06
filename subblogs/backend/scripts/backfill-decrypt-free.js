/* eslint-disable no-console */
// Convert paid subblog posts back to free, decrypting their content at rest
// (document + body + audio + photos) back to plaintext public blobs on R2.
//
// This is the inverse of backfill-encrypt-paid.js. Idempotent: posts without a
// price or without encrypted refs are skipped. Encrypted objects are deleted
// from R2 only after a successful swap.
//
// Usage:
//   node scripts/backfill-decrypt-free.js                  # all sites
//   node scripts/backfill-decrypt-free.js --subdomain=demo  # one site
//   node scripts/backfill-decrypt-free.js --type=document   # one post type
//   node scripts/backfill-decrypt-free.js --dry-run         # report only
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const {
  putBlob, deleteBlob, getBlob, decryptBytes, unpackCipherBlob,
} = require('@nibgate/sdk/server');
const config = require('../src/config/config');
const { registerR2Provider } = require('../src/lib/storage');

registerR2Provider();
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const subdomainFilter = (args.find((a) => a.startsWith('--subdomain=')) || '').split('=')[1] || null;
const typeFilter = (args.find((a) => a.startsWith('--type=')) || '').split('=')[1] || null;
const dryRun = args.includes('--dry-run');

function extFor(contentType, name) {
  if (name) {
    const m = /\.([a-z0-9]+)$/i.exec(name);
    if (m) return `.${m[1].toLowerCase()}`;
  }
  const map = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'application/msword': '.doc',
    'application/vnd.oasis.opendocument.spreadsheet': '.ods',
    'text/csv': '.csv',
    'text/markdown': '.md',
    'text/plain': '.txt',
  };
  return map[contentType] || '.bin';
}

function parseMedia(value) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((i) => i && typeof i === 'object');
}

async function decryptBlobToPublic(storageRef, encryptedKey, siteId, contentType, name, kind) {
  if (!storageRef || !encryptedKey) return null;
  const blob = await getBlob({ storageRef });
  const { iv, tag, ciphertext } = unpackCipherBlob(blob);
  const plain = decryptBytes(Buffer.from(encryptedKey, 'base64'), iv, tag, ciphertext);
  const key = `blog/${siteId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${kind}${extFor(contentType, name)}`;
  if (dryRun) return { url: null, plain };
  const { url } = await putBlob({
    key,
    data: plain,
    contentType: contentType || 'application/octet-stream',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return { url, plain };
}

async function convertPost(post) {
  if (post.price === null || post.price === '0') return { status: 'skipped', detail: 'already free' };

  const siteId = post.siteId;
  const changes = {};
  let toDelete = [];

  if (post.documentStorageRef && post.documentEncryptedKey) {
    const out = await decryptBlobToPublic(
      post.documentStorageRef, post.documentEncryptedKey, siteId,
      post.documentContentType, post.documentName, 'doc',
    );
    changes.documentUrl = out.url;
    changes.documentStorageRef = null;
    changes.documentEncryptedKey = null;
    toDelete.push(post.documentStorageRef);
  }

  if (post.bodyStorageRef && post.contentKey) {
    const out = await decryptBlobToPublic(post.bodyStorageRef, post.contentKey, siteId, 'text/markdown', 'body.md', 'body');
    changes.bodyMarkdown = out.plain.toString('utf8');
    changes.bodyStorageRef = null;
    changes.contentKey = null;
    toDelete.push(post.bodyStorageRef);
  }

  if (post.audioStorageRef && post.audioEncryptedKey) {
    const out = await decryptBlobToPublic(post.audioStorageRef, post.audioEncryptedKey, siteId, post.audioContentType, 'audio.bin', 'audio');
    changes.audioUrl = out.url;
    changes.audioStorageRef = null;
    changes.audioEncryptedKey = null;
    changes.audioContentType = null;
    toDelete.push(post.audioStorageRef);
  }

  const mediaItems = parseMedia(post.media);
  const newMedia = [];
  for (const item of mediaItems) {
    if (item.storageRef && item.encryptedKey) {
      const out = await decryptBlobToPublic(item.storageRef, item.encryptedKey, siteId, item.contentType, null, 'media');
      toDelete.push(item.storageRef);
      newMedia.push({ url: out.url, caption: item.caption || '', contentType: item.contentType || null });
    } else {
      newMedia.push(item);
    }
  }
  if (mediaItems.length > 0) changes.media = newMedia.length ? JSON.stringify(newMedia) : null;

  changes.price = null;
  changes.recipientWallet = null;

  const hasChanges = Object.keys(changes).length > 0 && (changes.documentUrl !== undefined || changes.bodyMarkdown !== undefined || changes.audioUrl !== undefined || changes.media !== undefined);
  if (!hasChanges) return { status: 'skipped', detail: 'no encrypted content to decrypt' };

  if (dryRun) return { status: 'would-convert', detail: Object.keys(changes).join(',') };

  const converted = await prisma.blogPost.update({ where: { id: post.id }, data: changes });
  for (const ref of toDelete) {
    await deleteBlob({ storageRef: ref }).catch((err) => console.error(`  warn: failed to delete old object ${ref}: ${err.message}`));
  }
  return { status: 'converted', deletedOld: toDelete.length, converted };
}

async function main() {
  if (!config.r2?.endpoint) {
    console.error('R2 is not configured — nothing to decrypt from.');
    process.exit(1);
  }
  const sites = await prisma.site.findMany();
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const site of sites) {
    if (subdomainFilter && site.subdomain !== subdomainFilter) continue;
    const posts = await prisma.blogPost.findMany({
      where: { siteId: site.id, price: { not: null }, NOT: { price: '0' }, ...(typeFilter ? { type: typeFilter } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    for (const post of posts) {
      const label = `${site.subdomain}/${post.type}/${post.slug}`;
      try {
        const result = await convertPost(post);
        if (result.status === 'converted') { converted += 1; console.log(`[converted] ${label}: deleted ${result.deletedOld} encrypted object(s)`); }
        else if (result.status === 'would-convert') { console.log(`[would-convert] ${label}: ${result.detail}`); }
        else { skipped += 1; if (!dryRun) console.log(`[skipped] ${label}: ${result.detail}`); }
      } catch (err) {
        failed += 1;
        console.error(`[failed] ${label}: ${err.message || err}`);
      }
    }
  }

  await prisma.$disconnect();
  console.log(`\nDone. converted=${converted} skipped=${skipped} failed=${failed}${dryRun ? ' (dry-run, no changes made)' : ''}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
