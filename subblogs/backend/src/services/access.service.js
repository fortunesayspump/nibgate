const { status } = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('../lib/prisma');
const sdk = require('@nibgate/sdk/server');

const ADDR_RE = /^0x[a-f0-9]{40}$/i;

function normalizeWhitelist(value) {
  return sdk.normalizeWhitelist(value);
}

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n);
}

// Legacy "open list" semantic: empty whitelist means everyone is (implicitly) allowed.
function isWhitelisted(post, wallet) {
  return sdk.isWhitelisted(post, wallet);
}

// Strict membership: wallet is listed AND the list is non-empty. Used for tier
// pricing and invite-only enforcement, where an empty list must not grant
// everyone a whitelist tier.
function inWhitelist(post, wallet) {
  return sdk.inWhitelist(post, wallet);
}

// The price THIS wallet must pay right now.
//   whitelist member + whitelistPrice set  -> whitelistPrice
//   everything else                         -> post.price (public tier)
function effectivePrice(post, wallet) {
  return String(sdk.effectivePrice(post, wallet));
}

function isPaidValue(price) {
  return sdk.isPaidValue(price);
}

function paidCutoffWallets(args) {
  return sdk.paidCutoffWallets(args);
}

// Non-payment gate check (who is allowed to even try). Payment/entitlement
// state is layered on top by the route.
//   publicAccess=false -> invite-only: only listed wallets may try.
//   publicAccess=true  -> everyone may try; whitelist members simply get the
//                         whitelistPrice tier.
function accessDecision(post, wallet) {
  const decision = sdk.accessDecision(post, wallet);
  return { ok: decision.ok, reason: decision.reason || null, message: decision.message || null };
}

async function findPostBySlugOrId(siteId, slugOrId) {
  const post = await prisma.blogPost.findFirst({
    where: { siteId, OR: [{ slug: slugOrId }, { id: slugOrId }] },
    include: { author: { select: { id: true, name: true } } },
  });
  return post;
}

