const express = require('express');
const validate = require('../../middlewares/validate');
const nibgateValidation = require('../../validations/nibgate.validation');
const prisma = require('../../lib/prisma');
const config = require('../../config/config');
const { createCircleGatewayServer, getBlob, decryptBytes, unpackCipherBlob } = require('@nibgate/sdk/server');
const { storedToKey } = require('../../lib/keywrap');
const { registerR2Provider } = require('../../lib/storage');
const { renderDocument } = require('../../services/document-render');
const { authenticate, authorize } = require('../../middlewares/auth');
const accessService = require('../../services/access.service');
const logger = require('../../config/logger');
const router = express.Router();

registerR2Provider();

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

async function decryptContentFor(post) {
  if (!post) return null;
  if (!post.bodyStorageRef || !post.contentKey) return post.bodyMarkdown || null;
  const key = storedToKey(post.contentKey);
  if (!key) return null;
  const blob = await getBlob({ storageRef: post.bodyStorageRef });
  const { iv, tag, ciphertext } = unpackCipherBlob(blob);
  const decrypted = decryptBytes(key, iv, tag, ciphertext);
  return decrypted.toString('utf8');
}

function mediaMetaFor(post) {
  if (!post) return { hasAudio: false, audioContentType: null, photos: 0, hasVideo: false, hasDocument: false, documentName: null, documentSize: null, documentContentType: null };
  const photos = parseMedia(post.media).filter((i) => i && i.storageRef).length;
  return {
    hasAudio: !!(post.audioStorageRef && post.audioEncryptedKey),
    audioContentType: post.audioContentType || 'audio/mpeg',
    photos,
    hasVideo: !!(post.videoUrl || (post.videoStorageRef && post.videoEncryptedKey)),
    videoName: post.videoName || null,
    videoSize: post.videoSize || null,
    videoContentType: post.videoContentType || null,
    hasDocument: !!(post.documentStorageRef && post.documentEncryptedKey) || !!post.documentUrl,
    documentName: post.documentName || null,
    documentSize: post.documentSize || null,
    documentContentType: post.documentContentType || null,
  };
}

async function accessPayloadFor(post) {
  const content = await decryptContentFor(post);
  return { content, media: mediaMetaFor(post) };
}

const nibgateServer = createCircleGatewayServer({
  secret: config.nibgate.gatewaySecret,
});

router.get('/status', (req, res) => {
  res.json({
    site: req.site.subdomain,
    hosted: true,
    payEndpoint: `${config.nibgate.apiBase}/hub/pay`,
  });
});

// Wallet identity embedded in a valid SDK unlock-proof token (minted by
// nibgateServer.unlock). Used to gate media + proof replay on entitlements.
function proofWalletFor(req, resource) {
  const proof =
    req.headers['x-nibgate-payment-proof'] ||
    req.query.proof ||
    '';
  if (!proof) return null;
  const payload = nibgateServer.verifyUnlockToken(proof, resource);
  const w = payload?.payment?.payer || '';
  return /^0x[0-9a-f]{40}$/i.test(w) ? w.toLowerCase() : null;
}

function challengeFor(req, resource) {
  const rail = req.query?.rail === 'transfer' ? 'transfer' : 'gateway';
  return nibgateServer.createPaymentChallenge(resource, { paymentRail: rail });
}

