import { db } from '@nibgate/internal/db.js';
import {
  normalizeContentType, serializeContent,
  siteReputationScore, creatorReputationScore, primaryWalletAddress
} from './hub/helpers.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'nibgate';
const SERVER_VERSION = '0.1.0';

const VERIFIED_SITE_WHERE = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
const CONTENT_INCLUDE = { website: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } };

// ── Tool implementations (mirror the public hub query shapes) ────────────

async function exploreContent(args = {}) {
  const q = String(args.q || '').trim();
  const requestedType = String(args.type || '').trim().toLowerCase();
  const type = normalizeContentType(requestedType);
  const sort = String(args.sort || 'trending').trim().toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '20', 10) || 20, 1), 100);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);

  const where = {
    deletedAt: null,
    website: VERIFIED_SITE_WHERE,
    ...(requestedType && requestedType !== 'all' ? { contentType: type } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { contains: q, mode: 'insensitive' } },
        { website: { name: { contains: q, mode: 'insensitive' } } },
        { website: { domain: { contains: q, mode: 'insensitive' } } },
      ],
    } : {}),
  };

  const [content, total] = await Promise.all([
    db.content.findMany({ where, include: CONTENT_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    db.content.count({ where }),
  ]);

  const serialized = content.map(serializeContent).sort((a, b) => {
    if (sort === 'best-sellers') return (b.unlocks - a.unlocks) || (b.revenue - a.revenue) || (b.views - a.views);
    if (sort === 'hot-new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return (b.views + b.unlocks * 4 + b.revenue * 20) - (a.views + a.unlocks * 4 + a.revenue * 20);
  });

  return { success: true, content: serialized, total, limit, skip };
}

async function getLedger(args = {}) {
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '20', 10) || 20, 1), 100);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);
  const type = String(args.type || '').trim().toLowerCase();
  const domain = String(args.domain || '').trim().toLowerCase() || undefined;
  const siteWhere = domain ? { website: { domain } } : { website: VERIFIED_SITE_WHERE };

  const activities = [];

  if (!type || type === 'views') {
    const views = await db.metric.findMany({
      where: { type: 'view', contentId: { not: null }, ...siteWhere },
      include: { content: { select: { id: true, title: true, url: true } }, website: { select: { domain: true } } },
      orderBy: { createdAt: 'desc' }, take: limit, skip,
    });
    for (const v of views) activities.push({
      type: 'view', id: v.id, websiteId: v.websiteId, actor: v.visitorId || 'anonymous',
      contentId: v.contentId, contentTitle: v.content?.title || '', contentUrl: v.content?.url || v.url || '',
      domain: v.website?.domain || '', referrer: v.referrer || null, durationMs: v.durationMs || null,
      timestamp: v.createdAt,
    });
  }

  if (!type || type === 'unlocks') {
    const unlocks = await db.metric.findMany({
      where: { eventName: 'unlock_completed', contentId: { not: null }, ...siteWhere },
      include: { content: { select: { id: true, title: true, url: true, price: true, currency: true } }, website: { select: { domain: true } } },
      orderBy: { createdAt: 'desc' }, take: limit, skip,
    });
    for (const u of unlocks) activities.push({
      type: 'unlock', id: u.id, websiteId: u.websiteId, actor: u.visitorId || u.sessionId || 'user',
      contentId: u.contentId, contentTitle: u.content?.title || '', contentUrl: u.content?.url || u.url || '',
      domain: u.website?.domain || '', revenue: u.revenue || 0, currency: u.currency || 'USDC',
      timestamp: u.createdAt,
    });
  }

  if (!type || type === 'payments') {
    const payments = await db.unlockReceipt.findMany({
      where: { ...siteWhere, status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] } },
      include: { content: { select: { id: true, title: true, url: true } }, website: { select: { domain: true } } },
      orderBy: { createdAt: 'desc' }, take: limit, skip,
    });
    for (const p of payments) activities.push({
      type: 'payment', id: p.id, websiteId: p.websiteId, actor: p.payerWallet || p.actor || 'wallet',
      contentId: p.contentId, contentTitle: p.content?.title || '', contentUrl: p.content?.url || '',
      domain: p.website?.domain || '', amount: p.amount || 0, currency: p.currency || 'USDC',
      paymentId: p.paymentId, txHash: p.txHash || null, chainId: p.chainId || null,
      network: p.network || null, paymentProvider: p.paymentProvider || null, receiptUrl: p.receiptUrl || null,
      payerWallet: p.payerWallet || null, recipientWallet: p.recipientWallet || null,
      timestamp: p.createdAt,
    });
  }

  if (!type || type === 'ratings') {
    const ratings = await db.contentRating.findMany({
      where: { status: 'accepted', proof: { startsWith: 'onchain:' }, ...siteWhere },
      include: { content: { select: { id: true, title: true, url: true } }, website: { select: { domain: true } } },
      orderBy: { createdAt: 'desc' }, take: limit, skip,
    });
    for (const r of ratings) activities.push({
      type: 'rating', id: r.id, websiteId: r.websiteId, actor: r.walletAddress || r.actor || 'user',
      contentId: r.contentId, contentTitle: r.content?.title || '', contentUrl: r.content?.url || '',
      domain: r.website?.domain || '', score: Math.round((r.ratingValue || 0) / 10),
      walletAddress: r.walletAddress || null, txHash: r.txHash || null, proofType: r.proofType || null,
      timestamp: r.createdAt,
    });
  }

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return { success: true, activities: activities.slice(0, limit), total: activities.length, limit, skip };
}

