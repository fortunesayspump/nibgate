const express = require('express');
const authRoute = require('./auth.route');
const blogRoute = require('./blog.route');
const nibgateRoute = require('./nibgate.route');
const settingsRoute = require('./settings.route');
const setupRoute = require('./setup.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/blog', route: blogRoute },
  { path: '/nibgate', route: nibgateRoute },
  { path: '/settings', route: settingsRoute },
  { path: '/setup', route: setupRoute },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

router.get('/site', (req, res) => {
  let settings = {};
  try { settings = req.site.settings ? JSON.parse(req.site.settings) : {}; } catch {}

  const hubSiteId = settings.hubSiteId || req.siteId;
  const hubToken = settings.hubToken || req.site.verifyToken || '';

  res.json({
    success: true,
    site: { id: req.siteId, name: req.site.name, subdomain: req.site.subdomain, verifyToken: req.site.verifyToken || '' },
    hub: { siteId: hubSiteId, token: hubToken },
    widgetScript: hubToken
      ? `<script async src="https://nibgate.xyz/widget.js" data-nibgate-site="${hubSiteId}" data-nibgate-token="${hubToken}"></script>`
      : '',
  });
});

router.get('/health', (req, res) => {
  res.json({ success: true, site: req.site.subdomain, env: config.env, timestamp: new Date().toISOString() });
});

module.exports = router;
