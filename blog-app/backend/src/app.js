const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
}
const passport = require('passport');
const { status } = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { generalLimiter, tenantLimiter } = require('./middlewares/rateLimiter');
const { resolveTenant } = require('./middlewares/tenant');
const { tenantLogger } = require('./middlewares/tenant-logger');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(helmet());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(cors({ exposedHeaders: ['payment-required', 'x-nibgate-payment-proof'] }));
app.options('*', cors({ exposedHeaders: ['payment-required', 'x-nibgate-payment-proof'] }));

app.use(generalLimiter);

app.use(resolveTenant);
app.use(tenantLimiter);
app.use(tenantLogger);

app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

app.get('/', (req, res) => {
  res.json({
    site: req.subdomain,
    name: req.site?.name || '',
    endpoints: {
      posts: `/api/blog/posts`,
      admin: `/api/blog/admin/posts`,
      auth: `/api/auth/login`,
      manifest: `/api/nibgate/manifest`,
    },
  });
});

app.use('/uploads', express.static('uploads'));

app.use('/api', routes);

app.use((req, res, next) => {
  next(new ApiError(status.NOT_FOUND, 'Not found'));
});

if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  app.use(Sentry.Handlers.errorHandler());
}
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
