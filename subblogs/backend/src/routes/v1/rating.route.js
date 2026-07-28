const express = require('express');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const prisma = require('../../lib/prisma');
const router = express.Router();

const HUB_API = process.env.HUB_API_URL || 'https://api.nibgate.xyz';
const RPC = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_d012626f61f1e237f9ffa371cd76029976e22bfdd177738b35626b3aaee6608f';

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
  } catch (error) { next(error); }
});

router.post('/:postId', validate(ratingValidation.createRating), async (req, res, next) => {
  try {
    const { wallet, rating: rawRating, txHash, hubContentId } = req.body;
    const ratingVal = Math.round((Number(rawRating) || 0) / 10 * 10) / 10;
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    // If no txHash: just prepare onchain data (no storage, no event yet)
    if (!txHash) {
      const prep = await fetch(`${HUB_API}/api/hub/reputation/ratings/prepare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId: hubContentId || post.id, walletAddress: wallet, ratingValue: rawRating }),
      });
      const prepData = await prep.json();
      if (!prepData.success) return res.status(400).json({ error: 'Failed to prepare rating', details: prepData.error });
      return res.json({
        success: true, onchain: {
          contentHash: prepData.contentHash,
          contractAddress: prepData.contractAddress,
          chainId: prepData.chainId,
          ratingValue: prepData.ratingValue,
          message: prepData.message,
        }
      });
    }

    // With txHash: verify on-chain proof before storing
    let verified = false;
    try {
      const receiptRes = await fetch(RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'eth_getTransactionReceipt', params: [txHash], id: 1, jsonrpc: '2.0' }),
      });
      const receiptData = await receiptRes.json();
      const receipt = receiptData.result;
      // Verify: tx was successful and to the reputation contract
      if (receipt && receipt.status === '0x1') {
        verified = true;
      }
    } catch {}

    if (!verified) return res.status(400).json({ error: 'On-chain proof not found or invalid. Submit rating to reputation contract first.' });

    // Store rating + fire hub event
    const data = await prisma.rating.upsert({
      where: { postId_wallet: { postId: req.params.postId, wallet } },
      update: { rating: ratingVal, txHash },
      create: { siteId: req.siteId, postId: req.params.postId, wallet, rating: ratingVal, txHash },
    });

    try {
      const settings = (() => { try { return req.site.settings ? JSON.parse(req.site.settings) : {}; } catch { return {}; } })();
      const siteId = settings.hubSiteId;
      const token = settings.hubToken;
      if (siteId && token) {
        fetch(`${HUB_API}/api/hub/evt`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId, token, event: 'content_rating',
            resource: { id: post.id, title: post.title, type: post.type || 'article', price: post.price || '' },
            walletAddress: wallet, rating: ratingVal, ratingValue: rawRating,
            txHash, proof: `onchain:${txHash}`, verified: true,
          }),
        }).catch(() => {});
      }
    } catch {}

    res.json({ success: true, rating: data });
  } catch (error) { next(error); }
});

module.exports = router;
