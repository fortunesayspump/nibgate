import crypto from 'node:crypto';
import { db } from '@nibgate/internal/db.js';
export { gatewayBalance } from '@nibgate/internal/payments.js';
import { contentHashFor, deleteBlob, encryptBytes, generateContentKey, packCipherBlob, putBlob, wrapKey } from '@nibgate/sdk/server';
import { isWhitelisted as sdkIsWhitelisted, inWhitelist as sdkInWhitelist, effectivePrice as sdkEffectivePrice, accessDecision as sdkAccessDecision, normalizeWhitelist, paidCutoffWallets } from '@nibgate/sdk/server';
import { FREE_TIER_MAX_BYTES, MAX_EXPIRY_HOURS, parsePrice, shareKeySecret, sharePublicUrl, uniqueSlug } from './utils.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function createShare({ title, summary, coverUrl, content, price, expiresAt, whitelist, whitelistPrice, publicAccess, storageProvider, contentType, status, ownerWallet }) {
  const shareStatus = status === 'draft' ? 'draft' : 'active';

  if (!title || typeof title !== 'string') {
    throw new HttpError(400, 'title is required');
  }
  if (title.length > 150) {
    throw new HttpError(400, 'title cannot exceed 150 characters');
  }
  const VALID_CONTENT_TYPES = ['article', 'text', 'photo', 'video', 'music', 'document'];
  if (contentType && !VALID_CONTENT_TYPES.includes(contentType)) {
    throw new HttpError(400, `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}`);
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

  // Whitelist is normalized through the SDK rule (lowercase dedupe). Sloppy
  // input is rejected rather than silently rewritten, so owners can't
  // accidentally lock everyone out with a typo'd address.
  if (whitelist !== undefined && !Array.isArray(whitelist)) {
    throw new HttpError(400, 'whitelist must be an array of wallet addresses');
  }
  const cleanWhitelist = normalizeWhitelist(whitelist);
  if (Array.isArray(whitelist) && cleanWhitelist.length !== whitelist.length) {
    throw new HttpError(400, 'whitelist contains an invalid wallet address');
  }
  if (whitelistPrice !== undefined && whitelistPrice !== null && whitelistPrice !== '') {
    const wp = parsePrice(whitelistPrice);
    if (String(whitelistPrice).trim() !== '' && Number(whitelistPrice) !== wp) {
      throw new HttpError(400, 'whitelistPrice must be a non-negative number or null');
    }
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
        whitelist: normalizeWhitelist(whitelist),
        whitelistPrice: whitelistPrice == null || whitelistPrice === '' ? null : parsePrice(whitelistPrice),
        publicAccess: publicAccess !== false,
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

// Grants exactly-one access per payment (ACCESS-CONTROL-DESIGN §5). The caller
// supplies the x402 settlement (txHash) which is the ONLY stable id x402 offers
// (it has no paymentId). `atomicIdempotentGrant` does a find-or-create on
// (paymentNonce, shareId); a replayed proof/txHash hits the SAME receipt and is
// returned without a second grant, unlockCount bump, or view event.
async function atomicIdempotentGrant({ share, payer, txHash, amount }) {
  const paymentNonce = txHash || null;
  if (paymentNonce) {
    const existing = await db.nibShareReceipt.findUnique({
      where: { paymentNonce_shareId: { paymentNonce, shareId: share.id } }
    });
    if (existing) return { receipt: existing, replay: true };
  }

  const paid = amount == null ? share.price : amount;
  let receipt;
  try {
    receipt = await db.nibShareReceipt.create({
      data: {
        shareId: share.id,
        payerWallet: payer,
        paymentNonce: paymentNonce || `free-${crypto.randomUUID()}`,
        amount: paid,
        currency: share.currency,
        txHash
      }
    });
  } catch (error) {
    // Two rapid retries can race through the findUnique above; the UNIQUE
    // (paymentNonce, shareId) constraint is the real arbiter. Re-read and
    // return the stored receipt instead of double-granting.
    if (error?.code === 'P2002' && paymentNonce) {
      const raced = await db.nibShareReceipt.findUnique({
        where: { paymentNonce_shareId: { paymentNonce, shareId: share.id } }
      });
      if (raced) return { receipt: raced, replay: true };
    }
    throw error;
  }

  // A payment-only reach is either a real paid unlock or the whitelist free tier
  // (amount 0). Free-tier grant => source 'free' (re-granted per visit); anything
  // with a real amount => 'paid' (lifetime, the receipt backs it forever).
  const source = Number(paid) > 0 ? 'paid' : 'free';
  await db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet: payer } },
    create: { shareId: share.id, wallet: payer, status: 'active', source },
    update: { status: 'active', revokedAt: null, source: sourceMax(source, 'paid') }
  });
  await db.nibShare.update({ where: { id: share.id }, data: { unlockCount: { increment: 1 } } });
  await db.nibShareReceipt.update({ where: { id: receipt.id }, data: { keyGrantedAt: new Date() } });
  // Attribute the content view to the payer wallet server-side, so owners can
  // always see who unlocked/accessed their work even when the page view was
  // anonymous (wallet not connected at page-load time).
  await db.nibShareEvent.create({ data: { shareId: share.id, type: 'view', wallet: payer } });
  return { receipt, replay: false };
}

