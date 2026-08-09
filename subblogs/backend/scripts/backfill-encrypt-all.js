// Encrypt any remaining plaintext subblog content at rest (free AND paid):
// post body, gallery/inline media, audio, uploaded video, and documents.
//
// Matches what blog.service.create/update and upload.route.js do for new posts.
// Idempotent: posts/items already carrying storageRef + key are skipped.
// Old plaintext objects are deleted from R2 after a successful swap.
// Cover images (coverUrl) are never touched — they stay public by design.
// YouTube video posts are left alone (videoUrl is external metadata).
// Old article bodies that embed plaintext image URLs are rewritten to
// nibgate-embed://N tokens so the reader streams them through the media proxy.
//
// Usage:
//   node scripts/backfill-encrypt-all.js                     # all sites
//   node scripts/backfill-encrypt-all.js --subdomain=x       # one site
//   node scripts/backfill-encrypt-all.js --post=<id>         # one post
//   node scripts/backfill-encrypt-all.js --dry-run           # report only
//   node scripts/backfill-encrypt-all.js --skip-delete       # keep old objects
const crypto = require('crypto');
const path = require('path');
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
const postFilter = (args.find((a) => a.startsWith('--post=')) || '').split('=')[1] || null;
const fetchOrigin = (args.find((a) => a.startsWith('--origin=')) || '').split('=')[1] || 'http://localhost:4000';
const dryRun = args.includes('--dry-run');
const skipDelete = args.includes('--skip-delete');

const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  md: 'text/markdown',
};
const VIDEO_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
};

function parseMedia(value) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => {
    if (typeof item === 'string') return { url: item, caption: '', encrypted: false };
    if (item && typeof item === 'object') {
      if (item.storageRef) return { ...item, url: null, encrypted: true };
      if (item.url) return { url: item.url, caption: item.caption || '', encrypted: false };
    }
    return null;
  }).filter(Boolean);
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
  if (buf.length > 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return 'application/octet-stream';
}

function typeFromName(name) {
  if (!name) return null;
  const ext = path.extname(String(name)).toLowerCase().replace(/^\./, '');
  return DOCUMENT_TYPES[ext] || VIDEO_TYPES[ext] || null;
}

function isYoutubeUrl(url) {
  return /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(url || '');
}