// Confirm the request may stream this post's media:
//   paid            -> valid proof OR active paid entitlement (lifetime);
//                      never banned/revoked
//   invite-only     -> wallet MUST be whitelisted (even free posts)
// Returns null if allowed, else a { status, body } response to send.
async function mediaAccessResult(req, post, resource) {
  if (!isPaidValue(post?.price) && post?.publicAccess !== false) return null;
  const isInviteOnly = post.publicAccess === false;
  // The wallet is trusted from a valid proof, OR from a session-corroborated
  // claim. A bare ?wallet= claim alone cannot unlock media.
  let wallet = proofWalletFor(req, resource);
  if (!wallet) wallet = await accessService.possessedWalletFor(req, accessService.walletFor(req), resource);
  if (!wallet) {
    if (!isPaidValue(post?.price)) {
      return { status: 403, body: { error: 'This post is invite-only. Connect and sign in with the wallet you were invited with to view its media.' } };
    }
    const challenge = challengeFor(req, resource);
    return { status: 402, body: challenge };
  }
  if (isInviteOnly && !accessService.inWhitelist(post, wallet)) {
    return { status: 403, body: { error: 'This post is invite-only — only whitelisted wallets can access it.' } };
  }
  if (isPaidValue(post.price) && !nibgateServer.isUnlocked(new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { headers: new Headers(req.headers) }), resource)) {
    // No valid proof: gate on a lifetime active paid entitlement.
    const decision = await accessService.canAccessPost(post, { wallet });
    const paidMediaOk = decision.allowed && decision.grant === 'paid';
    if (!paidMediaOk) {
      if (!decision.allowed && decision.reason === 'invite-only') {
        return { status: 403, body: { error: 'This post is invite-only — only whitelisted wallets can access it.' } };
      }
      const challenge = challengeFor(req, resource);
      return { status: 402, body: challenge };
    }
  }
  const decision = await accessService.canAccessPost(post, { wallet });
  if (!decision.allowed && (decision.reason === 'banned' || decision.reason === 'revoked')) {
    return { status: 403, body: { error: 'You must unlock this post to view its media.' } };
  }
  return null;
}

