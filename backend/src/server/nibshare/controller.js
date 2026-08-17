import crypto from 'node:crypto';
import { getUserBySession, requireAuth } from '@nibgate/internal/auth.js';
import { runHostedPayRequirement } from '@nibgate/sdk/server';
import { decryptMediaBlob, decryptShareBody, expirySecondsFor, mediaItemFor, paymentProofFor, primaryWallet, sharePublicUrl, walletFromPaymentProof } from './utils.js';
import * as service from './service.js';

export { requireAuth };

// Relay a share payment through the same hosted-pay seam the hub /hub/pay uses,
// so the fee-wallet revenue logic lives in one place. Serves the x402 challenge
// (gateway or direct rail) when the wallet has not paid yet, or verifies the
// payment and returns it when it clears.
async function relayX402Payment(req, res, share, price, paymentRail) {
  const requestHeaders = {};
  const sourceHeaders = req.headers || {};
  for (const key of Object.keys(sourceHeaders)) {
    requestHeaders[key.toLowerCase()] = sourceHeaders[key];
  }
  const result = await runHostedPayRequirement(
    { method: req.method || 'GET', url: req.body?.path || req.originalUrl || '/', headers: requestHeaders },
    {
      id: share.id,
      title: share.title || 'content',
      price: String(price),
      recipient: share.ownerWallet,
      path: req.body?.path || req.originalUrl || '/',
      paymentRail: paymentRail || req.query?.rail || undefined,
    },
    { hosted: true },
  );
  if (result.handled) {
    res.status(result.response.status).set(Object.fromEntries(result.response.headers.entries())).send(await result.response.text());
    return null;
  }
  return {
    payer: String(result.payment.payer || '').toLowerCase(),
    txHash: String(result.payment.txHash || result.payment.paymentId || ''),
    paymentProvider: result.payment.paymentProvider || 'circle-gateway',
  };
}

