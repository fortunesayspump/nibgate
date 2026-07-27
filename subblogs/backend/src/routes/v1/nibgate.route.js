const express = require('express');
const validate = require('../../middlewares/validate');
const nibgateValidation = require('../../validations/nibgate.validation');
const prisma = require('../../lib/prisma');
const config = require('../../config/config');
const { createCircleGatewayServer } = require('@nibgate/sdk/server');
const { authenticate, authorize } = require('../../middlewares/auth');
const logger = require('../../config/logger');
const router = express.Router();

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
    const slug = req.query.path?.replace('/posts/', '') || '';
    const post = slug ? await prisma.blogPost.findFirst({ where: { siteId: req.siteId, slug } }) : null;
    if (!post && slug) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
    const recipient = settings.recipientWallet || process.env.NIBGATE_SELLER_ADDRESS || '';

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
      return res.json({ ok: true, resource, content: post?.bodyMarkdown || null, videoUrl: post?.videoUrl || null });
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
          return res.json({ ok: true, resource, content: post?.bodyMarkdown || null, videoUrl: post?.videoUrl || null, payment: hubData.payment, unlockProof: result.unlockProof, expiresInSeconds: result.expiresInSeconds });
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

router.get('/manifest', async (req, res, next) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { siteId: req.siteId, status: 'published' },
      orderBy: [{ publishedAt: 'desc' }],
    });

    const typePath = { article: 'writing', photo: 'photos', music: 'music', video: 'video' };

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
