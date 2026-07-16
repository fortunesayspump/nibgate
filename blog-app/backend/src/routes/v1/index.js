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

router.get('/health', (req, res) => {
  res.json({ success: true, env: config.env, timestamp: new Date().toISOString() });
});

module.exports = router;