// The x402 challenge is minted server-side BEFORE the wallet pays, so the
// requester must identify itself up-front (unlock flow appends ?wallet=) for
// the challenge amount to match their whitelist tier.
function walletForAccess(req) {
  const w = String(req.query?.wallet || req.body?.walletAddress || '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(w) ? w : null;
}

// Resolve the wallet that actually signed in on this origin (SIWE session
// cookie), if any. This is the ONLY wallet the request may claim to be when
// that claim would unlock content or mint a discounted challenge.
async function sessionWalletFor(req) {
  try {
    const user = await getUserBySession(req.cookies?.auth_session);
    return primaryWallet(user) || null;
  } catch {
    return null;
  }
}

// A bare ?wallet=/walletAddress claim must be corroborated by proof of
// possession (the SIWE session wallet) before it can grant anything. Returning
// null means the request is anonymous: safe to charge PUBLIC price, unsafe to
// grant lifetime access, whitelist tiers, or invite-only content.
async function possessedWalletFor(req, claimed) {
  if (!claimed) return null;
  const sessionWallet = await sessionWalletFor(req);
  return sessionWallet && sessionWallet.toLowerCase() === claimed.toLowerCase() ? sessionWallet.toLowerCase() : null;
}

// A share is only publicly reachable while active. Drafts are owner-private.
function assertReachable(share) {
  if (share.status === 'draft') return { status: 404, body: 'Share not found' };
  if (share.status === 'revoked') return { status: 410, body: 'This share has been revoked.' };
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return { status: 419, body: 'This share has expired.' };
  return null;
}

async function resolvePayment(req, res, share, challengePrice) {
  if (share.price > 0) {
    const payment = await relayX402Payment(req, res, share, challengePrice);
    if (!payment) return null;
    if (!payment.payer) {
      res.status(400).json({ error: 'Payment verified but payer wallet could not be determined.' });
      return null;
    }
    return payment;
  }

  const payer = String(req.body?.walletAddress || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(payer)) {
    res.status(400).json({ error: 'walletAddress is required to unlock a free share.' });
    return null;
  }
  return { payer, txHash: null };
}

export async function createShare(req, res) {
  try {
    const {
      title, summary, coverUrl, content, price = '0', expiresAt = null,
      whitelist = [], whitelistPrice, publicAccess, storageProvider = 'nibgate', contentType = 'text', status
    } = req.body || {};

    const share = await service.createShare({
      title, summary, coverUrl, content, price, expiresAt, whitelist, whitelistPrice, publicAccess, storageProvider, contentType, status,
      ownerWallet: primaryWallet(req.user)
    });

    res.status(201).json({
      id: share.id,
      slug: share.slug,
      url: sharePublicUrl(share),
      title: share.title,
      coverUrl: share.coverUrl,
      price: String(share.price),
      whitelistPrice: share.whitelistPrice == null ? null : String(share.whitelistPrice),
      publicAccess: share.publicAccess,
      expiresAt: share.expiresAt,
      storageProvider: share.storageProvider,
      storageRef: share.storageRef,
      ciphertextUrl: share.ciphertextUrl,
      contentHash: share.contentHash
    });
  } catch (error) {
    if (error instanceof service.HttpError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create share', details: error.message });
  }
}

export async function getShareMeta(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.status === 'draft') return res.status(404).json({ error: 'Share not found' });
    res.json({
      title: share.title,
      summary: share.summary,
      coverUrl: share.coverUrl,
      price: String(share.price),
      whitelistPrice: share.whitelistPrice == null ? null : String(share.whitelistPrice),
      publicAccess: share.publicAccess,
      currency: share.currency,
      contentType: share.contentType,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      whitelist: share.whitelist.length > 0,
      status: share.status,
      viewCount: share.viewCount,
      unlockCount: share.unlockCount,
      revenue: (share.unlockCount || 0) * (share.price || 0)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load share metadata', details: error.message });
  }
}

export async function getShareManifest(req, res) {
  try {
    const manifest = await service.shareManifest(req.params.slug);
    if (!manifest) return res.status(404).json({ error: 'Share not found' });
    if (manifest.status === 'draft') return res.status(404).json({ error: 'Share not found' });
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load share manifest', details: error.message });
  }
}

export async function recordView(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    await service.recordView(share, String(req.body?.viewer || '').toLowerCase() || null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record view', details: error.message });
  }
}

export async function unlockShare(req, res) {
  try {
    // Hardened cache hygiene (x402 Attack III): gated bodies must never be
    // cached by a shared proxy, or a non-payer could read a cached 200.
    res.setHeader('Cache-Control', 'private, no-store');
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    const blocked = assertReachable(share);
    if (blocked) return res.status(blocked.status).json({ error: blocked.body });

    const preWallet = walletForAccess(req);
    // Only a session-corroborated claim may unlock content or claim a tier.
    const possessed = await possessedWalletFor(req, preWallet);
    const preDecision = possessed ? await service.canAccessShare(share, { wallet: possessed }) : null;

    // Whitelist-free tier: grant an active entitlement without an x402 challenge.
    if (share.price > 0 && possessed && service.effectivePrice(share, possessed) === 0) {
      if (preDecision && !preDecision.allowed && preDecision.reason !== 'revoked') {
        if (preDecision.reason === 'banned') {
          return res.status(403).json({ error: 'This wallet is banned from this share.' });
        }
        return res.status(403).json({ error: preDecision.message || 'This share is invite-only — only whitelisted wallets can access it.' });
      }
      const ent = await service.grantEntitlement({ share, wallet: possessed });
      const freeBody = await decryptShareBody(share);
      return res.json({
        success: true,
        receipt: { id: `free-${ent.id}`, amount: '0', txHash: null, payerWallet: possessed },
        access: {
          sessionId: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 3600e3).toISOString(),
          body: freeBody
        }
      });
    }

    // Invite-only paid shares: never charge an anonymous or non-listed wallet.
    // The wallet that pays MUST be the wallet that identified itself.
    if (share.publicAccess === false) {
      if (!possessed) {
        return res.status(403).json({ error: 'This share is invite-only. Connect and sign in with the wallet you were invited with.' });
      }
      if (preDecision && !preDecision.allowed && preDecision.reason !== 'revoked') {
        if (preDecision.reason === 'banned') {
          return res.status(403).json({ error: 'This wallet is banned from this share.' });
        }
        return res.status(403).json({ error: preDecision.message || 'This share is invite-only — only whitelisted wallets can access it.' });
      }
    }

    const challengePrice = possessed ? service.effectivePrice(share, possessed) : Number(share.price) === 0 ? 0 : share.price;

    const payment = await resolvePayment(req, res, share, challengePrice);
    if (!payment) return;

    const { payer, txHash } = payment;
    if (share.publicAccess === false && payer !== possessed) {
      return res.status(403).json({ error: 'This share is invite-only — the wallet that pays must be the wallet you signed in with.' });
    }
    const decision = await service.canAccessShare(share, { wallet: payer });
    if (!decision.allowed && decision.reason !== 'revoked') {
      if (decision.reason === 'banned') {
        return res.status(403).json({ error: 'This wallet is banned from this share.' });
      }
      return res.status(403).json({ error: decision.message || 'This wallet is not allowed to unlock this share.' });
    }
    if (share.price > 0) {
      const payerPrice = service.effectivePrice(share, payer);
      if (String(payerPrice) !== String(challengePrice)) {
        return res.status(409).json({ error: 'The price changed for your wallet. Please retry unlocking.' });
      }
    }

    const { receipt } = await service.grantUnlock({ share, payer, txHash, amount: share.price > 0 ? challengePrice : 0 });
    const body = await decryptShareBody(share);

    return res.json({
      success: true,
      receipt: { id: receipt.id, amount: String(share.price > 0 ? challengePrice : 0), txHash, payerWallet: payer },
      access: {
        sessionId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 3600e3).toISOString(),
        body
      }
    });
  } catch (error) {
    if (error instanceof service.HttpError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: 'Failed to unlock share', details: error.message });
  }
}