function walletFor(req) {
  const w = String(req.query?.wallet || req.body?.walletAddress || '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(w) ? w : null;
}

// Resolve the wallet that actually signed in (SIWE `sb_auth_session` cookie),
// if any. This is the ONLY wallet a request may claim to be when that claim
// would unlock content or mint a discounted challenge.
function sessionWalletFor(req) {
  const token = req.cookies?.sb_auth_session;
  if (!token) return null;
  const { getUserBySessionToken } = require('../services/siwe.service');
  const user = getUserBySessionToken(token);
  if (!user) return null;
  const address = user.wallets?.[0]?.address || user.walletAddress || null;
  return address && /^0x[0-9a-f]{40}$/i.test(address) ? address.toLowerCase() : null;
}

// A bare ?wallet= / walletAddress claim must be corroborated by the SIWE
// session wallet before it can grant anything. null => anonymous (safe to
// charge PUBLIC price, unsafe to grant tiers / invite-only content).
async function possessedWalletFor(req, claimed) {
  if (!claimed) return null;
  const sessionWallet = await sessionWalletFor(req);
  return sessionWallet && sessionWallet === claimed.toLowerCase() ? sessionWallet : null;
}

async function findEntitlement({ postId, wallet }) {
  return prisma.blogPostEntitlement.findUnique({
    where: { postId_wallet: { postId, wallet } },
  });
}

async function findLastReceipt({ postId, wallet }) {
  return prisma.blogPostReceipt.findFirst({
    where: { postId, payerWallet: wallet },
    orderBy: { unlockedAt: 'desc' },
  });
}

// Free-tier grant (whitelistPrice=0 member): activates the entitlement so
// proof-replay + media work, WITHOUT a receipt, unlockCount bump, or view event.
async function grantEntitlement({ post, wallet }) {
  const ent = await findEntitlement({ postId: post.id, wallet });
  if (ent && ent.status === 'banned') {
    throw new ApiError(status.FORBIDDEN, 'This wallet is banned from this post.');
  }
  const source = ent && ent.source === 'paid' ? 'paid' : 'free';
  return prisma.blogPostEntitlement.upsert({
    where: { postId_wallet: { postId: post.id, wallet } },
    create: { siteId: post.siteId, postId: post.id, wallet, status: 'active', source: 'free' },
    update: { status: 'active', revokedAt: null, source },
  });
}

// Exactly-one grant per payment (ACCESS-CONTROL-DESIGN §5). x402 has no
// paymentId; txHash is the only stable id. A replayed txHash hits the SAME
// receipt and is returned without a second grant / unlock event.
async function grantUnlock({ post, payer, txHash, amount }) {
  const paymentNonce = txHash || null;
  if (paymentNonce) {
    const existing = await prisma.blogPostReceipt.findUnique({
      where: { paymentNonce_postId: { paymentNonce, postId: post.id } },
    });
    if (existing) return { receipt: existing, replay: true };
  }
  const source = Number(amount || post.price || 0) > 0 ? 'paid' : 'free';
  let receipt;
  try {
    receipt = await prisma.blogPostReceipt.create({
      data: {
        siteId: post.siteId,
        postId: post.id,
        payerWallet: payer,
        txHash: txHash || null,
        paymentNonce: paymentNonce || `free-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        amount: String(amount || '0'),
      },
    });
  } catch (error) {
    // Two rapid retries can race through the findUnique above; the UNIQUE
    // (paymentNonce, postId) constraint is the real arbiter. Re-read and return
    // the stored receipt instead of double-granting.
    if (error?.code === 'P2002' && paymentNonce) {
      const raced = await prisma.blogPostReceipt.findUnique({
        where: { paymentNonce_postId: { paymentNonce, postId: post.id } },
      });
      if (raced) return { receipt: raced, replay: true };
    }
    throw error;
  }
  const existing = await findEntitlement({ postId: post.id, wallet: payer });
  const entSource = existing && existing.source === 'paid' ? 'paid' : source;
  await prisma.blogPostEntitlement.upsert({
    where: { postId_wallet: { postId: post.id, wallet: payer } },
    create: { siteId: post.siteId, postId: post.id, wallet: payer, status: 'active', source: entSource },
    update: { status: 'active', revokedAt: null, source: sourceMax(existing?.source, entSource) },
  });
  if (!paymentNonce || !existing) {
    await prisma.blogPostEvent.create({
      data: { siteId: post.siteId, postId: post.id, type: 'unlock', wallet: payer },
    });
  }
  return receipt;
}

function sourceMax(a, b) {
  return a === 'paid' || b === 'paid' ? 'paid' : 'free';
}

// Revoke/ban do NOT touch money: x402 payments are one-shot irreversible
// transfers to the creator's wallet, so there is no refund primitive. These
// actions only flip the entitlement so the wallet loses/keeps future access.
async function revokeEntitlement({ post, wallet }) {
  await prisma.blogPostEntitlement.upsert({
    where: { postId_wallet: { postId: post.id, wallet } },
    create: { siteId: post.siteId, postId: post.id, wallet, status: 'revoked', revokedAt: new Date(), source: 'paid' },
    update: { status: 'revoked', revokedAt: new Date() },
  });
  await prisma.blogPostEvent.create({
    data: { siteId: post.siteId, postId: post.id, type: 'revoke', wallet },
  });
}

async function banEntitlement({ post, wallet }) {
  await prisma.blogPostEntitlement.upsert({
    where: { postId_wallet: { postId: post.id, wallet } },
    create: { siteId: post.siteId, postId: post.id, wallet, status: 'banned', revokedAt: new Date(), source: 'paid' },
    update: { status: 'banned', revokedAt: new Date() },
  });
  await prisma.blogPostEvent.create({
    data: { siteId: post.siteId, postId: post.id, type: 'ban', wallet },
  });
}

// Restore just reactivates the wallet under its original terms. No refund
// bookkeeping exists to reverse — money stays where it landed.
async function restoreEntitlement({ post, wallet }) {
  const existing = await prisma.blogPostEntitlement.findUnique({
    where: { postId_wallet: { postId: post.id, wallet } },
  });
  if (!existing) return null;
  return prisma.blogPostEntitlement.update({
    where: { postId_wallet: { postId: post.id, wallet } },
    data: { status: 'active', revokedAt: null },
  });
}

async function listEntitlements(postId) {
  const rows = await prisma.blogPostEntitlement.findMany({
    where: { postId },
    orderBy: { grantedAt: 'desc' },
  });
  return rows.map((e) => ({ wallet: e.wallet, status: e.status, grantedAt: e.grantedAt, revokedAt: e.revokedAt }));
}

async function listViewers(postId) {
  const rows = await prisma.blogPostEvent.findMany({ where: { postId, type: 'unlock' } });
  const by = new Map();
  for (const r of rows) {
    if (!r.wallet) continue;
    const entry = by.get(r.wallet) || { count: 0, lastSeenAt: null };
    entry.count += 1;
    if (!entry.lastSeenAt || new Date(r.createdAt) > new Date(entry.lastSeenAt)) entry.lastSeenAt = r.createdAt;
    by.set(r.wallet, entry);
  }
  return Array.from(by).map(([wallet, v]) => ({ wallet, count: v.count, lastSeenAt: v.lastSeenAt }));
}

async function updateAccessPolicy(post, patch) {
  const data = {};
  if (patch.whitelist !== undefined) {
    if (!Array.isArray(patch.whitelist)) {
      throw new ApiError(status.BAD_REQUEST, 'whitelist must be an array of wallet addresses');
    }
    data.whitelist = normalizeWhitelist(patch.whitelist);
  }
  if (patch.whitelistPrice !== undefined) {
    data.whitelistPrice = parsePrice(patch.whitelistPrice);
  }
  if (patch.publicAccess !== undefined) {
    if (typeof patch.publicAccess !== 'boolean') {
      throw new ApiError(status.BAD_REQUEST, 'publicAccess must be a boolean');
    }
    data.publicAccess = patch.publicAccess;
  }
  const alreadyInviteOnly = post.publicAccess === false;
  const flippingInviteOnly = data.publicAccess === false && !alreadyInviteOnly;
  const whitelistChanged = data.whitelist !== undefined && JSON.stringify(data.whitelist) !== JSON.stringify(post.whitelist);
  const nextWhitelist = data.whitelist !== undefined ? data.whitelist : post.whitelist;

  const updated = await prisma.blogPost.update({ where: { id: post.id }, data });

  // Gap #11 (ACCESS-CONTROL-DESIGN §6 row 7 / §10.1): invite-only content must
  // not keep serving paid wallets that are no longer listed. This fires on the
  // flip AND on later whitelist edits while already invite-only (removing a
  // wallet from an invite-only post cuts that payer off). Wallets still listed
  // are untouched; already-revoked wallets are not re-processed.
  const cuttingOff = (data.publicAccess === false && flippingInviteOnly) || (alreadyInviteOnly && whitelistChanged);
  const cutOffWallets = [];
  if (cuttingOff) {
    const [activeEnts, receipts] = await Promise.all([
      prisma.blogPostEntitlement.findMany({ where: { postId: post.id, status: 'active' } }),
      prisma.blogPostReceipt.findMany({ where: { postId: post.id } }),
    ]);
    const cutoff = sdk.paidCutoffWallets({
      policy: { whitelist: nextWhitelist, publicAccess: false },
      entitlements: activeEnts,
      receipts: receipts.map((r) => ({ payerWallet: r.payerWallet, amount: r.amount })),
    });
    for (const wallet of cutoff) {
      await revokeEntitlement({ post, wallet });
      await prisma.blogPostEvent.create({
        data: { siteId: post.siteId, postId: post.id, type: 'invite_only_flip', wallet },
      });
      cutOffWallets.push(wallet);
    }
  }

  return {
    whitelist: updated.whitelist,
    whitelistPrice: updated.whitelistPrice == null ? null : String(updated.whitelistPrice),
    publicAccess: updated.publicAccess,
    cutOffWallets,
  };
}

module.exports = {
  normalizeWhitelist,
  parsePrice,
  isWhitelisted,
  inWhitelist,
  effectivePrice,
  isPaidValue,
  paidCutoffWallets,
  accessDecision,
  findPostBySlugOrId,
  walletFor,
  sessionWalletFor,
  possessedWalletFor,
  findEntitlement,
  findLastReceipt,
  grantEntitlement,
  grantUnlock,
  revokeEntitlement,
  banEntitlement,
  restoreEntitlement,
  listEntitlements,
  listViewers,
  updateAccessPolicy,
};