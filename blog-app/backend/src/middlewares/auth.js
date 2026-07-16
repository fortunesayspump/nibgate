const passport = require('passport');
const { status } = require('http-status');
const ApiError = require('../utils/ApiError');

const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return next(new ApiError(status.UNAUTHORIZED, info?.message || 'Authentication required'));
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
