const express = require('express');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const prisma = require('../../lib/prisma');
const router = express.Router();

const RPC = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || '';
if (!RPC) console.warn('[rating] No ARC_RPC_URL set — on-chain rating verification will fail');

const REPUTATION_CONTRACT = process.env.NIBGATE_REPUTATION_CONTRACT || '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
const REPUTATION_CHAIN_ID = Number(process.env.NIBGATE_REPUTATION_CHAIN_ID || '5042002');
const CONTENT_HASH_NAMESPACE = 'nibgate:content:v1';
const TYPE_PATH = { article: 'writing', photo: 'photos', music: 'music', video: 'video' };

const statsCache = new Map();
const STATS_TTL_MS = 60 * 1000;

function cleanDomain(domain = '') {
  return String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function contentHashFor(domain, externalId, url) {
  const { keccak256, stringToBytes } = require('viem');
  return keccak256(stringToBytes([CONTENT_HASH_NAMESPACE, cleanDomain(domain), externalId, url].join('|')));
}

function contentUrlFor(site, post) {
  const path = `${TYPE_PATH[post.type] || 'posts'}/${post.slug}`;
  const origin = site && site.subdomain ? `https://${site.subdomain}.nibgate.xyz` : '';
  return origin ? `${origin}/${path}` : path;
}

async function readOnchainStats(contentId) {
  if (!RPC) return null;
  const cached = statsCache.get(contentId);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.value;
  try {
    const { createPublicClient, http } = require('viem');
    const publicClient = createPublicClient({
      chain: { id: REPUTATION_CHAIN_ID, name: 'Arc Testnet', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
      transport: http(RPC, { retryCount: 2, timeout: 12000 }),
    });
    const abi = [{ type: 'function', name: 'contentStats', stateMutability: 'view', inputs: [{ name: 'contentId', type: 'bytes32' }], outputs: [{ name: 'count', type: 'uint256' }, { name: 'total', type: 'uint256' }] }];
    const [count, total] = await publicClient.readContract({ address: REPUTATION_CONTRACT, abi, functionName: 'contentStats', args: [contentId] });
    const value = { count: Number(count), total: Number(total) };
    statsCache.set(contentId, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

router.get('/:postId', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.postId }, select: { id: true, type: true, slug: true } });

    if (post && req.site) {
      const domain = `${req.site.subdomain}.nibgate.xyz`;
      const url = contentUrlFor(req.site, post);
      const contentId = contentHashFor(domain, post.id, url);
      const onchain = await readOnchainStats(contentId);
      if (onchain && onchain.count > 0) {
        const average = onchain.total / onchain.count;
        return res.json({ success: true, source: 'onchain', average: Math.round(average * 10) / 10, count: onchain.count });
      }
    }

    const stats = await prisma.rating.aggregate({
      where: { postId: req.params.postId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    res.json({ success: true, source: 'db', average: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0, count: stats._count.rating });
  } catch (error) { next(error); }
});

router.post('/:postId', validate(ratingValidation.createRating), async (req, res, next) => {
  try {
    const { wallet, rating: rawRating, txHash, hubContentId } = req.body;
    const ratingVal = Math.round((Number(rawRating) || 0) / 10);
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    // Load SDK (ESM → dynamic import from CJS)
    const sdk = await import('@nibgate/sdk/server');

    // Step 1: No txHash → prepare onchain data (SDK)
    if (!txHash) {
      const onchain = await sdk.prepareOnchainRating({
        contentId: hubContentId || post.id,
        walletAddress: wallet,
        ratingValue: rawRating,
      });
      return res.json({ success: true, onchain });
    }

    // Step 2: With txHash → verify on-chain proof (SDK)
    if (!RPC) return res.status(500).json({ error: 'ARC_RPC_URL not configured.' });
    await sdk.verifyRatingTx(txHash, RPC);

    // Step 3: Store + fire hub event (SDK)
    const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
    const data = await prisma.rating.upsert({
      where: { postId_wallet: { postId: req.params.postId, wallet } },
      update: { rating: ratingVal, txHash },
      create: { siteId: req.siteId, postId: req.params.postId, wallet, rating: ratingVal, txHash },
    });

    if (settings.hubSiteId && settings.hubToken) {
      const typePath = { article: 'writing', photo: 'photos', music: 'music', video: 'video' };
      const pubUrl = `https://${req.site.subdomain}.nibgate.xyz/${typePath[post.type] || 'posts'}/${post.slug}`;
      sdk.submitOnchainRating({
        siteId: settings.hubSiteId, token: settings.hubToken,
        hubContentId: hubContentId || post.id, title: post.title, postType: post.type, price: post.price,
        walletAddress: wallet, rating: ratingVal, ratingValue: rawRating, txHash,
        url: pubUrl, path: `/${typePath[post.type] || 'posts'}/${post.slug}`,
      }).catch((err) => console.warn('[rating] Failed to submit hub event:', err.message));
    }

    res.json({ success: true, rating: data });
  } catch (error) {
    if (error.message.includes('on-chain proof')) return res.status(400).json({ error: error.message });
    next(error);
  }
});

module.exports = router;
