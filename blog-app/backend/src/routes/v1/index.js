const express = require('express');
const authRoute = require('./auth.route');
const blogRoute = require('./blog.route');
const nibgateRoute = require('./nibgate.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/blog', route: blogRoute },
  { path: '/nibgate', route: nibgateRoute },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

router.get('/site', (req, res) => {
  res.json({ success: true, site: { id: req.siteId, name: req.site.name, subdomain: req.site.subdomain } });
});

router.get('/health', (req, res) => {
  res.json({ success: true, site: req.site.subdomain, env: config.env, timestamp: new Date().toISOString() });
});

module.exports = router;
