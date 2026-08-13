const crypto = require('crypto');
const { status } = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('../lib/prisma');
const config = require('../config/config');
const { registerR2Provider } = require('../lib/storage');
const { putBlob, getBlob, deleteBlob, generateContentKey, encryptBytes, decryptBytes, packCipherBlob, unpackCipherBlob } = require('@nibgate/sdk/server');
const { wrapContentKey, storedToKey } = require('../lib/keywrap');
const accessService = require('./access.service');

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

function normalizeMediaForStorage(value) {
  return parseMedia(value)
    .filter((i) => i && i.storageRef)
    .map((i) => ({
      storageRef: String(i.storageRef),
      encryptedKey: i.encryptedKey ? String(i.encryptedKey) : null,
      contentType: i.contentType || 'image/webp',
      caption: String(i.caption || '').trim(),
    }));
}

async function encryptBytesToStore(data, siteId, kind) {
  const contentKey = generateContentKey();
  const enc = encryptBytes(contentKey, data);
  const blob = packCipherBlob(enc);
  const key = `blog/${siteId}/enc/${kind}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`;
  const { storageRef } = await putBlob({ key, data: blob, contentType: 'application/octet-stream' });
  return { storageRef, contentKey: wrapContentKey(contentKey.toString('base64')) };
}

