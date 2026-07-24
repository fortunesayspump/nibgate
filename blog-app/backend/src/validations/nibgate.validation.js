const Joi = require('joi');

const deposit = {
  body: Joi.object().keys({
    amount: Joi.string().required().custom((value, helpers) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) return helpers.error('any.invalid');
      return value;
    }, 'positive number string'),
  }),
};

const withdraw = {
  body: Joi.object().keys({
    amount: Joi.string().required().custom((value, helpers) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) return helpers.error('any.invalid');
      return value;
    }, 'positive number string'),
    recipient: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional().allow(''),
    chain: Joi.string().optional().allow(''),
    maxFee: Joi.string().optional().allow(''),
  }),
};

module.exports = { deposit, withdraw };
