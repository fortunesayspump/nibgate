const crypto = require('crypto');
const { status } = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('../lib/prisma');
const config = require('../config/config');
const { registerR2Provider } = require('../lib/storage');
const { putBlob, getBlob, deleteBlob, generateContentKey, encryptBytes, decryptBytes, packCipherBlob, unpackCipherBlob } = require('@nibgate/sdk/server');

registerR2Provider();
const ENCRYPT_ENABLED = !!config.r2?.endpoint;

function isPaidValue(price) {
  return !!price && price !== '0';
}

function parseMedia(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeMediaForStorage(value, paid) {
  const items = parseMedia(value);
  if (paid) {
    return items
      .filter((i) => i && i.storageRef)
      .map((i) => ({
        storageRef: String(i.storageRef),
        encryptedKey: i.encryptedKey ? String(i.encryptedKey) : null,
        contentType: i.contentType || 'image/webp',
        caption: String(i.caption || '').trim(),
      }));
  }
  return items
    .map((i) => (typeof i === 'string' ? { url: i, caption: '' } : i))
    .filter((i) => i && i.url)
    .map((i) => ({
      url: String(i.url),
      caption: String(i.caption || '').trim(),
    }));
}

async function encryptBytesToStore(data, siteId, kind) {
  const contentKey = generateContentKey();
  const enc = encryptBytes(contentKey, data);
  const blob = packCipherBlob(enc);
  const key = `blog/${siteId}/enc/${kind}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`;
  const { storageRef } = await putBlob({ key, data: blob, contentType: 'application/octet-stream' });
  return { storageRef, contentKey: contentKey.toString('base64') };
}

async function decryptBytesFromStore(storageRef, contentKey) {
  if (!storageRef || !contentKey) return null;
  const blob = await getBlob({ storageRef });
  const { iv, tag, ciphertext } = unpackCipherBlob(blob);
  return decryptBytes(Buffer.from(contentKey, 'base64'), iv, tag, ciphertext);
}

function extForContentType(contentType) {
  const map = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'text/csv': '.csv',
    'application/vnd.oasis.opendocument.spreadsheet': '.ods',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt',
    'text/markdown': '.md',
  };
  return map[contentType] || null;
}

function extFromName(name) {
  if (!name) return null;
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? `.${m[1].toLowerCase()}` : null;
}

