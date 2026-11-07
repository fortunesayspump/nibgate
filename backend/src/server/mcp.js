import { db } from '@nibgate/internal/db.js';
import {
  normalizeContentType, serializeContent,
  siteReputationScore, creatorReputationScore, primaryWalletAddress,
  tipRevenueByContentId, attributeTips,
} from './hub/helpers.js';
import { getPublicLedger, getPublicStats, publicContentWhere, publicSiteWhere, sanitizePublicContent } from './hub/public-feeds.js';
import { shareManifest } from './nibshare/service.js';
import { activeNetwork, hostsFor } from '@nibgate/internal/networks.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'nibgate';
const SERVER_VERSION = '0.2.15';

// Per-stack settlement facts for tool instructions (Circle CLI chain flag,
// API host). Mainnet settles real USDC on Arc (5042); testnet mirrors it.
function settlementFacts() {
  const net = activeNetwork();
  const apiBase = (process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL || hostsFor(net.name).apiBase).replace(/\/+$/, '');
  return {
    apiBase,
    circleChain: net.isTestnet ? 'ARC-TESTNET' : 'ARC',
    networkBlurb: net.isTestnet ? 'Arc testnet (chain ID 5042002)' : 'Arc (chain ID 5042)',
  };
}

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
    ...publicContentWhere(),
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

  const serialized = content.map((c) => sanitizePublicContent(serializeContent(c))).sort((a, b) => {
    if (sort === 'best-sellers') return (b.unlocks - a.unlocks) || (b.revenue - a.revenue) || (b.views - a.views);
    if (sort === 'hot-new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return (b.views + b.unlocks * 4 + b.revenue * 20) - (a.views + a.unlocks * 4 + a.revenue * 20);
  });

  return { success: true, content: serialized, total, limit, skip };
}

async function getLedger(args = {}) {
  return getPublicLedger(db, args);
}

async function getPlatformStats() {
  return getPublicStats(db);
}

async function getLeaderboards(args = {}) {
  const type = String(args.type || 'creators').trim().toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '10', 10) || 10, 1), 50);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);

  if (type === 'content') {
    const content = await db.content.findMany({
      where: publicContentWhere(),
      include: CONTENT_INCLUDE, take: 500,
    });
    const tipByContent = await tipRevenueByContentId(content.map((c) => c.id), { publicOnly: true });
    const items = content.map((c) => sanitizePublicContent(serializeContent(c))).map((c) => ({
      ...c,
      tipRevenue: tipByContent.get(c.id) || 0,
      revenue: c.revenue + (tipByContent.get(c.id) || 0),
    }))
      .sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
      .slice(skip, skip + limit)
      .map((c, i) => ({ rank: skip + i + 1, ...c }));
    return { success: true, type: 'content', items, limit, skip, ...(content.length >= 500 ? { rankingScope: 'first-500-candidates' } : {}) };
  }

  if (type === 'sites') {
    const websites = await db.website.findMany({
      where: publicSiteWhere(),
      include: { content: { where: publicContentWhere(), include: CONTENT_INCLUDE }, _count: { select: { content: true } } },
      take: 500,
    });
    const contentToSite = new Map();
    const siteToOwner = new Map();
    const domainToSite = new Map();
    for (const w of websites) {
      siteToOwner.set(w.id, w.ownerId || null);
      if (w.domain) domainToSite.set(String(w.domain).toLowerCase(), w.id);
      for (const c of w.content || []) contentToSite.set(c.id, w.id);
    }
    const siteTips = await attributeTips({ contentToSite, siteToOwner, domainToSite, publicOnly: true });
    const items = websites.map((website) => {
      const content = website.content.map((c) => sanitizePublicContent(serializeContent(c)));
      const tipRevenue = siteTips.bySite.get(website.id) || 0;
      return {
        id: website.id, name: website.name, domain: website.domain, description: website.description || '',
        reputationScore: siteReputationScore(content, website),
        contentCount: content.length,
        views: content.reduce((s, c) => s + c.views, 0),
        unlocks: content.reduce((s, c) => s + c.unlocks, 0),
        revenue: content.reduce((s, c) => s + c.revenue, 0) + tipRevenue,
        tipRevenue,
      };
    }).sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
      .slice(skip, skip + limit)
      .map((s, i) => ({ rank: skip + i + 1, ...s }));
    return { success: true, type: 'sites', items, limit, skip, ...(websites.length >= 500 ? { rankingScope: 'first-500-candidates' } : {}) };
  }

  const users = await db.user.findMany({
    where: { websites: { some: publicSiteWhere() } },
    include: {
      wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      websites: { where: publicSiteWhere(), include: { content: { where: publicContentWhere(), include: CONTENT_INCLUDE } } },
    },
    take: 500,
  });
  const contentToOwner = new Map();
  const siteToOwner = new Map();
  const domainToSite = new Map();
  for (const u of users) {
    for (const w of u.websites || []) {
      siteToOwner.set(w.id, u.id);
      if (w.domain) domainToSite.set(String(w.domain).toLowerCase(), w.id);
      for (const c of w.content || []) contentToOwner.set(c.id, w.id);
    }
  }
  const creatorTips = await attributeTips({ contentToSite: contentToOwner, siteToOwner, domainToSite, publicOnly: true });
  const items = users.map((user) => {
    const websites = user.websites || [];
    const content = websites.flatMap((w) => w.content.map((c) => sanitizePublicContent(serializeContent(c))));
    const tipRevenue = creatorTips.byOwner.get(user.id) || 0;
    return {
      id: user.id, name: user.username || 'Unnamed creator', walletAddress: primaryWalletAddress(user),
      reputationScore: creatorReputationScore(content, websites),
      verifiedSites: websites.length, contentCount: content.length,
      views: content.reduce((s, c) => s + c.views, 0),
      unlocks: content.reduce((s, c) => s + c.unlocks, 0),
      revenue: content.reduce((s, c) => s + c.revenue, 0) + tipRevenue,
      tipRevenue,
    };
  }).filter((c) => c.contentCount > 0 || c.verifiedSites > 0)
    .sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
    .slice(skip, skip + limit)
    .map((c, i) => ({ rank: skip + i + 1, ...c }));
  return { success: true, type: 'creators', items, limit, skip, ...(users.length >= 500 ? { rankingScope: 'first-500-candidates' } : {}) };
}

