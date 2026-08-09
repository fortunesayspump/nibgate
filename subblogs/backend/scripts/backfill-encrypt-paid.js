/* eslint-disable no-console */
// Encrypt existing paid subblog content at rest (body + audio + photos) with the
// SDK K-model, matching what blog.service.create/update do for new paid posts.
//
// Idempotent: posts that already carry contentKey/bodyStorageRef are skipped.
// Old plaintext objects are deleted from R2 after a successful swap so the
// plaintext is not left behind.
//
// Usage:
//   node scripts/backfill-encrypt-paid.js                  # all sites
//   node scripts/backfill-encrypt-paid.js --subdomain=x    # one site
//   node scripts/backfill-encrypt-paid.js --dry-run        # report only
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const {
  putBlob, deleteBlob, generateContentKey, encryptBytes, packCipherBlob,
} = require('@nibgate/sdk/server');
const config = require('../src/config/config');
const { registerR2Provider } = require('../src/lib/storage');
const { wrapContentKey } = require('../src/lib/keywrap');

registerR2Provider();
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const subdomainFilter = (args.find((a) => a.startsWith('--subdomain=')) || '').split('=')[1] || null;
const dryRun = args.includes('--dry-run');

function parseMedia(value) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (typeof item === 'string') return { url: item, caption: '' };
      if (item && typeof item === 'object' && item.url) return item;
      return null;
    })
    .filter(Boolean);
}

function sniffMime(buf) {
  if (!buf || buf.length < 12) return 'application/octet-stream';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'audio/mpeg';
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'audio/ogg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.slice(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  return 'application/octet-stream';
}

function keyFromUrl(url) {
  if (!url || !url.startsWith(config.r2.publicUrl)) return null;
  return url.replace(config.r2.publicUrl, '').replace(/^\//, '');
}

async function encryptAndStore(buffer, siteId, kind) {
  const contentKey = generateContentKey();
  const enc = encryptBytes(contentKey, buffer);
  const blob = packCipherBlob(enc);
  const storageRef = `blog/${siteId}/enc/${kind}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`;
  if (!dryRun) await putBlob({ key: storageRef, data: blob, contentType: 'application/octet-stream' });
  return { storageRef, contentKey: wrapContentKey(contentKey.toString('base64')) };
}

async function fetchBuffer(url) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error(`empty body from ${url}`);
      return buf;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`  warn: ${label} attempt ${attempt + 1} failed: ${err.message || err}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

async function convertPost(post) {
  if (post.contentKey || post.bodyStorageRef) return { status: 'skipped', detail: 'already encrypted' };

  const siteId = post.siteId;
  const oldMedia = parseMedia(post.media).filter((i) => typeof i === 'object' && i);
  const needsMedia = oldMedia.some((i) => i.url && !i.storageRef);
  const needsAudio = !!post.audioUrl && !post.audioStorageRef;
  const needsBody = !!post.bodyMarkdown && post.bodyMarkdown.trim().length > 0;

  if (!needsBody && !needsAudio && !needsMedia) return { status: 'skipped', detail: 'no plaintext content to encrypt' };

  const newMedia = [];
  if (needsMedia) {
    for (const item of oldMedia) {
      if (!item.url) continue;
      const buf = await fetchBuffer(item.url);
      const enc = await encryptAndStore(buf, siteId, 'media');
      newMedia.push({ storageRef: enc.storageRef, encryptedKey: enc.contentKey, contentType: sniffMime(buf), caption: item.caption || '' });
    }
  }

  let audioStorageRef = null;
  let audioEncryptedKey = null;
  let audioContentType = null;
  if (needsAudio) {
    const buf = await fetchBuffer(post.audioUrl);
    const enc = await encryptAndStore(buf, siteId, 'audio');
    audioStorageRef = enc.storageRef;
    audioEncryptedKey = enc.contentKey;
    audioContentType = sniffMime(buf);
  }

  let contentKey = null;
  let bodyStorageRef = null;
  if (needsBody) {
    const enc = await encryptAndStore(Buffer.from(post.bodyMarkdown, 'utf8'), siteId, 'body');
    contentKey = enc.contentKey;
    bodyStorageRef = enc.storageRef;
  }

  const update = {};
  if (contentKey) {
    update.bodyMarkdown = '';
    update.contentKey = contentKey;
    update.bodyStorageRef = bodyStorageRef;
  }
  if (audioStorageRef) {
    update.audioUrl = null;
    update.audioStorageRef = audioStorageRef;
    update.audioEncryptedKey = audioEncryptedKey;
    update.audioContentType = audioContentType;
  }
  if (needsMedia) update.media = newMedia.length ? JSON.stringify(newMedia) : null;

  if (dryRun) return { status: 'would-convert', detail: `${needsBody ? 'body' : ''} ${needsAudio ? 'audio' : ''} ${needsMedia ? `media(${newMedia.length})` : ''}`.trim() };

  const converted = await prisma.blogPost.update({ where: { id: post.id }, data: update });

  const oldKeys = [];
  if (post.audioUrl) { const k = keyFromUrl(post.audioUrl); if (k) oldKeys.push(k); }
  for (const item of oldMedia) { const k = keyFromUrl(item.url); if (k) oldKeys.push(k); }
  for (const k of oldKeys) {
    await deleteBlob({ storageRef: k }).catch((err) => console.error(`  warn: failed to delete old object ${k}: ${err.message}`));
  }

  return { status: 'converted', detail: `${needsBody ? 'body' : ''} ${needsAudio ? 'audio' : ''} ${needsMedia ? `media(${newMedia.length})` : ''}`.trim(), deletedOld: oldKeys.length, converted };
}

async function main() {
  if (!config.r2?.endpoint) {
    console.error('R2 is not configured — nothing to encrypt to.');
    process.exit(1);
  }
  const sites = await prisma.site.findMany();
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const site of sites) {
    if (subdomainFilter && site.subdomain !== subdomainFilter) continue;
    const posts = await prisma.blogPost.findMany({
      where: { siteId: site.id, price: { not: null }, NOT: { price: '0' } },
      orderBy: { updatedAt: 'desc' },
    });
    for (const post of posts) {
      const label = `${site.subdomain}/${post.type}/${post.slug}`;
      try {
        const result = await withRetry(() => convertPost(post), label);
        if (result.status === 'converted') { converted += 1; console.log(`[converted] ${label}: ${result.detail} (deleted ${result.deletedOld} plaintext object(s))`); }
        else if (result.status === 'would-convert') { console.log(`[would-convert] ${label}: ${result.detail}`); }
        else { skipped += 1; if (!dryRun) console.log(`[skipped] ${label}: ${result.detail}`); }
      } catch (err) {
        failed += 1;
        console.error(`[failed] ${label}: ${err.message || err}${err.stack ? ` | ${err.stack.split('\n').slice(0, 2).join(' <- ')}` : ''}`);
      }
    }
  }

  await prisma.$disconnect();
  console.log(`\nDone. converted=${converted} skipped=${skipped} failed=${failed}${dryRun ? ' (dry-run, no changes made)' : ''}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