export async function accessShare(req, res) {
  try {
    // Hardened cache hygiene (x402 Attack III): gated bodies must never be
    // cached by a shared proxy, or a non-payer could read a cached 200.
    res.setHeader('Cache-Control', 'private, no-store');
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    const blocked = assertReachable(share);
    if (blocked) return res.status(blocked.status).json({ ok: false, error: blocked.body });

    const body = await decryptShareBody(share);
    const resource = service.resourceFor(share);

// Free shares render directly, matching how subblogs serves free posts.
    if (!(share.price > 0)) {
      // Invite-only (publicAccess=false) still requires a listed wallet;
      // banned / revoked wallets are refused. Only a session-corroborated
      // claim is trusted — a bare ?wallet= can't unlock free content.
      if (!share.publicAccess) {
        const claimed = String(req.body?.walletAddress || req.query.wallet || '').trim().toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(claimed)) {
          return res.status(403).json({ ok: false, error: 'This share is invite-only. Connect your wallet to view it.' });
        }
        const wallet = await possessedWalletFor(req, claimed);
        if (!wallet) {
          return res.status(403).json({ ok: false, error: 'This share is invite-only. Sign in with the wallet you were invited with to view it.' });
        }
        const decision = await service.canAccessShare(share, { wallet });
        if (!decision.allowed) {
          if (decision.reason === 'banned') {
            return res.status(403).json({ ok: false, error: 'This wallet is banned from this share.' });
          }
          if (decision.reason === 'revoked') {
            return res.status(403).json({ ok: false, error: 'Access to this share has been revoked.' });
          }
          return res.status(403).json({ ok: false, error: 'This share is invite-only. Sign in with the wallet you were invited with to view it.' });
        }
      }
      return res.json({ ok: true, resource, content: body, media: null, payment: null, unlockProof: null, expiresInSeconds: expirySecondsFor(share) });
    }

    // Replay an existing payment proof (x-nibgate-payment-proof header).
    const replayedWallet = walletFromPaymentProof(share, req.headers['x-nibgate-payment-proof']);
    if (replayedWallet) {
      const decision = await service.canAccessShare(share, { wallet: replayedWallet, proofValid: true });
      if (!decision.allowed) {
        if (decision.reason === 'banned') {
          return res.status(403).json({ ok: false, error: 'This wallet is banned from this share.' });
        }
        if (decision.reason === 'revoked') {
          return res.status(403).json({ ok: false, error: 'Access to this share has been revoked. Pay again to re-unlock.' });
        }
        return res.status(403).json({ ok: false, error: 'This share is invite-only — only whitelisted wallets can access it.' });
      }
      const lastReceipt = await service.findLastReceipt({ shareId: share.id, wallet: replayedWallet });
      return res.json({
        ok: true,
        resource,
        content: body,
        media: null,
        payment: { id: lastReceipt?.id || null, amount: String(share.price), currency: share.currency, txHash: lastReceipt?.txHash || null, payerWallet: replayedWallet },
        unlockProof: req.headers['x-nibgate-payment-proof'],
        expiresInSeconds: expirySecondsFor(share)
      });
    }

    // Paid share: relay the x402 Gateway payment (challenge, or verification + unlock).
    const claimed = walletForAccess(req);
    // Only a session-corroborated wallet may claim a tier or unlock content.
    const possessed = await possessedWalletFor(req, claimed);
    const preDecision = possessed ? await service.canAccessShare(share, { wallet: possessed }) : null;

    // Invite-only paid shares: only a possessed, whitelisted wallet may even
    // attempt a payment — anonymous requests get 403, never a charge. A revoked
    // wallet may still re-purchase, so only banned/invite-only hard-deny here.
    if (share.publicAccess === false) {
      if (!possessed) {
        return res.status(403).json({ ok: false, error: 'This share is invite-only. Connect and sign in with the wallet you were invited with.' });
      }
      if (preDecision && !preDecision.allowed && preDecision.reason !== 'revoked') {
        if (preDecision.reason === 'banned') {
          return res.status(403).json({ ok: false, error: 'This wallet is banned from this share.' });
        }
        return res.status(403).json({ ok: false, error: preDecision.message || 'This share is invite-only — only whitelisted wallets can access it.' });
      }
    }

    // Lifetime access: an active entitlement backed by a REAL paid receipt means
    // the wallet already paid. Even with no stored proof (new browser /
    // cleared localStorage), re-issue a fresh proof instead of charging again —
    // but only to the wallet that actually signed in.
    if (possessed && preDecision && preDecision.allowed && preDecision.grant === 'paid') {
      const paidReceipt = await service.findLastReceipt({ shareId: share.id, wallet: possessed });
      return res.json({
        ok: true,
        resource,
        content: body,
        media: null,
        payment: { id: paidReceipt.id, amount: String(paidReceipt.amount), currency: share.currency, txHash: paidReceipt.txHash || null, payerWallet: possessed },
        unlockProof: paymentProofFor(share, possessed),
        expiresInSeconds: expirySecondsFor(share)
      });
    }

    const challengePrice = possessed ? service.effectivePrice(share, possessed) : share.price;

    // Whitelist-free tier (whitelistPrice=0): the wallet's effective price is $0,
    // which the x402 middleware rejects ("Invalid price: $0"). Grant an active
    // entitlement without a payment challenge instead. Only reachable for paid
    // shares whose whitelist price is zero, for a session-corroborated wallet.
    if (share.price > 0 && challengePrice === 0 && possessed) {
      if (preDecision && !preDecision.allowed && preDecision.reason !== 'revoked') {
        if (preDecision.reason === 'banned') {
          return res.status(403).json({ ok: false, error: 'This wallet is banned from this share.' });
        }
        return res.status(403).json({ ok: false, error: preDecision.message || 'This share is invite-only — only whitelisted wallets can access it.' });
      }
      await service.grantEntitlement({ share, wallet: possessed });
      return res.json({
        ok: true,
        resource,
        content: body,
        media: null,
        payment: { id: null, amount: '0', currency: share.currency, txHash: null, payerWallet: possessed },
        unlockProof: paymentProofFor(share, possessed),
        expiresInSeconds: expirySecondsFor(share)
      });
    }

    const payment = await relayX402Payment(req, res, share, challengePrice);
    if (!payment) return;
    if (!payment.payer) {
      return res.status(400).json({ ok: false, error: 'Payment verified but payer wallet could not be determined.' });
    }

    const { payer, txHash } = payment;
    // Invite-only: the account that pays must be the account that identified
    // itself (a bare claim cannot route a whitelist tier to someone else).
    if (share.publicAccess === false && payer !== possessed) {
      return res.status(403).json({ ok: false, error: 'This share is invite-only — the wallet that pays must be the wallet you signed in with.' });
    }
    const decision = await service.canAccessShare(share, { wallet: payer });
    if (!decision.allowed && decision.reason !== 'revoked') {
      if (decision.reason === 'banned') {
        return res.status(403).json({ ok: false, error: 'This wallet is banned from this share.' });
      }
      return res.status(403).json({ ok: false, error: decision.message || 'This wallet is not allowed to unlock this share.' });
    }
    if (String(service.effectivePrice(share, payer)) !== String(challengePrice)) {
      return res.status(409).json({ ok: false, error: 'The price changed for your wallet. Please retry unlocking.' });
    }

    const { receipt } = await service.grantUnlock({ share, payer, txHash, amount: challengePrice });

    return res.json({
      ok: true,
      resource,
      content: body,
      media: null,
      payment: { id: receipt.id, amount: String(challengePrice), currency: share.currency, txHash, payerWallet: payer },
      unlockProof: paymentProofFor(share, payer),
      expiresInSeconds: expirySecondsFor(share)
    });
  } catch (error) {
    if (error instanceof service.HttpError) return res.status(error.status).json({ ok: false, error: error.message });
    res.status(500).json({ ok: false, error: 'Failed to access share', details: error.message });
  }
}

