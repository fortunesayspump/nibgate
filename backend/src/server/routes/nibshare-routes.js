import crypto from 'node:crypto';
import { db } from '@nibgate/internal/db.js';
import { getUserBySession } from '@nibgate/internal/auth.js';
import {
  contentHashFor, decryptBytes, encryptBytes, generateContentKey,
  packCipherBlob, unpackCipherBlob
} from '@nibgate/sdk/server';
import { putBlob, getBlob, deleteBlob } from '@nibgate/sdk/server';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SHARE_BASE = process.env.NIBGATE_SHARE_BASE_URL || 'https://nibgate.xyz/s';
const FREE_TIER_MAX_BYTES = 512 * 1024;

function slugFromBytes(buf) {
  let n = BigInt('0x' + buf.toString('hex'));
  let out = '';
  const base = BigInt(58);
  while (n > 0n) {
    out = BASE58[Number(n % base)] + out;
    n = n / base;
  }
  return (out.padStart(8, BASE58[0])).slice(0, 8);
}

async function uniqueSlug() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = slugFromBytes(crypto.randomBytes(8));
    const existing = await db.nibShare.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new Error('Could not generate a unique slug');
}

function primaryWallet(user) {
  return user?.wallets?.[0]?.address || user?.walletAddress || '';
}

async function requireAuth(req, res, next) {
  const sessionToken = req.cookies.auth_session;
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  req.user = user;
  next();
}

function parsePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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

function sharePublicUrl(share) {
  return `${SHARE_BASE}/${share.slug}`;
}