async function serveAccess(req, res, post, slug) {
  // Hardened cache hygiene (x402 Attack III): gated bodies must never be
  // cached by a shared proxy, or a non-payer could read a cached 200.
  res.setHeader('Cache-Control', 'private, no-store');
  const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
  const recipient = post?.recipientWallet || settings.recipientWallet || process.env.NIBGATE_SELLER_ADDRESS || '';

  if (!recipient) {
    return res.status(400).json({ ok: false, error: 'Gateway recipient wallet not configured. Set recipientWallet in site settings or NIBGATE_SELLER_ADDRESS env.' });
  }

  const resource = {
    id: post?.id || slug || 'unknown',
    title: post?.title || req.query.title || '',
    type: post?.type || 'article',
    price: post ? (isPaidValue(post.price) ? post.price : '0') : (req.query.price || '0.01'),
    currency: 'USDC',
    path: req.query.path || (slug ? `/posts/${slug}` : '/'),
    description: post?.excerpt || '',
    recipient,
  };

  const origin = `${req.protocol}://${req.get('host')}`;
  const request = new Request(`${origin}${req.originalUrl}`, {
    headers: new Headers(req.headers),
  });

  // ---------- Free posts (price 0 / empty) ----------
  if (!isPaidValue(post?.price)) {
    // Invite-only free posts still require a listed, un-banned, un-revoked
    // wallet — and only a session-corroborated claim is trusted. A bare
    // ?wallet= cannot unlock free content.
    if (!post?.publicAccess) {
      const possessed = await accessService.possessedWalletFor(req, accessService.walletFor(req), resource);
      if (!possessed) {
        return res.status(403).json({ ok: false, error: 'This post is invite-only. Connect and sign in with the wallet you were invited with to view it.' });
      }
      const decision = await accessService.canAccessPost(post, { wallet: possessed });
      if (!decision.allowed) {
        if (decision.reason === 'banned') {
          return res.status(403).json({ ok: false, error: 'This wallet is banned from this post.' });
        }
        if (decision.reason === 'revoked') {
          return res.status(403).json({ ok: false, error: 'Access to this post has been revoked.' });
        }
        return res.status(403).json({ ok: false, error: 'This post is invite-only. Connect and sign in with the wallet you were invited with to view it.' });
      }
    }
    const payload = await accessPayloadFor(post);
    const result = await nibgateServer.unlock(resource, { id: `${post.id}:free`, payer: accessService.walletFor(req) || '', amount: 0, txHash: null });
    return res.json({
      ok: true, resource, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media,
      payment: { id: null, amount: '0', currency: 'USDC', txHash: null, payerWallet: accessService.walletFor(req) || '' },
      unlockProof: result.unlockProof,
      expiresInSeconds: result.expiresInSeconds,
    });
  }

  // ---------- Paid posts ----------

  // Replay an existing SDK unlock-proof (wallet already paid / was granted).
  const proofWallet = proofWalletFor(req, resource);
  if (proofWallet) {
    const decision = await accessService.canAccessPost(post, { wallet: proofWallet, proofValid: true });
    if (!decision.allowed) {
      if (decision.reason === 'banned') {
        return res.status(403).json({ ok: false, error: 'This wallet is banned from this post.' });
      }
      if (decision.reason === 'revoked') {
        return res.status(403).json({ ok: false, error: 'Access to this post has been revoked. Pay again to re-unlock.' });
      }
      return res.status(403).json({ ok: false, error: 'This post is invite-only — only whitelisted wallets can access it.' });
    }
    const payload = await accessPayloadFor(post);
    const lastReceipt = await accessService.findLastReceipt({ postId: post.id, wallet: proofWallet });
    return res.json({
      ok: true, resource, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media,
      payment: { id: lastReceipt?.id || null, amount: String(post.price), currency: 'USDC', txHash: lastReceipt?.txHash || null, payerWallet: proofWallet },
      unlockProof: req.headers['x-nibgate-payment-proof'],
      expiresInSeconds: 12 * 60 * 60,
    });
  }

  // Per-wallet tier pricing: the x402 challenge amount is minted BEFORE the
  // wallet pays, so the requester must identify itself up-front (?wallet=).
  // Only a session-corroborated claim may influence the tier — a bare claim
  // charges the PUBLIC price and grants nothing.
  const claimed = accessService.walletFor(req);
  const wallet = await accessService.possessedWalletFor(req, claimed, resource);
  const preDecision = wallet ? await accessService.canAccessPost(post, { wallet }) : null;

  // Invite-only paid posts: only a possessed, whitelisted wallet may even
  // attempt a payment — anonymous requests get 403, never a charge.
  if (!post?.publicAccess) {
    if (!wallet) {
      return res.status(403).json({ ok: false, error: 'This post is invite-only. Connect and sign in with the wallet you were invited with to view it.' });
    }
    if (preDecision && !preDecision.allowed && preDecision.reason !== 'revoked') {
      if (preDecision.reason === 'banned') {
        return res.status(403).json({ ok: false, error: 'This wallet is banned from this post.' });
      }
      return res.status(403).json({ ok: false, error: preDecision.message || 'This post is invite-only — only whitelisted wallets can access it.' });
    }
  }

  const challengePrice = wallet ? accessService.effectivePrice(post, wallet) : post.price;

  // Whitelist-free tier (whitelistPrice=0 member of a paid post): x402 rejects
  // $0, so grant an active entitlement without a challenge instead.
  if (isPaidValue(post.price) && String(challengePrice) === '0' && wallet) {
    if (preDecision && !preDecision.allowed && preDecision.reason !== 'revoked') {
      if (preDecision.reason === 'banned') {
        return res.status(403).json({ ok: false, error: 'This wallet is banned from this post.' });
      }
      return res.status(403).json({ ok: false, error: preDecision.message || 'This post is invite-only — only whitelisted wallets can access it.' });
    }
    await accessService.grantEntitlement({ post, wallet });
    const freeResult = await nibgateServer.unlock({ ...resource, price: '0' }, { id: `${post.id}:free`, payer: wallet, amount: 0, txHash: null });
    const payload = await accessPayloadFor(post);
    return res.json({
      ok: true, resource: { ...resource, price: '0' }, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media,
      payment: { id: null, amount: '0', currency: 'USDC', txHash: null, payerWallet: wallet },
      unlockProof: freeResult.unlockProof,
      expiresInSeconds: freeResult.expiresInSeconds,
    });
  }

  // Lifetime access: an active entitlement backed by a REAL paid receipt means
  // the wallet already paid. When their 12h unlock-proof lapses, re-issue a
  // fresh proof for free instead of charging them again.
  if (wallet && preDecision && preDecision.allowed && preDecision.grant === 'paid') {
    const paidReceipt = await accessService.findLastReceipt({ postId: post.id, wallet });
    if (paidReceipt) {
      const refreshedProof = await nibgateServer.unlock(
        { ...resource, price: String(challengePrice || post.price) },
        { id: `${post.id}:lifetime:${wallet}`, payer: wallet, amount: 0, txHash: null }
      );
      const payload = await accessPayloadFor(post);
      return res.json({
        ok: true, resource: { ...resource, price: String(challengePrice || post.price) }, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media,
        payment: { id: paidReceipt.id, amount: String(post.price), currency: 'USDC', txHash: paidReceipt.txHash || null, payerWallet: wallet },
        unlockProof: refreshedProof.unlockProof,
        expiresInSeconds: refreshedProof.expiresInSeconds,
      });
    }
  }

  const paidResource = { ...resource, price: String(challengePrice) };
  const access = nibgateServer.accessFor(request, paidResource);
  if (access.allowed) {
    const payload = await accessPayloadFor(post);
    return res.json({ ok: true, resource: paidResource, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media });
  }
  if (access.blocked) {
    return res.status(403).json({ ok: false, error: 'Access blocked' });
  }

  const hubPayUrl = `${config.nibgate.apiBase}/hub/pay`;
  const hubResponse = await fetch(hubPayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(req.headers['payment-signature'] ? { 'payment-signature': req.headers['payment-signature'] } : {}),
      ...(req.headers['payment-memo'] ? { 'payment-memo': req.headers['payment-memo'] } : {}),
      ...(req.headers['x-nibgate-transfer-tx'] ? { 'x-nibgate-transfer-tx': req.headers['x-nibgate-transfer-tx'] } : {}),
      ...(req.headers['x-nibgate-tx-owner'] ? { 'x-nibgate-tx-owner': req.headers['x-nibgate-tx-owner'] } : {}),
    },
    body: JSON.stringify({
      price: paidResource.price,
      recipient: paidResource.recipient,
      title: paidResource.title,
      contentId: paidResource.id,
      path: paidResource.path,
      paymentRail: req.query.rail || req.body?.paymentRail || undefined,
    }),
  });

  if (hubResponse.status === 402) {
    let body = await hubResponse.text();
    // Cheap, untrusted ownership hint: if the request CLAIMS a wallet that has
    // a paid receipt for this post, tell the client it's worth asking the user
    // for one ownership signature instead of charging them again. The claim
    // alone grants nothing — the signature does (possessedWalletFor).
    const claimedAddr = String(claimed || '').toLowerCase();
    if (claimedAddr && !wallet && /^0x[0-9a-f]{40}$/.test(claimedAddr)) {
      try {
        const j = JSON.parse(body);
        if (j && typeof j === 'object') {
          j.ownedForClaim = Boolean(await accessService.findLastReceipt({ postId: post.id, wallet: claimedAddr }));
          if (j.ownedForClaim) body = JSON.stringify(j);
        }
      } catch { /* non-JSON challenge body: forward untouched */ }
    }
    const hasSig = !!req.headers['payment-signature'];
    logger.warn(`nibgate/access 402 subdomain=${req.subdomain} slug=${slug} hasSig=${hasSig} body=${body}`);
    return res
      .status(402)
      .set('PAYMENT-REQUIRED', hubResponse.headers.get('PAYMENT-REQUIRED') || '')
      .set('Content-Type', hubResponse.headers.get('content-type') || 'application/json')
      .send(body);
  }

  if (hubResponse.ok) {
    const hubData = await hubResponse.json();
    if (hubData.success) {
      const result = await nibgateServer.unlock(paidResource, hubData.payment);
      if (result.ok) {
        const payer = String(hubData.payment?.payer || hubData.payment?.payerWallet || '').toLowerCase();
        if (payer) {
          // Invite-only: the account that pays must be the account that
          // identified itself (a bare claim cannot route a whitelist tier).
          if (!post?.publicAccess && payer !== wallet) {
            return res.status(403).json({ ok: false, error: 'This post is invite-only — the wallet that pays must be the wallet you signed in with.' });
          }
          const decision = await accessService.canAccessPost(post, { wallet: payer });
          if (!decision.allowed && decision.reason !== 'revoked' && decision.reason !== 'payment-required') {
            if (decision.reason === 'banned') {
              return res.status(403).json({ ok: false, error: 'This wallet is banned from this post.' });
            }
            return res.status(403).json({ ok: false, error: decision.message || 'This wallet is not allowed to unlock this post.' });
          }
          if (Number(accessService.effectivePrice(post, payer)) !== Number(challengePrice)) {
            return res.status(409).json({ ok: false, error: 'The price changed for your wallet. Please retry unlocking.' });
          }
          await accessService.grantUnlock({ post, payer, txHash: hubData.payment?.txHash || null, amount: String(challengePrice) });
        }
        const payload = await accessPayloadFor(post);
        return res.json({
          ok: true, resource: paidResource, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media,
          payment: hubData.payment, unlockProof: result.unlockProof, expiresInSeconds: result.expiresInSeconds,
        });
      }
    }
  }

  logger.warn(`nibgate/access hub error subdomain=${req.subdomain} status=${hubResponse.status}`);

  const response = await nibgateServer.accessResponse(request, paidResource, {
    ok: true,
    resource: paidResource,
  });

  const responseBody = await response.text();

  if (response.status === 402) {
    const hasSig = !!req.headers['payment-signature'];
    logger.warn(`nibgate/access (local) 402 subdomain=${req.subdomain} slug=${slug} hasSig=${hasSig} body=${responseBody}`);
  }

  return res
    .status(response.status)
    .set(Object.fromEntries(response.headers.entries()))
    .send(responseBody);
}

