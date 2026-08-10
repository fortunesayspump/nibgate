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
    payEndpoint: 'https://api.nibgate.xyz/api/hub/pay',
  });
});

router.get('/access', async (req, res, next) => {
  try {
    const slug = req.query.path?.replace(/^\/(?:writing|photos|music|video|docs|posts)\//, '') || '';
    const post = slug ? await prisma.blogPost.findFirst({ where: { siteId: req.siteId, slug } }) : null;
    if (!post && slug) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
    const recipient = post?.recipientWallet || settings.recipientWallet || process.env.NIBGATE_SELLER_ADDRESS || '';

    if (!recipient) {
      return res.status(400).json({ ok: false, error: 'Gateway recipient wallet not configured. Set recipientWallet in site settings or NIBGATE_SELLER_ADDRESS env.' });
    }

    const resource = {
      id: post?.id || slug || 'unknown',
      title: post?.title || req.query.title || '',
      type: post?.type || 'article',
      price: post?.price || '0.01',
      currency: 'USDC',
      path: slug ? `/posts/${slug}` : req.query.path || '/',
      description: post?.excerpt || '',
      recipient,
    };

    const origin = `${req.protocol}://${req.get('host')}`;
    const request = new Request(`${origin}${req.originalUrl}`, {
      headers: new Headers(req.headers),
    });

    const access = nibgateServer.accessFor(request, resource);
    if (access.allowed) {
      const payload = await accessPayloadFor(post);
      return res.json({ ok: true, resource, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media });
    }
    if (access.blocked) {
      return res.status(403).json({ ok: false, error: 'Access blocked' });
    }

    const hubResponse = await fetch('https://api.nibgate.xyz/api/hub/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['payment-signature'] ? { 'payment-signature': req.headers['payment-signature'] } : {}),
        ...(req.headers['payment-memo'] ? { 'payment-memo': req.headers['payment-memo'] } : {}),
      },
      body: JSON.stringify({
        price: resource.price,
        recipient: resource.recipient,
        title: resource.title,
        contentId: resource.id,
        path: resource.path,
      }),
    });

    if (hubResponse.status === 402) {
      const body = await hubResponse.text();
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
        const result = await nibgateServer.unlock(resource, hubData.payment);
        if (result.ok) {
          const payload = await accessPayloadFor(post);
          return res.json({ ok: true, resource, content: payload.content, videoUrl: post?.videoUrl || null, media: payload.media, payment: hubData.payment, unlockProof: result.unlockProof, expiresInSeconds: result.expiresInSeconds });
        }
      }
    }

    logger.warn(`nibgate/access hub error subdomain=${req.subdomain} status=${hubResponse.status}`);

    const response = await nibgateServer.accessResponse(request, resource, {
      ok: true,
      resource,
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
  } catch (error) {
    next(error);
  }
});

router.get('/media/:postId/:kind', async (req, res, next) => {
  try {
    const { postId, kind } = req.params;
    const post = await prisma.blogPost.findFirst({ where: { siteId: req.siteId, id: postId } });
    if (!post) return res.status(404).json({ error: 'Not found' });

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

    if (isPaidValue(post.price)) {
      const resource = { id: post.id };
      const mediaRequest = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { headers: new Headers(req.headers) });
      if (!nibgateServer.isUnlocked(mediaRequest, resource)) {
        const challenge = nibgateServer.createPaymentChallenge(resource);
        return res.status(402).json(challenge);
      }
    }

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
    const isPaid = isPaidValue(post.price);
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
    if (isPaidValue(post.price)) {
      const resource = { id: post.id };
      const mediaRequest = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { headers: new Headers(req.headers) });
      if (!nibgateServer.isUnlocked(mediaRequest, resource)) {
        const challenge = nibgateServer.createPaymentChallenge(resource);
        return res.status(402).json(challenge);
      }
    }
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
          access: `${origin}/api/nibgate/access?path=${encodeURIComponent(path)}`,
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