async function deleteObjectFromUrl(url) {
  if (!url || !config.r2.publicUrl || !url.startsWith(config.r2.publicUrl)) return;
  const key = url.slice(config.r2.publicUrl.length).replace(/^\//, '');
  if (!key) return;
  try {
    await deleteBlob({ storageRef: key });
  } catch {}
}

async function convertDocumentInPlace(existing, willBePaid, siteId) {
  if (willBePaid) {
    if (existing.documentStorageRef && existing.documentEncryptedKey) return {};
    if (!existing.documentUrl || !ENCRYPT_ENABLED) return {};
    const fileRes = await fetch(existing.documentUrl);
    if (!fileRes.ok) return {};
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    const enc = await encryptBytesToStore(bytes, siteId, 'media');
    await deleteObjectFromUrl(existing.documentUrl);
    return { documentStorageRef: enc.storageRef, documentEncryptedKey: enc.contentKey };
  }
  if (!(existing.documentStorageRef && existing.documentEncryptedKey)) return {};
  const plain = await decryptBytesFromStore(existing.documentStorageRef, existing.documentEncryptedKey);
  if (!plain) return {};
  const ext = extForContentType(existing.documentContentType) || extFromName(existing.documentName) || '.bin';
  const key = `blog/${siteId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const { url } = await putBlob({
    key,
    data: plain,
    contentType: existing.documentContentType || 'application/octet-stream',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  await deleteBlob({ storageRef: existing.documentStorageRef }).catch(() => {});
  return { documentUrl: url };
}

function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return 'application/octet-stream';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}

async function extractCoverFromMedia(mediaItems, coverKey, siteId) {
  if (!coverKey || !Array.isArray(mediaItems)) return { mediaItems, coverUrl: null };
  const idx = mediaItems.findIndex((m) => m && m.storageRef === coverKey);
  if (idx === -1) return { mediaItems, coverUrl: null };
  const item = mediaItems[idx];
  if (!item.storageRef || !item.encryptedKey) return { mediaItems, coverUrl: null };
  let data;
  try {
    const blob = await getBlob({ storageRef: item.storageRef });
    const { iv, tag, ciphertext } = unpackCipherBlob(blob);
    data = decryptBytes(Buffer.from(item.encryptedKey, 'base64'), iv, tag, ciphertext);
  } catch {
    return { mediaItems, coverUrl: null };
  }
  const contentType = item.contentType || sniffImageMime(data);
  const ext = contentType === 'image/jpeg' ? '.jpg' : contentType === 'image/png' ? '.png' : contentType === 'image/gif' ? '.gif' : '.webp';
  const key = `blog/${siteId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const { url } = await putBlob({ key, data, contentType });
  mediaItems.splice(idx, 1);
  return { mediaItems, coverUrl: url };
}

function slugify(value = '') {
  return String(value).trim().toLowerCase().replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function excerptFrom(markdown = '') {
  return String(markdown).replace(/[#*_>`\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function cleanTags(value) {
  if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 8).join(',');
  return String(value || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8).join(',');
}

async function listPublished(siteId, options = {}) {
  const { page = 1, limit = 10, tag, type } = options;
  const where = { siteId, status: 'published' };
  if (tag) where.tags = { contains: tag, mode: 'insensitive' };
  if (type) where.type = type;

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return { posts, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getBySlug(siteId, slug) {
  return prisma.blogPost.findFirst({
    where: { siteId, slug, status: 'published' },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function listAll(siteId, authorId) {
  const where = { siteId };
  if (authorId) where.authorId = authorId;
  return prisma.blogPost.findMany({
    where,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

async function getById(siteId, id) {
  const post = await prisma.blogPost.findFirst({
    where: { siteId, id },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  if (post && post.bodyStorageRef && post.contentKey) {
    try {
      const decrypted = await decryptBytesFromStore(post.bodyStorageRef, post.contentKey);
      if (decrypted) post.bodyMarkdown = decrypted.toString('utf8');
    } catch {
      post.bodyMarkdown = '';
    }
  }
  return post;
}

async function create(data, siteId, authorId) {
  const title = String(data.title || '').trim();
  const bodyMarkdown = String(data.bodyMarkdown || data.body || '').trim();
  const slug = slugify(data.slug || title);
  if (!slug) throw new ApiError(status.BAD_REQUEST, 'Could not generate slug');
  const statusVal = data.status === 'draft' ? 'draft' : 'published';
  const isPaid = isPaidValue(data.price);
  const excerpt = String(data.excerpt || '').trim() || excerptFrom(bodyMarkdown);
  const mediaItems = normalizeMediaForStorage(data.media, isPaid);
  let coverUrl = String(data.coverUrl || '').trim() || null;
  if (isPaid && data.coverKey) {
    const extracted = await extractCoverFromMedia(mediaItems, data.coverKey, siteId);
    if (extracted.coverUrl) coverUrl = extracted.coverUrl;
  }

  const postData = {
    siteId, title, slug,
    excerpt,
    tags: cleanTags(data.tags),
    type: ['article', 'photo', 'music', 'video', 'document'].includes(data.type) ? data.type : 'article',
    coverUrl,
    videoUrl: String(data.videoUrl || '').trim() || null,
    audioUrl: isPaid ? null : String(data.audioUrl || '').trim() || null,
    audioStorageRef: isPaid ? String(data.audioStorageRef || '').trim() || null : null,
    audioEncryptedKey: isPaid ? String(data.audioEncryptedKey || '').trim() || null : null,
    audioContentType: isPaid ? String(data.audioContentType || '').trim() || null : null,
    documentUrl: isPaid ? null : String(data.documentUrl || '').trim() || null,
    documentName: String(data.documentName || '').trim() || null,
    documentSize: data.documentSize ? Number(data.documentSize) || null : null,
    documentStorageRef: isPaid ? String(data.documentStorageRef || '').trim() || null : null,
    documentEncryptedKey: isPaid ? String(data.documentEncryptedKey || '').trim() || null : null,
    documentContentType: String(data.documentContentType || '').trim() || null,
    media: mediaItems.length ? JSON.stringify(mediaItems) : null,
    price: isPaid ? String(data.price).trim() : null,
    recipientWallet: String(data.recipientWallet || '').trim() || null,
    status: statusVal,
    featured: data.featured === true,
    publishedAt: statusVal === 'published' ? new Date() : null,
    authorId,
  };

  if (isPaid && ENCRYPT_ENABLED) {
    const encryptedBody = await encryptBytesToStore(Buffer.from(bodyMarkdown, 'utf8'), siteId, 'body');
    postData.bodyMarkdown = '';
    postData.contentKey = encryptedBody.contentKey;
    postData.bodyStorageRef = encryptedBody.storageRef;
  } else {
    postData.bodyMarkdown = bodyMarkdown;
  }

  return prisma.blogPost.create({
    data: postData,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function update(siteId, id, data) {
  const existing = await prisma.blogPost.findFirst({ where: { siteId, id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');

  const willBePaid = isPaidValue(data.price !== undefined ? data.price : existing.price);
  const updateData = {};
  if (data.title !== undefined) {
    updateData.title = String(data.title).trim();
    if (!data.slug) updateData.slug = slugify(data.title);
  }
  if (data.slug !== undefined) updateData.slug = slugify(data.slug);

  const bodyProvided = data.bodyMarkdown !== undefined || data.body !== undefined;
  if (bodyProvided) {
    const newBody = String(data.bodyMarkdown || data.body || '').trim();
    if (willBePaid && ENCRYPT_ENABLED) {
      if (existing.bodyStorageRef) await deleteBlob({ storageRef: existing.bodyStorageRef }).catch(() => {});
      const encryptedBody = await encryptBytesToStore(Buffer.from(newBody, 'utf8'), siteId, 'body');
      updateData.bodyMarkdown = '';
      updateData.contentKey = encryptedBody.contentKey;
      updateData.bodyStorageRef = encryptedBody.storageRef;
    } else {
      if (existing.bodyStorageRef) await deleteBlob({ storageRef: existing.bodyStorageRef }).catch(() => {});
      updateData.bodyMarkdown = newBody;
      updateData.contentKey = null;
      updateData.bodyStorageRef = null;
    }
  } else if (!willBePaid && existing.bodyStorageRef) {
    const decrypted = await decryptBytesFromStore(existing.bodyStorageRef, existing.contentKey);
    if (decrypted) {
      updateData.bodyMarkdown = decrypted.toString('utf8');
      await deleteBlob({ storageRef: existing.bodyStorageRef }).catch(() => {});
    }
    updateData.contentKey = null;
    updateData.bodyStorageRef = null;
  }

  if (data.excerpt !== undefined) updateData.excerpt = String(data.excerpt).trim();
  if (data.tags !== undefined) updateData.tags = cleanTags(data.tags);
  if (data.coverUrl !== undefined) updateData.coverUrl = String(data.coverUrl).trim() || null;
  if (data.videoUrl !== undefined) updateData.videoUrl = String(data.videoUrl).trim() || null;
  if (data.media !== undefined) {
    const mediaItems = normalizeMediaForStorage(data.media, willBePaid);
    if (willBePaid && data.coverKey) {
      const extracted = await extractCoverFromMedia(mediaItems, data.coverKey, siteId);
      if (extracted.coverUrl) updateData.coverUrl = extracted.coverUrl;
    }
    updateData.media = mediaItems.length ? JSON.stringify(mediaItems) : null;
  }
  if (data.type !== undefined) updateData.type = ['article', 'photo', 'music', 'video', 'document'].includes(data.type) ? data.type : 'article';
  if (data.price !== undefined) updateData.price = willBePaid ? String(data.price).trim() : null;
  if (data.recipientWallet !== undefined) updateData.recipientWallet = String(data.recipientWallet).trim() || null;
  if (data.featured !== undefined) updateData.featured = data.featured;
  if (willBePaid) {
    if (data.audioStorageRef !== undefined) updateData.audioStorageRef = String(data.audioStorageRef).trim() || null;
    if (data.audioEncryptedKey !== undefined) updateData.audioEncryptedKey = String(data.audioEncryptedKey).trim() || null;
    if (data.audioContentType !== undefined) updateData.audioContentType = String(data.audioContentType).trim() || null;
    updateData.audioUrl = null;
    if (data.documentStorageRef !== undefined) {
      updateData.documentStorageRef = String(data.documentStorageRef).trim() || null;
    } else {
      const converted = await convertDocumentInPlace(existing, true, siteId);
      if (converted.documentStorageRef) updateData.documentStorageRef = converted.documentStorageRef;
      if (converted.documentEncryptedKey) updateData.documentEncryptedKey = converted.documentEncryptedKey;
    }
    if (data.documentEncryptedKey !== undefined) updateData.documentEncryptedKey = String(data.documentEncryptedKey).trim() || null;
    if (data.documentContentType !== undefined) updateData.documentContentType = String(data.documentContentType).trim() || null;
    else if (!updateData.documentContentType) updateData.documentContentType = existing.documentContentType;
    updateData.documentUrl = null;
  } else {
    updateData.audioUrl = data.audioUrl !== undefined ? String(data.audioUrl).trim() || null : existing.audioUrl;
    updateData.audioStorageRef = null;
    updateData.audioEncryptedKey = null;
    updateData.audioContentType = null;
    updateData.documentStorageRef = null;
    updateData.documentEncryptedKey = null;
    if (data.documentUrl !== undefined) {
      updateData.documentUrl = String(data.documentUrl).trim() || null;
    } else {
      const converted = await convertDocumentInPlace(existing, false, siteId);
      updateData.documentUrl = converted.documentUrl || existing.documentUrl;
    }
    updateData.documentContentType = data.documentContentType !== undefined ? String(data.documentContentType).trim() || null : existing.documentContentType;
  }
  if (data.documentName !== undefined) updateData.documentName = String(data.documentName).trim() || null;
  if (data.documentSize !== undefined) updateData.documentSize = data.documentSize ? Number(data.documentSize) || null : null;
  if (data.status !== undefined) {
    updateData.status = data.status === 'draft' ? 'draft' : 'published';
    if (updateData.status === 'published' && !existing.publishedAt) updateData.publishedAt = new Date();
  }
  if (bodyProvided && data.bodyMarkdown && !data.excerpt) updateData.excerpt = excerptFrom(data.bodyMarkdown);

  return prisma.blogPost.update({
    where: { id },
    data: updateData,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function remove(siteId, id) {
  const existing = await prisma.blogPost.findFirst({ where: { siteId, id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');
  await prisma.blogPost.delete({ where: { id } });
  if (ENCRYPT_ENABLED) {
    if (existing.bodyStorageRef) await deleteBlob({ storageRef: existing.bodyStorageRef }).catch(() => {});
    if (existing.audioStorageRef) await deleteBlob({ storageRef: existing.audioStorageRef }).catch(() => {});
    if (existing.documentStorageRef) await deleteBlob({ storageRef: existing.documentStorageRef }).catch(() => {});
    for (const item of parseMedia(existing.media)) {
      if (item && item.storageRef) await deleteBlob({ storageRef: item.storageRef }).catch(() => {});
    }
  }
  return existing;
}

async function listByTypes(siteId) {
  const types = ['article', 'photo', 'music', 'video', 'document'];
  const result = {};
  for (const type of types) {
    const posts = await prisma.blogPost.findMany({
      where: { siteId, status: 'published', type },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    if (posts.length > 0) result[type] = posts;
  }
  return result;
}

module.exports = { listPublished, getBySlug, listAll, getById, create, update, remove, listByTypes };
