const passport = require('passport');
const { status } = require('http-status');
const ApiError = require('../utils/ApiError');

const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) return next(new ApiError(status.UNAUTHORIZED, info?.message || 'Authentication required'));

    const tokenParts = req.headers.authorization?.split(' ') || [];
    if (tokenParts.length === 2) {
      try {
        const jwt = require('jsonwebtoken');
        const config = require('../config/config');
        const decoded = jwt.verify(tokenParts[1], config.jwt.secret);
        if (decoded.siteId && decoded.siteId !== req.siteId) {
          return next(new ApiError(status.FORBIDDEN, 'Token does not belong to this site'));
        }
      } catch {
        return next(new ApiError(status.UNAUTHORIZED, 'Invalid token'));
      }
    }

    req.user = user;
    next();
  })(req, res, next);
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(status.FORBIDDEN, 'You do not have permission to perform this action'));
  }
  next();
};

module.exports = { authenticate, authorize };
