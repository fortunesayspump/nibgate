const express = require('express');
const { status } = require('http-status');
const config = require('../../config/config');

const router = express.Router();

const hasNibgate = () => Boolean(config.nibgate.siteToken && config.nibgate.sellerAddress);

router.get('/status', (req, res) => {
  res.json({
    configured: hasNibgate(),
    siteId: config.nibgate.siteId,
    apiBase: config.nibgate.apiBase,
  });
});

router.get('/manifest', async (req, res, next) => {
  if (!hasNibgate()) {
    return res.status(status.NOT_IMPLEMENTED).json({
      error: 'Nibgate not configured. Set NIBGATE_SITE_TOKEN and NIBGATE_SELLER_ADDRESS.',
    });
  }
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const premiumPosts = await prisma.blogPost.findMany({
      where: { status: 'published' },
      orderBy: [{ publishedAt: 'desc' }],
    });

    const { createManifest } = await import('@nibgate/sdk/server');
    const manifest = createManifest({
      name: config.nibgate.siteId,
      origin: `${req.protocol}://${req.get('host')}`,
      content: premiumPosts.map((post) => ({
        id: post.id,
        title: post.title,
        summary: post.excerpt || '',
        type: 'article',
        path: `/api/blog/posts/${post.slug}`,
        url: `${req.protocol}://${req.get('host')}/api/blog/posts/${post.slug}`,
        tags: (post.tags || '').split(',').filter(Boolean),
      })),
    });

    res.json(manifest);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