router.get('/access', async (req, res, next) => {
  try {
    const slug = req.query.path?.replace(/^\/(?:writing|photos|music|video|docs|posts)\//, '') || '';
    const post = slug ? await prisma.blogPost.findFirst({ where: { siteId: req.siteId, slug } }) : null;
    if (!post && slug) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }
    if (post && post.status !== 'published') {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }
    return await serveAccess(req, res, post, slug);
  } catch (error) {
    next(error);
  }
});

// ---------- Owner/admin access-control ----------

// GET /posts/:key/quote?wallet=0x… — per-wallet pricing snapshot for the gate UI.
router.get('/posts/:key/quote', async (req, res) => {
  try {
    const post = await accessService.findPostBySlugOrId(req.siteId, req.params.key);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const wallet = accessService.walletFor(req);
    if (!wallet) return res.status(400).json({ error: 'wallet query param is required' });
    const ent = await accessService.findEntitlement({ postId: post.id, wallet });
    const inWL = accessService.inWhitelist(post, wallet);
    const decision = accessService.accessDecision(post, wallet);
    const revoked = ent?.status === 'revoked';
    const banned = ent?.status === 'banned';
    const canUnlock = decision.ok && !banned;
    res.json({
      wallet,
      price: String(isPaidValue(post.price) ? post.price : '0'),
      whitelistPrice: post.whitelistPrice == null || post.whitelistPrice === '' ? null : String(post.whitelistPrice),
      publicAccess: post.publicAccess,
      whitelisted: accessService.isWhitelisted(post, wallet),
      inWhitelist: inWL,
      effectivePrice: accessService.effectivePrice(post, wallet),
      status: ent?.status || null,
      revoked,
      banned,
      canUnlock,
      reason: canUnlock ? null : (banned ? 'This wallet is banned from this post.' : decision.message),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to quote post', details: error.message });
  }
});

// GET /posts/:key/access-control — whitelist policy + entitlements + viewers.
router.get('/posts/:key/access-control', authenticate, authorize('admin'), async (req, res) => {
  try {
    const post = await accessService.findPostBySlugOrId(req.siteId, req.params.key);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const [entitlements, viewers] = await Promise.all([
      accessService.listEntitlements(post.id),
      accessService.listViewers(post.id),
    ]);
    res.json({
      whitelist: post.whitelist || [],
      whitelistPrice: post.whitelistPrice == null || post.whitelistPrice === '' ? null : String(post.whitelistPrice),
      publicAccess: post.publicAccess,
      entitlements,
      viewers,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load access control', details: error.message });
  }
});

// PUT /posts/:key/access-control — { whitelist?, whitelistPrice?, publicAccess? }.
router.put('/posts/:key/access-control', authenticate, authorize('admin'), async (req, res) => {
  try {
    const post = await accessService.findPostBySlugOrId(req.siteId, req.params.key);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const { whitelist, whitelistPrice, publicAccess } = req.body || {};
    if (whitelist !== undefined && !Array.isArray(whitelist)) {
      return res.status(400).json({ error: 'whitelist must be an array of wallet addresses' });
    }
    if (whitelist !== undefined) {
      for (const w of whitelist) {
        if (typeof w !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(w.trim())) {
          return res.status(400).json({ error: `Invalid wallet address: ${w}` });
        }
      }
    }
    if (whitelistPrice !== undefined && whitelistPrice !== null && whitelistPrice !== '') {
      const n = Number(whitelistPrice);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'whitelistPrice must be a non-negative number or null' });
      }
    }
    if (publicAccess !== undefined && typeof publicAccess !== 'boolean') {
      return res.status(400).json({ error: 'publicAccess must be a boolean' });
    }
    const updated = await accessService.updateAccessPolicy(post, { whitelist, whitelistPrice, publicAccess });
    res.json({ success: true, ...updated });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    res.status(500).json({ error: 'Failed to update access control', details: error.message });
  }
});

// POST /posts/:key/entitlements/:wallet/revoke
router.post('/posts/:key/entitlements/:wallet/revoke', authenticate, authorize('admin'), async (req, res) => {
  try {
    const post = await accessService.findPostBySlugOrId(req.siteId, req.params.key);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const wallet = String(req.params.wallet).toLowerCase();
    await accessService.revokeEntitlement({ post, wallet });
    res.json({ success: true, wallet, status: 'revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke entitlement', details: error.message });
  }
});

// POST /posts/:key/entitlements/:wallet/ban
router.post('/posts/:key/entitlements/:wallet/ban', authenticate, authorize('admin'), async (req, res) => {
  try {
    const post = await accessService.findPostBySlugOrId(req.siteId, req.params.key);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const wallet = String(req.params.wallet).toLowerCase();
    await accessService.banEntitlement({ post, wallet });
    res.json({ success: true, wallet, status: 'banned' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ban wallet', details: error.message });
  }
});

// DELETE /posts/:key/entitlements/:wallet — restore to active.
router.delete('/posts/:key/entitlements/:wallet', authenticate, authorize('admin'), async (req, res) => {
  try {
    const post = await accessService.findPostBySlugOrId(req.siteId, req.params.key);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const wallet = String(req.params.wallet).toLowerCase();
    const restored = await accessService.restoreEntitlement({ post, wallet });
    if (!restored) {
      return res.status(404).json({ error: 'No entitlement found for this wallet' });
    }
    res.json({ success: true, wallet, status: 'active' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore entitlement', details: error.message });
  }
});

router.get('/media/:postId/:kind', async (req, res, next) => {
  try {
    const { postId, kind } = req.params;
    const post = await prisma.blogPost.findFirst({ where: { siteId: req.siteId, id: postId } });
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (post.status !== 'published') return res.status(404).json({ error: 'Not found' });

    let storageRef = null;
    let contentKey = null;
    let contentType = null;
    let filename = null;

    if (kind === 'audio') {
      storageRef = post.audioStorageRef;
      contentKey = post.audioEncryptedKey;
      contentType = post.audioContentType || 'audio/mpeg';
    } else if (kind === 'video') {
      storageRef = post.videoStorageRef;
      contentKey = post.videoEncryptedKey;
      contentType = post.videoContentType || 'video/mp4';
      filename = post.videoName || `video-${post.id}.mp4`;
    } else if (kind === 'photo') {
      const index = parseInt(req.query.index || '0', 10);
      const item = parseMedia(post.media)[index];
      if (item) {
        storageRef = item.storageRef;
        contentKey = item.encryptedKey;
        contentType = item.contentType || 'image/webp';
      }
    } else if (kind === 'document') {
      storageRef = post.documentStorageRef;
      contentKey = post.documentEncryptedKey;
      contentType = post.documentContentType || null;
      filename = post.documentName || `document-${post.id}.bin`;
    } else {
      return res.status(404).json({ error: 'Not found' });
    }

    const gate = await mediaAccessResult(req, post, { id: post.id });
    if (gate) return res.status(gate.status).json(gate.body);

    if (!storageRef || !contentKey) {
      if (kind !== 'document' || !post.documentUrl) return res.status(404).json({ error: 'Not found' });
      const fileRes = await fetch(post.documentUrl);
      if (!fileRes.ok) return res.status(404).json({ error: 'Not found' });
      const fileBytes = Buffer.from(await fileRes.arrayBuffer());
      const safeName = String(filename || '').replace(/["\r\n]/g, '').replace(/\\/g, '');
      res.setHeader('Content-Type', post.documentContentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${safeName}"`);
      return res.send(fileBytes);
    }

    const blob = await getBlob({ storageRef });
    const key = storedToKey(contentKey);
    if (!key) return res.status(404).json({ error: 'Not found' });
    const { iv, tag, ciphertext } = unpackCipherBlob(blob);
    const plain = decryptBytes(key, iv, tag, ciphertext);

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (kind === 'document' || kind === 'video') {
      const safeName = String(filename || '').replace(/["\r\n]/g, '').replace(/\\/g, '');
      res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${safeName}"`);
    }
    return res.send(plain);
  } catch (error) {
    next(error);
  }
});

function documentMetaFor(post) {
  return {
    name: post.documentName || null,
    size: post.documentSize || null,
    contentType: post.documentContentType || null,
  };
}

router.get('/media/:postId/document/preview', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findFirst({ where: { siteId: req.siteId, id: req.params.postId } });
    if (!post || (!(post.documentStorageRef && post.documentEncryptedKey) && !post.documentUrl)) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (post.status !== 'published') return res.status(404).json({ error: 'Not found' });
    const isPaid = isPaidValue(post.price) || post.publicAccess === false;
    const { kind, html } = await renderDocument(post, { preview: isPaid });
    res.setHeader('Cache-Control', 'private, max-age=120');
    return res.json({ ok: true, kind, html: html || null, meta: documentMetaFor(post) });
  } catch (error) {
    next(error);
  }
});

router.get('/media/:postId/document/render', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findFirst({ where: { siteId: req.siteId, id: req.params.postId } });
    if (!post || (!(post.documentStorageRef && post.documentEncryptedKey) && !post.documentUrl)) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (post.status !== 'published') return res.status(404).json({ error: 'Not found' });
    const gate = await mediaAccessResult(req, post, { id: post.id });
    if (gate) return res.status(gate.status).json(gate.body);
    const { kind, html } = await renderDocument(post, { preview: false });
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.json({ ok: true, kind, html: html || null, meta: documentMetaFor(post) });
  } catch (error) {
    next(error);
  }
});

router.get('/manifest', async (req, res, next) => {
  try {
    const typePath = { article: 'writing', photo: 'photos', music: 'music', video: 'video', document: 'docs' };

    const subdomain = req.get('x-site-subdomain') || req.subdomain || req.site?.subdomain || '';
    const origin = subdomain ? `https://${subdomain}.nibgate.xyz` : `${req.protocol}://${req.get('host')}`;

    const requestedPath = req.query.path;
    if (requestedPath) {
      const slug = String(requestedPath).replace(/^\/(?:writing|photos|music|video|docs|posts)\//, '');
      const post = slug
        ? await prisma.blogPost.findFirst({ where: { siteId: req.siteId, slug }, include: { author: { select: { name: true } } } })
        : null;
      if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });

      const t = post.type || 'article';
      const isPaid = isPaidValue(post.price);
      const path = `/${typePath[t] || 'posts'}/${post.slug}`;
      const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
      const recipient = post.recipientWallet || settings.recipientWallet || process.env.NIBGATE_SELLER_ADDRESS || '';
      const mediaMeta = mediaMetaFor(post);
      const media = [];
      if (mediaMeta.photos) media.push(`${origin}/api/nibgate/media/${post.id}/photo`);
      if (mediaMeta.hasAudio) media.push(`${origin}/api/nibgate/media/${post.id}/audio`);
      if (mediaMeta.hasVideo) media.push(`${origin}/api/nibgate/media/${post.id}/video`);
      if (mediaMeta.hasDocument) media.push(`${origin}/api/nibgate/media/${post.id}/document`);

      return res.json({
        schema: 'https://docs.nibgate.xyz/subblog-manifest',
        version: 1,
        kind: 'subblog',
        site: subdomain || req.site.name || '',
        id: post.id,
        title: post.title,
        summary: post.excerpt || '',
        type: t,
        price: isPaid ? post.price : '0',
        currency: 'USDC',
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt || post.publishedAt,
        author: post.author?.name || null,
        coverUrl: post.coverUrl || post.videoUrl || null,
        urls: {
          page: `${origin}${path}`,
          access: `${origin}/api${path}`,
          manifest: `${origin}/api/nibgate/manifest?path=${encodeURIComponent(path)}`,
          media,
        },
        payment: isPaid
          ? { scheme: 'x402', mode: 'one_time', recipient, description: `Pay ${post.price} USDC to unlock this ${t} post.` }
          : { scheme: 'x402', mode: 'none', description: 'This post is free to read.' },
      });
    }

    const posts = await prisma.blogPost.findMany({
      where: { siteId: req.siteId, status: 'published' },
      orderBy: [{ publishedAt: 'desc' }],
    });

    const manifest = {
      name: req.site.name,
      origin,
      content: posts.map((post) => {
        const t = post.type || 'article';
        const isPaid = !!post.price && post.price !== '0';
        const path = `/${typePath[t] || 'posts'}/${post.slug}`;
        return {
          id: post.id,
          title: post.title,
          summary: post.excerpt || '',
          type: t,
          price: isPaid ? post.price : null,
          currency: 'USDC',
          path,
          url: `${origin}${path}`,
          tags: (post.tags || '').split(',').filter(Boolean),
          imageUrl: post.coverUrl || post.imageUrl || null,
          access: isPaid ? { humans: 'paid', agents: 'paid' } : { humans: 'free', agents: 'free' },
          ...(isPaid ? { unlock: { mode: 'one_time' } } : {}),
        };
      }),
    };

    res.json(manifest);
  } catch (error) {
    next(error);
  }
});

router.get('/nibgate.json', async (req, res, next) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { siteId: req.siteId, status: 'published' },
      orderBy: [{ publishedAt: 'desc' }],
    });

    const typePath = { article: 'writing', photo: 'photos', music: 'music', video: 'video', document: 'docs' };

    const subdomain = req.get('x-site-subdomain') || req.subdomain || req.site?.subdomain || '';
    const origin = subdomain ? `https://${subdomain}.nibgate.xyz` : `${req.protocol}://${req.get('host')}`;

    const manifest = {
      name: req.site.name,
      origin,
      content: posts.map((post) => {
        const t = post.type || 'article';
        const isPaid = !!post.price && post.price !== '0';
        const path = `/${typePath[t] || 'posts'}/${post.slug}`;
        return {
          id: post.id,
          title: post.title,
          summary: post.excerpt || '',
          type: t,
          price: isPaid ? post.price : null,
          currency: 'USDC',
          path,
          url: `${origin}${path}`,
          tags: (post.tags || '').split(',').filter(Boolean),
          imageUrl: post.coverUrl || post.imageUrl || null,
          access: isPaid ? { humans: 'paid', agents: 'paid' } : { humans: 'free', agents: 'free' },
          ...(isPaid ? { unlock: { mode: 'one_time' } } : {}),
        };
      }),
    };

    res.json(manifest);
  } catch (error) {
    next(error);
  }
});

router.get('/gateway/balances', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await nibgateServer.getGatewayBalances();
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/gateway/deposit', authenticate, authorize('admin'), validate(nibgateValidation.deposit), async (req, res, next) => {
  try {
    const { amount } = req.body;
    const result = await nibgateServer.depositToGateway(amount);
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/gateway/withdraw', authenticate, authorize('admin'), validate(nibgateValidation.withdraw), async (req, res, next) => {
  try {
    const { amount, recipient, chain, maxFee } = req.body;
    const result = await nibgateServer.withdrawFromGateway(amount, { recipient, chain, maxFee });
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/gateway/balance', async (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: 'Invalid address' });
    const apiKey = process.env.CIRCLE_API_KEY || '';
    if (!apiKey) return res.json({ balance: '' });
    const r = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'USDC', sources: [{ depositor: address, domain: 26 }] }),
    });
    const data = await r.json();
    const bal = data?.balances?.[0]?.balance || '';
    res.json({ balance: bal ? Number(bal).toFixed(2) + ' USDC' : '' });
  } catch { res.json({ balance: '' }); }
});

module.exports = router;
module.exports.serveAccess = serveAccess;