async function getPlatformStats() {
  const [creators, sites, content, views, unlockCount, revenueAgg] = await Promise.all([
    db.user.count({ where: { wallets: { some: {} }, websites: { some: VERIFIED_SITE_WHERE } } }),
    db.website.count({ where: VERIFIED_SITE_WHERE }),
    db.content.count({ where: { deletedAt: null, website: VERIFIED_SITE_WHERE } }),
    db.metric.count({ where: { type: 'view', contentId: { not: null }, website: VERIFIED_SITE_WHERE } }).catch(() => 0),
    db.unlockReceipt.count({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: VERIFIED_SITE_WHERE } } }).catch(() => 0),
    db.unlockReceipt.findMany({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: VERIFIED_SITE_WHERE } }, select: { amount: true } }).catch(() => []),
  ]);

  const revenue = (revenueAgg || []).reduce((t, r) => (Number(r?.amount || 0) < 100 ? t + Number(r?.amount || 0) : t), 0);
  return { success: true, stats: { creators, sites, content, views: Number(views || 0), unlocks: Number(unlockCount || 0), revenue } };
}

async function getLeaderboards(args = {}) {
  const type = String(args.type || 'creators').trim().toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '10', 10) || 10, 1), 50);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);

  if (type === 'content') {
    const content = await db.content.findMany({
      where: { deletedAt: null, website: VERIFIED_SITE_WHERE },
      include: CONTENT_INCLUDE, take: 500,
    });
    const items = content.map(serializeContent)
      .sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
      .slice(skip, skip + limit)
      .map((c, i) => ({ rank: skip + i + 1, ...c }));
    return { success: true, type: 'content', items, limit, skip };
  }

  if (type === 'sites') {
    const websites = await db.website.findMany({
      where: VERIFIED_SITE_WHERE,
      include: { content: { where: { deletedAt: null }, include: CONTENT_INCLUDE }, _count: { select: { content: true } } },
      take: 500,
    });
    const items = websites.map((website) => {
      const content = website.content.map(serializeContent);
      return {
        id: website.id, name: website.name, domain: website.domain, description: website.description || '',
        reputationScore: siteReputationScore(content, website),
        contentCount: content.length,
        views: content.reduce((s, c) => s + c.views, 0),
        unlocks: content.reduce((s, c) => s + c.unlocks, 0),
        revenue: content.reduce((s, c) => s + c.revenue, 0),
      };
    }).sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
      .slice(skip, skip + limit)
      .map((s, i) => ({ rank: skip + i + 1, ...s }));
    return { success: true, type: 'sites', items, limit, skip };
  }

  const users = await db.user.findMany({
    include: {
      wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      websites: { where: VERIFIED_SITE_WHERE, include: { content: { where: { deletedAt: null }, include: CONTENT_INCLUDE } } },
    },
    take: 500,
  });
  const items = users.map((user) => {
    const websites = user.websites || [];
    const content = websites.flatMap((w) => w.content.map(serializeContent));
    return {
      id: user.id, name: user.username || 'Unnamed creator', walletAddress: primaryWalletAddress(user),
      reputationScore: creatorReputationScore(content, websites),
      verifiedSites: websites.length, contentCount: content.length,
      views: content.reduce((s, c) => s + c.views, 0),
      unlocks: content.reduce((s, c) => s + c.unlocks, 0),
      revenue: content.reduce((s, c) => s + c.revenue, 0),
    };
  }).filter((c) => c.contentCount > 0 || c.verifiedSites > 0)
    .sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
    .slice(skip, skip + limit)
    .map((c, i) => ({ rank: skip + i + 1, ...c }));
  return { success: true, type: 'creators', items, limit, skip };
}

