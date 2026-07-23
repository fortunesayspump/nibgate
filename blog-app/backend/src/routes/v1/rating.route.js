const express = require('express');
const prisma = require('../../lib/prisma');
const router = express.Router();

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

router.post('/:postId', async (req, res, next) => {
  try {
    const { wallet, rating, txHash } = req.body;
    if (!wallet || !rating) {
      return res.status(400).json({ success: false, error: 'wallet and rating are required' });
    }

    const data = await prisma.rating.upsert({
      where: { postId_wallet: { postId: req.params.postId, wallet } },
      update: { rating, txHash },
      create: { siteId: req.siteId, postId: req.params.postId, wallet, rating, txHash },
    });

    res.json({ success: true, rating: data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
