import crypto from 'node:crypto';
import { db } from '@nibgate/internal/db.js';
import { contentHashFor, deleteBlob, encryptBytes, generateContentKey, packCipherBlob, putBlob, wrapKey } from '@nibgate/sdk/server';
import { FREE_TIER_MAX_BYTES, MAX_EXPIRY_HOURS, parsePrice, shareKeySecret, sharePublicUrl, uniqueSlug } from './utils.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function createShare({ title, summary, coverUrl, content, price, expiresAt, whitelist, storageProvider, contentType, status, ownerWallet }) {
  const shareStatus = status === 'draft' ? 'draft' : 'active';

  if (!title || typeof title !== 'string') {
    throw new HttpError(400, 'title is required');
  }
  const plaintext = typeof content === 'string' ? content : content ? JSON.stringify(content) : '';
  if (!plaintext) {
    throw new HttpError(400, 'content is required');
  }
  if (storageProvider !== 'nibgate') {
    throw new HttpError(400, 'only the nibgate storage provider is supported yet');
  }

  const plaintextBytes = Buffer.byteLength(plaintext, 'utf8');
  if (plaintextBytes > FREE_TIER_MAX_BYTES) {
    throw new HttpError(400, `Content exceeds the ${FREE_TIER_MAX_BYTES} byte limit for Nibgate free tier. Use Arweave for larger content.`);
  }

  if (expiresAt) {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffHours = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours < 0) throw new HttpError(400, 'expiresAt must be in the future.');
    if (diffHours > MAX_EXPIRY_HOURS) throw new HttpError(400, `expiresAt cannot exceed ${MAX_EXPIRY_HOURS} hours (1 week) from now.`);
  }

  if (!ownerWallet) {
    throw new HttpError(400, 'Sign-in wallet could not be determined.');
  }

  const contentKey = generateContentKey();
  const enc = encryptBytes(contentKey, Buffer.from(plaintext, 'utf8'));
  const blob = packCipherBlob(enc);
  const id = crypto.randomUUID();
  const slug = await uniqueSlug();
  const r2Key = `nibshare/${id}/body.bin`;
  const { storageRef, url } = await putBlob({ key: r2Key, data: blob });
  const contentHash = contentHashFor(ownerWallet, storageRef, plaintext);

  try {
    return await db.nibShare.create({
      data: {
        id,
        ownerWallet,
        title,
        summary: summary || null,
        coverUrl: coverUrl || null,
        contentType,
        bodyLength: plaintextBytes,
        price: parsePrice(price),
        currency: 'USDC',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        whitelist: Array.isArray(whitelist) ? whitelist.map((w) => String(w).toLowerCase()) : [],
        storageProvider,
        storageRef,
        ciphertextUrl: url,
        contentHash,
        keyProvider: 'server',
        encryptedKey: wrapKey(shareKeySecret(), contentKey),
        decryptMode: 'server',
        status: shareStatus,
        slug
      }
    });
  } catch (error) {
    await deleteBlob({ storageRef: r2Key }).catch(() => {});
    throw error;
  }
}

export function findShareBySlug(slug) {
  return db.nibShare.findUnique({ where: { slug } });
}

export async function recordView(share, viewer) {
  await db.nibShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } });
  await db.nibShareEvent.create({
    data: { shareId: share.id, type: 'view', wallet: viewer || null }
  });
}

export async function grantUnlock({ share, payer, txHash }) {
  const receipt = await db.nibShareReceipt.create({
    data: {
      shareId: share.id,
      payerWallet: payer,
      amount: share.price,
      currency: share.currency,
      txHash
    }
  });
  await db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet: payer } },
    create: { shareId: share.id, wallet: payer, status: 'active' },
    update: { status: 'active', revokedAt: null }
  });
  await db.nibShare.update({ where: { id: share.id }, data: { unlockCount: { increment: 1 } } });
  await db.nibShareReceipt.update({ where: { id: receipt.id }, data: { keyGrantedAt: new Date() } });
  return receipt;
}

export function resourceFor(share) {
  return {
    id: share.slug,
    title: share.title,
    type: share.contentType,
    price: String(share.price),
    currency: share.currency,
    path: `/ns/${share.slug}`,
  };
}

export function isWhitelisted(share, wallet) {
  return share.whitelist.length === 0 || share.whitelist.includes(wallet);
}

export function findEntitlement({ shareId, wallet }) {
  return db.nibShareEntitlement.findUnique({ where: { shareId_wallet: { shareId, wallet } } });
}

