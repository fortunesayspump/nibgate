import { db } from '@nibgate/internal/db.js';
import { requireAuth } from '@nibgate/internal/auth.js';

function normalizeWallet(value = '') {
  return String(value).trim().toLowerCase();
}

const DEFAULT_BLOG_OWNER_WALLET = '0x558e7bfaf2cf1a494f44e50d92431afc060c9d12';

function blogOwnerWallet() {
  return normalizeWallet(process.env.BLOG_OWNER_WALLET || DEFAULT_BLOG_OWNER_WALLET);
}

function primaryWalletAddress(user) {
  return normalizeWallet(user?.wallets?.find((wallet) => wallet.isPrimary)?.address || user?.wallets?.[0]?.address || user?.walletAddress || '');
}

function isBlogOwner(user) {
  const ownerWallet = blogOwnerWallet();
  if (!ownerWallet) return false;
  return primaryWalletAddress(user) === ownerWallet;
}

async function requireBlogOwner(req, res, next) {
  if (!isBlogOwner(req.user)) {
    return res.status(403).json({ error: 'This wallet is not the blog owner.' });
  }
  next();
}

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function cleanTags(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 8).join(',');
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(',');
}

function excerptFrom(markdown = '') {
  return String(markdown)
    .replace(/[#*_>`\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function serializePost(post, { includeBody = false } = {}) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt || excerptFrom(post.bodyMarkdown),
    tag: post.tag || 'Company',
    tags: post.tags ? post.tags.split(',').filter(Boolean) : [],
    coverUrl: post.coverUrl || '',
    status: post.status,
    publishedAt: post.publishedAt || post.createdAt,
    updatedAt: post.updatedAt,
    author: {
      id: post.author?.id || post.authorId,
      username: post.author?.username || '',
      walletAddress: primaryWalletAddress(post.author)
    },
    ...(includeBody ? { bodyMarkdown: post.bodyMarkdown } : {})
  };
}

function postPayload(body, user, existingPost = null) {
  const title = String(body.title || '').trim();
  if (title.length < 4) throw new Error('Title must be at least 4 characters.');

  const bodyMarkdown = String(body.bodyMarkdown || body.body || '').trim();
  if (bodyMarkdown.length < 20) throw new Error('Post body must be at least 20 characters.');

  const slug = slugify(body.slug || title);
  if (!slug) throw new Error('Slug could not be generated.');

  const status = body.status === 'draft' ? 'draft' : 'published';
  const wasPublished = existingPost?.status === 'published';

  return {
    title,
    slug,
    bodyMarkdown,
    excerpt: String(body.excerpt || '').trim() || excerptFrom(bodyMarkdown),
    tag: String(body.tag || 'Company').trim().slice(0, 40),
    tags: cleanTags(body.tags),
    coverUrl: String(body.coverUrl || '').trim() || null,
    status,
    publishedAt: status === 'published' ? (existingPost?.publishedAt || new Date()) : (wasPublished ? existingPost.publishedAt : null),
    authorId: user.id
  };
}

export function registerBlogRoutes(app) {
  app.get('/api/blog/posts', async (_req, res) => {
    try {
      const posts = await db.blogPost.findMany({
        where: { status: 'published' },
        include: { author: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
      });
      res.json({ success: true, posts: posts.map((post) => serializePost(post)) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch blog posts', details: error.message });
    }
  });

  app.get('/api/blog/posts/:slug', async (req, res) => {
    try {
      const post = await db.blogPost.findFirst({
        where: { slug: req.params.slug, status: 'published' },
        include: { author: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } }
      });
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json({ success: true, post: serializePost(post, { includeBody: true }) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch blog post', details: error.message });
    }
  });

  app.get('/api/blog/admin/me', requireAuth, (req, res) => {
    res.json({
      success: true,
      canPublish: isBlogOwner(req.user),
      walletAddress: primaryWalletAddress(req.user)
    });
  });

  app.get('/api/blog/admin/posts', requireAuth, requireBlogOwner, async (_req, res) => {
    try {
      const posts = await db.blogPost.findMany({
        include: { author: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } },
        orderBy: [{ updatedAt: 'desc' }]
      });
      res.json({ success: true, posts: posts.map((post) => serializePost(post, { includeBody: true })) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch admin posts', details: error.message });
    }
  });

  app.post('/api/blog/admin/posts', requireAuth, requireBlogOwner, async (req, res) => {
    try {
      const data = postPayload(req.body, req.user);
      const post = await db.blogPost.create({
        data,
        include: { author: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } }
      });
      res.json({ success: true, post: serializePost(post, { includeBody: true }) });
    } catch (error) {
      const status = error.code === 'P2002' ? 409 : 400;
      res.status(status).json({ error: error.code === 'P2002' ? 'A post with this slug already exists.' : error.message });
    }
  });

  app.put('/api/blog/admin/posts/:id', requireAuth, requireBlogOwner, async (req, res) => {
    try {
      const existingPost = await db.blogPost.findUnique({ where: { id: req.params.id } });
      if (!existingPost) return res.status(404).json({ error: 'Post not found' });
      const data = postPayload(req.body, req.user, existingPost);
      const post = await db.blogPost.update({
        where: { id: existingPost.id },
        data,
        include: { author: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } }
      });
      res.json({ success: true, post: serializePost(post, { includeBody: true }) });
    } catch (error) {
      const status = error.code === 'P2002' ? 409 : 400;
      res.status(status).json({ error: error.code === 'P2002' ? 'A post with this slug already exists.' : error.message });
    }
  });

  app.delete('/api/blog/admin/posts/:id', requireAuth, requireBlogOwner, async (req, res) => {
    try {
      await db.blogPost.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete post', details: error.message });
    }
  });
}
