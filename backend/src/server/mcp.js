import { db } from '@nibgate/internal/db.js';
import { creatorOrigin, getPublicDiscovery } from './hub/manifest-discovery.js';
import { ledgerTotals } from './hub/ledger-totals.js';
import {
  serializeContent,
  siteReputationScore, creatorReputationScore, primaryWalletAddress,
  tipRevenueByContentId, attributeTips, nibshareStatsByWallet, platformMoneyTotals,
} from './hub/helpers.js';
import { shareManifest } from './nibshare/service.js';
import { activeNetwork, hostsFor } from '@nibgate/internal/networks.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'nibgate';
const SERVER_VERSION = '0.2.16';

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

const VERIFIED_SITE_WHERE = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
const CONTENT_INCLUDE = { website: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } };

// ── Tool implementations (mirror the public hub query shapes) ────────────

async function exploreContent(args = {}) {
  return getPublicDiscovery(db,{limit:20,...args},{network:activeNetwork().name});
}

async function getLedger(args = {}) {
  if (args.domain) throw new Error('Per-site activity is unavailable');
  return { success: true, activities: [], totals: await ledgerTotals(db), activityStatus: 'unavailable' };
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
  // Sum fees recorded at ingest — pre-fee-model payments carry null/0.
  const feeAgg = await db.unlockReceipt
    .aggregate({ _sum: { protocolFee: true }, where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: VERIFIED_SITE_WHERE } } })
    .catch(() => ({ _sum: { protocolFee: 0 } }));
  const protocolFees = Number(feeAgg._sum.protocolFee || 0);
  const money = await platformMoneyTotals();
  return {
    success: true,
    stats: {
      creators, sites, content, views: Number(views || 0), unlocks: Number(unlockCount || 0),
      revenue: revenue + money.tipRevenue + money.nibshareRevenue,
      protocolFees: protocolFees + money.tipFees + money.nibshareFees,
      tips: money.tips, tipRevenue: money.tipRevenue,
      nibshareUnlocks: money.nibshareUnlocks, nibshareViews: money.nibshareViews,
      nibshareRevenue: money.nibshareRevenue,
    },
  };
}

