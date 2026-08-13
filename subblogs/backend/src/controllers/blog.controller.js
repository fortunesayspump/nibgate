const catchAsync = require('../utils/catchAsync');
const blogService = require('../services/blog.service');
const { status } = require('http-status');

function transformTags(post) {
  if (!post) return post;
  if (post.tags && typeof post.tags === 'string') {
    return { ...post, tags: post.tags.split(',').map((t) => t.trim()).filter(Boolean) };
  }
  return { ...post, tags: post.tags || [] };
}

const list = catchAsync(async (req, res) => {
  const { page, limit, tag, type } = req.query;
  const result = await blogService.listPublished(req.siteId, {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 10, 50),
    tag,
    type,
  });
  res.json({ success: true, ...result, posts: result.posts.map(transformTags) });
});

const getBySlug = catchAsync(async (req, res) => {
  const post = await blogService.getBySlug(req.siteId, req.params.slug);
  if (!post) return res.status(status.NOT_FOUND).json({ error: 'Post not found' });
  // For paid posts, NEVER send the body publicly — only a teaser.
  // Invite-only (publicAccess=false) posts are locked too, even when free.
  const isPaid = post.price && post.price !== '0';
  const isInviteOnly = post.publicAccess === false;
  if (isPaid || isInviteOnly) {
    const { bodyMarkdown, body, videoUrl, audioUrl, audioStorageRef, audioEncryptedKey, audioContentType, contentKey, bodyStorageRef, media, whitelist, ...teaser } = post;
    return res.json({ success: true, post: transformTags({ ...teaser, bodyMarkdown: null, body: null, videoUrl: null, audioUrl: null, audioStorageRef: null, audioEncryptedKey: null, audioContentType: null, contentKey: null, bodyStorageRef: null, media: null, whitelist: null, isLocked: true }) });
  }
  res.json({ success: true, post: transformTags(post) });
});

const adminList = catchAsync(async (req, res) => {
  const authorId = req.user.role === 'admin' ? null : req.user.id;
  const posts = await blogService.listAll(req.siteId, authorId);
  res.json({ success: true, posts: posts.map(transformTags) });
});

const adminStats = catchAsync(async (req, res) => {
  const stats = await blogService.adminPostStats(req.siteId);
  res.json({ success: true, stats });
});

const adminActivity = catchAsync(async (req, res) => {
  const { activities, totals } = await blogService.adminActivity(req.siteId);
  res.json({ success: true, activities, totals });
});

const getById = catchAsync(async (req, res) => {
  const post = await blogService.getById(req.siteId, req.params.id);
  if (!post) return res.status(status.NOT_FOUND).json({ error: 'Post not found' });
  // Authors may only read their own posts' full bodies; admins may read any.
  if (req.user.role !== 'admin' && post.authorId !== req.user.id) {
    return res.status(status.FORBIDDEN).json({ error: 'You can only view your own posts' });
  }
  res.json({ success: true, post: transformTags(post) });
});

const create = catchAsync(async (req, res) => {
  const post = await blogService.create(req.body, req.siteId, req.user.id);
  res.status(status.CREATED).json({ success: true, post: transformTags(post) });
});

const update = catchAsync(async (req, res) => {
  const actor = req.user.role === 'admin' ? null : req.user.id;
  const post = await blogService.update(req.siteId, req.params.id, req.body, actor);
  res.json({ success: true, post: transformTags(post) });
});

const remove = catchAsync(async (req, res) => {
  const actor = req.user.role === 'admin' ? null : req.user.id;
  await blogService.remove(req.siteId, req.params.id, actor);
  res.json({ success: true });
});

const listByTypes = catchAsync(async (req, res) => {
  const result = await blogService.listByTypes(req.siteId);
  for (const type of Object.keys(result)) {
    if (Array.isArray(result[type])) result[type] = result[type].map(transformTags);
  }
  res.json({ success: true, ...result });
});

module.exports = { list, getBySlug, adminList, getById, create, update, remove, listByTypes, adminStats, adminActivity };
