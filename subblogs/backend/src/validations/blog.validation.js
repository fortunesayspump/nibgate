const Joi = require('joi');

const createPost = {
  body: Joi.object().keys({
    title: Joi.string().required().min(4).max(200),
    slug: Joi.string().optional().max(100),
    bodyMarkdown: Joi.string().optional().min(20).allow(''),
    excerpt: Joi.string().optional().max(300).allow(''),
    tag: Joi.string().optional().max(40).allow(''),
    tags: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).optional().allow(''),
    coverUrl: Joi.string().uri().optional().allow(''),
    videoUrl: Joi.string().uri().optional().allow(''),
    audioUrl: Joi.string().optional().allow(''),
    media: Joi.string().optional().allow(''),
    coverKey: Joi.string().optional().allow(''),
    type: Joi.string().valid('article', 'photo', 'music', 'video').optional(),
    status: Joi.string().valid('draft', 'published').optional(),
    featured: Joi.boolean().optional(),
    price: Joi.string().optional().allow('', null),
  }).unknown(true),
};

const updatePost = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
  body: Joi.object().keys({
    title: Joi.string().min(4).max(200).optional(),
    slug: Joi.string().max(100).optional(),
    bodyMarkdown: Joi.string().min(20).optional().allow(''),
    excerpt: Joi.string().max(300).optional().allow(''),
    tag: Joi.string().max(40).optional().allow(''),
    tags: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).optional().allow(''),
    coverUrl: Joi.string().uri().optional().allow(''),
    videoUrl: Joi.string().uri().optional().allow(''),
    audioUrl: Joi.string().optional().allow(''),
    media: Joi.string().optional().allow(''),
    coverKey: Joi.string().optional().allow(''),
    type: Joi.string().valid('article', 'photo', 'music', 'video').optional(),
    status: Joi.string().valid('draft', 'published').optional(),
    featured: Joi.boolean().optional(),
    price: Joi.string().optional().allow('', null),
  }).unknown(true).min(1),
};

module.exports = { createPost, updatePost };