async function decryptBytesFromStore(storageRef, contentKey) {
  if (!storageRef || !contentKey) return null;
  const key = storedToKey(contentKey);
  if (!key) return null;
  const blob = await getBlob({ storageRef });
  const { iv, tag, ciphertext } = unpackCipherBlob(blob);
  return decryptBytes(key, iv, tag, ciphertext);
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
    const key = storedToKey(item.encryptedKey);
    if (!key) return { mediaItems, coverUrl: null };
    const blob = await getBlob({ storageRef: item.storageRef });
    const { iv, tag, ciphertext } = unpackCipherBlob(blob);
    data = decryptBytes(key, iv, tag, ciphertext);
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
  return String(markdown).replace(/nibgate-embed:\/\/\d+/g, '').replace(/[#*_>`\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
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
  const post = await prisma.blogPost.findFirst({
    where: { siteId, slug, status: 'published' },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  if (post && !isPaidValue(post.price) && post.bodyStorageRef && post.contentKey) {
    try {
      const decrypted = await decryptBytesFromStore(post.bodyStorageRef, post.contentKey);
      if (decrypted) post.bodyMarkdown = decrypted.toString('utf8');
    } catch {
      post.bodyMarkdown = '';
    }
  }
  return post;
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
  const mediaItems = normalizeMediaForStorage(data.media);
  let coverUrl = String(data.coverUrl || '').trim() || null;
  if (ENCRYPT_ENABLED && data.coverKey) {
    const extracted = await extractCoverFromMedia(mediaItems, data.coverKey, siteId);
    if (extracted.coverUrl) coverUrl = extracted.coverUrl;
  }

  const postData = {
    siteId, title, slug,
    excerpt,
    tags: cleanTags(data.tags),
    type: ['article', 'photo', 'music', 'video', 'document'].includes(data.type) ? data.type : 'article',
    coverUrl,
    videoUrl: null,
    videoName: String(data.videoName || '').trim() || null,
    videoSize: data.videoSize ? Number(data.videoSize) || null : null,
    videoStorageRef: String(data.videoStorageRef || '').trim() || null,
    videoEncryptedKey: String(data.videoEncryptedKey || '').trim() || null,
    videoContentType: String(data.videoContentType || '').trim() || null,
    audioUrl: null,
    audioStorageRef: String(data.audioStorageRef || '').trim() || null,
    audioEncryptedKey: String(data.audioEncryptedKey || '').trim() || null,
    audioContentType: String(data.audioContentType || '').trim() || null,
    documentUrl: null,
    documentName: String(data.documentName || '').trim() || null,
    documentSize: data.documentSize ? Number(data.documentSize) || null : null,
    documentStorageRef: String(data.documentStorageRef || '').trim() || null,
    documentEncryptedKey: String(data.documentEncryptedKey || '').trim() || null,
    documentContentType: String(data.documentContentType || '').trim() || null,
    media: mediaItems.length ? JSON.stringify(mediaItems) : null,
    price: isPaid ? String(data.price).trim() : null,
    recipientWallet: String(data.recipientWallet || '').trim() || null,
    whitelist: accessService.normalizeWhitelist(data.whitelist),
    whitelistPrice: data.whitelistPrice === undefined || data.whitelistPrice === null || data.whitelistPrice === '' ? null : String(data.whitelistPrice).trim(),
    publicAccess: data.publicAccess !== false,
    status: statusVal,
    featured: data.featured === true,
    publishedAt: statusVal === 'published' ? new Date() : null,
    authorId,
  };

  if (ENCRYPT_ENABLED) {
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

async function update(siteId, id, data, actor) {
  const existing = await prisma.blogPost.findFirst({ where: { siteId, id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');
  // Authors may only edit their own posts; admins may edit anything.
  if (actor && existing.authorId !== actor) {
    throw new ApiError(status.FORBIDDEN, 'You can only edit your own posts');
  }

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
    if (ENCRYPT_ENABLED) {
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
  }

  if (data.excerpt !== undefined) updateData.excerpt = String(data.excerpt).trim();
  if (data.tags !== undefined) updateData.tags = cleanTags(data.tags);
  if (data.coverUrl !== undefined) updateData.coverUrl = String(data.coverUrl).trim() || null;
  if (data.videoUrl !== undefined) updateData.videoUrl = String(data.videoUrl).trim() || null;
  if (data.media !== undefined) {
    const mediaItems = normalizeMediaForStorage(data.media);
    if (ENCRYPT_ENABLED && data.coverKey) {
      const extracted = await extractCoverFromMedia(mediaItems, data.coverKey, siteId);
      if (extracted.coverUrl) updateData.coverUrl = extracted.coverUrl;
    }
    updateData.media = mediaItems.length ? JSON.stringify(mediaItems) : null;
  }
  if (data.type !== undefined) updateData.type = ['article', 'photo', 'music', 'video', 'document'].includes(data.type) ? data.type : 'article';
  if (data.price !== undefined) updateData.price = willBePaid ? String(data.price).trim() : null;
  if (data.recipientWallet !== undefined) updateData.recipientWallet = String(data.recipientWallet).trim() || null;
  if (data.featured !== undefined) updateData.featured = data.featured;
  if (data.videoStorageRef !== undefined) updateData.videoStorageRef = String(data.videoStorageRef).trim() || null;
  if (data.videoEncryptedKey !== undefined) updateData.videoEncryptedKey = String(data.videoEncryptedKey).trim() || null;
  if (data.videoContentType !== undefined) updateData.videoContentType = String(data.videoContentType).trim() || null;
  updateData.videoUrl = null;
  if (data.audioStorageRef !== undefined) updateData.audioStorageRef = String(data.audioStorageRef).trim() || null;
  if (data.audioEncryptedKey !== undefined) updateData.audioEncryptedKey = String(data.audioEncryptedKey).trim() || null;
  if (data.audioContentType !== undefined) updateData.audioContentType = String(data.audioContentType).trim() || null;
  updateData.audioUrl = null;
  if (data.documentStorageRef !== undefined) updateData.documentStorageRef = String(data.documentStorageRef).trim() || null;
  if (data.documentEncryptedKey !== undefined) updateData.documentEncryptedKey = String(data.documentEncryptedKey).trim() || null;
  if (data.documentContentType !== undefined) updateData.documentContentType = String(data.documentContentType).trim() || null;
  updateData.documentUrl = null;
  if (data.documentName !== undefined) updateData.documentName = String(data.documentName).trim() || null;
  if (data.documentSize !== undefined) updateData.documentSize = data.documentSize ? Number(data.documentSize) || null : null;
  if (data.videoName !== undefined) updateData.videoName = String(data.videoName).trim() || null;
  if (data.videoSize !== undefined) updateData.videoSize = data.videoSize ? Number(data.videoSize) || null : null;
  if (data.status !== undefined) {
    updateData.status = data.status === 'draft' ? 'draft' : 'published';
    if (updateData.status === 'published' && !existing.publishedAt) updateData.publishedAt = new Date();
  }
  if (bodyProvided && data.bodyMarkdown && !data.excerpt) updateData.excerpt = excerptFrom(data.bodyMarkdown);
  if (data.whitelist !== undefined) updateData.whitelist = accessService.normalizeWhitelist(data.whitelist);
  if (data.whitelistPrice !== undefined) {
    updateData.whitelistPrice = data.whitelistPrice === null || data.whitelistPrice === '' ? null : String(data.whitelistPrice).trim();
  }
  if (data.publicAccess !== undefined) updateData.publicAccess = data.publicAccess !== false;

  // Gap #11 (ACCESS-CONTROL-DESIGN §6 row 7): invite-only content must not
  // keep serving paid wallets that are no longer listed. This fires on the flip
  // AND on later whitelist edits while already invite-only, so the same rule
  // applies whether an owner edits policy via this admin form or via the
  // access-control endpoint.
  const alreadyInviteOnly = existing.publicAccess === false;
  const flippingInviteOnly = updateData.publicAccess === false && !alreadyInviteOnly;
  const whitelistChanged = updateData.whitelist !== undefined && JSON.stringify(updateData.whitelist) !== JSON.stringify(existing.whitelist);
  const cuttingOff = (updateData.publicAccess === false && flippingInviteOnly) || (alreadyInviteOnly && whitelistChanged);
  const updated = await prisma.blogPost.update({
    where: { id },
    data: updateData,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  if (cuttingOff && updated.id) {
    const [activeEnts, receipts] = await Promise.all([
      prisma.blogPostEntitlement.findMany({ where: { postId: updated.id, status: 'active' } }),
      prisma.blogPostReceipt.findMany({ where: { postId: updated.id } }),
    ]);
    const cutoff = accessService.paidCutoffWallets({
      policy: { whitelist: updated.whitelist || [], publicAccess: false },
      entitlements: activeEnts,
      receipts: receipts.map((r) => ({ payerWallet: r.payerWallet, amount: r.amount, refundedAt: r.refundedAt })),
    });
    for (const wallet of cutoff) {
      await accessService.revokeEntitlement({ post: updated, wallet });
      await prisma.blogPostEvent.create({
        data: { siteId: updated.siteId, postId: updated.id, type: 'invite_only_flip', wallet },
      });
    }
    if (cutoff.length > 0) updated.cutOffWallets = cutoff;
  }
  return updated;
}

async function remove(siteId, id, actor) {
  const existing = await prisma.blogPost.findFirst({ where: { siteId, id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');
  // Authors may only delete their own posts; admins may delete anything.
  if (actor && existing.authorId !== actor) {
    throw new ApiError(status.FORBIDDEN, 'You can only delete your own posts');
  }
  await prisma.blogPost.delete({ where: { id } });
  if (ENCRYPT_ENABLED) {
    if (existing.bodyStorageRef) await deleteBlob({ storageRef: existing.bodyStorageRef }).catch(() => {});
    if (existing.audioStorageRef) await deleteBlob({ storageRef: existing.audioStorageRef }).catch(() => {});
    if (existing.videoStorageRef) await deleteBlob({ storageRef: existing.videoStorageRef }).catch(() => {});
    if (existing.documentStorageRef) await deleteBlob({ storageRef: existing.documentStorageRef }).catch(() => {});
    for (const item of parseMedia(existing.media)) {
      if (item && item.storageRef) await deleteBlob({ storageRef: item.storageRef }).catch(() => {});
    }
  }
  return existing;
}

async function adminPostStats(siteId) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new ApiError(status.NOT_FOUND, 'Site not found');

  const domain = `${site.subdomain}.nibgate.xyz`;
  const hub = config.nibgate.apiBase || 'http://localhost:3000';
  const res = await fetch(`${hub}/hub/ledger?domain=${encodeURIComponent(domain)}&limit=100`).catch(() => null);
  if (!res || !res.ok) return {};

  const data = await res.json().catch(() => null);
  const activities = data?.activities || [];
  const stats = {};

  const bump = (url) => {
    if (!stats[url]) stats[url] = { url, title: '', views: 0, unlocks: 0, payments: 0, ratings: 0, revenue: 0, receipts: [] };
    return stats[url];
  };

  for (const a of activities) {
    const url = a.contentUrl || '';
    if (!url) continue;
    const entry = bump(url);
    if (!entry.title && a.contentTitle) entry.title = a.contentTitle;
    if (a.type === 'view') {
      entry.views += 1;
    } else if (a.type === 'payment') {
      entry.unlocks += 1;
      entry.payments += 1;
      const amount = Number(a.amount || 0);
      entry.revenue += amount;
      entry.receipts.push({ id: a.id, payerWallet: a.payerWallet || a.actor || null, amount, currency: a.currency || 'USDC', timestamp: a.timestamp, txHash: a.txHash || null, provider: a.paymentProvider || 'payment' });
    } else if (a.type === 'rating') {
      entry.ratings += 1;
    }
  }

  for (const url of Object.keys(stats)) {
    stats[url].receipts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  return stats;
}

async function adminActivity(siteId) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new ApiError(status.NOT_FOUND, 'Site not found');

  const domain = `${site.subdomain}.nibgate.xyz`;
  const hub = config.nibgate.apiBase || 'http://localhost:3000';
  const res = await fetch(`${hub}/hub/ledger?domain=${encodeURIComponent(domain)}&limit=50`).catch(() => null);
  if (!res || !res.ok) return { activities: [], totals: { views: 0, unlocks: 0, payments: 0, ratings: 0 } };
  const data = await res.json().catch(() => null);
  return {
    activities: data?.activities || [],
    totals: data?.totals || { views: 0, unlocks: 0, payments: 0, ratings: 0 },
  };
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

module.exports = { listPublished, getBySlug, listAll, getById, create, update, remove, listByTypes, adminPostStats, adminActivity };
