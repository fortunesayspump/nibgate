const express = require('express');
const { status } = require('http-status');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    site: req.site.subdomain,
    configured: Boolean(process.env.NIBGATE_SELLER_ADDRESS),
  });
});

router.get('/manifest', async (req, res, next) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { siteId: req.siteId, status: 'published' },
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
        path: `/posts/${post.slug}`,
        url: `${req.protocol}://${req.get('host')}/posts/${post.slug}`,
        tags: (post.tags || '').split(',').filter(Boolean),
      })),
    };

    res.json(manifest);
  } catch (error) {
    next(error);
  }
});

router.get('/access', async (req, res, next) => {
  try {
    const slug = req.query.slug;
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    const post = await prisma.blogPost.findFirst({
      where: { siteId: req.siteId, slug, status: 'published' },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const hasSdk = await import('@nibgate/sdk/server').catch(() => null);
    if (!hasSdk) return res.status(501).json({ error: 'Nibgate SDK not configured' });

    const { createCircleGatewayServer } = hasSdk;
    const server = createCircleGatewayServer({
      origin: `${req.protocol}://${req.get('host')}`,
      secret: process.env.NIBGATE_SECRET || 'blog-secret',
      network: process.env.NIBGATE_PAYMENT_NETWORK || 'eip155:5042002',
    });

    const resource = {
      id: post.id,
      title: post.title,
      type: 'article',
      price: process.env.NIBGATE_DEFAULT_PRICE || '0.01',
      currency: 'USDC',
      recipient: process.env.NIBGATE_SELLER_ADDRESS || '',
      path: `/posts/${post.slug}`,
      url: `${req.protocol}://${req.get('host')}/posts/${post.slug}`,
      tags: (post.tags || '').split(',').filter(Boolean),
      access: { humans: 'paid', agents: 'paid' },
      unlock: { mode: 'one_time' },
    };

    const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
      headers: new Headers(req.headers),
    });

    const response = await server.accessResponse(request, resource, {
      ok: true,
      resource,
      content: {
        title: post.title,
        body: post.bodyMarkdown,
      },
    });

    res.status(response.status)
      .set(Object.fromEntries(response.headers.entries()))
      .send(await response.text());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