function resolveUrl(url) {
  if (/^https?:\/\//i.test(url || '')) return url;
  if (url && url.startsWith('/uploads/')) return `${fetchOrigin.replace(/\/+$/, '')}${url}`;
  return url;
}

function keyFromUrl(url) {
  if (!url || !config.r2.publicUrl) return null;
  if (!url.startsWith(config.r2.publicUrl)) return null;
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
  const siteId = post.siteId;
  const changes = [];
  const oldMedia = parseMedia(post.media);
  const needsMedia = oldMedia.some((i) => !i.encrypted && i.url);
  const needsAudio = !!post.audioUrl && !post.audioStorageRef;
  const needsDocument = !!post.documentUrl && !post.documentStorageRef;
  const needsVideo = !!post.videoUrl && !post.videoStorageRef && !isYoutubeUrl(post.videoUrl);
  const needsBody = !!post.bodyMarkdown && post.bodyMarkdown.trim().length > 0 && !post.bodyStorageRef;

  if (!needsBody && !needsMedia && !needsAudio && !needsDocument && !needsVideo) {
    return { status: 'skipped', detail: 'no plaintext content to encrypt' };
  }

  let newBody = post.bodyMarkdown;
  const urlToIndex = new Map();
  const oldPlainUrls = [];

  let newMedia = null;
  if (needsMedia) {
    newMedia = [];
    let index = 0;
    for (const item of oldMedia) {
      if (item.encrypted) {
        newMedia.push({ storageRef: item.storageRef, encryptedKey: item.encryptedKey, contentType: item.contentType || 'image/webp', caption: item.caption || '' });
      } else if (item.url) {
        const buf = await fetchBuffer(resolveUrl(item.url));
        const enc = await encryptAndStore(buf, siteId, 'media');
        newMedia.push({ storageRef: enc.storageRef, encryptedKey: enc.contentKey, contentType: sniffMime(buf) || 'image/webp', caption: item.caption || '' });
        urlToIndex.set(item.url, index);
        oldPlainUrls.push(item.url);
      }
      index += 1;
    }
    changes.push(`media(${oldPlainUrls.length})`);
  }

  if (needsBody && post.type === 'article' && urlToIndex.size > 0) {
    for (const [url, index] of urlToIndex.entries()) {
      newBody = newBody.split(url).join(`nibgate-embed://${index}`);
    }
    changes.push('body(+tokens)');
  }

  let audioStorageRef = null;
  let audioEncryptedKey = null;
  let audioContentType = null;
  if (needsAudio) {
    const buf = await fetchBuffer(resolveUrl(post.audioUrl));
    const enc = await encryptAndStore(buf, siteId, 'media');
    audioStorageRef = enc.storageRef;
    audioEncryptedKey = enc.contentKey;
    audioContentType = sniffMime(buf) || 'audio/mpeg';
    changes.push('audio');
  }

  let documentStorageRef = null;
  let documentEncryptedKey = null;
  let documentContentType = null;
  let documentName = null;
  let documentSize = null;
  if (needsDocument) {
    const buf = await fetchBuffer(resolveUrl(post.documentUrl));
    const enc = await encryptAndStore(buf, siteId, 'media');
    documentStorageRef = enc.storageRef;
    documentEncryptedKey = enc.contentKey;
    documentContentType = post.documentContentType || sniffMime(buf) || typeFromName(post.documentName || post.documentUrl) || 'application/octet-stream';
    documentName = post.documentName || (post.documentUrl ? path.basename(String(post.documentUrl).split('?')[0]) : null);
    documentSize = buf.length;
    changes.push('document');
  }

  let videoStorageRef = null;
  let videoEncryptedKey = null;
  let videoContentType = null;
  let videoName = null;
  let videoSize = null;
  if (needsVideo) {
    const buf = await fetchBuffer(resolveUrl(post.videoUrl));
    const enc = await encryptAndStore(buf, siteId, 'media');
    videoStorageRef = enc.storageRef;
    videoEncryptedKey = enc.contentKey;
    videoContentType = post.videoContentType || sniffMime(buf) || typeFromName(post.videoName || post.videoUrl) || 'video/mp4';
    videoName = post.videoName || (post.videoUrl ? path.basename(String(post.videoUrl).split('?')[0]) : null);
    videoSize = buf.length;
    changes.push('video');
  }

  let contentKey = null;
  let bodyStorageRef = null;
  if (needsBody) {
    const enc = await encryptAndStore(Buffer.from(newBody, 'utf8'), siteId, 'body');
    contentKey = enc.contentKey;
    bodyStorageRef = enc.storageRef;
    changes.push('body');
  }

  const update = {};
  if (contentKey) {
    update.bodyMarkdown = '';
    update.contentKey = contentKey;
    update.bodyStorageRef = bodyStorageRef;
  }
  if (newMedia) update.media = JSON.stringify(newMedia);
  if (audioStorageRef) {
    update.audioUrl = null;
    update.audioStorageRef = audioStorageRef;
    update.audioEncryptedKey = audioEncryptedKey;
    update.audioContentType = audioContentType;
  }
  if (documentStorageRef) {
    update.documentUrl = null;
    update.documentStorageRef = documentStorageRef;
    update.documentEncryptedKey = documentEncryptedKey;
    update.documentContentType = documentContentType;
    update.documentName = documentName;
    update.documentSize = documentSize;
  }
  if (videoStorageRef) {
    update.videoUrl = null;
    update.videoStorageRef = videoStorageRef;
    update.videoEncryptedKey = videoEncryptedKey;
    update.videoContentType = videoContentType;
    update.videoName = videoName;
    update.videoSize = videoSize;
  }

  if (dryRun) return { status: 'would-convert', detail: changes.join(' ') };

  const converted = await prisma.blogPost.update({ where: { id: post.id }, data: update });

  let deletedOld = 0;
  if (!skipDelete) {
    const oldKeys = [];
    for (const url of oldPlainUrls) { const k = keyFromUrl(url); if (k) oldKeys.push(k); }
    if (post.audioUrl) { const k = keyFromUrl(post.audioUrl); if (k) oldKeys.push(k); }
    if (post.documentUrl) { const k = keyFromUrl(post.documentUrl); if (k) oldKeys.push(k); }
    if (needsVideo && post.videoUrl) { const k = keyFromUrl(post.videoUrl); if (k) oldKeys.push(k); }
    for (const k of oldKeys) {
      await deleteBlob({ storageRef: k }).catch((err) => console.error(`  warn: failed to delete old object ${k}: ${err.message}`));
    }
    deletedOld = oldKeys.length;
  }

  return { status: 'converted', detail: changes.join(' '), deletedOld, converted };
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
      where: postFilter ? { id: postFilter } : { siteId: site.id },
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
