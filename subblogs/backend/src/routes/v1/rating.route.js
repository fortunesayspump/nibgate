const express = require('express');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const prisma = require('../../lib/prisma');
const config = require('../../config/config');
const router = express.Router();

const HUB_API = process.env.HUB_API_URL || 'https://api.nibgate.xyz';

router.get('/:postId', async (req, res, next) => {
  try {
    const stats = await prisma.rating.aggregate({
      where: { postId: req.params.postId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    res.json({
      success: true,
      average: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0,
      count: stats._count.rating,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:postId', validate(ratingValidation.createRating), async (req, res, next) => {
  try {
    const { wallet, rating: rawRating, txHash, hubContentId } = req.body;
    const rating = Math.round((Number(rawRating) || 0) / 10 * 10) / 10;

    const [post, data] = await Promise.all([
      prisma.blogPost.findUnique({ where: { id: req.params.postId } }),
      prisma.rating.upsert({
        where: { postId_wallet: { postId: req.params.postId, wallet } },
        update: { rating, txHash },
        create: { siteId: req.siteId, postId: req.params.postId, wallet, rating, txHash },
      }),
    ]);

    // Fire content_rating event to hub
    try {
      const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
      const siteId = settings.hubSiteId;
      const token = settings.hubToken;
      if (siteId && token && post) {
        fetch(`${HUB_API}/api/hub/evt`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId, token, event: 'content_rating',
            resource: { id: post.id, title: post.title, type: post.type || 'article', price: post.price || '' },
            walletAddress: wallet, rating, ratingValue: rawRating,
            ...(txHash ? { txHash, proof: `receipt:${txHash}` } : {}),
          }),
        }).catch(() => {});
      }
    } catch {}

    // Prepare on-chain rating data for bot to sign
    let onchain = null;
    if (post) {
      try {
        const hubRes = await fetch(`${HUB_API}/api/hub/reputation/ratings/prepare`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentId: hubContentId || post.id, walletAddress: wallet, ratingValue: rawRating, paymentId: txHash || '' }),
        });
        const hubData = await hubRes.json();
        if (hubData.success) onchain = { contentHash: hubData.contentHash, contractAddress: hubData.contractAddress, chainId: hubData.chainId, ratingValue: hubData.ratingValue };
      } catch {}
    }

    res.json({ success: true, rating: data, onchain });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