export function registerNibshareRoutes(app) {
  app.post('/api/nibshare', requireAuth, async (req, res) => {
    try {
      const {
        title, summary, content, price = '0', expiresAt = null,
        whitelist = [], storageProvider = 'nibgate', contentType = 'text'
      } = req.body || {};

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'title is required' });
      }
      const plaintext = typeof content === 'string' ? content : content ? JSON.stringify(content) : '';
      if (!plaintext) {
        return res.status(400).json({ error: 'content is required' });
      }
      if (storageProvider !== 'nibgate') {
        return res.status(400).json({ error: 'only the nibgate storage provider is supported yet' });
      }

      const plaintextBytes = Buffer.byteLength(plaintext, 'utf8');
      if (plaintextBytes > FREE_TIER_MAX_BYTES) {
        return res.status(400).json({
          error: `Content exceeds the ${FREE_TIER_MAX_BYTES} byte limit for Nibgate free tier. Use Arweave for larger content.`
        });
      }

      const ownerWallet = primaryWallet(req.user);
      if (!ownerWallet) {
        return res.status(400).json({ error: 'Sign-in wallet could not be determined.' });
      }

      const contentKey = generateContentKey();
      const enc = encryptBytes(contentKey, Buffer.from(plaintext, 'utf8'));
      const blob = packCipherBlob(enc);
      const id = crypto.randomUUID();
      const slug = await uniqueSlug();
      const r2Key = `nibshare/${id}/body.bin`;
      const { storageRef, url } = await putBlob({ key: r2Key, data: blob });
      const contentHash = contentHashFor(ownerWallet, storageRef, plaintext);

      let share;
      try {
        share = await db.nibShare.create({
          data: {
            id,
            ownerWallet,
            title,
            summary: summary || null,
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
            encryptedKey: contentKey.toString('base64'),
            decryptMode: 'server',
            status: 'active',
            slug
          }
        });
      } catch (error) {
        await deleteBlob({ storageRef: r2Key }).catch(() => {});
        throw error;
      }

      res.status(201).json({
        id: share.id,
        slug: share.slug,
        url: sharePublicUrl(share),
        title: share.title,
        price: String(share.price),
        expiresAt: share.expiresAt,
        storageProvider: share.storageProvider,
        storageRef: share.storageRef,
        ciphertextUrl: share.ciphertextUrl,
        contentHash: share.contentHash
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create share', details: error.message });
    }
  });

  app.get('/api/nibshare/:slug/meta', async (req, res) => {
    try {
      const share = await db.nibShare.findUnique({ where: { slug: req.params.slug } });
      if (!share) return res.status(404).json({ error: 'Share not found' });
      res.json({
        title: share.title,
        summary: share.summary,
        price: String(share.price),
        currency: share.currency,
        expiresAt: share.expiresAt,
        whitelist: share.whitelist.length > 0,
        status: share.status
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load share metadata', details: error.message });
    }
  });

  app.post('/api/nibshare/:slug/unlock', async (req, res) => {
    try {
      const share = await db.nibShare.findUnique({ where: { slug: req.params.slug } });
      if (!share) return res.status(404).json({ error: 'Share not found' });
      if (share.status === 'revoked') return res.status(410).json({ error: 'This share has been revoked.' });
      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return res.status(419).json({ error: 'This share has expired.' });
      }

      const payment = await resolvePayment(req, res, share);
      if (!payment) return;

      const { payer, txHash } = payment;
      const whitelisted = share.whitelist.length === 0 || share.whitelist.includes(payer);
      if (!whitelisted) {
        return res.status(403).json({ error: 'Your wallet is not whitelisted for this share.' });
      }

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

      const receiptJson = { id: receipt.id, amount: String(share.price), txHash, payerWallet: payer };

      const blob = await getBlob({ storageRef: share.storageRef });
      const { iv, tag, ciphertext } = unpackCipherBlob(blob);
      const key = Buffer.from(share.encryptedKey, 'base64');
      const bodyBuf = decryptBytes(key, iv, tag, ciphertext);
      let body = bodyBuf.toString('utf8');
      try { body = JSON.parse(body); } catch { /* keep raw string */ }

      return res.json({
        success: true,
        receipt: receiptJson,
        access: {
          sessionId: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 3600e3).toISOString(),
          body
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to unlock share', details: error.message });
    }
  });

  app.post('/api/nibshare/:slug/entitlements/:wallet/revoke', requireAuth, async (req, res) => {
    try {
      const share = await db.nibShare.findUnique({ where: { slug: req.params.slug } });
      if (!share) return res.status(404).json({ error: 'Share not found' });
      if (primaryWallet(req.user) !== share.ownerWallet) {
        return res.status(403).json({ error: 'Only the owner can revoke entitlements.' });
      }
      const wallet = String(req.params.wallet).toLowerCase();
      await db.nibShareEntitlement.upsert({
        where: { shareId_wallet: { shareId: share.id, wallet } },
        create: { shareId: share.id, wallet, status: 'revoked', revokedAt: new Date() },
        update: { status: 'revoked', revokedAt: new Date() }
      });
      res.json({ success: true, wallet, status: 'revoked' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to revoke entitlement', details: error.message });
    }
  });

  app.delete('/api/nibshare/:slug', requireAuth, async (req, res) => {
    try {
      const share = await db.nibShare.findUnique({ where: { slug: req.params.slug } });
      if (!share) return res.status(404).json({ error: 'Share not found' });
      if (primaryWallet(req.user) !== share.ownerWallet) {
        return res.status(403).json({ error: 'Only the owner can revoke this share.' });
      }
      await db.nibShare.update({ where: { id: share.id }, data: { status: 'revoked' } });
      await deleteBlob({ storageRef: share.storageRef }).catch(() => {});
      res.json({ success: true, status: 'revoked' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to revoke share', details: error.message });
    }
  });

  app.get('/api/nibshare/mine', requireAuth, async (req, res) => {
    try {
      const ownerWallet = primaryWallet(req.user);
      const shares = await db.nibShare.findMany({
        where: { ownerWallet },
        orderBy: { createdAt: 'desc' },
        include: { receipts: { orderBy: { unlockedAt: 'desc' } } }
      });
      res.json({
        shares: shares.map((s) => ({
          id: s.id,
          slug: s.slug,
          url: sharePublicUrl(s),
          title: s.title,
          summary: s.summary,
          price: String(s.price),
          expiresAt: s.expiresAt,
          status: s.status,
          unlockCount: s.unlockCount,
          storageProvider: s.storageProvider,
          createdAt: s.createdAt,
          receipts: s.receipts
        }))
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list shares', details: error.message });
    }
  });
}
