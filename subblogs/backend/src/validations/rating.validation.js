const Joi = require('joi');

const createRating = {
  params: Joi.object().keys({
    postId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    wallet: Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/),
    rating: Joi.number().required().min(1).max(50),
    txHash: Joi.string().allow('', null),
  }),
};

module.exports = { createRating };
