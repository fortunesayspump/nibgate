const express = require('express');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const prisma = require('../../lib/prisma');
const router = express.Router();

const RPC = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || '';
if (!RPC) console.warn('[rating] No ARC_RPC_URL set — on-chain rating verification will fail');

const statsCache = new Map();
const STATS_TTL_MS = 60 * 1000;

router.get('/:postId', async (req, res, next) => {
  try {
    const postId = req.params.postId;
    // Hub-authoritative on-chain stats: the hub resolves the post id against
    // its content rows (id or externalId), hashes with its own stored row, and
    // reads the reputation contract directly. Never recompute the content hash
    // locally — stored url/domain forms drift across stacks and renames, which
    // silently orphans the lookup ("No ratings yet" with ratings on-chain).
    const hubKey = `hub:${postId}`;
    const hubCached = statsCache.get(hubKey);
    if (hubCached && Date.now() - hubCached.at < STATS_TTL_MS) {
      if (hubCached.value && hubCached.value.count > 0) {
        return res.json({ success: true, source: 'onchain', average: hubCached.value.average, count: hubCached.value.count });
      }
    } else {
      try {
        const hubApi = require('../../config/config').nibgate.hubApi;
        const r = await fetch(`${hubApi}/hub/reputation/ratings/stats?contentId=${encodeURIComponent(postId)}`, { signal: AbortSignal.timeout(10000) });
        const data = await r.json().catch(() => null);
        if (data && data.success && Number(data.count) > 0) {
          const value = { average: data.average, count: Number(data.count) };
          statsCache.set(hubKey, { at: Date.now(), value });
          return res.json({ success: true, source: 'onchain', average: value.average, count: value.count });
        }
        statsCache.set(hubKey, { at: Date.now(), value: { average: 0, count: 0 } });
      } catch {
        // Hub unreachable — fall through to the local aggregate.
      }
    }

    const stats = await prisma.rating.aggregate({
      where: { postId },
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

    // Step 2: With txHash → verify on-chain proof (SDK), retrying briefly so
    // a freshly-broadcast tx has time to mine before we reject it.
    if (!RPC) return res.status(500).json({ error: 'ARC_RPC_URL not configured.' });
    let verified = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await sdk.verifyRatingTx(txHash, RPC);
        verified = true;
        break;
      } catch (error) {
        const stillPending = /not found|invalid/i.test(error.message);
        if (attempt === 5 || !stillPending) throw error;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    if (!verified) return res.status(400).json({ error: 'On-chain proof not found or invalid' });

    // Step 3: Store + fire hub event (SDK)
    const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
    const data = await prisma.rating.upsert({
      where: { postId_wallet: { postId: req.params.postId, wallet } },
      update: { rating: ratingVal, txHash },
      create: { siteId: req.siteId, postId: req.params.postId, wallet, rating: ratingVal, txHash },
    });

    if (settings.hubSiteId && settings.hubToken) {
      const typePath = { article: 'writing', photo: 'photos', music: 'music', video: 'video' };
      // Report the URL the reader actually used (testnet- alias on the testnet
      // stack), not the canonical mainnet host.
      const reqHost = String(req.get('x-forwarded-host') || req.get('host') || '').split(':')[0].toLowerCase();
      const pubOrigin = reqHost ? `https://${reqHost}` : `https://${req.site.subdomain}.nibgate.xyz`;
      const pubUrl = `${pubOrigin}/${typePath[post.type] || 'posts'}/${post.slug}`;
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
