// Paid x402 surfaces: Dr. Nib sells what it does best — metered search over
// the free bench — to any agent with USDC. Circle Gateway nanopayments:
// the middleware returns 402 with a GatewayWalletBatched challenge, verifies
// the payment-signature, and serves. Zero auth, zero accounts: payment IS
// the authentication, exactly the pattern our own buyer uses.
//
// Priced in cents because the underlying retrieval costs nothing; the margin
// funds the operator wallet that pays out escrow splits and tips.
import { Router } from 'express';
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server';
import { searchAll } from '../retrieval/index.js';
import { spendChain } from '../spend/chain.js';

export const x402 = Router();

const SELLER = process.env.DRNIB_SELLER_ADDRESS || process.env.ESCROW_OPERATOR || '';
const PRICE = process.env.DRNIB_X402_SEARCH_PRICE || '$0.01';

function gateway() {
  const chain = spendChain();
  const caip2 = `eip155:${chain.chainId}`;
  return createGatewayMiddleware({
    sellerAddress: SELLER,
    networks: [caip2],
    facilitatorUrl: chain.facilitatorUrl,
  });
}

function enabled(_req, res, next) {
  if (!SELLER) return res.status(501).json({ error: 'paid endpoints are not configured on this deployment (DRNIB_SELLER_ADDRESS)' });
  return next();
}

// Paid web search: the free bench, metered per call. What our own data
// stage buys when it needs primary discovery it cannot get for free.
x402.post(
  '/x402/search',
  enabled,
  (req, res, next) => gateway().require(PRICE)(req, res, next),
  async (req, res) => {
    try {
      const { query, maxResults = 6 } = req.body || {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'query is required' });
      }
      const out = await searchAll({ query: query.trim(), maxResults: Math.min(Math.max(Number(maxResults) || 6, 1), 10) });
      res.json({
        results: out.results.slice(0, 10),
        providers: out.providers,
        price: PRICE,
        seller: SELLER,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  },
);

// Paid single-URL read: fetch + extract one page (PDFs and Office docs
// included), for agents that found the URL elsewhere.
x402.post(
  '/x402/read',
  enabled,
  (req, res, next) => gateway().require(process.env.DRNIB_X402_READ_PRICE || '$0.01'),
  async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
      const { extractAll } = await import('../retrieval/index.js');
      const out = await extractAll({ urls: [url] });
      if (!out.documents.length) return res.status(422).json({ error: 'nothing readable', skipped: out.skipped });
      res.json({ document: out.documents[0], price: process.env.DRNIB_X402_READ_PRICE || '$0.01', seller: SELLER });
    } catch (e) { res.status(500).json({ error: e.message }); }
  },
);