// 'paid' outranks 'free' on a collision: a wallet that was handed a free grant
// and later pays must never be downgraded to a re-grant-per-visit 'free' source.
function sourceMax(a, b) {
  return a === 'paid' || b === 'paid' ? 'paid' : 'free';
}

export async function grantUnlock({ share, payer, txHash, amount }) {
  const ent = await findEntitlement({ shareId: share.id, wallet: payer });
  if (ent && ent.status === 'banned') {
    throw new HttpError(403, 'This wallet is banned from this share.');
  }
  return atomicIdempotentGrant({ share, payer, txHash, amount });
}

export function resourceFor(share) {
  return {
    id: share.slug,
    title: share.title,
    type: share.contentType,
    price: String(share.price),
    whitelistPrice: share.whitelistPrice == null ? null : String(share.whitelistPrice),
    publicAccess: share.publicAccess,
    currency: share.currency,
    path: `/ns/${share.slug}`,
  };
}

export async function shareManifest(slug) {
  const share = await findShareBySlug(slug);
  if (!share) return null;
  const apiBase = (process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL || 'https://api.nibgate.xyz').replace(/\/+$/, '');
  return {
    schema: 'https://docs.nibgate.xyz/nibshare-manifest',
    version: 1,
    kind: 'nibshare',
    slug: share.slug,
    title: share.title,
    summary: share.summary,
    contentType: share.contentType,
    price: String(share.price),
    whitelistPrice: share.whitelistPrice == null ? null : String(share.whitelistPrice),
    publicAccess: share.publicAccess,
    currency: share.currency,
    expiresAt: share.expiresAt,
    status: share.status,
    createdAt: share.createdAt,
    viewCount: share.viewCount,
    unlockCount: share.unlockCount,
    urls: {
      page: sharePublicUrl(share),
      access: `${apiBase}/ns/${share.slug}`,
      meta: `${apiBase}/nibshare/${share.slug}/meta`,
      manifest: `${apiBase}/nibshare/${share.slug}/manifest`,
      unlock: `${apiBase}/nibshare/${share.slug}/unlock`,
      media: `${apiBase}/nibshare/${share.slug}/media/{kind}?index=N`
    },
    payment: {
      scheme: 'x402',
      description: 'GET urls.access. Free shares return the body directly; paid shares respond 402 with a PAYMENT-REQUIRED x402 envelope. Sign the challenge and resubmit to receive content + unlockProof.',
    },
  };
}

export function isWhitelisted(share, wallet) {
  return sdkIsWhitelisted(share, wallet);
}

// Strict membership: wallet is listed AND the list is non-empty (legacy
// "empty list = open to everyone" semantics). Used for tier pricing and
// invite-only enforcement, where an empty list must not grant everyone a
// whitelist tier.
export function inWhitelist(share, wallet) {
  return sdkInWhitelist(share, wallet);
}

// The price THIS wallet must pay right now.
//   whitelist member + whitelistPrice set  -> whitelistPrice
//   everything else                         -> share.price (public tier)
export function effectivePrice(share, wallet) {
  return sdkEffectivePrice(share, wallet);
}

// Non-payment gate check (who is allowed to even try). Payment/entitlement
// state is layered on top by the controller.
//   publicAccess=false -> invite-only: only listed wallets may try.
//   publicAccess=true  -> everyone may try; whitelist members simply get the
//                         whitelistPrice tier (legacy "whitelist = invite-only"
//                         shares are migrated with publicAccess=false).
export function accessDecision(share, wallet) {
  const decision = sdkAccessDecision(share, wallet);
  return { ok: decision.ok, reason: decision.reason || null, message: decision.message || null };
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

// Free-tier grant (whitelistPrice=0 member): activates the entitlement so
// media + proof-replay work, WITHOUT a receipt, unlockCount bump, or view event.
// Paid unlocks are the revenue signal; free members don't distort it. `source`
// stays 'free' unless the wallet has already paid (never downgrade a paid grant).
export async function grantEntitlement({ share, wallet }) {
  const ent = await findEntitlement({ shareId: share.id, wallet });
  if (ent && ent.status === 'banned') {
    throw new HttpError(403, 'This wallet is banned from this share.');
  }
  const source = ent && ent.source === 'paid' ? 'paid' : 'free';
  return db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    create: { shareId: share.id, wallet, status: 'active', source: 'free' },
    update: { status: 'active', revokedAt: null, source }
  });
}

// Revoke/ban do NOT touch money: x402 payments are one-shot irreversible
// transfers to the creator's wallet, so there is no refund primitive. These
// actions only flip the entitlement so the wallet loses/keeps future access.
export async function revokeEntitlement({ share, wallet }) {
  await db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    create: { shareId: share.id, wallet, status: 'revoked', revokedAt: new Date(), source: 'paid' },
    update: { status: 'revoked', revokedAt: new Date() }
  });
  await db.nibShareEvent.create({ data: { shareId: share.id, type: 'revoke', wallet } });
}