export async function getShareMedia(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    const blocked = assertReachable(share);
    if (blocked) return res.status(blocked.status).json({ error: blocked.body });

    const body = await decryptShareBody(share);
    const kind = req.params.kind;
    const item = mediaItemFor(body, kind, req.query.index);

    // Free invite-only shares are as gated as paid ones: a session-corroborated,
    // whitelisted, un-banned wallet is required to stream their media too.
    if (!(share.price > 0) && !share.publicAccess) {
      const claimed = String(req.body?.walletAddress || req.query.wallet || '').trim().toLowerCase();
      const wallet = await possessedWalletFor(req, claimed);
      if (!wallet) {
        return res.status(403).json({ error: 'This share is invite-only. Sign in with the wallet you were invited with to view its media.' });
      }
      const decision = await service.canAccessShare(share, { wallet });
      if (!decision.allowed) {
        if (decision.reason === 'banned') return res.status(403).json({ error: 'This wallet is banned from this share.' });
        if (decision.reason === 'revoked') return res.status(403).json({ error: 'Access to this share has been revoked.' });
        return res.status(403).json({ error: decision.message || 'This share is invite-only. Sign in with the wallet you were invited with to view its media.' });
      }
    }

    if (share.price > 0) {
      const proof = req.headers['x-nibgate-payment-proof'] || req.query.proof || '';
      // The wallet is trusted from a valid bound proof, OR from a
      // session-corroborated claim. A bare ?wallet= claim alone cannot unlock
      // media — the wallet client signs in (SIWE) before loading media, so the
      // session wallet is the authoritative identity here.
      let wallet = walletFromPaymentProof(share, proof);
      const proofValid = Boolean(wallet);
      if (!wallet) wallet = await possessedWalletFor(req, walletForAccess(req));
      if (wallet) {
        // Paid media requires an ACTIVE PAID entitlement (a real receipt). A
        // proof-only fast-path (no receipt) or a free-tier grant must not leak.
        const decision = await service.canAccessShare(share, { wallet, proofValid });
        const paidMediaOk = decision.allowed && decision.grant === 'paid';
        if (!paidMediaOk) {
          if (!decision.allowed && decision.reason === 'invite-only') {
            return res.status(403).json({ error: 'This share is invite-only — only whitelisted wallets can access it.' });
          }
          return res.status(403).json({ error: 'You must unlock this share to view its media.' });
        }
      } else {
        return res.status(403).json({ error: 'You must unlock this share to view its media.' });
      }
    }

    if (!item) {
      const legacy = legacyMediaUrl(body, kind, req.query.index);
      if (legacy) return res.redirect(legacy);
      return res.status(404).json({ error: 'Not found' });
    }

    const plain = await decryptMediaBlob({ storageRef: item.storageRef, encryptedKey: item.encryptedKey });
    const filename = item.name || `media-${share.slug}.bin`;
    res.setHeader('Content-Type', item.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (kind === 'document' || kind === 'video') {
      const safeName = String(filename).replace(/["\r\n]/g, '').replace(/\\/g, '');
      res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${safeName}"`);
    }
    return res.send(plain);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load media', details: error.message });
  }
}

function legacyMediaUrl(body, kind, indexRaw) {
  if (!body || typeof body !== 'object') return null;
  if (kind === 'photo') {
    const item = Array.isArray(body.media) ? body.media[Number(indexRaw) || 0] : null;
    return item?.url || null;
  }
  const holder = kind === 'music' ? body.audio : kind === 'video' ? body.file : kind === 'document' ? body.document : null;
  return holder?.url || null;
}

export async function gatewayBalance(req, res) {
  try {
    const { address } = req.body || {};
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: 'Invalid address' });
    res.json({ balance: await service.gatewayBalance(address) });
  } catch {
    res.json({ balance: '' });
  }
}

