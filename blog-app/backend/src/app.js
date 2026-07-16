const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const { status } = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { generalLimiter } = require('./middlewares/rateLimiter');
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
app.use(cors());
app.options('*', cors());

app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

app.use(generalLimiter);

app.get('/', (req, res) => {
  res.json({
    name: 'Nibgate Blog API',
    version: '1.0.0',
    docs: {
      posts: `${req.protocol}://${req.get('host')}/api/blog/posts`,
      admin: `${req.protocol}://${req.get('host')}/api/blog/admin/posts`,
      auth: `${req.protocol}://${req.get('host')}/api/auth/login`,
      health: `${req.protocol}://${req.get('host')}/api/health`,
    },
  });
});

app.use('/api', routes);

app.use((req, res, next) => {
  next(new ApiError(status.NOT_FOUND, 'Not found'));
});

app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
