const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { code: 429, message: 'Too many requests, please try again later' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { code: 429, message: 'Too many requests, please try again later' },
});

const tenantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  keyGenerator: (req) => req.siteId || req.ip || 'unknown',
  message: { code: 429, message: 'Too many requests for this site, please try again later' },
  skip: (req) => !req.siteId,
});

module.exports = { authLimiter, generalLimiter, tenantLimiter };
