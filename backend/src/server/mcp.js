import { db } from '@nibgate/internal/db.js';
import { getPublicDiscovery, getPublicLedger, getPublicStats, getPublicLeaderboards } from './hub/public-feeds.js';
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

// Public surfaces share the current-public-source boundary with HTTP routes.
async function exploreContent(args = {}) {
  return getPublicDiscovery(db, args, { network: activeNetwork().name });
}
async function getLedger(args = {}) {
  return getPublicLedger(db, args);
}
async function getPlatformStats() {
  return getPublicStats(db, { network: activeNetwork().name });
}
async function getLeaderboards(args = {}) {
  return getPublicLeaderboards(db, args);
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
    description: 'Discover currently published-and-public creator articles, confirmed against fresh public-home-v2 and manifest sources. Coverage is limited to the latest 20 articles per site. Results use newest-publication order, never historical popularity or sales. Historical metrics are null; Nibshare is excluded. Discovery id uses identityScope=creator-publication and is not a legacy Hub Content payment ID. Follow the returned current manifestUrl and its payment challenge; do not pass this id as a Hub Content payment ID.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search term across title, summary, site name, and domain.' },
        type: { type: 'string', enum: ['article', 'music', 'video', 'image', 'document', 'all'], description: 'Content type filter.' },
        sort: { type: 'string', enum: ['trending', 'best-sellers', 'hot-new', 'newest-publication'], description: 'Compatibility input only. Results always use newest-publication order; requestedSort echoes the request.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100, description: 'Max results (default 100).' },
        skip: { type: 'integer', minimum: 0, description: 'Pagination offset.' },
      },
    },
    handler: exploreContent,
  },
  {
    name: 'get_ledger',
    description: 'Historical activity is unavailable: records lack event-time public visibility proof. Returns a safe event-visibility-unavailable tool error and does not query historical events.',
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
    description: 'Counts articles in the current public creator listing; site count is null if the fetched page cannot establish a complete count. Creator count and all historical engagement, payment, tip, fee and revenue totals are null because event-time public visibility proof is unavailable. Coverage is limited to the latest 20 articles per site; Nibshare is excluded.',
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
    description: 'Historical rankings are unavailable because records lack event-time public visibility proof. Returns event-visibility-unavailable, not ranked results.',
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
      `Nibgate MCP server: current published-and-public creator articles from fresh public-home-v2 and manifest sources, limited to the latest 20 articles per site and ordered by newest publication. Nibshare is excluded from discovery. Historical activity and rankings are unavailable because event-time public visibility proof is absent. Stats report current listing site/article counts only, with historical values and creator count null. Tools are read-only. Explicit Nibshare resolution requires a caller-supplied slug or link. Settlements on this server are ${settlementFacts().networkBlurb}. To check pending tips for any domain, including external sites, GET ${settlementFacts().apiBase}/hub/tips/held?domain={domain}; this API host checks only its own network. To unlock paid content after discovery, pay over x402: GET ${settlementFacts().apiBase}/ns/{slug} (or the content access URL) returns 402 with a PAYMENT-REQUIRED header; pay with the Circle Agent Stack CLI (\`circle services pay <url> --address <wallet> --chain ${settlementFacts().circleChain}\`) or any x402 client, then retry the same request to receive the content. To tip a page, POST ${settlementFacts().apiBase}/hub/tips/challenge, pay the returned requirement, then POST the proof to /hub/tips/verify (a successful response confirms the resolved tip) or /hub/tips/hold (unresolved/external creator is held in a per-domain contract with no EOA key; the factory owner/keeper relays release/refund after Hub authorization checks, and the contract trusts recipient arguments. It is claimable by the verified creator and refundable by the payer until claimed; payer control accepts EOA personal_sign or deployed ERC-1271 wallets with a fresh domain/payer-bound message). Completed matching proofs return their original receipt without a second Tip row or Gateway settlement. Preserve the exact proof and request fields when retrying. HTTP 409 payment-proof-already-used rejects a conflicting or unverifiable binding; payment-verification-pending requires reconciliation of an incomplete durable reservation. Never send a fresh payment to recover an ambiguous settlement. Applies to mainnet and testnet; held-tip claim/refund behavior is unchanged. Full guide: https://nibgate.xyz/discovery.md`,
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
      } catch (error) {
        const unavailable = error?.code === 'event-visibility-unavailable';
        return res.type('application/json').json(jsonRpcResponse(id ?? null, {
          content: [{ type: 'text', text: unavailable ? 'event-visibility-unavailable: Historical activity is unavailable because event-time public visibility proof is missing.' : 'The requested data is temporarily unavailable. Please try again later.' }],
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
        'Current public creator articles and listing counts, plus explicit Nibshare link resolution. Historical ledger and rankings are unavailable.',
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
      const listing = await getPublicDiscovery(db, { limit: 100, type: 'article' }, { network: activeNetwork().name });
      const resources = [...new Set((listing.content || []).filter((item) => Number(item.price) > 0).map((item) => item.url).filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !/\/(?:ns|nibshare|share)(?:\/|$)/i.test(parsed.pathname);
        } catch { return false; }
      }))];
      return res.type('application/json').json({
        version: 1,
        resources,
        instructions:
          'Every Nibgate surface speaks x402. GET a resource without payment to receive its 402 challenge, settle via Circle Gateway micropayments or a direct USDC transfer on ' + settlementFacts().networkBlurb + ', then retry with the payment proof. Discover current public creator articles via MCP tools at /mcp or GET /hub/explore/content; coverage is limited to the latest 20 articles per site.',
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
