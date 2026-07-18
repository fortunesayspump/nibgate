const express = require('express');
const prisma = require('../../lib/prisma');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    site: req.site.subdomain,
    hosted: true,
    payEndpoint: 'https://api.nibgate.xyz/api/hub/pay',
  });
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

module.exports = router;
