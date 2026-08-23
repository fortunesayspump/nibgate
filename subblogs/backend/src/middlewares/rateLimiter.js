const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Admin bypass: if the request carries a valid admin key in X-Admin-Key,
// rate limiters are skipped. Use this for server-to-server operations.
function adminBypass(req) {
  const key = String(req.headers['x-admin-key'] || '');
  const expected = process.env.ADMIN_KEY || '';
  if (!key || !expected) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}

const baseOptions = {
  skip: adminBypass,
  message: { code: 429, error: 'Too many requests, please try again later' },
};

const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 20,
  skipSuccessfulRequests: true,
  skip: adminBypass,
  message: baseOptions.message,
});

const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 200,
  skip: adminBypass,
  message: baseOptions.message,
});

const tenantLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.RATE_LIMIT_TENANT_MAX) || 500,
  keyGenerator: (req) => req.siteId || req.ip || 'unknown',
  message: { code: 429, error: 'Too many requests for this site, please try again later' },
  skip: (req) => !req.siteId || adminBypass(req),
});

module.exports = { authLimiter, generalLimiter, tenantLimiter };
