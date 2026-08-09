import crypto from 'node:crypto';
import { requireAuth } from '@nibgate/internal/auth.js';
import { decryptMediaBlob, decryptShareBody, expirySecondsFor, mediaItemFor, paymentProofFor, primaryWallet, sharePublicUrl, walletFromPaymentProof } from './utils.js';
import * as service from './service.js';

export { requireAuth };

async function relayX402Payment(req, res, share) {
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  const network = process.env.NIBGATE_PAYMENT_NETWORK || 'eip155:5042002';

  const middleware = createGatewayMiddleware({
    sellerAddress: share.ownerWallet,
    facilitatorUrl: process.env.NIBGATE_FACILITATOR_URL || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
    networks: [network],
    description: `Unlock ${share.title || 'content'}`,
  });

  let body = '';
  const headers = {};
  let statusCode = 200;
  let nextCalled = false;
  const requestHeaders = {};
  const sourceHeaders = req.headers || {};
  for (const key of Object.keys(sourceHeaders)) {
    requestHeaders[key.toLowerCase()] = sourceHeaders[key];
  }
  const mwReq = { method: req.method || 'GET', url: req.body?.path || '/', headers: requestHeaders };
  const mwRes = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    setHeader(name, value) { headers[name] = value; },
    end(value = '') { body = value; },
  };

  await middleware.require(`$${share.price || '0'}`)(mwReq, mwRes, () => { nextCalled = true; });

  if (!nextCalled) {
    res.status(statusCode).set(headers).send(body);
    return null;
  }
  return {
    payer: String(mwReq.payment?.payer || '').toLowerCase(),
    txHash: String(mwReq.payment?.transaction || '')
  };
}

async function resolvePayment(req, res, share) {
  if (share.price > 0) {
    const payment = await relayX402Payment(req, res, share);
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
      whitelist = [], storageProvider = 'nibgate', contentType = 'text', status
    } = req.body || {};

    const share = await service.createShare({
      title, summary, coverUrl, content, price, expiresAt, whitelist, storageProvider, contentType, status,
      ownerWallet: primaryWallet(req.user)
    });

    res.status(201).json({
      id: share.id,
      slug: share.slug,
      url: sharePublicUrl(share),
      title: share.title,
      coverUrl: share.coverUrl,
      price: String(share.price),
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
    res.json({
      title: share.title,
      summary: share.summary,
      coverUrl: share.coverUrl,
      price: String(share.price),
      currency: share.currency,
      contentType: share.contentType,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      whitelist: share.whitelist.length > 0,
      status: share.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load share metadata', details: error.message });
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
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.status === 'revoked') return res.status(410).json({ error: 'This share has been revoked.' });
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return res.status(419).json({ error: 'This share has expired.' });
    }

    const payment = await resolvePayment(req, res, share);
    if (!payment) return;

    const { payer, txHash } = payment;
    if (!service.isWhitelisted(share, payer)) {
      return res.status(403).json({ error: 'Your wallet is not whitelisted for this share.' });
    }

    const receipt = await service.grantUnlock({ share, payer, txHash });
    const body = await decryptShareBody(share);

    return res.json({
      success: true,
      receipt: { id: receipt.id, amount: String(share.price), txHash, payerWallet: payer },
      access: {
        sessionId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 3600e3).toISOString(),
        body
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unlock share', details: error.message });
  }
}

export async function accessShare(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ ok: false, error: 'Share not found' });
    if (share.status === 'revoked') return res.status(410).json({ ok: false, error: 'This share has been revoked.' });
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return res.status(419).json({ ok: false, error: 'This share has expired.' });
    }

    const body = await decryptShareBody(share);
    const resource = service.resourceFor(share);

    // Free shares render directly, matching how subblogs serves free posts.
    if (!(share.price > 0)) {
      return res.json({ ok: true, resource, content: body, media: null, payment: null, unlockProof: null, expiresInSeconds: expirySecondsFor(share) });
    }

    // Replay an existing payment proof (x-nibgate-payment-proof header).
    const replayedWallet = walletFromPaymentProof(share, req.headers['x-nibgate-payment-proof']);
    if (replayedWallet) {
      const ent = await service.findEntitlement({ shareId: share.id, wallet: replayedWallet });
      if (ent && ent.status === 'active') {
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
      return res.status(403).json({ ok: false, error: 'Access to this share has been revoked.' });
    }

    // Paid share: relay the x402 Gateway payment (challenge, or verification + unlock).
    const payment = await relayX402Payment(req, res, share);
    if (!payment) return;
    if (!payment.payer) {
      return res.status(400).json({ ok: false, error: 'Payment verified but payer wallet could not be determined.' });
    }

    const { payer, txHash } = payment;
    if (!service.isWhitelisted(share, payer)) {
      return res.status(403).json({ ok: false, error: 'Your wallet is not whitelisted for this share.' });
    }

    const receipt = await service.grantUnlock({ share, payer, txHash });

    return res.json({
      ok: true,
      resource,
      content: body,
      media: null,
      payment: { id: receipt.id, amount: String(share.price), currency: share.currency, txHash, payerWallet: payer },
      unlockProof: paymentProofFor(share, payer),
      expiresInSeconds: expirySecondsFor(share)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to access share', details: error.message });
  }
}

export async function getShareMedia(req, res) {
  try {
    const share = await service.findShareBySlug(req.params.slug);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.status === 'revoked') return res.status(410).json({ error: 'This share has been revoked.' });
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return res.status(419).json({ error: 'This share has expired.' });
    }

    const body = await decryptShareBody(share);
    const kind = req.params.kind;
    const item = mediaItemFor(body, kind, req.query.index);

    if (share.price > 0) {
      const proof = req.headers['x-nibgate-payment-proof'] || req.query.proof || '';
      const wallet = walletFromPaymentProof(share, proof);
      const ent = wallet ? await service.findEntitlement({ shareId: share.id, wallet }) : null;
      if (!wallet || !ent || ent.status !== 'active') {
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

export async function listMine(req, res) {
  try {
    const { shares, activity } = await service.listMine(primaryWallet(req.user));
    res.json({ shares, activity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list shares', details: error.message });
  }
}
