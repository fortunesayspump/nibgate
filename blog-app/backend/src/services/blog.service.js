const { PrismaClient } = require('@prisma/client');
const { status } = require('http-status');
const ApiError = require('../utils/ApiError');

const prisma = new PrismaClient();

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function excerptFrom(markdown = '') {
  return String(markdown)
    .replace(/[#*_>`\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function cleanTags(value) {
  if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 8).join(',');
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(',');
}

async function listPublished(options = {}) {
  const { page = 1, limit = 10, tag } = options;
  const where = { status: 'published' };
  if (tag) where.tag = tag;

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

async function getBySlug(slug) {
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: 'published' },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return post;
}

async function listAll(authorId) {
  const where = authorId ? { authorId } : {};
  return prisma.blogPost.findMany({
    where,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

async function getById(id) {
  return prisma.blogPost.findUnique({
    where: { id },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function create(data, authorId) {
  const title = String(data.title || '').trim();
  if (title.length < 4) throw new ApiError(status.BAD_REQUEST, 'Title must be at least 4 characters');

  const bodyMarkdown = String(data.bodyMarkdown || data.body || '').trim();
  if (bodyMarkdown.length < 20) throw new ApiError(status.BAD_REQUEST, 'Post body must be at least 20 characters');

  const slug = slugify(data.slug || title);
  if (!slug) throw new ApiError(status.BAD_REQUEST, 'Could not generate slug');

  const statusVal = data.status === 'draft' ? 'draft' : 'published';

  const post = await prisma.blogPost.create({
    data: {
      title,
      slug,
      bodyMarkdown,
      excerpt: String(data.excerpt || '').trim() || excerptFrom(bodyMarkdown),
      tag: String(data.tag || 'General').trim().slice(0, 40),
      tags: cleanTags(data.tags),
      coverUrl: String(data.coverUrl || '').trim() || null,
      status: statusVal,
      featured: data.featured === true,
      publishedAt: statusVal === 'published' ? new Date() : null,
      authorId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return post;
}

async function update(id, data, authorId) {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');

  const updateData = {};
  if (data.title !== undefined) {
    const title = String(data.title).trim();
    if (title.length < 4) throw new ApiError(status.BAD_REQUEST, 'Title must be at least 4 characters');
    updateData.title = title;
    if (!data.slug) updateData.slug = slugify(title);
  }
  if (data.slug !== undefined) updateData.slug = slugify(data.slug);
  if (data.bodyMarkdown !== undefined || data.body !== undefined) {
    const body = String(data.bodyMarkdown || data.body || '').trim();
    if (body.length < 20) throw new ApiError(status.BAD_REQUEST, 'Post body must be at least 20 characters');
    updateData.bodyMarkdown = body;
  }
  if (data.excerpt !== undefined) updateData.excerpt = String(data.excerpt).trim();
  if (data.tag !== undefined) updateData.tag = String(data.tag).trim().slice(0, 40);
  if (data.tags !== undefined) updateData.tags = cleanTags(data.tags);
  if (data.coverUrl !== undefined) updateData.coverUrl = String(data.coverUrl).trim() || null;
  if (data.featured !== undefined) updateData.featured = data.featured;
  if (data.status !== undefined) {
    updateData.status = data.status === 'draft' ? 'draft' : 'published';
    if (updateData.status === 'published' && !existing.publishedAt) {
      updateData.publishedAt = new Date();
    }
  }
  if (data.bodyMarkdown && !data.excerpt) {
    updateData.excerpt = excerptFrom(data.bodyMarkdown);
  }

  return prisma.blogPost.update({
    where: { id },
    data: updateData,
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

async function remove(id) {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new ApiError(status.NOT_FOUND, 'Post not found');
  await prisma.blogPost.delete({ where: { id } });
  return existing;
}

module.exports = { listPublished, getBySlug, listAll, getById, create, update, remove };