// ── Tool registry ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'explore_content',
    description: 'Search verified creator content on Nibgate. Returns content metadata (title, type, price, domain, reputation, unlock path). Use to discover what paid/free content exists.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search term across title, description, tags, site name, and domain.' },
        type: { type: 'string', enum: ['article', 'music', 'video', 'image', 'document', 'all'], description: 'Content type filter.' },
        sort: { type: 'string', enum: ['trending', 'best-sellers', 'hot-new'], description: 'Sort order. Defaults to trending.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20).' },
        skip: { type: 'integer', minimum: 0, description: 'Pagination offset.' },
      },
    },
    handler: exploreContent,
  },
  {
    name: 'get_ledger',
    description: 'Get the public Nibgate activity ledger: recent views, unlocks, payments, and onchain ratings across verified sites. Includes wallet addresses, tx hashes, and receipts where available.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20).' },
        skip: { type: 'integer', minimum: 0, description: 'Pagination offset.' },
        type: { type: 'string', enum: ['views', 'unlocks', 'payments', 'ratings'], description: 'Filter by activity type.' },
        domain: { type: 'string', description: 'Filter by site domain, e.g. example.nibgate.xyz.' },
      },
    },
    handler: getLedger,
  },
  {
    name: 'get_platform_stats',
    description: 'Get platform-wide Nibgate totals: creators, verified sites, content count, views, unlocks, and revenue.',
    inputSchema: { type: 'object', properties: {} },
    handler: getPlatformStats,
  },
  {
    name: 'get_leaderboards',
    description: 'Get ranked creators, sites, or content by reputation score, unlocks, views, and revenue.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['creators', 'sites', 'content'], description: 'Leaderboard type (default creators).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max results (default 10).' },
        skip: { type: 'integer', minimum: 0, description: 'Pagination offset.' },
      },
    },
    handler: getLeaderboards,
  },
];

function serverInfo() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions:
      'Nibgate MCP server: verified content discovery, unlock/payment ledger, platform stats, and reputation leaderboards. Tools return JSON matching the public hub API. All data is public and read-only.',
  };
}

function jsonRpcResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function registerMcpRoute(app) {
  // Server info (Streamable HTTP GET handshake).
  app.get('/mcp', (_req, res) => {
    res.type('application/json').json(serverInfo());
  });

  app.post('/mcp', async (req, res) => {
    const message = req.body || {};
    const { id, method, params } = message;

    if (method === 'initialize') {
      return res.type('application/json').json(jsonRpcResponse(id ?? null, serverInfo()));
    }

    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return res.status(202).end();
    }

    if (method === 'ping') {
      return res.type('application/json').json(jsonRpcResponse(id ?? null, {}));
    }

    if (method === 'tools/list') {
      const list = TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
      return res.type('application/json').json(jsonRpcResponse(id ?? null, { tools: list }));
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return res.type('application/json').json(jsonRpcError(id ?? null, -32602, `Unknown tool: ${name}`));
      }
      try {
        const result = await tool.handler(args || {});
        return res.type('application/json').json(jsonRpcResponse(id ?? null, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }));
      } catch (error) {
        return res.type('application/json').json(jsonRpcResponse(id ?? null, {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        }));
      }
    }

    return res.type('application/json').json(jsonRpcError(id ?? null, -32601, `Method not found: ${method}`));
  });

  // MCP server card for .well-known discovery (SEP-1649 compatible shape).
  app.get('/.well-known/mcp.json', (_req, res) => {
    const apiOrigin = process.env.PUBLIC_API_URL || 'https://api.nibgate.xyz';
    res.type('application/json').json({
      $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
      version: '1.0',
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: {
        name: SERVER_NAME,
        title: 'Nibgate Hub',
        version: SERVER_VERSION,
      },
      description:
        'Verified content discovery, unlock/payment ledger, platform stats, and reputation leaderboards for the Nibgate open protocol for paid content.',
      documentationUrl: 'https://docs.nibgate.xyz/agent-discovery',
      transport: {
        type: 'streamable-http',
        endpoint: `${apiOrigin.replace(/\/+$/, '')}/mcp`,
      },
      capabilities: { tools: { listChanged: false } },
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  });
}
