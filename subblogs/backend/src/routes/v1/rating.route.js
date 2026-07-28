const express = require('express');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const prisma = require('../../lib/prisma');
const router = express.Router();

const RPC = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || '';
if (!RPC) console.warn('[rating] No ARC_RPC_URL set — on-chain rating verification will fail');

router.get('/:postId', async (req, res, next) => {
  try {
    const stats = await prisma.rating.aggregate({
      where: { postId: req.params.postId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    res.json({ success: true, average: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0, count: stats._count.rating });
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
      sdk.submitOnchainRating({
        siteId: settings.hubSiteId, token: settings.hubToken,
        hubContentId: hubContentId || post.id, title: post.title, postType: post.type, price: post.price,
        walletAddress: wallet, rating: ratingVal, ratingValue: rawRating, txHash,
      }).catch((err) => console.warn('[rating] Failed to submit hub event:', err.message));
    }

    res.json({ success: true, rating: data });
  } catch (error) {
    if (error.message.includes('on-chain proof')) return res.status(400).json({ error: error.message });
    next(error);
  }
});

module.exports = router;
