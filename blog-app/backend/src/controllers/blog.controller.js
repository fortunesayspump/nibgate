const catchAsync = require('../utils/catchAsync');
const blogService = require('../services/blog.service');
const { status } = require('http-status');

const list = catchAsync(async (req, res) => {
  const { page, limit, tag } = req.query;
  const result = await blogService.listPublished(req.siteId, {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 10, 50),
    tag,
  });
  res.json({ success: true, ...result });
});

const getBySlug = catchAsync(async (req, res) => {
  const post = await blogService.getBySlug(req.siteId, req.params.slug);
  if (!post) return res.status(status.NOT_FOUND).json({ error: 'Post not found' });
  res.json({ success: true, post });
});

const adminList = catchAsync(async (req, res) => {
  const authorId = req.user.role === 'admin' ? null : req.user.id;
  const posts = await blogService.listAll(req.siteId, authorId);
  res.json({ success: true, posts });
});

const getById = catchAsync(async (req, res) => {
  const post = await blogService.getById(req.siteId, req.params.id);
  if (!post) return res.status(status.NOT_FOUND).json({ error: 'Post not found' });
  res.json({ success: true, post });
});

const create = catchAsync(async (req, res) => {
  const post = await blogService.create(req.body, req.siteId, req.user.id);
  res.status(status.CREATED).json({ success: true, post });
});

const update = catchAsync(async (req, res) => {
  const post = await blogService.update(req.siteId, req.params.id, req.body);
  res.json({ success: true, post });
});

const remove = catchAsync(async (req, res) => {
  await blogService.remove(req.siteId, req.params.id);
  res.json({ success: true });
});

module.exports = { list, getBySlug, adminList, getById, create, update, remove };