export async function revokeEntitlement(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can revoke entitlements.' });
    }
    const wallet = String(req.params.wallet).toLowerCase();
    await service.revokeEntitlement({ share, wallet });
    res.json({ success: true, wallet, status: 'revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke entitlement', details: error.message });
  }
}

export async function banEntitlement(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can ban wallets.' });
    }
    const wallet = String(req.params.wallet).toLowerCase();
    await service.banEntitlement({ share, wallet });
    res.json({ success: true, wallet, status: 'banned' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ban wallet', details: error.message });
  }
}

export async function restoreEntitlement(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can restore entitlements.' });
    }
    const wallet = String(req.params.wallet).toLowerCase();
    await service.restoreEntitlement({ share, wallet });
    res.json({ success: true, wallet, status: 'active' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore entitlement', details: error.message });
  }
}

export async function getAccessControl(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can view this share\'s access control.' });
    }
    const [entitlements, viewers] = await Promise.all([
      service.listEntitlements(share.id),
      service.listViewers(share.id)
    ]);
    res.json({
      whitelist: share.whitelist,
      whitelistPrice: share.whitelistPrice == null ? null : String(share.whitelistPrice),
      publicAccess: share.publicAccess,
      entitlements,
      viewers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load access control', details: error.message });
  }
}