async function getLeaderboards(args = {}) {
  const type = String(args.type || 'creators').trim().toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '10', 10) || 10, 1), 50);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);

  if (type === 'content') throw new Error('Content rankings are temporarily unavailable');

  if (type === 'sites') {
    const websites = await db.website.findMany({
      where: VERIFIED_SITE_WHERE,
      include: { content: { where: { deletedAt: null }, include: CONTENT_INCLUDE }, _count: { select: { content: true } } },
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
    const siteTips = await attributeTips({ contentToSite, siteToOwner, domainToSite });
    const items = websites.map((website) => {
      const content = website.content.map(serializeContent);
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
    return { success: true, type: 'sites', items, limit, skip };
  }

  const users = await db.user.findMany({
    include: {
      wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      websites: { where: VERIFIED_SITE_WHERE, include: { content: { where: { deletedAt: null }, include: CONTENT_INCLUDE } } },
    },
    take: 500,
  });
  const contentToOwner = new Map();
  const siteToOwner = new Map();
  const domainToSite = new Map();
  const allWallets = [];
  for (const u of users) {
    for (const w of u.websites || []) {
      siteToOwner.set(w.id, u.id);
      if (w.domain) domainToSite.set(String(w.domain).toLowerCase(), w.id);
      for (const c of w.content || []) contentToOwner.set(c.id, w.id);
    }
    for (const wl of u.wallets || []) {
      if (wl.address) allWallets.push(wl.address);
    }
  }
  const creatorTips = await attributeTips({ contentToSite: contentToOwner, siteToOwner, domainToSite });
  const items = users.map((user) => {
    const websites = user.websites || [];
    const content = websites.flatMap((w) => w.content.map(serializeContent));
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
  return { success: true, type: 'creators', items, limit, skip };
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
    description: 'Search a bounded mainnet sample of current public articles from verified creator-host manifests. Historical metrics and rankings are unavailable; results are ordered by site, not popularity or recency. Testnet is unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search term across title, description, tags, site name, and domain.' },
        type: { type: 'string', enum: ['article', 'music', 'video', 'image', 'document', 'all'], description: 'Content type filter.' },
        sort: { type: 'string', enum: ['site-order'], description: 'Site order; historical rankings are unavailable.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20).' },
        skip: { type: 'integer', minimum: 0, description: 'Pagination offset.' },
      },
    },
    handler: exploreContent,
  },
  {
    name: 'get_ledger',
    description: 'Network-wide activity totals including private-share activity. Individual events and per-site filters are unavailable.',
    inputSchema: { type: 'object', properties: {} },
    handler: getLedger,
  },
  {
    name: 'get_platform_stats',
    description: 'Get platform-wide Nibgate totals: creators, verified sites, content count, views, unlocks, revenue (unlocks + tips + nibshares), tips, nibshare unlocks/views/revenue, and cumulative protocol fees.',
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
    description: 'Creator and site rankings; content rankings are temporarily unavailable.',
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
      `Nibgate MCP server: bounded mainnet current public article discovery (site order; testnet unavailable), network-wide activity totals, platform stats, creator and site rankings; content rankings are unavailable, and Nibshare link resolution (resolve_share). Tools return JSON matching the public API. Tools are read-only. Settlements on this server are ${settlementFacts().networkBlurb}. To check pending tips for any domain, including external sites, GET ${settlementFacts().apiBase}/hub/tips/held?domain={domain}; this API host checks only its own network. To unlock paid content after discovery, pay over x402: GET ${settlementFacts().apiBase}/ns/{slug} (or the content access URL) returns 402 with a PAYMENT-REQUIRED header; pay with the Circle Agent Stack CLI (\`circle services pay <url> --address <wallet> --chain ${settlementFacts().circleChain}\`) or any x402 client, then retry the same request to receive the content. To tip a page, POST ${settlementFacts().apiBase}/hub/tips/challenge, pay the returned requirement, then POST the proof to /hub/tips/verify (a successful response confirms the resolved tip) or /hub/tips/hold (unresolved/external creator is held in a per-domain contract with no EOA key; the factory owner/keeper relays release/refund after Hub authorization checks, and the contract trusts recipient arguments. It is claimable by the verified creator and refundable by the payer until claimed; payer control accepts EOA personal_sign or deployed ERC-1271 wallets with a fresh domain/payer-bound message). Completed matching proofs return their original receipt without a second Tip row or Gateway settlement. Preserve the exact proof and request fields when retrying. HTTP 409 payment-proof-already-used rejects a conflicting or unverifiable binding; payment-verification-pending requires reconciliation of an incomplete durable reservation. Never send a fresh payment to recover an ambiguous settlement. Applies to mainnet and testnet; held-tip claim/refund behavior is unchanged. Full guide: https://nibgate.xyz/discovery.md`,
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
    res.set('Cache-Control', 'private, no-store');
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
          content: [{ type: 'text', text: name === 'explore_content' ? 'Public discovery temporarily unavailable' : name === 'get_ledger' ? 'Ledger totals temporarily unavailable' : name === 'get_leaderboards' ? 'Rankings are temporarily unavailable' : `Error: ${error.message}` }],
          isError: true,
        }));
      }
    }

    return res.type('application/json').json(jsonRpcError(id ?? null, -32601, `Method not found: ${method}`));
  });

  // MCP server card for .well-known discovery (SEP-1649 compatible shape).
  app.get('/.well-known/mcp.json', (_req, res) => {
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
        'Verified content discovery, aggregate activity totals, platform stats, creator and site rankings; content rankings are unavailable, and Nibshare link resolution for the Nibgate open protocol for paid content.',
      documentationUrl: 'https://docs.nibgate.xyz/agent-discovery',
      transport: {
        type: 'streamable-http',
        endpoint: `${apiOrigin.replace(/\/+$/, '')}/mcp`,
      },
      capabilities: { tools: { listChanged: false } },
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  });

  // The x402 directory uses the same bounded current-public manifest sample.
  // A caller-supplied share slug is still resolved separately; no private share
  // is automatically published through discovery.
  app.get('/.well-known/x402', async (_req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const listing = await getPublicDiscovery(db, {limit:400,sort:'site-order'}, {network:activeNetwork().name});
      const resources = listing.content.flatMap(item => {try {const u=new URL(item.url);return item.price>0 && creatorOrigin({domain:u.hostname,deletedAt:null,isVerified:true,verificationStatus:'verified'})===u.origin && /^\/writing\/[A-Za-z0-9_-]{1,200}$/.test(u.pathname) && !u.search && !u.hash && !u.username && !u.password ? [`${u.origin}/api${u.pathname}`] : [];}catch{return []}});
      return res.type('application/json').json({version:1,resources,scope:listing.scope,coverage:listing.coverage,
        instructions:'This is a bounded sample of current public creator articles. Request a resource for its payment challenge; discovery excludes private shares.'});
    } catch {
      return res.status(503).type('application/json').json({error:'Public discovery temporarily unavailable'});
    }
  });

}

// registry discovery surfaces live at the bottom of this file
