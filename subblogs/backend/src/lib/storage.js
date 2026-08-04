const { registerProvider } = require('@nibgate/sdk/server');
const config = require('../config/config');
const { createR2Provider } = require('./r2-provider');

function registerR2Provider() {
  if (!config.r2?.endpoint) return false;
  registerProvider('nibgate', createR2Provider, {
    endpoint: config.r2.endpoint,
    bucket: config.r2.bucket,
    publicUrl: config.r2.publicUrl.replace(/\/+$/, ''),
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  });
  return true;
}

module.exports = { registerR2Provider };
