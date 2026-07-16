const catchAsync = require('../utils/catchAsync');
const blogService = require('../services/blog.service');
const { status } = require('http-status');

const list = catchAsync(async (req, res) => {
  const { page, limit, tag } = req.query;
  const result = await blogService.listPublished({
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 10, 50),
    tag,
  });
  res.json({ success: true, ...result });
});

const getBySlug = catchAsync(async (req, res) => {
  const post = await blogService.getBySlug(req.params.slug);
  if (!post) return res.status(status.NOT_FOUND).json({ error: 'Post not found' });
  res.json({ success: true, post });
});

const adminList = catchAsync(async (req, res) => {
  const posts = await blogService.listAll(req.user.role === 'admin' ? null : req.user.id);
  res.json({ success: true, posts });
});

const getById = catchAsync(async (req, res) => {
  const post = await blogService.getById(req.params.id);
  if (!post) return res.status(status.NOT_FOUND).json({ error: 'Post not found' });
  res.json({ success: true, post });
});

const create = catchAsync(async (req, res) => {
  const post = await blogService.create(req.body, req.user.id);
  res.status(status.CREATED).json({ success: true, post });
});

const update = catchAsync(async (req, res) => {
  const post = await blogService.update(req.params.id, req.body, req.user.id);
  res.json({ success: true, post });
});

const remove = catchAsync(async (req, res) => {
  await blogService.remove(req.params.id);
  res.json({ success: true });
});

module.exports = { list, getBySlug, adminList, getById, create, update, remove };