export async function updateAccessPolicy(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can update access control.' });
    }
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
    const updated = await service.updateAccessPolicy(share, { whitelist, whitelistPrice, publicAccess });
    res.json({ success: true, ...updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update access control', details: error.message });
  }
}

export async function quoteShare(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.status === 'draft') return res.status(404).json({ error: 'Share not found' });
    const wallet = walletForAccess(req);
    if (!wallet) return res.status(400).json({ error: 'wallet query param is required' });
    const ent = await service.findEntitlement({ shareId: share.id, wallet });
    const inWL = service.inWhitelist(share, wallet);
    const decision = service.accessDecision(share, wallet);
    const revoked = ent?.status === 'revoked';
    const banned = ent?.status === 'banned';
    const canUnlock = decision.ok && !banned;
    res.json({
      wallet,
      price: String(share.price),
      whitelistPrice: share.whitelistPrice == null ? null : String(share.whitelistPrice),
      publicAccess: share.publicAccess,
      whitelisted: service.isWhitelisted(share, wallet),
      inWhitelist: inWL,
      effectivePrice: String(service.effectivePrice(share, wallet)),
      status: ent?.status || null,
      revoked,
      banned,
      canUnlock,
      reason: canUnlock ? null : (banned ? 'This wallet is banned from this share.' : decision.message)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to quote share', details: error.message });
  }
}

export async function revokeShare(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can revoke this share.' });
    }
    await service.revokeShare(share);
    res.json({ success: true, status: 'revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke share', details: error.message });
  }
}

export async function rotateShare(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can rotate this share link.' });
    }
    if (share.status === 'revoked') {
      return res.status(400).json({ error: 'Revoked shares cannot be re-linked.' });
    }
    const { slug, url } = await service.rotateShare(share);
    res.json({ success: true, slug, url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rotate share link', details: error.message });
  }
}

export async function publishShare(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (primaryWallet(req.user) !== share.ownerWallet) {
      return res.status(403).json({ error: 'Only the owner can publish this share.' });
    }
    if (share.status !== 'draft') {
      return res.status(400).json({ error: 'Only drafts can be published.' });
    }
    const { slug, url } = await service.publishShare(share);
    res.json({ success: true, slug, url, status: 'active' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to publish share', details: error.message });
  }
}

export async function listMine(req, res) {
  try {
    const { shares, activity } = await service.listMine(primaryWallet(req.user));
    res.json({ shares, activity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list shares', details: error.message });
  }
}

export async function dashboardStats(req, res) {
  try {
    const data = await service.dashboardStats({ ownerWallet: primaryWallet(req.user), query: req.query || {} });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dashboard stats', details: error.message });
  }
}

export async function platformStats(req, res) {
  try {
    res.json(await service.platformStats());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load platform stats', details: error.message });
  }
}