export async function banEntitlement({ share, wallet }) {
  await db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    create: { shareId: share.id, wallet, status: 'banned', revokedAt: new Date(), source: 'paid' },
    update: { status: 'banned', revokedAt: new Date() }
  });
  await db.nibShareEvent.create({ data: { shareId: share.id, type: 'ban', wallet } });
}

// Restore just reactivates the wallet under its original source. No refund
// bookkeeping exists to reverse — money stays where it landed.
export async function restoreEntitlement({ share, wallet }) {
  const ent = await findEntitlement({ shareId: share.id, wallet });
  const source = ent && ent.source === 'paid' ? 'paid' : 'free';
  await db.nibShareEntitlement.upsert({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    create: { shareId: share.id, wallet, status: 'active', source },
    update: { status: 'active', revokedAt: null }
  });
}

// Approves ONLY via server-side default for `canAccess` facts. `serveAccess`/
// `mediaAccessResult` in the controller wrap the full §4 rule: ban/revoke/invite
// gates, paid-lifetime entitlement, whitelist free tier, legacy free grant,
// proof fast path, then the 402 challenge.

export async function updateAccessPolicy(share, patch) {
  const data = {};
  if (patch.whitelist !== undefined) {
    if (!Array.isArray(patch.whitelist)) {
      throw new HttpError(400, 'whitelist must be an array of wallet addresses');
    }
    const cleaned = normalizeWhitelist(patch.whitelist);
    if (cleaned.length !== patch.whitelist.length) {
      throw new HttpError(400, 'whitelist contains an invalid wallet address');
    }
    data.whitelist = cleaned;
  }
  if (patch.whitelistPrice === undefined) {
    // omitted — leave unchanged
  } else if (patch.whitelistPrice === null || patch.whitelistPrice === '') {
    data.whitelistPrice = null;
  } else {
    const n = Number(patch.whitelistPrice);
    if (!Number.isFinite(n) || n < 0) {
      throw new HttpError(400, 'whitelistPrice must be a non-negative number or null');
    }
    data.whitelistPrice = n;
  }
  if (typeof patch.publicAccess === 'boolean') data.publicAccess = patch.publicAccess;

  const alreadyInviteOnly = share.publicAccess === false;
  const flippingInviteOnly = data.publicAccess === false && !alreadyInviteOnly;
  const whitelistChanged = data.whitelist !== undefined && JSON.stringify(data.whitelist) !== JSON.stringify(share.whitelist);
  const nextWhitelist = data.whitelist ?? share.whitelist;

  await db.nibShare.update({ where: { id: share.id }, data });

  // Gap #11 (ACCESS-CONTROL-DESIGN §6 row 7 / §10.1): invite-only content must
  // not keep serving paid wallets that are no longer listed. This fires on the
  // flip AND on later whitelist edits while already invite-only (removing a
  // wallet from an invite-only share cuts that payer off). Wallets still listed
  // are untouched; already-revoked wallets are not re-processed.
  const cuttingOff = (data.publicAccess === false && flippingInviteOnly) || (alreadyInviteOnly && whitelistChanged);
  const cutOffWallets = [];
  if (cuttingOff) {
    const [activeEnts, receipts] = await Promise.all([
      db.nibShareEntitlement.findMany({ where: { shareId: share.id, status: 'active' } }),
      db.nibShareReceipt.findMany({ where: { shareId: share.id } })
    ]);
    const cutOff = paidCutoffWallets({
      policy: { whitelist: nextWhitelist, publicAccess: false },
      entitlements: activeEnts,
      receipts
    });

    for (const wallet of cutOff) {
      await revokeEntitlement({ share, wallet });
      await db.nibShareEvent.create({ data: { shareId: share.id, type: 'invite_only_flip', wallet } });
      cutOffWallets.push(wallet);
    }
  }

  return {
    whitelist: data.whitelist ?? share.whitelist,
    whitelistPrice: data.whitelistPrice !== undefined ? data.whitelistPrice : share.whitelistPrice,
    publicAccess: data.publicAccess !== undefined ? data.publicAccess : share.publicAccess,
    cutOffWallets
  };
}

export async function listEntitlements(shareId) {
  const rows = await db.nibShareEntitlement.findMany({ where: { shareId }, orderBy: { grantedAt: 'desc' } });
  return rows.map((e) => ({ wallet: e.wallet, status: e.status, grantedAt: e.grantedAt, revokedAt: e.revokedAt }));
}

export async function listViewers(shareId) {
  const events = await db.nibShareEvent.findMany({
    where: { shareId, type: 'view', wallet: { not: null } },
    orderBy: { createdAt: 'desc' }
  });
  const seen = new Map();
  for (const e of events) {
    const w = e.wallet;
    const rec = seen.get(w);
    if (rec) {
      rec.count += 1;
    } else {
      seen.set(w, { wallet: w, count: 1, lastSeenAt: e.createdAt });
    }
  }
  return [...seen.values()];
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
      whitelistPrice: s.whitelistPrice == null ? null : String(s.whitelistPrice),
      publicAccess: s.publicAccess,
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
