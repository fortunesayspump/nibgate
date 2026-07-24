const { status } = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('../lib/prisma');

function slugify(value = '') {
  return String(value).trim().toLowerCase().replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function excerptFrom(markdown = '') {
  return String(markdown).replace(/[#*_>`\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function cleanTags(value) {
  if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 8).join(',');
  return String(value || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8).join(',');
}

async function listPublished(siteId, options = {}) {
  const { page = 1, limit = 10, tag, type } = options;
  const where = { siteId, status: 'published' };
  if (tag) where.tag = tag;
  if (type) where.type = type;

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return { posts, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getBySlug(siteId, slug) {
  return prisma.blogPost.findFirst({
    where: { siteId, slug, status: 'published' },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function listAll(siteId, authorId) {
  const where = { siteId };
  if (authorId) where.authorId = authorId;
  return prisma.blogPost.findMany({
    where,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

async function getById(siteId, id) {
  return prisma.blogPost.findFirst({
    where: { siteId, id },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function create(data, siteId, authorId) {
  const title = String(data.title || '').trim();
  const bodyMarkdown = String(data.bodyMarkdown || data.body || '').trim();
  const slug = slugify(data.slug || title);
  if (!slug) throw new ApiError(status.BAD_REQUEST, 'Could not generate slug');
  const statusVal = data.status === 'draft' ? 'draft' : 'published';

  return prisma.blogPost.create({
    data: {
      siteId, title, slug, bodyMarkdown,
      excerpt: String(data.excerpt || '').trim() || excerptFrom(bodyMarkdown),
      tag: String(data.tag || 'General').trim().slice(0, 40),
      tags: cleanTags(data.tags),
      type: ['article', 'photo', 'music', 'video'].includes(data.type) ? data.type : 'article',
      coverUrl: String(data.coverUrl || '').trim() || null,
      videoUrl: String(data.videoUrl || '').trim() || null,
      price: data.price && data.price !== '0' ? String(data.price).trim() : null,
      status: statusVal,
      featured: data.featured === true,
      publishedAt: statusVal === 'published' ? new Date() : null,
      authorId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function update(siteId, id, data) {
  const existing = await prisma.blogPost.findFirst({ where: { siteId, id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');

  const updateData = {};
  if (data.title !== undefined) {
    updateData.title = String(data.title).trim();
    if (!data.slug) updateData.slug = slugify(data.title);
  }
  if (data.slug !== undefined) updateData.slug = slugify(data.slug);
  if (data.bodyMarkdown !== undefined || data.body !== undefined) {
    updateData.bodyMarkdown = String(data.bodyMarkdown || data.body || '').trim();
  }
  if (data.excerpt !== undefined) updateData.excerpt = String(data.excerpt).trim();
  if (data.tag !== undefined) updateData.tag = String(data.tag).trim().slice(0, 40);
  if (data.tags !== undefined) updateData.tags = cleanTags(data.tags);
  if (data.coverUrl !== undefined) updateData.coverUrl = String(data.coverUrl).trim() || null;
  if (data.videoUrl !== undefined) updateData.videoUrl = String(data.videoUrl).trim() || null;
  if (data.type !== undefined) updateData.type = ['article', 'photo', 'music', 'video'].includes(data.type) ? data.type : 'article';
  if (data.price !== undefined) updateData.price = data.price && data.price !== '0' ? String(data.price).trim() : null;
  if (data.featured !== undefined) updateData.featured = data.featured;
  if (data.status !== undefined) {
    updateData.status = data.status === 'draft' ? 'draft' : 'published';
    if (updateData.status === 'published' && !existing.publishedAt) updateData.publishedAt = new Date();
  }
  if (data.bodyMarkdown && !data.excerpt) updateData.excerpt = excerptFrom(data.bodyMarkdown);

  return prisma.blogPost.update({
    where: { id },
    data: updateData,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function remove(siteId, id) {
  const existing = await prisma.blogPost.findFirst({ where: { siteId, id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');
  await prisma.blogPost.delete({ where: { id } });
  return existing;
}

async function listByTypes(siteId) {
  const types = ['article', 'photo', 'music', 'video'];
  const result = {};
  for (const type of types) {
    const posts = await prisma.blogPost.findMany({
      where: { siteId, status: 'published', type },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    if (posts.length > 0) result[type] = posts;
  }
  return result;
}

module.exports = { listPublished, getBySlug, listAll, getById, create, update, remove, listByTypes };
