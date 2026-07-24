const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test', 'PRODUCTION', 'DEVELOPMENT').required(),
    PORT: Joi.number().default(4000),
    DATABASE_URL: Joi.string().required().description('PostgreSQL connection string'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(1440).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    NIBGATE_API_BASE: Joi.string().optional().description('Nibgate hub API base URL'),
    NIBGATE_SITE_ID: Joi.string().optional().description('Nibgate site ID'),
    NIBGATE_SITE_TOKEN: Joi.string().optional().description('Nibgate site token'),
    NIBGATE_SELLER_ADDRESS: Joi.string().optional().allow('').description('Wallet address for Nibgate payments (set in DB settings instead)'),
    NIBGATE_SECRET: Joi.string().required().description('Nibgate gateway secret key'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  database: {
    url: envVars.DATABASE_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
  },
  nibgate: {
    apiBase: envVars.NIBGATE_API_BASE || 'http://localhost:3000',
    siteId: envVars.NIBGATE_SITE_ID || 'nibgate-blog',
    siteToken: envVars.NIBGATE_SITE_TOKEN || '',
    sellerAddress: envVars.NIBGATE_SELLER_ADDRESS || '',
    gatewaySecret: envVars.NIBGATE_SECRET,
  },
};

module.exports = config;
