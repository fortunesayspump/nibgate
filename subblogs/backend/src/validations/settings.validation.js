const Joi = require('joi');

const updateSettings = {
  body: Joi.object().keys({
    siteName: Joi.string().max(100),
    description: Joi.string().max(500),
    recipientWallet: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).allow('', null),
    hubSiteId: Joi.string().allow('', null),
    hubToken: Joi.string().allow('', null),
    aboutMarkdown: Joi.string().max(50000).allow('', null),
  }).unknown(true),
};

module.exports = { updateSettings };
