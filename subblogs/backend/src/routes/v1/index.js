const express = require('express');
const authRoute = require('./auth.route');
const blogRoute = require('./blog.route');
const nibgateRoute = require('./nibgate.route');
const ratingRoute = require('./rating.route');
const settingsRoute = require('./settings.route');
const setupRoute = require('./setup.route');
const uploadRoute = require('./upload.route');
const config = require('../../config/config');
const prisma = require('../../lib/prisma');

const router = express.Router();

const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/blog', route: blogRoute },
  { path: '/nibgate', route: nibgateRoute },
  { path: '/rating', route: ratingRoute },
  { path: '/settings', route: settingsRoute },
  { path: '/setup', route: setupRoute },
  { path: '/upload', route: uploadRoute },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

router.get('/site', async (req, res) => {
  let settings = {};
  try { settings = req.site.settings ? JSON.parse(req.site.settings) : {}; } catch {}

  const hubSiteId = settings.hubSiteId || req.siteId;
  const hubToken = settings.hubToken || req.site.verifyToken || '';

  // Auto-fill recipientWallet from hub if missing
  if (!settings.recipientWallet && hubSiteId && hubToken) {
    try {
      const hubRes = await fetch('https://api.nibgate.xyz/hub/site/info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: hubSiteId, token: hubToken }),
      });
      const hubData = await hubRes.json();
      if (hubData.success && hubData.site?.ownerWallet) {
        settings.recipientWallet = hubData.site.ownerWallet;
        await prisma.site.update({ where: { id: req.siteId }, data: { settings: JSON.stringify(settings) } });
      }
    } catch {}
  }

  res.json({
    success: true,
    site: { id: req.siteId, name: req.site.name, description: req.site.description || '', subdomain: req.site.subdomain, verifyToken: req.site.verifyToken || '' },
    aboutMarkdown: settings.aboutMarkdown || '',
    hub: { siteId: hubSiteId, token: hubToken },
    widgetScript: hubToken
      ? `<script async src="https://www.nibgate.xyz/widget.js" data-nibgate-site="${hubSiteId}" data-nibgate-token="${hubToken}" data-nibgate-api="https://api.nibgate.xyz"></script>`
      : '',
  });
});

router.get('/health', (req, res) => {
  res.json({ success: true, env: config.env, timestamp: new Date().toISOString() });
});

router.post('/sync-hub', async (req, res) => {
  try {
    let settings = {};
    try { settings = req.site.settings ? JSON.parse(req.site.settings) : {}; } catch {}
    const siteId = settings.hubSiteId;
    const token = settings.hubToken;
    if (!siteId || !token) return res.status(400).json({ error: 'Blog not linked to hub.' });

    const hubRes = await fetch('https://api.nibgate.xyz/hub/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, token }),
    });
    const data = await hubRes.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Short mirror of a post URL on the site origin: GET /api/<type>/<slug> reads
// straight through (free → body, paid → 402 x402 challenge). Same handler as
// /access. The type prefix disambiguates slugs shared across post types.
router.get('/:type/:slug', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { siteId: req.siteId, slug: req.params.slug },
      orderBy: { publishedAt: 'desc' },
    });
    if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });
    const typePath = { article: 'writing', photo: 'photos', music: 'music', video: 'video', document: 'docs' };
    const expectedType = typePath[post.type] || 'posts';
    if (req.params.type !== expectedType) return res.status(404).json({ ok: false, error: 'Post not found' });
    return await nibgateRoute.serveAccess(req, res, post, req.params.slug);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