export function findLastReceipt({ shareId, wallet }) {
  return db.nibShareReceipt.findFirst({
    where: { shareId, payerWallet: wallet },
    orderBy: { unlockedAt: 'desc' }
  });
}

export async function gatewayBalance(address) {
  const apiKey = process.env.CIRCLE_API_KEY || '';
  if (!apiKey) return '';
  const r = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources: [{ depositor: address, domain: 26 }] }),
  });
  const data = await r.json();
  const bal = data?.balances?.[0]?.balance || '';
  return bal ? Number(bal).toFixed(2) + ' USDC' : '';
}

export async function revokeEntitlement({ share, wallet }) {
  await db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    create: { shareId: share.id, wallet, status: 'revoked', revokedAt: new Date() },
    update: { status: 'revoked', revokedAt: new Date() }
  });
  await db.nibShareEvent.create({ data: { shareId: share.id, type: 'revoke', wallet } });
}

export async function revokeShare(share) {
  await db.nibShare.update({ where: { id: share.id }, data: { status: 'revoked' } });
  await db.nibShareEvent.create({ data: { shareId: share.id, type: 'revoke' } });
  await deleteBlob({ storageRef: share.storageRef }).catch(() => {});
}

export async function rotateShare(share) {
  const newSlug = await uniqueSlug();
  await db.nibShare.update({ where: { id: share.id }, data: { slug: newSlug, updatedAt: new Date() } });
  return { slug: newSlug, url: sharePublicUrl({ ...share, slug: newSlug }) };
}

