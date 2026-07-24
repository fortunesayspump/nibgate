const express = require('express');
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

    const response = await nibgateServer.accessResponse(request, resource, {
      ok: true,
      resource,
    });

    const responseBody = await response.text();

    if (response.status === 402 && req.headers['payment-signature']) {
      logger.warn({ responseBody, subdomain: req.subdomain, slug }, 'Circle Gateway payment verification failed');
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
      where: { siteId: req.siteId, status: 'published', price: { not: null } },
      orderBy: [{ publishedAt: 'desc' }],
    });

    const manifest = {
      name: req.site.name,
      origin: `${req.protocol}://${req.get('host')}`,
      content: posts.map((post) => ({
        id: post.id,
        title: post.title,
        summary: post.excerpt || '',
        type: 'article',
        price: post.price,
        currency: 'USDC',
        path: `/posts/${post.slug}`,
        url: `${req.protocol}://${req.get('host')}/posts/${post.slug}`,
        tags: (post.tags || '').split(',').filter(Boolean),
        access: { humans: 'paid', agents: 'paid' },
        unlock: { mode: 'one_time' },
      })),
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

router.post('/gateway/deposit', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { amount } = req.body || {};
    if (!amount) return res.status(400).json({ ok: false, error: 'amount is required' });
    const result = await nibgateServer.depositToGateway(amount);
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/gateway/withdraw', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { amount, recipient, chain, maxFee } = req.body || {};
    if (!amount) return res.status(400).json({ ok: false, error: 'amount is required' });
    const result = await nibgateServer.withdrawFromGateway(amount, { recipient, chain, maxFee });
    if (!result.ok) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
