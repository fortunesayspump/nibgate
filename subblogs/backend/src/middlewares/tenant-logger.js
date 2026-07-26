const logger = require('../config/logger');

function tenantLogger(req, res, next) {
  const site = req.subdomain || 'unknown';

  const originalLogger = logger.info.bind(logger);
  const originalError = logger.error.bind(logger);
  const originalWarn = logger.warn.bind(logger);

  req.log = {
    info: (msg, meta) => originalLogger(`[${site}] ${msg}`, meta),
    error: (msg, meta) => originalError(`[${site}] ${msg}`, meta),
    warn: (msg, meta) => originalWarn(`[${site}] ${msg}`, meta),
  };

  next();
}

module.exports = { tenantLogger };