function shareSlugFrom(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/\/ns\/([A-Za-z0-9_-]{1,64})/) || s.match(/^([A-Za-z0-9_-]{3,64})$/);
  return m ? m[1] : '';
}

async function resolveShare(args = {}) {
  const slug = shareSlugFrom(args.url || args.slug);
  if (!slug) {
    return { success: false, error: 'Provide a Nibshare slug or full /ns/<slug> URL, e.g. https://nibgate.xyz/ns/DxqTvRKJ.' };
  }
  const manifest = await shareManifest(slug);
  if (!manifest) {
    return { success: false, error: `No share found for slug "${slug}".` };
  }
  return { success: true, manifest };
}

// ── Tool registry ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'explore_content',
    description: 'Search verified creator content on Nibgate. Returns content metadata (title, type, price, domain, reputation, unlock path). Use to discover indexed paid/free content. Public metadata assumes verified indexed content, not an opt-in visibility guarantee; trending and best-sellers sort within the requested recent page.',
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
    description: 'Get the public Nibgate activity ledger: recent views, unlocks, payments, tips linked by contentId to indexed content on verified sites (including funded pending holds marked status=held), and onchain ratings. Nibshare is excluded. Browsing identifiers and referrers are withheld; unlocks and payments use verified receipts. Held tips are pending and do not count toward completed-tip totals; refunds appear as negative tip entries. Use GET /hub/tips/held?domain={domain} to check pending tips for any exact domain, including external sites. Includes wallet addresses, tx hashes, and receipts where available.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20).' },
        skip: { type: 'integer', minimum: 0, description: 'Pagination offset.' },
        type: { type: 'string', enum: ['views', 'unlocks', 'payments', 'ratings', 'tips'], description: 'Filter by activity type.' },
        domain: { type: 'string', description: 'Filter by site domain, e.g. example.nibgate.xyz.' },
      },
    },
    handler: getLedger,
  },
  {
    name: 'get_platform_stats',
    description: 'Get public Nibgate totals: creators, verified sites, indexed content, views, verified unlocks, revenue, matching content-linked tips, and protocol fees. Nibshare and unmatched external-page tips are excluded.',
    inputSchema: { type: 'object', properties: {} },
    handler: getPlatformStats,
  },
  {
    name: 'resolve_share',
    description: 'Resolve a Nibshare link (https://nibgate.xyz/ns/<slug> or a bare slug) to its machine-readable manifest: title, price, currency, content type, status, expiry, and the page/access/unlock/media URLs. Use before attempting payment or access.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The Nibshare share slug, e.g. DxqTvRKJ.' },
        url: { type: 'string', description: 'Full share URL, e.g. https://nibgate.xyz/ns/DxqTvRKJ.' },
      },
    },
    handler: resolveShare,
  },
  {
    name: 'get_leaderboards',
    description: 'Get ranked creators, sites, or content by reputation score, unlocks, views, and revenue (verified unlocks + matching content-linked tips). Nibshare is excluded. rankingScope=first-500-candidates marks a bounded candidate ranking.',
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
      `Nibgate MCP server: verified content discovery, public indexed-content ledger (funded matching held tips appear as pending entries; refunds appear as negative entries; Nibshare is excluded; browsing identifiers and referrers are withheld), platform stats, reputation leaderboards, and Nibshare link resolution (resolve_share). Tools return JSON matching the public API. Tools are read-only. Public discovery assumes indexed content on verified sites; it is not an opt-in visibility guarantee for historical URLs. Nibshare resolution requires a caller-supplied link or slug. Settlements on this server are ${settlementFacts().networkBlurb}. To check pending tips for any domain, including external sites, GET ${settlementFacts().apiBase}/hub/tips/held?domain={domain}; this API host checks only its own network. To unlock paid content after discovery, pay over x402: GET ${settlementFacts().apiBase}/ns/{slug} (or the content access URL) returns 402 with a PAYMENT-REQUIRED header; pay with the Circle Agent Stack CLI (\`circle services pay <url> --address <wallet> --chain ${settlementFacts().circleChain}\`) or any x402 client, then retry the same request to receive the content. To tip a page, POST ${settlementFacts().apiBase}/hub/tips/challenge, pay the returned requirement, then POST the proof to /hub/tips/verify (a successful response confirms the resolved tip) or /hub/tips/hold (unresolved/external creator is held in a per-domain contract with no EOA key; the factory owner/keeper relays release/refund after Hub authorization checks, and the contract trusts recipient arguments. It is claimable by the verified creator and refundable by the payer until claimed; payer control accepts EOA personal_sign or deployed ERC-1271 wallets with a fresh domain/payer-bound message). Completed matching proofs return their original receipt without a second Tip row or Gateway settlement. Preserve the exact proof and request fields when retrying. HTTP 409 payment-proof-already-used rejects a conflicting or unverifiable binding; payment-verification-pending requires reconciliation of an incomplete durable reservation. Never send a fresh payment to recover an ambiguous settlement. Applies to mainnet and testnet; held-tip claim/refund behavior is unchanged. Full guide: https://nibgate.xyz/discovery.md`,
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
    res.set('Cache-Control', 'no-store');
    res.type('application/json').json(serverInfo());
  });

  app.post('/mcp', async (req, res) => {
    res.set('Cache-Control', 'no-store');
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
      } catch {
        return res.type('application/json').json(jsonRpcResponse(id ?? null, {
          content: [{ type: 'text', text: 'The requested data is temporarily unavailable. Please try again later.' }],
          isError: true,
        }));
      }
    }

    return res.type('application/json').json(jsonRpcError(id ?? null, -32601, `Method not found: ${method}`));
  });

  // MCP server card for .well-known discovery (SEP-1649 compatible shape).
  app.get('/.well-known/mcp.json', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const apiOrigin = process.env.PUBLIC_API_URL || hostsFor().apiBase;
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
        'Verified content discovery, unlock/payment ledger, platform stats, reputation leaderboards, and Nibshare link resolution for the Nibgate open protocol for paid content.',
      documentationUrl: 'https://docs.nibgate.xyz/agent-discovery',
      transport: {
        type: 'streamable-http',
        endpoint: `${apiOrigin.replace(/\/+$/, '')}/mcp`,
      },
      capabilities: { tools: { listChanged: false } },
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  });

  // x402 discovery fan-out (x402scan compatibility). Resources are resolved at
  // request time so the listed URLs are always live paid surfaces.
  app.get('/.well-known/x402', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const post = await db.content.findFirst({
        where: { ...publicContentWhere(), price: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        select: { path: true, url: true, website: { select: { domain: true } } },
      });
      const resources = [];
      if (post) {
        let origin = '';
        try { origin = post.url ? new URL(post.url).origin : ''; } catch { origin = ''; }
        if (!origin && post.website?.domain) origin = `https://${post.website.domain}`;
        let p = post.path || '';
        if (!p && post.url) {
          try { p = new URL(post.url).pathname; } catch { p = ''; }
        }
        if (origin && p) resources.push(`${origin.replace(/\/+$/, '')}${p.startsWith('/') ? p : `/${p}`}`);
      }
      return res.type('application/json').json({
        version: 1,
        resources,
        instructions:
          'Every Nibgate surface speaks x402. GET a resource without payment to receive its 402 challenge, settle via Circle Gateway micropayments or a direct USDC transfer on ' + settlementFacts().networkBlurb + ', then retry with the payment proof. Discover all paid content via MCP tools at /mcp or GET /hub/explore/content.',
      });
    } catch {
      return res.status(503).type('application/json').json({
        success: false,
        error: 'Discovery is temporarily unavailable. Please try again later.',
      });
    }
  });
}

// registry discovery surfaces live at the bottom of this file