export async function listMine(ownerWallet) {
  const shares = await db.nibShare.findMany({
    where: { ownerWallet },
    orderBy: { createdAt: 'desc' },
    include: {
      receipts: { orderBy: { unlockedAt: 'desc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 100 }
    }
  });

  const activity = activityFor(shares).slice(0, 50);

  return {
    shares: shares.map((s) => ({
      id: s.id,
      slug: s.slug,
      url: sharePublicUrl(s),
      title: s.title,
      summary: s.summary,
      coverUrl: s.coverUrl,
      contentType: s.contentType,
      price: String(s.price),
      expiresAt: s.expiresAt,
      status: s.status,
      unlockCount: s.unlockCount,
      viewCount: s.viewCount,
      storageProvider: s.storageProvider,
      createdAt: s.createdAt,
      receipts: s.receipts
    })),
    activity
  };
}

function activityFor(shares) {
  const now = Date.now();
  const activity = [];
  for (const s of shares) {
    for (const r of s.receipts) {
      activity.push({
        key: `unlock-${r.id}`,
        type: 'unlock',
        title: s.title,
        slug: s.slug,
        amount: r.amount,
        wallet: r.payerWallet,
        createdAt: r.unlockedAt
      });
    }
    for (const e of s.events) {
      activity.push({
        key: `${e.type}-${e.id}`,
        type: e.type,
        title: s.title,
        slug: s.slug,
        wallet: e.wallet,
        createdAt: e.createdAt
      });
    }
    if (s.status !== 'draft' && s.status !== 'revoked' && s.expiresAt) {
      const exp = new Date(s.expiresAt).getTime();
      if (exp < now) {
        activity.push({ key: `expired-${s.id}`, type: 'expired', title: s.title, slug: s.slug, createdAt: s.expiresAt });
      } else if (exp - now <= 24 * 3600e3) {
        activity.push({ key: `expiring-${s.id}`, type: 'expiring', title: s.title, slug: s.slug, createdAt: s.expiresAt });
      }
    }
  }
  return activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function parseRange(query = {}) {
  const gte = new Date(String(query.from || ''));
  const lte = new Date(String(query.to || ''));
  const range = {};
  if (!Number.isNaN(gte.getTime())) range.gte = gte;
  if (!Number.isNaN(lte.getTime())) range.lte = lte;
  if (!range.gte && !range.lte) range.gte = new Date(Date.now() - 30 * 24 * 3600e3);
  return range;
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function truncateWallet(wallet) {
  if (!wallet) return null;
  const w = String(wallet);
  return w.length <= 12 ? w : `${w.slice(0, 6)}...${w.slice(-4)}`;
}

export async function dashboardStats({ ownerWallet, query = {} }) {
  const range = parseRange(query);

  const shares = await db.nibShare.findMany({
    where: { ownerWallet },
    orderBy: { createdAt: 'desc' },
    include: {
      receipts: { where: { unlockedAt: range }, orderBy: { unlockedAt: 'desc' } },
      events: { where: { createdAt: range }, orderBy: { createdAt: 'desc' }, take: 500 }
    }
  });

  const seriesMap = new Map();
  const rangeStats = { views: 0, unlocks: 0, revenue: 0 };
  const record = (date, kind, revenue = 0) => {
    let bucket = seriesMap.get(date);
    if (!bucket) {
      bucket = { date, views: 0, unlocks: 0, revenue: 0 };
      seriesMap.set(date, bucket);
    }
    if (kind === 'view') bucket.views += 1;
    if (kind === 'unlock') {
      bucket.unlocks += 1;
      bucket.revenue += revenue;
    }
  };

  for (const s of shares) {
    for (const e of s.events) {
      if (e.type !== 'view') continue;
      rangeStats.views += 1;
      record(dayKey(e.createdAt), 'view');
    }
    for (const r of s.receipts) {
      rangeStats.unlocks += 1;
      rangeStats.revenue += r.amount || 0;
      record(dayKey(r.unlockedAt), 'unlock', r.amount || 0);
    }
  }

  const now = Date.now();
  const list = shares.map((s) => {
    const exp = s.expiresAt ? new Date(s.expiresAt).getTime() : null;
    const status = s.status === 'revoked' ? 'revoked' : exp && exp < now ? 'expired' : s.status;
    return {
      slug: s.slug,
      url: sharePublicUrl(s),
      title: s.title,
      contentType: s.contentType,
      price: String(s.price),
      currency: s.currency,
      status,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      views: s.viewCount,
      unlocks: s.unlockCount,
      revenue: (s.unlockCount || 0) * (s.price || 0)
    };
  });

  const summary = list.reduce((acc, s) => {
    acc.shares += 1;
    if (s.status === 'active') acc.activeShares += 1;
    acc.views += s.views;
    acc.unlocks += s.unlocks;
    acc.revenue += s.revenue;
    return acc;
  }, { shares: 0, activeShares: 0, views: 0, unlocks: 0, revenue: 0 });

  return {
    summary,
    range: rangeStats,
    timeSeries: [...seriesMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    shares: list,
    recentActivity: activityFor(shares).slice(0, 50)
  };
}

export async function platformStats() {
  const dayAgo = new Date(Date.now() - 24 * 3600e3);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600e3);
  const activeWhere = { status: 'active', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };

  const [
    shareCount, activeCount, viewAgg, unlockAgg, revenueAgg,
    views24, views7, unlocks24, unlocks7, rev24Agg, rev7Agg, recentEvents
  ] = await Promise.all([
    db.nibShare.count(),
    db.nibShare.count({ where: activeWhere }),
    db.nibShare.aggregate({ _sum: { viewCount: true } }),
    db.nibShare.aggregate({ _sum: { unlockCount: true } }),
    db.nibShareReceipt.aggregate({ _sum: { amount: true } }),
    db.nibShareEvent.count({ where: { type: 'view', createdAt: { gte: dayAgo } } }),
    db.nibShareEvent.count({ where: { type: 'view', createdAt: { gte: weekAgo } } }),
    db.nibShareReceipt.count({ where: { unlockedAt: { gte: dayAgo } } }),
    db.nibShareReceipt.count({ where: { unlockedAt: { gte: weekAgo } } }),
    db.nibShareReceipt.aggregate({ where: { unlockedAt: { gte: dayAgo } }, _sum: { amount: true } }),
    db.nibShareReceipt.aggregate({ where: { unlockedAt: { gte: weekAgo } }, _sum: { amount: true } }),
    db.nibShareEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 25 })
  ]);

  const eventIds = [...new Set(recentEvents.map((e) => e.shareId))];
  const eventShares = eventIds.length
    ? await db.nibShare.findMany({ where: { id: { in: eventIds } }, select: { id: true, contentType: true } })
    : [];
  const byId = new Map(eventShares.map((s) => [s.id, s]));

  return {
    totals: {
      sharesCreated: shareCount,
      activeShares: activeCount,
      views: viewAgg._sum.viewCount || 0,
      unlocks: unlockAgg._sum.unlockCount || 0,
      revenue: revenueAgg._sum.amount || 0
    },
    windows: {
      '24h': { views: views24, unlocks: unlocks24, revenue: rev24Agg._sum.amount || 0 },
      '7d': { views: views7, unlocks: unlocks7, revenue: rev7Agg._sum.amount || 0 }
    },
    recent: recentEvents.map((e) => ({
      type: e.type,
      wallet: truncateWallet(e.wallet),
      contentType: byId.get(e.shareId)?.contentType || null,
      createdAt: e.createdAt
    }))
  };
}
