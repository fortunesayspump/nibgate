const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
}
const passport = require('passport');
const cookieParser = require('cookie-parser');
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

app.set('trust proxy', 1);

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !origin.startsWith('http')) return callback(null, true);
    const allowed = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:3002', 'http://localhost:3010', 'https://*.nibgate.xyz', 'https://nibgate.xyz'];
    if (allowed.some(a => {
      if (a.includes('*')) return new RegExp('^' + a.replace(/\./g, '\\.').replace(/\*/g, '[^.]+')).test(origin);
      return a === origin;
    })) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['payment-required', 'x-nibgate-payment-proof'],
}));
app.options('*', cors({
  origin: (origin, callback) => {
    if (!origin || !origin.startsWith('http')) return callback(null, true);
    const allowed = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:3002', 'https://*.nibgate.xyz', 'https://nibgate.xyz'];
    if (allowed.some(a => {
      if (a.includes('*')) return new RegExp('^' + a.replace(/\./g, '\\.').replace(/\*/g, '[^.]+')).test(origin);
      return a === origin;
    })) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['payment-required', 'x-nibgate-payment-proof'],
}));

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

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
